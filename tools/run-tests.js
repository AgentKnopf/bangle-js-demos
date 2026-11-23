#!/usr/bin/env node
'use strict';
// Runs apps/<id>/tests/*.test.js inside the Bangle.js 2 emulator.
// Usage: node tools/run-tests.js [appId...] [--grep <regex>] [--verbose] [--shots <dir>] [--apps-dir <dir>] [--results <file>]
const fs = require('node:fs');
const path = require('node:path');
const { Emulator, uploadApp } = require('./lib/emulator');

const ROOT = path.resolve(__dirname, '..');
const PRELUDE = fs.readFileSync(path.join(__dirname, 'lib', 'prelude.js'), 'utf8');

function parseArgs(argv) {
  const o = { ids: [], verbose: false, grep: null, shots: path.join(ROOT, 'build', 'screenshots'), appsDir: path.join(ROOT, 'apps'), results: path.join(ROOT, 'build', 'test-results.json'), timeout: 3600000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verbose' || a === '-v') o.verbose = true;
    else if (a === '--grep') o.grep = new RegExp(argv[++i]);
    else if (a === '--shots') o.shots = path.resolve(argv[++i]);
    else if (a === '--apps-dir') o.appsDir = path.resolve(argv[++i]);
    else if (a === '--timeout') o.timeout = Number(argv[++i]);
    else if (a === '--results') o.results = path.resolve(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node tools/run-tests.js [appId...] [--grep <regex on file path>] [--verbose] [--shots <dir>] [--apps-dir <dir>] [--results <file.json>] [--timeout <virtual ms per file>]');
      process.exit(0);
    } else if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
    else o.ids.push(a);
  }
  return o;
}

function listApps(appsDir, ids) {
  const all = fs.readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .filter((id) => fs.existsSync(path.join(appsDir, id, 'metadata.json')))
    .sort();
  for (const id of ids) if (!all.includes(id)) throw new Error(`No app "${id}" in ${appsDir}`);
  return ids.length ? ids : all;
}

function listTests(appDir) {
  const dir = path.join(appDir, 'tests');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(dir, f));
}

async function runFile(id, appDir, file, opts) {
  const rel = path.relative(ROOT, file);
  const result = { app: id, file: rel, tests: [], errors: [], log: [] };
  let ended = false;
  const emu = new Emulator({
    onLine: (line) => {
      result.log.push(line);
      const i = line.indexOf('@@T ');
      if (i >= 0) {
        let ev;
        try { ev = JSON.parse(line.slice(i + 4)); } catch (e) { result.errors.push(`Bad harness line: ${line}`); return; }
        if (ev.evt === 'pass' || ev.evt === 'fail') {
          result.tests.push(ev);
          console.log(`  ${ev.evt === 'pass' ? 'PASS' : 'FAIL'}  ${ev.name}${ev.msg ? `\n        ${ev.msg}` : ''}`);
        } else if (ev.evt === 'error') result.errors.push(`Uncaught outside a test: ${ev.msg}`);
        else if (ev.evt === 'end') ended = true;
        return;
      }
      if (/Uncaught|^ERROR|ASSERT FAILED|New interpreter error/.test(line)) result.errors.push(line);
      if (opts.verbose) console.log(`      | ${line}`);
    },
    onHostCommand: (cmd, e) => {
      switch (cmd.cmd) {
        case 'tap': e.tap(cmd.x, cmd.y, cmd.ms); break;
        case 'touch': e.touch(cmd.x, cmd.y, cmd.b, cmd.gesture); break;
        case 'swipe': e.swipe(cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.ms, cmd.steps); break;
        case 'press': e.press(cmd.ms); break;
        case 'button': e.button(cmd.pressed); break;
        case 'screenshot': {
          const name = String(cmd.name || 'shot').replace(/[^\w.-]/g, '_');
          const out = e.saveScreenshot(path.join(opts.shots, id, `${name}.png`));
          if (opts.verbose) console.log(`      screenshot -> ${path.relative(ROOT, out)}`);
          break;
        }
        default: result.errors.push(`Unknown host command ${JSON.stringify(cmd)}`);
      }
    },
  });
  console.log(rel);
  try {
    await emu.boot();
    uploadApp(emu, appDir);
    const fixtures = path.join(appDir, 'tests', 'fixtures');
    if (fs.existsSync(fixtures)) for (const f of fs.readdirSync(fixtures)) emu.writeFile(f, fs.readFileSync(path.join(fixtures, f)));
    emu.writeFile('_T.js', PRELUDE);
    emu.writeFile('_test.js', fs.readFileSync(file));
    emu.command('eval(require("Storage").read("_T.js"))');
    emu.command('eval(require("Storage").read("_test.js"))');
    emu.command('T.run()');
    if (!emu.runUntil(() => ended, { timeout: opts.timeout })) result.errors.push(`Tests did not finish within ${opts.timeout} ms of virtual time`);
  } catch (e) {
    result.errors.push(String(e && e.stack || e));
  }
  for (const err of result.errors) console.log(`  ERROR ${err}`);
  if (!result.tests.length && !result.errors.length) result.errors.push('No tests ran');
  return result;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ids = listApps(opts.appsDir, opts.ids);
  const results = [];
  for (const id of ids) {
    const appDir = path.join(opts.appsDir, id);
    const files = listTests(appDir).filter((f) => !opts.grep || opts.grep.test(f));
    if (!files.length) console.log(`apps/${id}: no tests`);
    for (const f of files) results.push(await runFile(id, appDir, f, opts));
  }
  const tests = results.flatMap((r) => r.tests);
  const failed = tests.filter((t) => t.evt === 'fail').length;
  const errors = results.reduce((n, r) => n + r.errors.length, 0);
  if (process.env.GITHUB_ACTIONS) {
    for (const r of results) {
      for (const t of r.tests.filter((x) => x.evt === 'fail')) console.log(`::error file=${r.file}::${t.name}: ${t.msg}`);
      for (const e of r.errors) console.log(`::error file=${r.file}::${e.split('\n')[0]}`);
    }
  }
  fs.mkdirSync(path.dirname(opts.results), { recursive: true });
  fs.writeFileSync(opts.results, JSON.stringify(results, null, 2));
  console.log(`\n${results.length} file(s), ${tests.length - failed} passed, ${failed} failed, ${errors} error(s)`);
  process.exit(failed || errors || !results.length ? 1 : 0);
}

main().catch((e) => { console.error(e.stack || e); process.exit(2); });
