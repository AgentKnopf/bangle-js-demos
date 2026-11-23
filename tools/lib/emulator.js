'use strict';
// Headless driver for the Bangle.js 2 emulator from the Espruino Web IDE.
// The firmware reads its clock through Date.now(), so we give it a virtual
// clock: whenever the firmware is idle we jump straight to its next timer.
// Tests that wait minutes of watch time finish in milliseconds and are
// deterministic.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ensureEmulator } = require('./fetch-emulator');
const { encodePNG } = require('./png');

const WIDTH = 176;
const HEIGHT = 176;
const DEFAULT_START = Date.UTC(2026, 0, 1, 9, 0, 0);
const INPUT_CHUNK = 200; // the firmware's console input buffer is 1024 bytes

const scriptCache = new Map();
function compiled(file) {
  let s = scriptCache.get(file);
  if (!s) {
    s = new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.basename(file) });
    scriptCache.set(file, s);
  }
  return s;
}

class Emulator {
  constructor(opts = {}) {
    this.startTime = opts.startTime ?? DEFAULT_START;
    this.onLine = opts.onLine || (() => {});
    this.onHostCommand = opts.onHostCommand || (() => {});
    this.lines = [];
    this.partial = '';
    this.queue = []; // host actions: {at, fn}
    this.booted = false;
  }

  get now() {
    return this.clock.now;
  }

  async boot() {
    const dir = await ensureEmulator({ log: (m) => process.stderr.write(m + '\n') });
    const clock = (this.clock = { now: this.startTime });
    const RealDate = Date;
    class VirtualDate extends RealDate {
      constructor(...a) {
        if (a.length === 0) super(clock.now);
        else super(...a);
      }
      static now() {
        return clock.now;
      }
    }
    let ready;
    const initialised = new Promise((r) => (ready = r));
    const quiet = () => {};
    const fakeProcess = { versions: process.versions, release: process.release, argv: [], env: {}, exitCode: 0 };
    const ctx = vm.createContext({
      console: { log: quiet, info: quiet, debug: quiet, warn: quiet, error: quiet },
      setTimeout, clearTimeout, queueMicrotask, performance, require, Buffer, URL, TextDecoder, TextEncoder, WebAssembly,
      process: fakeProcess,
      Date: VirtualDate,
      __dirname: dir,
      Module: { onRuntimeInitialized: () => ready(), print: quiet, printErr: quiet },
      jsUpdateGfx: quiet,
    });
    for (const f of ['emu_banglejs2.js', 'common.js', 'emulator_banglejs2.js']) compiled(path.join(dir, f)).runInContext(ctx);
    await initialised;
    this.ctx = ctx;
    this.M = ctx.Module;
    ctx.jsRXCallback = (c) => this._rx(c);
    ctx.onConsoleOutput = quiet;
    ctx.jsIdle = () => this._idleOnce(); // common.js helpers call this after input
    ctx.hwPinValue[ctx.BTN1] = 1; // BTN1 is active low; 0 at boot would mean "held"
    this.M.ccall('jsInit', 'number', [], []);
    ctx.jsHandleIO();
    this.runFor(200);
    this.command('echo(0)');
    this.runFor(50);
    this.booted = true;
    return this;
  }

  _rx(c) {
    if (c === 10) {
      const line = this.partial.replace(/\r/g, '');
      this.partial = '';
      this._line(line);
    } else {
      this.partial += String.fromCharCode(c);
    }
  }

  _line(raw) {
    const line = raw.replace(/^>+/, '');
    this.lines.push(line);
    const i = line.indexOf('@@H ');
    if (i >= 0) {
      let cmd;
      try {
        cmd = JSON.parse(line.slice(i + 4));
      } catch (e) {
        cmd = { cmd: 'invalid', raw: line };
      }
      // Never call into the firmware from here: we are inside its print().
      this.schedule(0, () => this.onHostCommand(cmd, this));
      return;
    }
    if (/@@E\w+ /.test(line)) return; // evaluate() results are read from this.lines
    this.onLine(line, this);
  }

  _idleOnce() {
    let ms = -1;
    for (let i = 0; i < 5 && ms < 0; i++) {
      ms = this.M.ccall('jsIdle', 'number', [], []);
      this.ctx.jsHandleIO();
    }
    return ms;
  }

  /** Queue a host action `delayMs` of virtual time from now. */
  schedule(delayMs, fn) {
    this.queue.push({ at: this.clock.now + Math.max(0, delayMs), fn });
    this.queue.sort((a, b) => a.at - b.at);
  }

  /** Run due host actions. Returns how many ran. */
  _drain() {
    let n = 0;
    while (this.queue.length && this.queue[0].at <= this.clock.now) {
      const { fn } = this.queue.shift();
      fn();
      this._idleOnce();
      n++;
    }
    return n;
  }

  /** Run virtual time until pred() is true or `timeout` virtual ms pass. */
  runUntil(pred, { timeout = 60000, wallTimeout = 120000 } = {}) {
    const end = this.clock.now + timeout;
    const wallEnd = performance.now() + wallTimeout;
    for (;;) {
      let ms = this._idleOnce();
      // Input from a host action can create timers (app handlers, the firmware's
      // button debounce), so ask the firmware for its next timer again.
      if (this._drain()) ms = this._idleOnce();
      if (pred()) return true;
      if (this.clock.now >= end) return false;
      if (performance.now() > wallEnd) throw new Error(`wall-clock timeout after ${wallTimeout} ms (virtual time ${this.clock.now - this.startTime} ms)`);
      let step = ms > 0 ? ms : 1;
      if (this.queue.length) step = Math.min(step, Math.max(1, this.queue[0].at - this.clock.now));
      this.clock.now += Math.min(step, end - this.clock.now);
    }
  }

  runFor(ms) {
    this.runUntil(() => false, { timeout: ms });
  }

  /** Type raw characters into the console (no newline added). */
  tx(str) {
    for (let i = 0; i < str.length; i += INPUT_CHUNK) {
      for (const ch of str.slice(i, i + INPUT_CHUNK)) {
        const code = ch.charCodeAt(0);
        if (code > 255) throw new Error('tx() only accepts 8-bit characters; base64-encode other data');
        this.M.ccall('jshPushIOCharEvent', 'number', ['number', 'number'], [this.ctx.DEVICE, code]);
      }
      this._idleOnce();
    }
  }

  /** Run one line of JS at the top level of the REPL, without echo. */
  command(js) {
    if (/[\r\n]/.test(js)) throw new Error('command() takes a single line; use writeFile() + eval for multi-line code');
    this.tx('\x10' + js + '\n');
    this._idleOnce();
  }

  /** Evaluate a JS expression on the watch and return its JSON value. */
  evaluate(js) {
    const tag = '@@E' + Math.random().toString(36).slice(2, 8) + ' ';
    const start = this.lines.length;
    this.command(`print(${JSON.stringify(tag)}+JSON.stringify(${js}))`);
    let found;
    this.runUntil(() => (found = this.lines.slice(start).find((l) => l.includes(tag))), { timeout: 1000 });
    if (!found) throw new Error(`No result for ${js}. Output: ${this.lines.slice(start).join('\n')}`);
    const json = found.slice(found.indexOf(tag) + tag.length);
    return json === 'undefined' || json === '' ? undefined : JSON.parse(json);
  }

  /** Write a file to Storage. evaluate:true stores the result of evaluating the content (BangleApps loader semantics). */
  writeFile(name, data, { evaluate = false } = {}) {
    if (name.length > 28) throw new Error(`Storage file name "${name}" is longer than 28 characters`);
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const n = JSON.stringify(name);
    if (!buf.length) this.command(`require("Storage").write(${n},"")`);
    const CH = 768;
    for (let off = 0; off < buf.length; off += CH) {
      const b64 = buf.subarray(off, off + CH).toString('base64');
      this.command(off === 0 ? `require("Storage").write(${n},atob("${b64}"),0,${buf.length})` : `require("Storage").write(${n},atob("${b64}"),${off})`);
    }
    if (evaluate) this.command(`require("Storage").write(${n},eval(require("Storage").read(${n})))`);
    else {
      const len = this.evaluate(`(require("Storage").read(${n})||"").length`);
      if (len !== buf.length) throw new Error(`Upload of ${name} failed: wrote ${buf.length} bytes, watch has ${len}`);
    }
  }

  // ---- input -------------------------------------------------------------
  touch(x, y, pressed, gesture = 0) {
    this.M.ccall('jsSendTouchEvent', 'number', ['number', 'number', 'number', 'number'], [x | 0, y | 0, pressed ? 1 : 0, gesture]);
    this._idleOnce();
  }

  /** Tap: press, release after `ms`, then the firmware's "touch" gesture. */
  tap(x, y, ms = 60) {
    this.touch(x, y, 1);
    this.schedule(ms, () => {
      this.touch(x, y, 0);
      this.touch(x, y, 0, 5);
    });
  }

  /** Drag from (x0,y0) to (x1,y1) over `ms` in `steps` moves, like the Web IDE's mouse handling. */
  swipe(x0, y0, x1, y1, ms = 150, steps = 5) {
    this.touch(x0, y0, 1);
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      this.schedule((ms * i) / steps, () => this.touch(x, y, 1));
    }
    this.schedule(ms, () => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      this.touch(x1, y1, 0);
      if (Math.abs(dx) > 80 && Math.abs(dy) < 20) this.touch(x1, y1, 0, dx < 0 ? 3 : 4);
      if (Math.abs(dx) < 20 && Math.abs(dy) > 80) this.touch(x1, y1, 0, dy < 0 ? 2 : 1);
    });
  }

  button(pressed) {
    this.ctx.hwPinValue[this.ctx.BTN1] = pressed ? 0 : 1;
    this.M.ccall('jsSendPinWatchEvent', 'number', ['number'], [this.ctx.BTN1]);
    this._idleOnce();
  }

  press(ms = 100) {
    this.button(true);
    this.schedule(ms, () => this.button(false));
  }

  // ---- screen --------------------------------------------------------------
  framebuffer() {
    const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
    this.ctx.jsGetGfxContents(rgba);
    return rgba;
  }

  screenshotPNG({ scale = 1, crop } = {}) {
    let rgba = this.framebuffer();
    let w = WIDTH;
    let h = HEIGHT;
    if (crop) {
      const [cx, cy, cw, ch] = crop;
      const out = new Uint8Array(cw * ch * 4);
      for (let y = 0; y < ch; y++) out.set(rgba.subarray(((cy + y) * WIDTH + cx) * 4, ((cy + y) * WIDTH + cx + cw) * 4), y * cw * 4);
      rgba = out;
      w = cw;
      h = ch;
    }
    return encodePNG(w, h, Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length), scale);
  }

  saveScreenshot(file, opts) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, this.screenshotPNG(opts));
    return file;
  }
}

/** Upload an app's Storage files as listed in its metadata.json. */
function uploadApp(emu, appDir) {
  const meta = JSON.parse(fs.readFileSync(path.join(appDir, 'metadata.json'), 'utf8'));
  for (const f of meta.storage || []) {
    if (!f.url && f.content === undefined) continue;
    const content = f.content !== undefined ? f.content : fs.readFileSync(path.join(appDir, f.url));
    emu.writeFile(f.name, content, { evaluate: !!f.evaluate });
  }
  if (meta.data) {
    for (const f of meta.data) {
      if (f.url) emu.writeFile(f.name, fs.readFileSync(path.join(appDir, f.url)));
    }
  }
  return meta;
}

module.exports = { Emulator, uploadApp, WIDTH, HEIGHT };
