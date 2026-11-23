// Criterion 2: replaying labelled recordings in the prototype-06 log format.
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

// ---- criterion 2: replay of labelled recordings in the prototype-06 format ----
var S = require("Storage");
var FIX = { still: "log.20260101-1000", fidget: "log.20260101-1005", walk: "log.20260101-1010", run: "log.20260101-1015" };
var cm = A.confusion();
Object.keys(FIX).forEach(function (label) {
  T.test("replay " + label + " recording: >= 90 % correct windows", function () {
    var r = A.replay(S.read(FIX[label]));
    T.eq(r.label, label, "header label");
    T.ok(r.windows.length >= 50, "windows: " + r.windows.length);
    r.windows.forEach(function (w) { cm.add(label, w.cls); });
    var acc = cm.accuracy(label);
    console.log("accuracy " + label + " " + acc.toFixed(3) + " " + JSON.stringify(cm.m[label]));
    T.ok(acc >= 0.9, label + " accuracy " + acc);
  }, { timeout: 600000 });
});

T.test("walk recording without step events is still walk (sdMag + zeroX alone)", function () {
  // a readLine() source that drops the "s" (step) lines of the flash file
  var f = S.read(FIX.walk), pos = 0;
  var src = { readLine: function () {
    for (;;) {
      var e = f.indexOf("\n", pos);
      if (e < pos || f.charAt(e) !== "\n") return;
      var l = f.substring(pos, e + 1); pos = e + 1;
      if (l.split(",")[1] !== "s") return l;
    }
  } };
  var r = A.replay(src), ok = 0;
  r.windows.forEach(function (w) { if (w.cls === "walk") ok++; });
  T.ok(ok / r.windows.length >= 0.9, "walk share " + ok / r.windows.length);
}, { timeout: 600000 });

T.test("replay ignores a partial last line (crash mid-write)", function () {
  // a StorageFile (as prototype 06 writes) whose last line was cut off
  var w = S.open("log.part", "w");
  w.write(S.read(FIX.still).substring(0, 6000));
  var r = A.replay(S.open("log.part", "r"));
  S.open("log.part", "r").erase();
  T.ok(r.windows.length > 0);
});


T.test("metadata trailer and step lines with counts are handled", function () {
  var lines = ['{"v":1,"start":1767258000000,"label":"walk","src":{"a":80,"s":1000}}'];
  for (var t = 0; t < 10000; t += 80) {
    lines.push(t + ",a,0.00,0.00,-1.00");
    if (t === 3040) lines.push("3040,s,4,,");   // lines are in time order, as the logger writes them
  }
  lines.push("9999,s,0,,");
  lines.push('{"dropped":3}');
  var w = S.open("log.trail", "w");
  w.write(lines.join("\n") + "\n");
  var r = A.replay(S.open("log.trail", "r"), { full: true });
  S.open("log.trail", "r").erase();
  T.eq(r.label, "walk", "label kept after the trailer");
  T.eq(r.windows[0].steps, 4, "4 steps in the first window");
});
