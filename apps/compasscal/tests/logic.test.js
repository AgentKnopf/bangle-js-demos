// Pure compass logic: calibration, heading maths, smoothing and bearings.
var C = require("compasscal");
var D = 180 / Math.PI;
var TRUE_OFF = [12.5, -40, 3], TRUE_SCALE = [1.02, 0.97, 1.01], H = 200, DIP = 60 / D;

// Raw reading for a watch lying flat and pointing at `deg` (magnetic), seen through
// a hard-iron offset and a soft-iron scale per axis.
function rawFor(deg, gain) {
  var a = deg / D, k = gain || 1;
  var v = [-Math.sin(a) * Math.cos(DIP) * H * k, Math.cos(a) * Math.cos(DIP) * H * k, -Math.sin(DIP) * H * k];
  return { x: v[0] / TRUE_SCALE[0] + TRUE_OFF[0], y: v[1] / TRUE_SCALE[1] + TRUE_OFF[1], z: v[2] / TRUE_SCALE[2] + TRUE_OFF[2] };
}

// Synthetic calibration: rotate the watch through the whole sphere of directions.
function calibrate() {
  var c = C.createCalibrator(), t = 0;
  for (var el = -90; el <= 90; el += 15) for (var az = 0; az < 360; az += 15) {
    var e = el / D, z = az / D;
    var u = [Math.cos(e) * Math.cos(z), Math.cos(e) * Math.sin(z), Math.sin(e)];
    c.add({ x: u[0] * H / TRUE_SCALE[0] + TRUE_OFF[0], y: u[1] * H / TRUE_SCALE[1] + TRUE_OFF[1], z: u[2] * H / TRUE_SCALE[2] + TRUE_OFF[2] }, t);
    t += 50;
  }
  T.ok(c.done(t), "calibration complete");
  return c.result(1732000000);
}

function angErr(a, b) { return Math.abs(C.diff(a, b)); }

T.test("criterion 1: headings around a circle within 1 degree after calibration", function () {
  var cal = calibrate();
  T.near(cal.offset[0], TRUE_OFF[0], 0.01, "offset x");
  T.near(cal.offset[1], TRUE_OFF[1], 0.01, "offset y");
  T.near(cal.offset[2], TRUE_OFF[2], 0.01, "offset z");
  var worst = 0;
  for (var deg = 0; deg < 360; deg += 5) {
    var flat = { x: 0, y: 0, z: -1 };
    var off = C.heading(C.correct(cal, rawFor(deg)), flat, false).h;
    var on = C.heading(C.correct(cal, rawFor(deg)), flat, true).h;
    worst = Math.max(worst, angErr(off, deg), angErr(on, deg));
  }
  T.ok(worst <= 1, "worst error " + worst);
});

T.test("criterion 2: smoothing across 358, 359, 1, 2 gives about 0, not 180", function () {
  var s = C.createSmoother(5), out;
  [358, 359, 1, 2].forEach(function (d) { out = s.add(d); });
  T.ok(angErr(out, 0) < 0.5, "smoothed " + out);
  s.reset();
  [10, 10, 10, 10, 10, 20, 20, 20, 20, 20].forEach(function (d) { out = s.add(d); });
  T.near(out, 20, 1e-6, "window keeps only the last 5");
});

T.test("criterion 3: bearing difference table incl. wraparound", function () {
  var table = [
    // target, heading, expected signed turn (+ = right)
    [350, 10, -20], [10, 350, 20], [0, 0, 0], [90, 0, 90], [0, 90, -90],
    [180, 0, 180], [0, 180, 180], [359, 1, -2], [1, 359, 2], [270, 45, -135],
    [45, 270, 135], [200, 10, -170], [123.5, 100, 23.5], [0, 359.9, 0.1]
  ];
  table.forEach(function (c) {
    T.near(C.diff(c[0], c[1]), c[2], 1e-6, "target " + c[0] + " heading " + c[1]);
  });
  T.eq(C.turnText(C.diff(350, 10)), "turn 20\xB0 left");
  T.eq(C.turnText(C.diff(40, 10)), "turn 30\xB0 right");
  T.eq(C.turnText(2), "on target");
});

T.test("cardinal labels use 16 points", function () {
  var cases = { 0: "N", 11: "N", 12: "NNE", 45: "NE", 90: "E", 135: "SE", 180: "S", 202.5: "SSW", 225: "SW", 270: "W", 315: "NW", 349: "N", 348: "NNW", 359.9: "N" };
  for (var k in cases) T.eq(C.cardinal(Number(k)), cases[k], String(k));
});

T.test("calibration from min/max samples gives expected offsets and scales", function () {
  var c = C.createCalibrator();
  T.eq(c.progress(), 0);
  [[162.5, -40, 3], [-137.5, -40, 3], [12.5, 120, 3], [12.5, -200, 3], [12.5, -40, 143], [12.5, -40, -137]]
    .forEach(function (v, i) { c.add({ x: v[0], y: v[1], z: v[2] }, i * 100); });
  T.ok(c.done(600));
  var r = c.result(1732000000);
  T.eq(r.v, 1);
  T.eq(r.offset, [12.5, -40, 3]);
  T.near(r.scale[0], 300 / 300, 1e-9);
  T.near(r.scale[1], 300 / 320, 1e-9);
  T.near(r.scale[2], 300 / 280, 1e-9);
  T.near(r.norm, 150, 1e-9);
  T.eq(r.t, 1732000000);
});

T.test("calibration waits for range, then accepts partial range after 20 s", function () {
  var c = C.createCalibrator();
  c.add({ x: 0, y: 0, z: 0 }, 0);
  c.add({ x: 60, y: 60, z: 40 }, 1000);
  T.ok(!c.done(1000), "not done at 1 s");
  T.ok(c.progress() > 0.3 && c.progress() < 1, "progress " + c.progress());
  T.ok(c.done(20000), "done after 20 s");
  var d = C.createCalibrator();
  d.add({ x: 0, y: 0, z: 0 }, 0);
  d.add({ x: 5, y: 5, z: 5 }, 1000);
  T.ok(!d.done(30000), "tiny range never completes");
  T.ok(!C.createCalibrator().done(1e6), "no samples never completes");
});

T.test("parseCal rejects missing and corrupt calibration", function () {
  var good = { v: 1, offset: [1, 2, 3], scale: [1, 1, 1], norm: 100, t: 0 };
  T.eq(C.parseCal(good), good);
  [undefined, null, "x", 42, {}, { v: 2, offset: [1, 2, 3], scale: [1, 1, 1], norm: 1 },
    { v: 1, offset: [1, 2], scale: [1, 1, 1], norm: 1 }, { v: 1, offset: [1, 2, "a"], scale: [1, 1, 1], norm: 1 },
    { v: 1, offset: [1, 2, 3], scale: [1, 0, 1], norm: 1 }, { v: 1, offset: [1, 2, 3], scale: [1, 1, 1] }]
    .forEach(function (o, i) { T.eq(C.parseCal(o), null, "case " + i); });
});

T.test("tilt angle from the accelerometer", function () {
  T.near(C.tilt({ x: 0, y: 0, z: -1 }), 0, 1e-6, "flat");
  T.near(C.tilt({ x: Math.sin(40 / D), y: 0, z: -Math.cos(40 / D) }), 40, 1e-3, "40 deg roll");
  T.near(C.tilt({ x: 0, y: -Math.sin(30 / D), z: -Math.cos(30 / D) }), 30, 1e-3, "30 deg pitch");
  T.near(C.tilt({ x: 0, y: 0, z: 1 }), 180, 1e-6, "face down");
  T.eq(C.tilt(undefined), 0);
});

T.test("tilt compensation keeps the heading when the watch is tilted", function () {
  // Rotate both gravity and the (dipping) field by the same tilt: the watch-frame
  // readings a tilted watch would see.
  function rotX(v, a) { return [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)]; }
  function rotY(v, a) { return [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]; }
  var worst = 0, worstOff = 0;
  for (var deg = 0; deg < 360; deg += 30) {
    var a = deg / D;
    var m = [-Math.sin(a) * Math.cos(DIP) * H, Math.cos(a) * Math.cos(DIP) * H, -Math.sin(DIP) * H];
    var gv = [0, 0, -1];
    [[30, 0], [0, 30], [20, -25]].forEach(function (t) {
      var mm = rotY(rotX(m, t[0] / D), t[1] / D), gg = rotY(rotX(gv, t[0] / D), t[1] / D);
      var acc = { x: gg[0], y: gg[1], z: gg[2] };
      worst = Math.max(worst, angErr(C.heading(mm, acc, true).h, deg));
      worstOff = Math.max(worstOff, angErr(C.heading(mm, acc, false).h, deg));
    });
  }
  T.ok(worst < 0.01, "compensated worst " + worst);
  T.ok(worstOff > 10, "uncompensated is off by " + worstOff);
});

T.test("interference: field magnitude beyond +/-40 %", function () {
  var cal = { v: 1, offset: [0, 0, 0], scale: [1, 1, 1], norm: 100 };
  T.eq(C.interference(cal, [0, 100, 0]), false);
  T.eq(C.interference(cal, [0, 139, 0]), false);
  T.eq(C.interference(cal, [0, 141, 0]), true);
  T.eq(C.interference(cal, [0, 59, 0]), true);
});

T.test("the gestures module (touchgest) ships with the app", function () {
  var G = require("gestures");
  var r = G.create({ instantTap: true }), got = [];
  r.on("gesture", function (e) { got.push(e.type); });
  r.feed({ x: 88, y: 88, b: 1, t: 0 });
  r.feed({ x: 89, y: 88, b: 0, t: 100 });
  T.eq(got, ["tap"], "instant tap");
});
