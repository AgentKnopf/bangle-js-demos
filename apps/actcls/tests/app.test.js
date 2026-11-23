// The whole app in the emulator: windows logged as JSON, debounce on screen,
// summary file rollover at midnight, pages, button and kill.
eval(require("Storage").read("actcls.app.js"));
DEBUG = true;
T.beforeEach(function () { T.capture(); });

var S = require("Storage");
var MIDNIGHT = 1767312000000; // 2026-01-02 00:00 UTC
var seed = 7;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; }
function still() { return { x: 0.1, y: -0.2, z: -0.97 + 0.002 * rnd() }; }
function walk(t) { var v = 0.25 * Math.sin(2 * Math.PI * 1.9 * t / 1000); return { x: 0.3 * (1 + v), y: 0, z: -0.95 * (1 + v) }; }
function run(t) { var v = 0.8 * Math.sin(2 * Math.PI * 2.7 * t / 1000); return { x: 0.4 * (1 + v), y: 0, z: -0.9 * (1 + v) }; }
var tNow = Date.now(); // continuous sample clock across tests (a gap would give unknown windows)
function play(t0, ms, f) { for (var t = t0; t < t0 + ms; t += 80) feed(f(t), t); tNow = t; return t; }

T.test("startup: summary file for today, waiting screen", function (done) {
  var j = S.readJSON("actcls.json", true);
  T.eq(j.v, 1); T.eq(j.day, "2026-01-01");
  T.eq(C.shown(), "");
  T.screenshot("startup");
  setTimeout(done, 100);
});

T.test("window events follow the spec format; still is shown after 2 windows", function () {
  play(tNow, 9000, still);
  var w = T.eventsOf("win");
  T.ok(w.length >= 2, "win events");
  ["t", "meanMag", "sdMag", "p2p", "zeroX", "orient", "steps", "cls", "conf"].forEach(function (k) {
    T.ok(w[0][k] !== undefined, "field " + k);
  });
  T.eq(w[w.length - 1].cls, "still");
  T.eq(T.eventsOf("show").map(function (e) { return e.cls; }), ["still"]);
});

T.test("debounce on screen: every shown change is backed by 2 consecutive windows", function () {
  var t = play(tNow, 9000, still);
  T.capture();
  t = play(t, 400, run);
  t = play(t, 9000, still);
  var w = T.eventsOf("win"), shows = T.eventsOf("show");
  T.ok(w.some(function (x) { return x.cls !== "still"; }), "an odd window happened");
  shows.forEach(function (sh) {
    var i = -1;
    w.forEach(function (x, k) { if (x.t === sh.t) i = k; });
    T.ok(i >= 1 && w[i].cls === sh.cls && w[i - 1].cls === sh.cls, "show " + sh.cls + " backed by 2 windows");
  });
  T.eq(C.shown(), "still");
});

T.test("walking shows walk (screenshot of the main page)", function (done) {
  // fill the 30 min timeline with a made-up morning so the screenshot shows the strip
  var now = tNow, codes = [1, 1, 2, 2, 1, 3, 3, 3, 4, 4, 3, 2];
  tl = A.timeline(120, 15000);
  for (var i = 0; i < 120; i++) tl.add(codes[Math.floor(i / 10)], now - (120 - i) * 15000);
  play(now, 12000, walk);
  T.eq(C.shown(), "walk");
  draw();
  T.screenshot("main-walk");
  setTimeout(done, 100);
});

T.test("an accel event reaches the classifier", function (done) {
  var s = T.spy(C, "onAccel");
  T.emit(Bangle, "accel", { x: 0, y: 0, z: -1, mag: 1, diff: 0 }, function () {
    T.eq(s.calls.length, 1); T.ok(s.calls[0][1] > 0, "timestamp");
    done();
  });
});

T.test("swipe shows the summary page, swipe again goes back", function (done) {
  sum = A.summary({ v: 1, day: "2026-01-01", min: { still: 312, fidget: 48, walk: 61, run: 12 } });
  T.swipe(150, 88, 20, 88, 150);
  setTimeout(function () {
    T.eq(page, 1);
    T.screenshot("summary");
    T.swipe(20, 88, 150, 88, 150);
    setTimeout(function () { T.eq(page, 0); done(); }, 400);
  }, 400);
});

T.test("summary file rolls over at midnight (mocked time)", function () {
  var t = play(MIDNIGHT - 90000, 85000, still);   // 23:58:30 .. 23:59:55
  var j = S.readJSON("actcls.json");
  T.eq(j.day, "2026-01-01");
  T.ok(j.min.still >= 1, "still minutes before midnight: " + j.min.still);
  play(MIDNIGHT + 1000, 8000, walk);              // 00:00:01 .. 00:00:09
  j = S.readJSON("actcls.json");
  T.eq(j.day, "2026-01-02", "new day");
  T.eq(j.min.still, 0, "minutes reset");
  var saves = T.eventsOf("save");
  T.eq(saves[saves.length - 1].day, "2026-01-02");
});

T.test("button returns to the launcher", function (done) {
  var load = T.spy(global, "load", function () {});
  T.press(100);
  setTimeout(function () { T.eq(load.calls.length, 1); done(); }, 500);
});

T.test("kill saves the summary and removes the sensor listeners", function (done) {
  T.emit(E, "kill", undefined, function () {
    T.eq(T.eventsOf("save").length, 1);
    var s = T.spy(C, "onAccel");
    T.emit(Bangle, "accel", { x: 0, y: 0, z: -1, mag: 1, diff: 0 }, function () {
      T.eq(s.calls.length, 0, "no longer listening");
      done();
    });
  });
});
