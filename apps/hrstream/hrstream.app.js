// Heart rate streaming: shows BPM, confidence and a 60 s sparkline, and
// streams over BLE as a standard Heart Rate Service and as "HR {...}" JSON
// lines on the Nordic UART. Tap toggles streaming, the button exits.
var DEBUG = false;
var APP = "hrstream";
var HR = require("hrstream");
var FLUSH_MS = 1500; // time for a fresh client to subscribe to UART notifications
var S, flushTimer;

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }

function uartSend(line) {
  log({ evt: "uart", line: line });
  try { Bluetooth.println(line); } catch (e) {}
}

function setupServices() {
  try {
    NRF.setServices({
      0x180D: {
        0x2A37: { value: [0, 0], maxLen: 2, readable: true, notify: true },
        0x2A38: { value: 2, readable: true }
      }
    }, { advertise: ["180D"], uart: true });
  } catch (e) { log({ evt: "error", msg: String(e) }); }
}

function updateHRS(v) {
  log({ evt: "hrs", v: v });
  try { NRF.updateServices({ 0x180D: { 0x2A37: { value: v, notify: true } } }); } catch (e) {}
}

function onHRM(h) {
  var r = S.onHRM(h, Date.now(), E.getBattery());
  if (S.streaming) updateHRS(r.hrs);
  log({ evt: "hrm", bpm: r.sample.bpm, conf: r.sample.conf, ok: r.confident, sent: r.sent, buf: S.buffer.length });
  draw();
}

function onConnect(addr) {
  S.connect();
  log({ evt: "conn", connected: true });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(function () {
    flushTimer = undefined;
    log({ evt: "flush", n: S.flush() });
  }, FLUSH_MS);
  draw();
}

function onDisconnect(reason) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  S.disconnect();
  log({ evt: "conn", connected: false });
  draw();
}

function toggle() {
  S.setStreaming(!S.streaming, Date.now());
  log({ evt: "stream", on: S.streaming });
  draw();
}

function drawSpark(x, y, w, h) {
  var v = S.history, lo = 255, hi = 0, i;
  for (i = 0; i < v.length; i++) if (v[i] !== null) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
  g.setColor(g.theme.fg).drawRect(x, y, x + w - 1, y + h - 1);
  if (hi < lo) return;
  if (hi - lo < 10) { lo -= 5; hi += 5; }
  var px, py, prev = false, step = (w - 3) / (HR.BUFFER - 1), off = HR.BUFFER - v.length;
  for (i = 0; i < v.length; i++) {
    if (v[i] === null) { prev = false; continue; }
    var nx = x + 1 + Math.round((i + off) * step), ny = y + h - 2 - Math.round((v[i] - lo) * (h - 3) / (hi - lo));
    if (prev) g.drawLine(px, py, nx, ny); else g.setPixel(nx, ny);
    px = nx; py = ny; prev = true;
  }
  g.setFont("6x8").setFontAlign(-1, -1).drawString(hi, x + 2, y + 2).setFontAlign(-1, 1).drawString(lo, x + 2, y + h - 1);
}

function draw() {
  var r = Bangle.appRect, cx = r.x + r.w / 2, last = S.last;
  var ok = !!(last && last.ok);
  g.reset().clearRect(r);
  g.setFont("6x8", 2).setFontAlign(0, -1);
  g.drawString(S.connected ? "connected" : "not connected", cx, r.y + 2);
  g.setFont("6x8").drawString(S.streaming ? "streaming (tap: pause)" : "paused (tap: stream)", cx, r.y + 20);
  if (!ok) g.setColor(0.5, 0.5, 0.5); // dithered grey on the 3-bit LCD
  g.setFont("Vector", 44).setFontAlign(0, 0).drawString(last ? last.bpm : "--", cx, r.y + 54);
  g.setColor(g.theme.fg).setFont("6x8", 2).setFontAlign(0, -1);
  g.drawString(last ? "conf " + last.conf + "%" : "waiting", cx, r.y + 80);
  if (last && !ok) g.setFont("6x8").drawString("no reading", cx, r.y + 97);
  drawSpark(r.x + 4, r.y + 106, r.w - 8, r.y2 - r.y - 108);
  log({ evt: "draw", bpm: last ? last.bpm : null, conf: last ? last.conf : null, grey: !ok, conn: S.connected, on: S.streaming });
}

E.on("kill", function () {
  if (flushTimer) clearTimeout(flushTimer);
  Bangle.setHRMPower(0, APP);
  try { NRF.setServices({}, { uart: true }); } catch (e) {}
  log({ evt: "kill" });
});

S = HR.create({ send: uartSend });
Bangle.on("HRM", onHRM);
NRF.on("connect", onConnect);
NRF.on("disconnect", onDisconnect);
Bangle.setHRMPower(1, APP);
setupServices();
Bangle.setUI({ mode: "custom", touch: toggle, btn: function () { load(); } });
Bangle.loadWidgets();
Bangle.drawWidgets();
draw();
if (NRF.getSecurityStatus().connected) { S.connect(); S.flush(); draw(); }
