// Pure logic: recording format, onset detector, model checks, normalisation, decisions.
var G = T.requireRAM("tfgest");
var T0 = 1767258000000; // 2026-01-01 09:00 UTC
var seed = 3;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; }
function rest() { return { x: 0.02 * 2 * rnd(), y: 0.02 * 2 * rnd(), z: -1 + 0.02 * 2 * rnd() }; }
function flick(i) { return { x: i < 3 ? 0.9 : -0.7, y: 0.1, z: -1 }; }
var META = { v: 1, labels: G.LABELS, n: 19, hz: 12.5, scale: 0.01, quant: "int8", io: "float32", thresh: 0.7, arena: 8000 };

// ---- criterion 1 (format) ----
T.test("encode writes n x 3 int8 values that parse back", function () {
  var xyz = [];
  for (var i = 0; i < 57; i++) xyz.push(i % 2 ? 300 : -1.4 * i);
  var line = G.encode("twist", xyz, T0, 12.5);
  var r = G.parse(line);
  T.ok(r, "parses");
  T.eq(r.n, 19); T.eq(r.hz, 12.5); T.eq(r.label, "twist"); T.eq(r.xyz.length, 57);
  T.eq(r.xyz[1], 127, "clamped high"); T.eq(r.xyz[56], -78, "rounded"); T.eq(r.xyz[54], -76);
  r.xyz.forEach(function (v) { T.ok(v >= -128 && v <= 127, "range " + v); });
});

T.test("parse rejects bad lines", function () {
  T.eq(G.parse('{"v":1,"label":"x","hz":12.5,"n":2,"t":0,"xyz":[1,2,3]}'), undefined, "wrong length");
  T.eq(G.parse('{"v":1,"label":"x","hz":12.5,"n":1,"t":0,"xyz":[1,2,300]}'), undefined, "out of range");
  T.eq(G.parse('{"v":1,"label":"x","hz":12.5,"n":1,"t":0,"xyz":[1,2'), undefined, "cut off");
  T.eq(G.parse("hello"), undefined);
});

// ---- criterion 2: onset detector ----
T.test("detector fires once on a synthetic burst, window includes the onset", function () {
  var got = [];
  var d = G.detector({ onWindow: function (xyz, t) { got.push({ xyz: xyz, t: t }); } });
  var t = T0, i;
  for (i = 0; i < 25; i++, t += 80) d.feed(rest(), t);
  for (i = 0; i < 6; i++, t += 80) d.feed(flick(i), t);
  for (i = 0; i < 30; i++, t += 80) d.feed(rest(), t);
  T.eq(got.length, 1, "one window");
  T.eq(got[0].xyz.length, 57);
  T.eq(got[0].xyz[9], 90, "sample 3 (after 3 pre samples) is the onset, x = 0.9 g");
  T.ok(Math.abs(got[0].xyz[0]) < 5, "pre samples are at rest");
});

T.test("detector does not fire on 1 g with +/-0.02 g noise (10 min)", function () {
  var n = 0, d = G.detector({ onWindow: function () { n++; } });
  for (var t = T0; t < T0 + 600000; t += 80) d.feed(rest(), t);
  T.eq(n, 0);
}, { timeout: 600000 });

T.test("detector hold() suppresses onsets until the given time", function () {
  var n = 0, d = G.detector({ onWindow: function () { n++; } }), t = T0, i;
  d.hold(T0 + 5000);
  for (i = 0; i < 6; i++, t += 80) d.feed(flick(i), t);
  for (i = 0; i < 30; i++, t += 80) d.feed(rest(), t);
  T.eq(n, 0, "held");
  t = T0 + 6000;
  for (i = 0; i < 6; i++, t += 80) d.feed(flick(i), t);
  for (i = 0; i < 20; i++, t += 80) d.feed(rest(), t);
  T.eq(n, 1, "after hold");
});

T.test("armed detector (record mode) captures at onset, or at the timeout", function () {
  var got = [], d = G.detector({ armedOnly: true, onWindow: function (x, t) { got.push(t); } }), t = T0, i;
  for (i = 0; i < 6; i++, t += 80) d.feed(flick(i), t);
  T.eq(got.length, 0, "not armed: nothing");
  d.arm(t + 3000);
  for (i = 0; i < 10; i++, t += 80) d.feed(rest(), t);
  for (i = 0; i < 25; i++, t += 80) d.feed(flick(i), t);
  T.eq(got.length, 1, "captured at onset");
  d.arm(t + 1000);
  for (i = 0; i < 60; i++, t += 80) d.feed(rest(), t);
  T.eq(got.length, 2, "captured after the timeout");
});

// ---- criterion 4: mismatch checks ----
T.test("checkModel reports label/output and input mismatches", function () {
  T.eq(G.checkModel(META, 57, 6, 12.5), "");
  T.eq(G.checkModel(META, 57, 5, 12.5), "model has 5 outputs, gestmodel.json 6 labels");
  T.eq(G.checkModel(META, 60, 6, 12.5), "model input 60, expected 57");
  T.eq(G.checkModel({ v: 1, labels: META.labels, n: 19, hz: 25, scale: 0.01 }, 57, 6, 12.5), "model wants 25 Hz, app runs 12.5 Hz");
  T.eq(G.checkModel(undefined, 57, 6), "no gestmodel.json");
});

function fakeTF(outLen, opts) {
  opts = opts || {};
  return { create: function (arena, model) {
    if (opts.fail) throw new Error(opts.fail);
    var inp = new Float32Array(opts.inLen || 57), out = new Float32Array(outLen);
    return { getInput: function () { return inp; }, getOutput: function () { return out; }, invoke: function () {} };
  } };
}

T.test("load: no model, no tensorflow, create() errors and mismatches never throw", function () {
  T.eq(G.load(fakeTF(6), undefined, META).err, "no model");
  T.eq(G.load(undefined, "x", META).err, "no tensorflow");
  T.eq(G.load(fakeTF(6), "x", undefined).err, "no gestmodel.json");
  T.eq(G.load(fakeTF(5), "x", META, 12.5).err, "model has 5 outputs, gestmodel.json 6 labels");
  var e = G.load(fakeTF(6, { fail: "Unable to allocate enough RAM for TensorFlow" }), "x", META).err;
  T.ok(/^model failed: Unable/.test(e) && /arena 8000/.test(e), e);
  var ok = G.load(fakeTF(6), "x", META, 12.5);
  T.ok(ok.tf && !ok.err, "loads");
});

T.test("fill normalises like the PC (float and int8 inputs); probs dequantises", function () {
  var f = new Float32Array(3); G.fill(f, [100, -50, 127], META);
  T.near(f[0], 1, 1e-6); T.near(f[1], -0.5, 1e-6); T.near(f[2], 1.27, 1e-6);
  var q = new Int8Array(3); G.fill(q, [100, -50, 0], { scale: 0.01, inScale: 0.02, inZero: 3 });
  T.eq([q[0], q[1], q[2]], [53, -22, 3]);
  var p = G.probs(new Int8Array([-128, 127]), { outScale: 1 / 256, outZero: -128 });
  T.near(p[0], 0, 1e-6); T.near(p[1], 255 / 256, 1e-6);
});

T.test("top-3 and decide: threshold, none class and 1 s refractory period", function () {
  var top = G.top([0.05, 0.8, 0.1, 0.02, 0.02, 0.01], META.labels, 3);
  T.eq(top.map(function (e) { return e.name; }), ["flick-left", "flick-right", "none"]);
  var st = {};
  T.eq(G.decide(top[0], META, 0, st), "flick-left");
  T.eq(G.decide(top[0], META, 900, st), "", "refractory");
  T.eq(G.decide(top[0], META, 1000, st), "flick-left", "after 1 s");
  T.eq(G.decide({ name: "twist", p: 0.7 }, META, 5000, st), "", "not above thresh");
  T.eq(G.decide({ name: "none", p: 0.99 }, META, 9000, st), "", "none is never an event");
});
