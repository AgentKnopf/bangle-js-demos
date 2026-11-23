#!/usr/bin/env node
'use strict';
// Writes synthetic labelled recordings in the prototype-06 log format to
// apps/actcls/tests/fixtures/. Deterministic (seeded), so re-running gives
// identical files.  Usage: node apps/actcls/tools/make-fixtures.js
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'tests', 'fixtures');
const DUR = 120000;     // ms per recording
const IV = 80;          // 12.5 Hz
const START = Date.UTC(2026, 0, 1, 10, 0, 0);

function rng(seed) {    // mulberry32
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / l); }
function rot(v, axis, deg) {   // Rodrigues rotation
  const k = norm(axis), a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const x = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + x[i] * s + k[i] * d * (1 - c));
}

// Each generator returns {a:[x,y,z]} per sample time and optional step flag.
const gens = {
  still(r) {
    const g = norm([0.1, -0.2, -0.97]);
    return (t) => ({ a: g.map((c) => c + 0.003 * gauss(r)) });
  },
  fidget(r) {
    let g = norm([0.15, -0.3, -0.94]), burstEnd = -1, nextBurst = 0, amp = 0;
    return (t) => {
      if (t >= nextBurst) {
        burstEnd = t + 400 + r() * 800;
        nextBurst = t + 1200 + r() * 1300;
        amp = 0.03 + r() * 0.03;
        g = norm(rot(g, [r() - 0.5, r() - 0.5, r() - 0.5], (r() - 0.5) * 16));
      }
      const j = t < burstEnd ? amp : 0.003;
      return { a: g.map((c) => c + j * gauss(r)) };
    };
  },
  walk(r) {
    const f = 1.85, g = norm([0.3, -0.1, -0.95]);
    let lastStep = 0;
    return (t) => {
      const s = t / 1000;
      const v = 0.25 * (Math.sin(2 * Math.PI * f * s) + 0.3 * Math.sin(4 * Math.PI * f * s + 1));
      const swing = 0.15 * Math.sin(Math.PI * f * s);
      const a = [g[0] * (1 + v) + swing, g[1] * (1 + v), g[2] * (1 + v)].map((c) => c + 0.02 * gauss(r));
      const step = t - lastStep >= 1000 / f; if (step) lastStep = t;
      return { a, step };
    };
  },
  run(r) {
    const f = 2.7, g = norm([0.4, -0.2, -0.9]);
    let lastStep = 0;
    return (t) => {
      const s = t / 1000;
      const v = 0.75 * (Math.sin(2 * Math.PI * f * s) + 0.25 * Math.sin(4 * Math.PI * f * s + 0.5));
      const swing = 0.4 * Math.sin(Math.PI * f * s);
      const a = [g[0] * (1 + v) + swing, g[1] * (1 + v), g[2] * (1 + v)].map((c) => c + 0.04 * gauss(r));
      const step = t - lastStep >= 1000 / f; if (step) lastStep = t;
      return { a, step };
    };
  },
};

fs.mkdirSync(OUT, { recursive: true });
Object.keys(gens).forEach((label, i) => {
  const r = rng(1000 + i);
  const gen = gens[label](r);
  const start = START + i * 5 * 60000;
  const d = new Date(start);
  const name = `log.${d.toISOString().slice(0, 10).replace(/-/g, '')}-${d.toISOString().slice(11, 16).replace(':', '')}`;
  const lines = [JSON.stringify({ v: 1, start, label, src: { a: IV } })];
  for (let t = 0; t < DUR; t += IV) {
    const ms = Math.max(0, t + Math.round((r() - 0.5) * 4));  // a little timer jitter
    const s = gen(ms);
    lines.push(`${ms},a,${s.a.map((c) => c.toFixed(2)).join(',')}`);
    if (s.step) lines.push(`${ms},s,1,,`);
  }
  fs.writeFileSync(path.join(OUT, name), lines.join('\n') + '\n');
  console.log(`${name}  ${label}  ${lines.length} lines`);
});
