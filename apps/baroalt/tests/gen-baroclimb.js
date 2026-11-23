// Run with Node: node apps/baroalt/tests/gen-baroclimb.js > apps/baroalt/tests/fixtures/baroclimb.csv
// Generates tests/fixtures/baroclimb.csv: a synthetic "recording" in the format
// the tutorial's recorder writes (t_ms,pressure_hPa,temp_C), 1 Hz, with noise.
const base = 1008.6;
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 1073741824 - 1; };
const pAt = (h) => base * Math.pow(1 - h / 44330, 5.255);
const ramp = (t, t0, t1, h0, h1) => t <= t0 ? h0 : t >= t1 ? h1 : h0 + (h1 - h0) * (t - t0) / (t1 - t0);
const h = (t) => t < 100 ? ramp(t, 20, 80, 0, 9.6) : ramp(t, 120, 140, 9.6, 6.0);
const lines = ['t,p,temp'];
for (let t = 0; t <= 180; t++) lines.push(`${t * 1000},${(pAt(h(t)) + 0.04 * rnd()).toFixed(2)},${(32.5 - t / 200).toFixed(1)}`);
process.stdout.write(lines.join('\n') + '\n');
