#!/usr/bin/env node
'use strict';
// Checks every apps/<id>/ against the repo conventions (see AGENTS.md).
// Usage: node tools/check-apps.js [appId...]
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APPS = path.join(ROOT, 'apps');
const MAX_SOURCE = 20 * 1024;
const REQUIRED = ['id', 'name', 'shortName', 'version', 'description', 'icon', 'type', 'tags', 'supports', 'readme', 'storage'];

function checkApp(id) {
  const errors = [];
  const warnings = [];
  const dir = path.join(APPS, id);
  const has = (f) => fs.existsSync(path.join(dir, f));
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
  } catch (e) {
    return { errors: [`metadata.json: ${e.message}`], warnings };
  }
  for (const k of REQUIRED) if (meta[k] === undefined) errors.push(`metadata.json: missing "${k}"`);
  if (meta.id !== id) errors.push(`metadata.json: id "${meta.id}" must match folder name "${id}"`);
  if (!/^[a-z0-9]+$/.test(id) || id.length > 20) errors.push('app id must be lowercase letters/digits, at most 20 characters');
  if (meta.version && !/^\d+\.\d\d$/.test(meta.version)) errors.push(`version "${meta.version}" should look like 0.01`);
  if (meta.supports && !meta.supports.includes('BANGLEJS2')) errors.push('supports must include "BANGLEJS2"');
  if (meta.icon && !has(meta.icon)) errors.push(`icon file ${meta.icon} not found`);
  if (meta.readme && !has(meta.readme)) errors.push(`readme ${meta.readme} not found`);
  const storage = meta.storage || [];
  const names = storage.map((s) => s.name);
  if (meta.type === 'app' && !names.includes(`${id}.app.js`)) errors.push(`storage must include "${id}.app.js"`);
  if (meta.type === 'app' && !names.includes(`${id}.img`)) errors.push(`storage must include "${id}.img"`);
  for (const s of storage) {
    if (!s.name) errors.push('storage entry without name');
    else if (s.name.length > 28) errors.push(`storage name "${s.name}" is longer than 28 characters`);
    if (s.url) {
      if (!has(s.url)) errors.push(`storage file ${s.url} not found`);
      else if (/\.js$/.test(s.url) && fs.statSync(path.join(dir, s.url)).size > MAX_SOURCE) warnings.push(`${s.url} is over 20 KB (convention: keep each app under ~20 KB of source)`);
    }
  }
  if (!has('HW-TESTS.md')) errors.push('HW-TESTS.md missing (copy hw-tests/TEMPLATE.md)');
  if (!has('tests') || !fs.readdirSync(path.join(dir, 'tests')).some((f) => f.endsWith('.test.js'))) errors.push('no tests/*.test.js');
  return { errors, warnings };
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(APPS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.')).map((d) => d.name).sort();
let bad = 0;
for (const id of ids) {
  const { errors, warnings } = checkApp(id);
  for (const w of warnings) console.log(`apps/${id}: warning: ${w}`);
  for (const e of errors) console.log(`apps/${id}: error: ${e}`);
  if (errors.length) bad++;
  else console.log(`apps/${id}: ok`);
}
process.exit(bad ? 1 : 0);
