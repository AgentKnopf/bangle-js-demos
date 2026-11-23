// The model upload file written by pc/train.py (a copy is in tests/fixtures):
// evaluating it stores a valid model, metadata and test windows.
var S = require("Storage");
var G = require("tfgest");
T.beforeEach(function () { T.capture(); });

T.test("tfgest-model.js stores .tfmodel, gestmodel.json and 5 test windows", function () {
  eval(S.read("tfgest-model.js"));
  var m = S.readJSON("gestmodel.json"), model = S.read(".tfmodel");
  T.eq(G.checkMeta(m), "");
  T.eq(m.labels, G.LABELS, "labels in the app's order");
  T.eq(m.n, 19); T.eq(m.hz, 12.5); T.eq(m.scale, 0.01); T.eq(m.quant, "int8"); T.eq(m.io, "float32");
  T.ok(m.arena <= 20000, "arena <= 20 KB");
  T.eq(model.length, m.bytes, "model size");
  T.ok(model.length <= 20480, "model <= 20 KB: " + model.length);
  T.eq(model.substr(4, 4), "TFL3", "TFLite flatbuffer identifier");
  var tw = S.readJSON("tfgest.tw.json");
  T.eq(tw.windows.length, 5);
  tw.windows.forEach(function (w) {
    T.ok(G.parse(JSON.stringify({ v: 1, label: w.label, hz: 12.5, n: 19, t: 0, xyz: w.xyz })), "window parses");
    T.ok(m.labels.indexOf(w.pcInt8) >= 0 && m.labels.indexOf(w.pcFloat) >= 0, "PC answers are labels");
  });
});

T.test("with the real model file, load() passes a flat RAM copy to tensorflow.create", function () {
  var got;
  var fake = { create: function (arena, model) {
    got = { arena: arena, len: model.length, head: model.substr(4, 4) };
    var inp = new Float32Array(57), out = new Float32Array(6);
    return { getInput: function () { return inp; }, getOutput: function () { return out; }, invoke: function () {} };
  } };
  var raw = S.read(".tfmodel"), m = S.readJSON("gestmodel.json");
  var r = G.load(fake, E.toString(raw), m, 12.5);
  T.eq(r.err, undefined);
  T.eq(got, { arena: 8000, len: m.bytes, head: "TFL3" });
});
