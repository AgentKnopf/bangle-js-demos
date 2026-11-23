#!/usr/bin/env node
'use strict';
// Render an app icon with the real firmware's Graphics library.
//
//   node tools/make-icon.js <appId>
//
// Reads apps/<appId>/icon-src.js: Espruino code that draws on `i`, a 48x48
// 16-bit Graphics (colours like i.setColor(1,0,0); background starts black).
// Heatshrink keeps simple icons small; the watch shows them in its 3-bit colours.
// Writes apps/<appId>/app.png (48x48, for the app loader) and
// apps/<appId>/app-icon.js (heatshrink-compressed image, store it as
// "<appId>.img" with "evaluate":true in metadata.json).
const fs = require('node:fs');
const path = require('node:path');
const { Emulator } = require('./lib/emulator');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: node tools/make-icon.js <appId>');
  const dir = path.join(ROOT, 'apps', id);
  const src = fs.readFileSync(path.join(dir, 'icon-src.js'), 'utf8');
  const emu = new Emulator({ onLine: (l) => { if (/Uncaught|Error/.test(l)) console.error(`| ${l}`); } });
  await emu.boot();
  emu.writeFile('_icon.js', src);
  emu.command('var i=Graphics.createArrayBuffer(48,48,16,{msb:true});');
  emu.command('eval(require("Storage").read("_icon.js"))');
  const b64 = emu.evaluate('btoa(require("heatshrink").compress(i.asImage("string")))');
  // Draw the stored icon back onto the screen to check the round trip and grab the PNG.
  emu.command(`g.clear();g.drawImage(require("heatshrink").decompress(atob(${JSON.stringify(b64)})),0,0);g.flip()`);
  emu.runFor(100);
  fs.writeFileSync(path.join(dir, 'app.png'), emu.screenshotPNG({ crop: [0, 0, 48, 48] }));
  fs.writeFileSync(path.join(dir, 'app-icon.js'), `require("heatshrink").decompress(atob("${b64}"))\n`);
  console.log(`wrote apps/${id}/app.png and apps/${id}/app-icon.js`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
