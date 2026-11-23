// Gesture module driven by synthetic touch samples through feed().
// A test that throws inside a timer can be reported as passed when another
// callback in the same tick swallows the exception (firmware quirk), so fail
// any test that ended without reaching done() or the end of its body.
(function () {
  var test = T.test, ended = true;
  T.test = function (name, fn, o) {
    test(name, fn.length ? function (done) {
      ended = false;
      fn(function (e) { ended = true; done(e); });
    } : function () { ended = false; fn(); ended = true; }, o);
  };
  T.afterEach(function () { if (!ended) throw new Error("test ended without reaching done()"); });
})();
var G = require("gestures");

// Feed a straight drag from (x0,y0) to (x1,y1): press at t, n moves, release at t+ms.
function line(r, x0, y0, x1, y1, t, ms, n) {
  n = n || 5;
  r.feed({ x: x0, y: y0, b: 1, t: t });
  for (var i = 1; i <= n; i++) {
    r.feed({ x: Math.round(x0 + (x1 - x0) * i / n), y: Math.round(y0 + (y1 - y0) * i / n), b: 1, t: t + ms * i / n });
  }
  r.feed({ x: x1, y: y1, b: 0, t: t + ms });
}
function tap(r, x, y, t, ms) {
  r.feed({ x: x, y: y, b: 1, t: t });
  r.feed({ x: x, y: y, b: 0, t: t + (ms || 100) });
}
function recorder(opts) {
  var r = G.create(opts || {});
  r.got = [];
  r.on("gesture", function (ev) { r.got.push(ev); });
  return r;
}
function types(r) { return r.got.map(function (e) { return e.type; }); }

T.test("1: one tap is reported once, after the double-tap window", function (done) {
  var r = recorder();
  tap(r, 88, 88, 0, 100);
  setTimeout(function () { T.eq(types(r), [], "nothing before 350 ms"); }, 300);
  setTimeout(function () {
    T.eq(types(r), ["tap"]);
    T.eq(r.got[0].x0, 88); T.eq(r.got[0].dur, 100); T.eq(r.got[0].dist, 0);
    done();
  }, 600);
});

T.test("2: two taps 200 ms apart give one doubletap and no tap", function (done) {
  var r = recorder();
  tap(r, 88, 88, 0, 100);
  tap(r, 90, 87, 300, 100);
  setTimeout(function () { T.eq(types(r), ["doubletap"]); done(); }, 1000);
});

T.test("instantTap reports tap at once, then doubletap as an extra event", function (done) {
  var r = recorder({ instantTap: true });
  tap(r, 88, 88, 0, 100);
  T.eq(types(r), ["tap"], "tap is synchronous");
  tap(r, 88, 88, 300, 100);
  setTimeout(function () { T.eq(types(r), ["tap", "doubletap"]); done(); }, 1000);
});

T.test("3: 100 px left over 150 ms is a fast swipe at ~667 px/s", function () {
  var r = recorder();
  line(r, 138, 88, 38, 88, 0, 150);
  T.eq(r.got.length, 1);
  var e = r.got[0];
  T.eq(e.type, "swipe"); T.eq(e.dir, "left"); T.eq(e.speedClass, "fast");
  T.eq(e.dist, 100); T.eq(e.dur, 150);
  T.near(e.speed, 667, 667 * 0.05, "speed");
  T.eq([e.x0, e.y0, e.x1, e.y1], [138, 88, 38, 88]);
});

T.test("4: the same movement over 1000 ms is a stroke", function () {
  var r = recorder();
  line(r, 138, 88, 38, 88, 0, 1000, 10);
  T.eq(types(r), ["stroke"]);
  T.eq(r.got[0].dir, "left"); T.eq(r.got[0].speedClass, "slow"); T.eq(r.got[0].speed, 100);
});

T.test("5: holding still 700 ms fires longpress before release, release adds nothing", function (done) {
  var r = recorder();
  r.feed({ x: 88, y: 88, b: 1, t: getTime() * 1000 });
  setTimeout(function () {
    T.eq(types(r), [], "not yet at 500 ms");
  }, 500);
  setTimeout(function () {
    T.eq(types(r), ["longpress"], "fired while held");
    T.ok(r.isDown(), "finger still down");
    r.feed({ x: 89, y: 88, b: 1, t: getTime() * 1000 });
  }, 650);
  setTimeout(function () {
    r.feed({ x: 89, y: 88, b: 0, t: getTime() * 1000 });
  }, 700);
  setTimeout(function () { T.eq(types(r), ["longpress"], "no tap after"); done(); }, 1500);
});

T.test("5b: long press is also caught from timestamps alone (no timer)", function () {
  var r = recorder();
  r.feed({ x: 88, y: 88, b: 1, t: 0 });
  r.feed({ x: 88, y: 89, b: 1, t: 650 });
  T.eq(types(r), ["longpress"]);
  r.feed({ x: 88, y: 89, b: 0, t: 700 });
  T.eq(types(r), ["longpress"]);
  T.eq(r.got[0].t, 600);
});

T.test("6: a zig-zag (straightness < 0.8) over 1000 ms emits nothing, unknown with the debug option", function (done) {
  function zig(r) {
    var pts = [[150, 88], [137, 128], [125, 88], [112, 128], [100, 88], [87, 128], [75, 88], [62, 128], [50, 88]];
    for (var i = 0; i < pts.length; i++) r.feed({ x: pts[i][0], y: pts[i][1], b: 1, t: i * 125 });
    r.feed({ x: 50, y: 88, b: 0, t: 1000 });
  }
  var a = recorder(), b = recorder({ unknown: true });
  zig(a); zig(b);
  setTimeout(function () {
    T.eq(types(a), []);
    T.eq(types(b), ["unknown"]);
    T.eq(b.got[0].reason, "not straight");
    T.ok(b.got[0].straight < 0.8, "straightness " + b.got[0].straight);
    done();
  }, 1000);
});

T.test("edge: a release with no x/y still classifies", function () {
  var r = recorder();
  r.feed({ x: 20, y: 88, b: 1, t: 0 });
  r.feed({ x: 120, y: 88, b: 1, t: 100 });
  r.feed({ b: 0, t: 120 });
  T.eq(types(r), ["swipe"]); T.eq(r.got[0].dir, "right"); T.eq(r.got[0].dur, 120);
});

T.test("edge: same timestamp counts as 1 ms, no division by zero", function () {
  var r = recorder();
  r.feed({ x: 20, y: 88, b: 1, t: 50 });
  r.feed({ x: 70, y: 88, b: 0, t: 50 });
  T.eq(r.got[0].dur, 1); T.eq(r.got[0].speed, 50000);
});

T.test("edge: reset (watch locked) drops the gesture and the waiting tap", function (done) {
  var r = recorder();
  tap(r, 88, 88, 0, 100);
  r.feed({ x: 88, y: 88, b: 1, t: 250 });   // second press of a possible double tap
  r.reset();
  T.ok(!r.isDown());
  r.feed({ x: 88, y: 88, b: 0, t: 300 });
  setTimeout(function () { T.eq(types(r), []); done(); }, 1500);
});

T.test("edge: release without a press and repeated releases are ignored", function () {
  var r = recorder({ unknown: true });
  r.feed({ x: 1, y: 1, b: 0, t: 0 });
  r.feed({ x: 1, y: 1, b: 0, t: 10 });
  T.eq(types(r), []);
});

T.test("helpers: direction ties go horizontal, speed classes", function () {
  T.eq(G.direction(-10, 10), "left"); T.eq(G.direction(10, -10), "right");
  T.eq(G.direction(3, -10), "up"); T.eq(G.direction(-3, 10), "down");
  T.eq(G.speedClass(149), "slow"); T.eq(G.speedClass(150), "normal");
  T.eq(G.speedClass(600), "normal"); T.eq(G.speedClass(601), "fast");
});

T.test("thresholds can be overridden per recognizer", function () {
  var r = recorder({ LONG_MS: 200 });
  r.feed({ x: 88, y: 88, b: 1, t: 0 });
  r.feed({ x: 88, y: 88, b: 0, t: 250 });
  T.eq(types(r), ["longpress"]);
  T.eq(G.LONG_MS, 600, "module default unchanged");
});

// Criterion 8: >= 20 scripted gestures through one recognizer, compared with a table.
T.test("8: 26 scripted gestures match the expected table", function (done) {
  var r = recorder();
  var t = 0;
  var GAP = 1000;
  var script = [
    ["tap centre", function () { tap(r, 88, 88, t, 80); }, ["tap"]],
    ["tap left edge", function () { tap(r, 1, 90, t, 60); }, ["tap"]],
    ["tap bottom-right corner", function () { tap(r, 174, 174, t, 120); }, ["tap"]],
    ["double tap", function () { tap(r, 88, 88, t, 80); tap(r, 95, 92, t + 250, 80); }, ["doubletap"]],
    ["two taps far apart", function () { tap(r, 30, 30, t, 80); tap(r, 140, 140, t + 200, 80); }, ["tap", "tap"]],
    ["tap then swipe", function () { tap(r, 88, 88, t, 80); line(r, 88, 88, 180, 88, t + 250, 150); }, ["tap", "swipe right fast"]],
    ["long press 700 ms", function () { tap(r, 88, 88, t, 700); }, ["longpress"]],
    ["long press 1500 ms with jitter", function () {
      r.feed({ x: 88, y: 88, b: 1, t: t }); r.feed({ x: 92, y: 91, b: 1, t: t + 800 }); r.feed({ x: 90, y: 90, b: 0, t: t + 1500 });
    }, ["longpress"]],
    ["swipe left fast", function () { line(r, 138, 88, 38, 88, t, 150); }, ["swipe left fast"]],
    ["swipe right fast", function () { line(r, 38, 88, 138, 88, t, 150); }, ["swipe right fast"]],
    ["swipe up fast", function () { line(r, 88, 138, 88, 38, t, 150); }, ["swipe up fast"]],
    ["swipe down fast", function () { line(r, 88, 38, 88, 138, t, 150); }, ["swipe down fast"]],
    ["swipe left normal", function () { line(r, 138, 88, 38, 88, t, 400); }, ["swipe left normal"]],
    ["swipe up normal", function () { line(r, 88, 138, 88, 38, t, 400); }, ["swipe up normal"]],
    ["swipe right slow", function () { line(r, 60, 88, 120, 88, t, 600); }, ["swipe right slow"]],
    ["swipe with 2 samples only", function () { r.feed({ x: 20, y: 80, b: 1, t: t }); r.feed({ x: 140, y: 84, b: 0, t: t + 50 }); }, ["swipe right fast"]],
    ["diagonal tie goes horizontal", function () { line(r, 40, 40, 100, 100, t, 200); }, ["swipe right normal"]],
    ["mostly vertical diagonal", function () { line(r, 100, 40, 70, 120, t, 200); }, ["swipe down normal"]],
    ["stroke left", function () { line(r, 138, 88, 38, 88, t, 1000, 10); }, ["stroke left slow"]],
    ["stroke right", function () { line(r, 38, 88, 138, 88, t, 1000, 10); }, ["stroke right slow"]],
    ["stroke up", function () { line(r, 88, 138, 88, 38, t, 1000, 10); }, ["stroke up slow"]],
    ["stroke down", function () { line(r, 88, 38, 88, 138, t, 1000, 10); }, ["stroke down slow"]],
    ["zig-zag slow", function () {
      for (var i = 0; i <= 8; i++) r.feed({ x: 150 - i * 12, y: i % 2 ? 128 : 88, b: 1, t: t + i * 120 });
      r.feed({ x: 54, y: 88, b: 0, t: t + 1000 });
    }, []],
    ["hold 400 ms (too long for tap, too short for long press)", function () { tap(r, 88, 88, t, 400); }, []],
    ["short drag 25 px", function () { line(r, 88, 88, 113, 88, t, 150); }, []],
    ["finger leaves the screen edge", function () { line(r, 150, 88, 190, 88, t, 60, 2); }, ["swipe right fast"]]
  ];
  var expected = [];
  script.forEach(function (s) {
    var before = r.got.length;
    s[1]();
    t += GAP;
    s.push(before);
    s[2].forEach(function (x) { expected.push(x); });
  });
  setTimeout(function () {
    var got = r.got.map(function (e) {
      return e.type === "swipe" || e.type === "stroke" ? e.type + " " + e.dir + " " + e.speedClass : e.type;
    });
    T.ok(script.length >= 20, "at least 20 gestures");
    T.eq(got, expected);
    done();
  }, 2000);
});
