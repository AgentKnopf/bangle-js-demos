// The streaming classifier: debounce, restlessness over time, missing samples, poll rate, off-wrist.
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

// ---- criterion 3: debounce ----
T.test("debouncer: a single odd window inside a run of still is not shown", function () {
  var d = A.debounce(2), seq = ["still", "still", "still", "walk", "still", "still", "run", "still"], shown = [];
  seq.forEach(function (c) { d.push(c); shown.push(d.shown()); });
  T.eq(shown, ["", "still", "still", "still", "still", "still", "still", "still"]);
  d.push("walk"); d.push("walk");
  T.eq(d.shown(), "walk", "two in a row are shown");
});

// Every shown change must be backed by 2 consecutive windows of that class.
function checkShows(ws) {
  for (var i = 0; i < ws.length; i++) if (ws[i].changed) {
    T.ok(i >= 1 && ws[i - 1].cls === ws[i].shown && ws[i].cls === ws[i].shown, "change at window " + i + " not backed by 2 windows");
  }
}

T.test("stream: a short burst inside still never flashes a class seen in only one window", function () {
  var k = collect(), t = T0;
  t = feed(k.c, t, 20000, still);
  T.eq(k.c.shown(), "still");
  t = feed(k.c, t, 400, sine(2.7, 0.8));   // 5 samples of running-like motion
  t = feed(k.c, t, 20000, still);
  T.ok(k.ws.filter(function (w) { return w.cls !== "still"; }).length >= 1, "the burst produced odd windows");
  checkShows(k.ws);
  T.eq(k.c.shown(), "still");
});

T.test("a class that persists for 2 windows is shown", function () {
  var k = collect(), t = T0;
  t = feed(k.c, t, 20000, still);
  t = feed(k.c, t, 10000, sine(1.9, 0.25));
  T.eq(k.c.shown(), "walk");
});

// ---- criterion 4 (stream) ----
T.test("restlessness from the stream: still 0, fidget raises it", function () {
  var k = collect(), t = T0;
  t = feed(k.c, t, 60000, still);
  T.eq(k.c.restless(), 0, "still");
  t = feed(k.c, t, 60000, fidget);
  var r1 = k.c.restless();
  t = feed(k.c, t, 60000, fidget);
  var r2 = k.c.restless();
  T.ok(r1 > 0 && r2 >= r1 && r2 <= 100, "rises: " + r1 + " -> " + r2);
}, { timeout: 600000 });

// ---- criterion 5: missing samples ----
T.test("window with < 80 % of samples is unknown", function () {
  var k = collect(), t = T0;
  t = feed(k.c, t, 12000, still);
  // 1.2 s of samples missing: 35 of 50 in the next windows (70 %)
  var t1 = t + 1200;
  feed(k.c, t1, 8000, still);
  var unk = k.ws.filter(function (w) { return w.cls === "unknown"; });
  T.ok(unk.length >= 1, "unknown windows");
  unk.forEach(function (w) { T.ok(w.n < 40, "n=" + w.n); });
  k.ws.filter(function (w) { return w.n >= 45; }).forEach(function (w) { T.eq(w.cls, "still", "full windows"); });
});

T.test("window with 85 % of samples is still classified", function () {
  var k = collect(), t = T0;
  t = feed(k.c, t, 12000, still);
  feed(k.c, t + 560, 8000, still); // 7 samples missing -> 43 of 50
  T.eq(counts(k.ws).unknown, undefined);
});

T.test("changed poll rate (40 ms) gives the same zeroX scale and class", function () {
  var a = collect(), b = collect();
  feed(a.c, T0, 10000, sine(1.9, 0.25), 80);
  feed(b.c, T0, 10000, sine(1.9, 0.25), 40);
  var wa = a.ws[a.ws.length - 1], wb = b.ws[b.ws.length - 1];
  T.eq(wb.hz, 25, "measured rate");
  T.near(wb.zeroX, wa.zeroX, 1, "zeroX");
  T.eq(wb.cls, "walk");
});

T.test("off-wrist flag after > 2 min of perfect stillness", function () {
  var k = collect(), t = T0;
  t = feed(k.c, t, 100000, function () { return { x: 0, y: 0, z: -1 }; });
  T.ok(!k.ws[k.ws.length - 1].off, "not yet");
  t = feed(k.c, t, 40000, function () { return { x: 0, y: 0, z: -1 }; });
  T.eq(k.ws[k.ws.length - 1].off, 1);
}, { timeout: 600000 });

