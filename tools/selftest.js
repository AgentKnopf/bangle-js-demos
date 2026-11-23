#!/usr/bin/env node
'use strict';
// Checks that the harness reports passes, failures and errors correctly by
// running tools/selftest/apps/ and comparing with the [pass]/[fail] test names.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const results = path.join(__dirname, '..', 'build', 'selftest-results.json');
const r = spawnSync(process.execPath, [path.join(__dirname, 'run-tests.js'), '--apps-dir', path.join(__dirname, 'selftest', 'apps'), '--results', results], { encoding: 'utf8' });
let problems = [];
if (r.status !== 1) problems.push(`runner exit code ${r.status}, expected 1 (there are deliberate failures)\n${r.stdout}\n${r.stderr}`);
const files = JSON.parse(fs.readFileSync(results, 'utf8'));
const basics = files.find((f) => f.file.endsWith('basics.test.js'));
const loadErr = files.find((f) => f.file.endsWith('load-error.test.js'));
if (!basics) problems.push('basics.test.js did not run');
else {
  if (basics.errors.length) problems.push(`basics.test.js had file errors: ${basics.errors.join('; ')}`);
  const src = fs.readFileSync(path.join(__dirname, 'selftest', 'apps', 'selfcheck', 'tests', 'basics.test.js'), 'utf8');
  const names = [...src.matchAll(/T\.test\("(\[(pass|fail)\][^"]*)"/g)].map((m) => ({ name: m[1], want: m[2] }));
  for (const { name, want } of names) {
    const got = basics.tests.find((t) => t.name === name);
    if (!got) problems.push(`${name}: not reported`);
    else if (got.evt !== want) problems.push(`${name}: reported ${got.evt}${got.msg ? ` (${got.msg})` : ''}`);
  }
  if (basics.tests.length !== names.length) problems.push(`basics.test.js reported ${basics.tests.length} results for ${names.length} tests`);
}
if (!loadErr || !loadErr.errors.some((e) => /thisFileIsBroken/.test(e))) problems.push(`load-error.test.js: expected a file error naming thisFileIsBroken, got ${JSON.stringify(loadErr && loadErr.errors)}`);
if (problems.length) {
  console.log(`Harness self-test FAILED:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Harness self-test passed (${basics.tests.length} scripted outcomes + load error detection).`);
