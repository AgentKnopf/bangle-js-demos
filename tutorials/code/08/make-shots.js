#!/usr/bin/env node
'use strict';
// Regenerates the step screenshots of tutorial 08 from the checkpoint files,
// with tools/screenshot.js. Run from the repo root:
//   node tutorials/code/08/make-shots.js [only-this-prefix]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const D = path.join('tutorials', 'code', '08');
const IMG = path.join('tutorials', 'img', '08');
const only = process.argv[2] || '';

const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');
// Storage.write in chunks: one console line each must stay short
function put(name, file) {
  const buf = fs.readFileSync(path.join(ROOT, file)), out = [], CH = 3000;
  for (let i = 0; i < buf.length; i += CH) {
    const part = buf.subarray(i, i + CH).toString('base64');
    out.push('--js', i ? `require('Storage').write('${name}',atob('${part}'),${i})`
      : `require('Storage').write('${name}',atob('${part}'),0,${buf.length})`);
  }
  return out;
}
// the model upload file, as sent from the Web IDE
const MODEL = [...put('m.js', 'apps/tfgest/model/tfgest-model.js'), '--js', "eval(require('Storage').read('m.js'))"];

function shot(step, png, steps) {
  if (!png.startsWith(only)) return;
  const args = ['tools/screenshot.js', 'tfgest',
    ...put('gest.app.js', path.join(D, step)), ...put('fake.js', path.join(D, 'fake.js')),
    '--load', 'gest.app.js', '--js', "eval(require('Storage').read('fake.js'))", '--js', 'fake()',
    ...steps, '--shot', path.join(IMG, png)];
  const out = execFileSync('node', args, { cwd: ROOT, encoding: 'utf8' });
  out.split('\n').filter((l) => /CHK|saved|rror|Uncaught/.test(l)).forEach((l) => console.log(l));
}

const twist = ['--js', 'startRec("twist")', '--tap', '88,100', '--js', 'gesture()', '--wait', '3000'];
const SCORES = '[0.02,0.9,0.03,0.02,0.02,0.01]';

shot('step1.app.js', 'step1-menu.png', []);
shot('step2.app.js', 'step2-armed.png', ['--js', 'startRec("twist")', '--tap', '88,100']);
shot('step2.app.js', 'step2-saved.png', [...twist,
  '--js', 'print("CHK2", require("Storage").open("gest.twist","r").readLine())']);
shot('step3.app.js', 'step3-counts.png', [...twist, '--tap', '88,100', '--js', 'gesture()', '--wait', '3000',
  '--js', 'startRec("none")', '--tap', '88,100', '--wait', '3000', '--js', 'recMenu()', '--wait', '300']);
shot('step5.app.js', 'step5-manage.png', [...MODEL, ...twist, '--js', 'manageMenu()', '--wait', '300']);
shot('step6.app.js', 'step6-no-model.png', ['--js', 'startRun()']);
shot('step6.app.js', 'step6-emulator.png', [...MODEL, '--js', 'startRun()']);
shot('step6.app.js', 'step6-mismatch.png', [...MODEL, '--js', 'fakeTF([0.1,0.2,0.3,0.2,0.2])', '--js', 'startRun()']);
shot('step6.app.js', 'step6-result.png', [...MODEL, '--js', `fakeTF(${SCORES})`, '--js', 'startRun()',
  '--js', 'gesture()', '--wait', '3000', '--js', 'print("CHK6", JSON.stringify(model.inp.slice(9,15)))']);
shot('step7.app.js', 'step7-detect.png', [...MODEL, '--js', `fakeTF(${SCORES})`, '--js', 'startRun()',
  '--js', 'gesture()', '--wait', '3000', '--js', 'print("CHK7", shown, JSON.stringify(top))']);
shot('step7.app.js', 'step7-unsure.png', [...MODEL, '--js', 'fakeTF([0.05,0.55,0.3,0.05,0.03,0.02])', '--js', 'startRun()',
  '--js', 'gesture()', '--wait', '3000', '--js', 'print("CHK7U", shown, JSON.stringify(top))']);
