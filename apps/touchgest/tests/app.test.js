// Whole app with real touchscreen input through the firmware.
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
eval(require("Storage").read("touchgest.app.js"));
DEBUG = true;
// The harness's virtual clock can skip past timers that an input handler creates
// (the double-tap and long-press timers), so keep a short tick running.
var tick;
T.beforeEach(function () { T.capture(); tick = setInterval(function () {}, 10); });
T.afterEach(function () { clearInterval(tick); });

function lastGesture() { var g = T.eventsOf("gesture"); return g[g.length - 1]; }

T.test("7: all four swipe directions by touchscreen, label matches", function (done) {
  var dirs = [["left", 150, 88, 30, 88], ["right", 30, 88, 150, 88], ["up", 88, 150, 88, 30], ["down", 88, 30, 88, 150]];
  var i = 0;
  function next() {
    if (i >= dirs.length) {
      T.eq(T.eventsOf("gesture").map(function (e) { return e.label; }), ["SWIPE LEFT", "SWIPE RIGHT", "SWIPE UP", "SWIPE DOWN"]);
      T.eq(counts.swipe, 4);
      done();
      return;
    }
    var d = dirs[i++];
    T.swipe(d[1], d[2], d[3], d[4], 150);
    setTimeout(function () {
      var e = lastGesture();
      T.ok(e, "gesture for " + d[0]);
      T.eq(e.type, "swipe"); T.eq(e.dir, d[0]);
      T.eq(e.speedClass, "fast", d[0] + " speed " + e.speed);
      T.eq(label, "SWIPE " + d[0].toUpperCase(), "on-screen label");
      T.screenshot("swipe-" + d[0]);
      setTimeout(next, 700);
    }, 400);
  }
  next();
});

T.test("trail is cleared 500 ms after release", function (done) {
  T.swipe(30, 88, 150, 88, 150);
  setTimeout(function () { T.ok(trail, "trail drawn while moving"); }, 100);
  setTimeout(function () { T.ok(trail, "still shown 300 ms after release"); }, 450);
  setTimeout(function () { T.eq(trail, null, "cleared"); done(); }, 800);
});

T.test("tap and double tap via the touchscreen", function (done) {
  var tapsBefore = counts.tap;
  T.tap(88, 88);
  setTimeout(function () {
    var e = lastGesture();
    T.ok(e, "a gesture after one tap");
    T.eq(e.type, "tap"); T.eq(label, "TAP"); T.eq(counts.tap, tapsBefore + 1);
    T.tap(88, 88);
    setTimeout(function () { T.tap(90, 90); }, 200);
    setTimeout(function () {
      var d = lastGesture();
      T.eq(d.type, "doubletap"); T.eq(label, "DOUBLE TAP"); T.eq(counts.doubletap, 1);
      T.eq(counts.tap, tapsBefore + 1, "no extra tap");
      T.screenshot("doubletap");
      done();
    }, 900);
  }, 600);
});

T.test("long press via the touchscreen fires while held", function (done) {
  var firstT = Date.now();
  T.touch(88, 88, true);
  setTimeout(function () {
    var e = lastGesture();
    T.ok(e, "gesture while held");
    T.eq(e.type, "longpress"); T.eq(label, "LONG PRESS");
    T.near(e.t - firstT, 600, 20, "fired 600 ms after the press");
    T.touch(88, 88, false);
    setTimeout(function () { T.eq(T.eventsOf("gesture").length, 1, "release adds nothing"); done(); }, 600);
  }, 700);
});

T.test("lock mid-gesture drops it", function (done) {
  T.touch(40, 88, true);
  setTimeout(function () { T.touch(80, 88, true); }, 50);
  setTimeout(function () { onLock(true); }, 80);
  setTimeout(function () { T.touch(140, 88, true); }, 100);
  setTimeout(function () { T.touch(140, 88, false); }, 150);
  setTimeout(function () {
    T.eq(T.eventsOf("gesture").length, 0); T.eq(T.eventsOf("lock").length, 1);
    done();
  }, 800);
});

T.test("button returns to the launcher", function (done) {
  var load = T.spy(global, "load", function () {});
  T.press(100);
  setTimeout(function () { T.eq(load.calls.length, 1, "load() calls"); done(); }, 500);
});

T.test("kill restores the lock timeout and logs", function (done) {
  var opts = T.spy(Bangle, "setOptions");
  T.emit(E, "kill", undefined, function () {
    T.eq(opts.calls.length, 1);
    T.eq(opts.calls[0][0].lockTimeout, savedLockTimeout);
    T.eq(T.eventsOf("kill").length, 1);
    done();
  });
});
