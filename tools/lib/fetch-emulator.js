'use strict';
// Downloads the Espruino Web IDE's Bangle.js 2 emulator (real firmware compiled
// to JS/WASM) at a pinned revision and verifies it, so every run and CI job
// tests against the same firmware build.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REVISION = '4a1a36528eb1e068a7cddf16eeb2f41b5028bb22'; // espruino/EspruinoWebIDE, firmware 2v29.74
const FILES = {
  'emu_banglejs2.js': '04dd3be7d84fc0d764d430779ff61420112e6b5783fd252baf16688cb8e2c46b',
  'common.js': 'c4e401a35c944497785b67c8ac396a92e5e887b62ccb38599b54a950932a9004',
  'emulator_banglejs2.js': '4979a9e8b07854a105db23f8a6a52b03576fadae04b58ea8329d373e9db79637',
};
const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'emulator', REVISION);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isComplete(dir, verify) {
  return Object.keys(FILES).every((f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return false;
    return !verify || sha256(fs.readFileSync(p)) === FILES[f];
  });
}

async function ensureEmulator({ log = () => {} } = {}) {
  // BANGLE_EMU_DIR points at an existing emu/ folder (e.g. a local EspruinoWebIDE
  // checkout); it is used as-is so you can try other firmware builds.
  if (process.env.BANGLE_EMU_DIR) {
    const dir = path.resolve(process.env.BANGLE_EMU_DIR);
    if (!isComplete(dir, false)) throw new Error(`BANGLE_EMU_DIR=${dir} is missing ${Object.keys(FILES).join(', ')}`);
    return dir;
  }
  if (isComplete(CACHE_DIR, false)) return CACHE_DIR;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const [file, hash] of Object.entries(FILES)) {
    const url = `https://raw.githubusercontent.com/espruino/EspruinoWebIDE/${REVISION}/emu/${file}`;
    log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== hash) throw new Error(`Checksum mismatch for ${file}: expected ${hash}, got ${got}`);
    fs.writeFileSync(path.join(CACHE_DIR, file) + '.part', buf);
    fs.renameSync(path.join(CACHE_DIR, file) + '.part', path.join(CACHE_DIR, file));
  }
  return CACHE_DIR;
}

module.exports = { ensureEmulator, REVISION, CACHE_DIR, FILES };

if (require.main === module) {
  ensureEmulator({ log: console.log })
    .then((dir) => {
      if (!process.env.BANGLE_EMU_DIR && !isComplete(dir, true)) throw new Error(`Cached files in ${dir} fail checksum; delete the folder and retry`);
      console.log(`Emulator ready in ${dir}`);
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
