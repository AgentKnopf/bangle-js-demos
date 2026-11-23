// Pure barometer logic with synthetic pressure traces (no sensor needed).
// Same module as require("baroalt"), loaded as a RAM copy: the emulator runs
// code stored in flash about 10x slower, and these tests feed tens of
// thousands of samples.
var B = T.requireRAM("baroalt");
T.test("RAM copy and require() are the same module", function () {
  var R = require("baroalt");
  T.eq(Object.keys(B), Object.keys(R));
  T.eq(B.altitude(950), R.altitude(950));
});
var P0 = 1013.25;

// Deterministic noise in [-1, 1)
var seed = 1;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 1073741824 - 1; }

// Feed a pressure trace: hOf(tSec) -> metres, or pOf(tSec) -> hPa (if opts.pressure).
// Returns {tr, n (results), last, maxAbsAlt}. Results are not kept: the watch has little RAM.
function run(fn, seconds, opts) {
  opts = opts || {};
  var hz = opts.hz || 1, tr = opts.tracker || B.create(opts.cfg), n = 0, last, maxAbs = 0;
  var t0 = opts.t0 || 0;
  for (var i = 0; i <= seconds * hz; i++) {
    var ts = i / hz;
    var p = opts.pressure ? fn(ts) : B.pressureAt(fn(ts), P0);
    if (opts.noise) p += opts.noise * rnd();
    var r = tr.feed({ p: p, temp: 31.2, t: t0 + Math.round(ts * 1000) });
    if (r) { n++; last = r; maxAbs = Math.max(maxAbs, Math.abs(r.altS)); }
  }
  return { tr: tr, n: n, last: last, maxAbsAlt: maxAbs };
}
// Ramp from h0 to h1 between t0 and t1 (seconds), flat outside.
function ramp(t, t0, t1, h0, h1) {
  if (t <= t0) return h0;
  if (t >= t1) return h1;
  return h0 + (h1 - h0) * (t - t0) / (t1 - t0);
}

T.test("criterion 6: barometric formula reference values", function () {
  T.near(B.altitude(1013.25, 1013.25), 0, 1e-9, "1013.25 hPa");
  T.near(B.altitude(900, 1013.25), 988, 1, "900 hPa");
  T.near(B.altitude(1013.25), 0, 1e-9, "default p0");
  T.near(B.altitude(1000, 1000), 0, 1e-9, "other reference");
  T.near(B.altitude(B.pressureAt(123.4)), 123.4, 1e-6, "inverse");
});

T.test("criterion 1: falling pressure worth 9.5 m over 60 s counts exactly 3 floors up", function () {
  [1, 10].forEach(function (hz) {
    var r = run(function (t) { return ramp(t, 10, 70, 0, 9.5); }, 120, { hz: hz });
    T.eq(r.last.up, 3, hz + " Hz up");
    T.eq(r.last.down, 0, hz + " Hz down");
    T.near(r.last.altS, 9.5, 0.2, hz + " Hz altitude");
  });
});

T.test("criterion 2: +/-0.1 hPa noise around a constant gives 0 floors over 10 min", function () {
  var r = run(function () { return 1009.42; }, 600, { pressure: true, noise: 0.1 });
  T.eq(r.last.up + r.last.down, 0, "1 Hz floors");
  T.ok(r.n >= 590 && r.n <= 601, "about one result per second: " + r.n);
  r = run(function () { return 1009.42; }, 120, { hz: 10, pressure: true, noise: 0.1 });
  T.eq(r.last.up + r.last.down, 0, "10 Hz floors (2 min)");
  T.ok(r.n >= 110 && r.n <= 121, "10 Hz resampled to 1 Hz: " + r.n);
});

T.test("criterion 3: 1 hPa drift over an hour gives 0 floors", function () {
  var r = run(function (t) { return 1013 - t / 3600; }, 3600, { pressure: true });
  T.eq(r.last.up + r.last.down, 0, "floors");
  T.near(r.last.altS, 8.3, 0.5, "the altitude itself does drift");
  var n = run(function (t) { return 1013 + t / 3600; }, 3600, { pressure: true, noise: 0.1 });
  T.eq(n.last.up + n.last.down, 0, "rising, with noise");
});

T.test("criterion 4: a single 3 hPa spike sample is rejected", function () {
  [1, 10].forEach(function (hz) {
    var r = run(function (t) { return t >= 30 && t < 30 + 1 / hz ? 1010 - 3 : 1010; }, 60, { hz: hz, pressure: true });
    T.eq(r.last.up + r.last.down, 0, hz + " Hz floors");
    T.eq(r.tr.rejected(), 1, hz + " Hz rejected samples");
    T.ok(r.maxAbsAlt < 0.01, "altitude untouched: " + r.maxAbsAlt);
  });
});

T.test("a jump that lasts longer than 3 s is accepted", function () {
  var r = run(function (t) { return t < 30 ? 1010 : 1008.5; }, 60, { pressure: true });
  T.ok(r.tr.rejected() >= 2 && r.tr.rejected() <= 3, "rejected while short: " + r.tr.rejected());
  T.near(r.last.altS, B.altitude(1008.5) - B.altitude(1010), 0.1, "new level");
});

T.test("criterion 5: up 3 floors then down 2 -> up 3, down 2, altitude about +3 m", function () {
  var r = run(function (t) {
    return t < 80 ? ramp(t, 10, 70, 0, 9.5) : ramp(t, 90, 135, 9.5, 2.7);
  }, 180);
  T.eq(r.last.up, 3, "up");
  T.eq(r.last.down, 2, "down");
  T.near(r.last.altS, 3, 0.5, "relative altitude");
});

T.test("first 2 s after power-on are discarded", function () {
  var tr = B.create();
  T.eq(tr.feed({ p: 900, temp: 20, t: 0 }), null);
  T.eq(tr.feed({ p: 900, temp: 20, t: 1999 }), null);
  T.eq(tr.feed({ p: 1010, temp: 20, t: 2000 }), null, "collecting the first second");
  var r = tr.feed({ p: 1010, temp: 20, t: 3000 });
  T.eq(r.p, 1010, "first result ignores the 900 hPa warm-up readings");
  T.eq(r.alt, 0);
});

T.test("gaps and slow sensors: 0.5 Hz still produces results", function () {
  var r = run(function (t) { return ramp(t, 10, 70, 0, 9.5); }, 150, { hz: 0.5 });
  T.eq(r.last.up, 3);
});

T.test("reset during a climb never gives negative counts", function () {
  var tr = B.create(), t = 0, minUp = 0, minDown = 0;
  function step(h) { var r = tr.feed({ p: B.pressureAt(h), temp: 30, t: t }); t += 1000; if (r) { minUp = Math.min(minUp, r.up); minDown = Math.min(minDown, r.down); } return r; }
  for (var i = 0; i < 10; i++) step(0);
  for (i = 0; i < 30; i++) step(i * 0.2);       // climbing 0.2 m/s
  tr.reset();
  T.eq(tr.last().altS, 0, "zero after reset");
  T.eq(tr.last().up, 0);
  for (i = 30; i < 60; i++) step(i * 0.2);
  for (i = 0; i < 20; i++) step(12);
  var last = tr.last();
  T.ok(minUp >= 0 && minDown >= 0, "never negative");
  T.eq(last.down, 0, "no down floors from the reset");
  T.ok(last.up >= 1 && last.up <= 2, "counting carries on: " + last.up);
});

T.test("step cross-check: a lift without steps counts 0, with steps it counts", function () {
  function lift(withSteps) {
    var tr = B.create({ stepCheck: true });
    for (var s = 0; s <= 120; s++) {
      if (withSteps && s % 1 === 0) tr.onStep(s * 1000);
      tr.feed({ p: B.pressureAt(ramp(s, 10, 40, 0, 9.5)), temp: 30, t: s * 1000 });
    }
    return tr.last();
  }
  T.eq(lift(false).up, 0, "lift");
  T.eq(lift(true).up, 3, "stairs");
  T.eq(run(function (t) { return ramp(t, 10, 40, 0, 9.5); }, 120).last.up, 3, "cross-check off by default");
});

T.test("sparkline history: one point per 10 s, last 10 minutes", function () {
  var r = run(function (t) { return t / 100; }, 900);
  var h = r.tr.history();
  T.eq(h.length, 60);
  T.near(h[h.length - 1], 9, 0.3, "newest point");
});

T.test("absolute altitude uses the sea-level reference", function () {
  var r = run(function () { return 1000; }, 10, { pressure: true });
  T.near(r.tr.absAltitude(1013.25), B.altitude(1000, 1013.25), 1e-6);
  T.near(r.tr.absAltitude(1000), 0, 1e-6);
});

T.test("press recognizer: tap and long press", function (done) {
  var p = B.createPress(), got = [];
  p.on("gesture", function (e) { got.push(e.type); });
  p.feed({ x: 88, y: 88, b: 1, t: 0 });
  p.feed({ x: 88, y: 88, b: 0, t: 120 });
  p.feed({ x: 88, y: 88, b: 1, t: 1000 });
  setTimeout(function () {
    p.feed({ x: 88, y: 88, b: 0, t: 1800 });
    T.eq(got, ["tap", "longpress"]);
    done();
  }, 700);
});
