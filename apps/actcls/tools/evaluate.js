#!/usr/bin/env node
'use strict';
// Replays prototype-06 recordings through the classifier on a PC and prints a
// confusion matrix (Markdown) per true label, the label taken from each file's header.
//   node apps/actcls/tools/evaluate.js <log files...>
// Use the raw log files (Web IDE storage download), not the CSV export.
const fs = require('node:fs');
const path = require('node:path');
const A = require(path.join(__dirname, '..', 'actcls.lib.js'));

const files = process.argv.slice(2);
if (!files.length) { console.log('Usage: node apps/actcls/tools/evaluate.js <log files...>'); process.exit(1); }
const cm = A.confusion();
const MAP = { sit: 'still', lie: 'still', rest: 'still' };   // logger labels that mean "still"
let total = 0, correct = 0;
for (const f of files) {
  const r = A.replay(fs.readFileSync(f, 'utf8'));
  const truth = MAP[r.label] || r.label || '?';
  let ok = 0;
  for (const w of r.windows) { cm.add(truth, w.cls); if (w.cls === truth) ok++; }
  total += r.windows.length; correct += ok;
  console.log(`${path.basename(f)}  label=${r.label}  windows=${r.windows.length}  correct=${(100 * ok / Math.max(1, r.windows.length)).toFixed(1)} %`);
}
const cols = ['still', 'fidget', 'walk', 'run', 'unknown'];
console.log(`\n| true \\ predicted | ${cols.join(' | ')} | accuracy |`);
console.log(`|---|${cols.map(() => '---:').join('|')}|---:|`);
for (const t of Object.keys(cm.m)) {
  console.log(`| ${t} | ${cols.map((c) => cm.m[t][c] || 0).join(' | ')} | ${(100 * cm.accuracy(t)).toFixed(1)} % |`);
}
console.log(`\nOverall window accuracy: ${(100 * correct / Math.max(1, total)).toFixed(1)} % (${correct}/${total})`);
