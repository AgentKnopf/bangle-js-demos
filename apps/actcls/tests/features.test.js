// Feature functions, rules, restlessness formula, summary rollover and timeline.
// RAM copy of the module: code run from (emulated) flash is ~10x slower, and these tests feed thousands of samples
var A = T.requireRAM("actcls");
var IV = 80, T0 = 1767258000000 /* 2026-01-01 09:00 UTC */;

var seed = 1;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; }

// Feed `ms` of samples from f(t) -> {x,y,z} into classifier c, starting at t0.
function feed(c, t0, ms, f, iv) {
  iv = iv || IV;
  for (var t = t0; t < t0 + ms; t += iv) c.onAccel(f(t), t);
  return t0 + ms;
}
function still(t) { return { x: 0, y: 0, z: -1 - 0.002 * rnd() }; }
function fidget(t) { return { x: 0.06 * rnd(), y: 0.06 * rnd(), z: -1 + 0.06 * rnd() }; }
function sine(f, amp) { return function (t) { return { x: 0, y: 0, z: -(1 + amp * Math.sin(2 * Math.PI * f * t / 1000 + 0.3)) }; }; }
function collect(opts) {
  var ws = [];
  opts = opts || {};
  opts.onWindow = function (w) { ws.push(w); };
  return { c: A.create(opts), ws: ws };
}
function counts(ws, from) {
  var o = {};
  for (var i = from || 0; i < ws.length; i++) o[ws[i].cls] = (o[ws[i].cls] || 0) + 1;
  return o;
}

// ---- criterion 1: feature functions ----
T.test("constant 1 g: mean 1, sd 0, p2p 0, no crossings", function () {
  var m = new Float32Array(50); m.fill(1);
  var f = A.features(m, null, null, null, 50);
  T.near(f.meanMag, 1, 1e-6); T.near(f.sdMag, 0, 1e-6); T.near(f.p2p, 0, 1e-6); T.eq(f.zeroX, 0);
});

T.test("2 Hz sine, amplitude 0.2 g: sd = 0.2/sqrt(2), 15 crossings in 50 samples", function () {
  var m = new Float32Array(50);
  for (var i = 0; i < 50; i++) m[i] = 1 + 0.2 * Math.sin(2 * Math.PI * 2 * i * 0.08 + 0.3);
  var f = A.features(m, null, null, null, 50);
  // 8 full cycles in 4 s; the window starts after the first zero, so 15 sign changes fall between samples
  T.near(f.meanMag, 1, 0.01, "mean");
  T.near(f.sdMag, 0.2 / Math.sqrt(2), 0.005, "sd");
  T.near(f.p2p, 0.4, 0.02, "p2p");
  T.eq(f.zeroX, 15, "zeroX");
});

T.test("orientation change: 90 degrees between axes, 0 for same vector", function () {
  T.near(A.angle({ gx: 0, gy: 0, gz: -1 }, { gx: 1, gy: 0, gz: 0 }), 90, 1e-3);
  T.near(A.angle({ gx: 0, gy: 0.5, gz: -1 }, { gx: 0, gy: 0.5, gz: -1 }), 0, 0.1);
});

T.test("streaming window of the 2 Hz sine gives the same sd and zeroX", function () {
  var k = collect();
  feed(k.c, T0, 4100, sine(2, 0.2));
  T.eq(k.ws.length, 1, "windows");
  T.eq(k.ws[0].n, 50, "samples");
  T.near(k.ws[0].sdMag, 0.141, 0.003, "sd");
  T.near(k.ws[0].zeroX, 16, 1, "zeroX");
  T.eq(k.ws[0].hz, 12.5, "hz");
});

// ---- rules ----
T.test("rules table", function () {
  T.eq(A.classify({ sdMag: 0.004, zeroX: 3, orient: 1, steps: 0 }).cls, "still");
  T.eq(A.classify({ sdMag: 0.004, zeroX: 3, orient: 12, steps: 0 }).cls, "fidget", "posture change is not still");
  T.eq(A.classify({ sdMag: 0.04, zeroX: 9, orient: 1, steps: 0 }).cls, "fidget");
  T.eq(A.classify({ sdMag: 0.2, zeroX: 15, orient: 1, steps: 0 }).cls, "walk");
  T.eq(A.classify({ sdMag: 0.05, zeroX: 4, orient: 1, steps: 4 }).cls, "walk", "steps cross-check");
  T.eq(A.classify({ sdMag: 0.5, zeroX: 21, orient: 1, steps: 10 }).cls, "run");
  T.eq(A.classify({ sdMag: 0.5, zeroX: 4, orient: 1, steps: 0 }).cls, "unknown");
  T.eq(A.classify({ sdMag: 0.2, zeroX: 15, orient: 1, steps: 0 }).conf > 0.5, true, "clear walk is confident");
  T.ok(A.classify({ sdMag: 0.009, zeroX: 0, orient: 0, steps: 0 }).conf < 0.3, "near the still boundary is not confident");
});

T.test("typing-like arm movement (sd 0.1, 5 Hz, no steps) stays out of walk", function () {
  var k = collect();
  feed(k.c, T0, 20000, sine(5, 0.14));
  var o = counts(k.ws);
  T.eq(o.walk, undefined, "walk windows " + JSON.stringify(o));
});

// ---- criterion 4: restlessness ----
T.test("restlessness: 0 for pure still, monotonic in fidget share, capped at 100", function () {
  var codes = new Uint8Array(150), flags = new Uint8Array(150), prev = -1;
  T.eq(A.restlessness(codes, flags, 150), -1, "no rest windows");
  codes.fill(1);
  T.eq(A.restlessness(codes, flags, 150), 0, "pure still");
  for (var f = 0; f <= 150; f += 15) {
    for (var i = 0; i < 150; i++) codes[i] = i < f ? 2 : 1;
    var s = A.restlessness(codes, flags, 150);
    T.ok(s >= prev, "monotonic at " + f + ": " + s + " < " + prev);
    T.ok(s <= 100, "cap");
    prev = s;
  }
  T.eq(prev, 100, "all fidget");
  flags.fill(1);
  T.eq(A.restlessness(codes, flags, 150), 100, "posture changes capped");
});

// ---- criterion 6: summary rollover (time given explicitly) ----
T.test("summary adds minutes and rolls over at midnight", function () {
  var s = A.summary({ v: 1, day: "2026-01-01", min: { still: 10, fidget: 0, walk: 0, run: 0 } });
  var late = 1767311940000 /* 2026-01-01 23:59 UTC */;
  for (var i = 0; i < 30; i++) s.add("walk", 2000, late + i * 2000 - 1000);
  T.eq(s.json(), { v: 1, day: "2026-01-01", min: { still: 10, fidget: 0, walk: 1, run: 0 } });
  T.eq(s.add("still", 2000, 1767312001000 /* 2026-01-02 00:00:01 UTC */), true, "rollover reported");
  T.eq(s.json(), { v: 1, day: "2026-01-02", min: { still: 0, fidget: 0, walk: 0, run: 0 } });
});

T.test("summary ignores unknown and keeps a loaded day", function () {
  var s = A.summary({ v: 1, day: "2026-01-01", min: { still: 3, fidget: 1, walk: 0, run: 0 } });
  T.eq(s.add("unknown", 60000, T0), false);
  T.eq(s.json().min.still, 3);
});

T.test("timeline keeps 30 min of 15 s slots, oldest first", function () {
  var tl = A.timeline(120, 15000);
  tl.add(1, T0);
  tl.add(3, T0 + 15000);
  var s = tl.get();
  T.eq(s.length, 120); T.eq(s[118], 1); T.eq(s[119], 3);
  tl.add(4, T0 + 31 * 60000);
  s = tl.get();
  T.eq(s[119], 4); T.eq(s.filter(function (c) { return c === 1 || c === 3; }).length, 0, "old slots cleared");
});
