#!/usr/bin/env node
'use strict';
// Capture emulator screenshots of an app, e.g. for tutorials.
//
//   node tools/screenshot.js <appId> [steps...]
//
// Steps run in order after the app is uploaded:
//   --load [file]        load(file); default <appId>.app.js
//   --js "<code>"        run one line of JS on the watch
//   --wait <ms>          advance virtual time
//   --tap x,y            tap
//   --swipe x0,y0,x1,y1[,ms]
//   --press [ms]         press and release BTN1
//   --shot <file.png>    save a screenshot (relative to the current directory)
//   --scale <n>          upscale later screenshots n times (default 1 = 176x176)
// If no step is given: --load --wait 1000 --shot build/screenshots/<appId>/screen.png
const path = require('node:path');
const { Emulator, uploadApp } = require('./lib/emulator');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  const [id, ...rest] = process.argv.slice(2);
  if (!id || id.startsWith('-')) {
    console.log(require('node:fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 18).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(id ? 0 : 1);
  }
  const steps = rest.length ? rest : ['--load', '--wait', '1000', '--shot', path.join('build', 'screenshots', id, 'screen.png')];
  const emu = new Emulator({ onLine: (l) => console.log(`| ${l}`), onHostCommand: () => {} });
  await emu.boot();
  uploadApp(emu, path.join(ROOT, 'apps', id));
  let scale = 1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const arg = () => {
      if (i + 1 >= steps.length) throw new Error(`${s} needs a value`);
      return steps[++i];
    };
    const nums = (v) => v.split(',').map(Number);
    switch (s) {
      case '--load': {
        const f = steps[i + 1] && !steps[i + 1].startsWith('--') ? steps[++i] : `${id}.app.js`;
        emu.command(`load(${JSON.stringify(f)})`);
        emu.runFor(500);
        break;
      }
      case '--js': emu.command(arg()); emu.runFor(50); break;
      case '--wait': emu.runFor(Number(arg())); break;
      case '--tap': { const [x, y] = nums(arg()); emu.tap(x, y); emu.runFor(200); break; }
      case '--swipe': { const [x0, y0, x1, y1, ms = 150] = nums(arg()); emu.swipe(x0, y0, x1, y1, ms); emu.runFor(ms + 200); break; }
      case '--press': {
        const ms = steps[i + 1] && /^\d+$/.test(steps[i + 1]) ? Number(steps[++i]) : 100;
        emu.press(ms);
        emu.runFor(ms + 200);
        break;
      }
      case '--scale': scale = Number(arg()); break;
      case '--shot': console.log(`saved ${emu.saveScreenshot(path.resolve(arg()), { scale })}`); break;
      default: throw new Error(`Unknown step ${s}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
