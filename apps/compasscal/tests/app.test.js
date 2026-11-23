// Whole app in the emulator. The emulator has no magnetometer or accelerometer
// data, so tests call the app's onMag/onAccel forwarders (or emit the events).
var S = require("Storage");
S.erase("compass.json");
eval(S.read("compasscal.app.js"));
DEBUG = true;
var D = 180 / Math.PI;
T.beforeEach(function () { T.capture(); });

// Field seen by a flat watch pointing at `deg`, through offset [12.5,-40,3] and
// per-axis gains, magnitude 150 after correction.
function rawFor(deg, k) {
  var a = deg / D; k = k || 1;
  return { x: -Math.sin(a) * 150 * k + 12.5, y: Math.cos(a) * 150 * k * 320 / 300 - 40, z: 3 };
}
function feed(deg, n) { for (var i = 0; i < (n || 1); i++) onMag(rawFor(deg)); }

T.test("no calibration: opens the calibration screen with compass power on", function (done) {
  T.eq(mode, "cal");
  T.screenshot("calibration-0");
  setTimeout(done, 100);
});

T.test("criterion 4: calibration writes offsets and scales; restart loads them", function (done) {
  var minRange = C.MIN_RANGE;
  C.MIN_RANGE = 280; // so the ring is still filling before the last sample
  var samples = [[162.5, -40, 3], [-137.5, -40, 3], [12.5, 120, 3], [12.5, -200, 3], [12.5, -40, 143]];
  samples.forEach(function (v) { onMag({ x: v[0], y: v[1], z: v[2] }); });
  T.eq(mode, "cal", "still calibrating with z range short");
  T.ok(shown.p > 0.8 && shown.p < 1, "ring shows progress " + shown.p);
  T.screenshot("calibration-progress");
  // the last sample arrives as a real 'mag' event
  T.emit(Bangle, "mag", { x: 12.5, y: -40, z: -137, dx: 0, dy: 0, dz: 0, heading: NaN }, function () {
    C.MIN_RANGE = minRange;
    T.eq(mode, "main");
    var f = S.readJSON("compass.json");
    T.eq(f.v, 1);
    T.eq(f.offset, [12.5, -40, 3]);
    T.near(f.scale[0], 1, 1e-6);
    T.near(f.scale[1], 300 / 320, 1e-6);
    T.near(f.scale[2], 300 / 280, 1e-6);
    T.ok(f.t > 1767225000, "timestamp " + f.t);
    T.eq(T.eventsOf("calibrated").length, 1);
    var power = T.spy(Bangle, "setCompassPower");
    T.emit(E, "kill", undefined, function () {
      T.eq(power.calls[0], [0, "compasscal"], "power off on kill");
      cal = undefined;
      start();
      T.eq(power.calls[1], [1, "compasscal"], "power on at start");
      T.eq(mode, "main", "restart skips calibration");
      T.eq(cal.offset, [12.5, -40, 3]);
      T.near(cal.scale[1], 300 / 320, 1e-6);
      done();
    });
  });
});

T.test("criterion 1 (app): headings around a circle within 1 degree", function () {
  var worst = 0;
  for (var deg = 0; deg < 360; deg += 10) {
    onMag(rawFor(deg));
    var e = T.eventsOf("heading").pop();
    worst = Math.max(worst, Math.abs(C.diff(e.raw, deg)));
  }
  T.ok(worst <= 1, "worst " + worst);
});

T.test("mag event is forwarded and the screen shows heading and cardinal", function (done) {
  feed(130, 4);
  T.emit(Bangle, "mag", rawFor(130), function () {
    var e = T.eventsOf("heading").pop();
    T.near(e.raw, 130, 1);
    T.near(e.smooth, 130, 1);
    T.eq(e.tilt, 0);
    T.eq(heading, 130);
    T.eq(shown.centre, "130\xB0|SE");
    T.screenshot("main");
    setTimeout(done, 100);
  });
});

T.test("smoothing in the app across north", function () {
  smoother.reset();
  [358, 359, 1, 2].forEach(function (d) { onMag(rawFor(d)); });
  var e = T.eventsOf("heading").pop();
  T.ok(Math.abs(C.diff(e.smooth, 0)) < 1, "smooth " + e.smooth);
});

T.test("only changed parts are redrawn", function () {
  feed(200, 5);
  T.capture();
  feed(200, 3);
  T.eq(T.eventsOf("draw").length, 0, "same heading: no rose redraw");
  feed(210, 1);
  T.eq(T.eventsOf("draw").length, 1, "new heading: one redraw");
});

T.test("criterion 6: 40 degree tilt shows the hint when compensation is off", function (done) {
  settings.tiltComp = false;
  feed(90, 5);
  T.emit(Bangle, "accel", { x: Math.sin(40 / D), y: 0, z: -Math.cos(40 / D), mag: 1, diff: 0 }, function () {
    feed(90, 1);
    T.eq(shown.status, "tilted - hold flat");
    T.eq(T.eventsOf("heading").pop().tilt, 40);
    T.ok(T.eventsOf("status").some(function (s) { return s.text === "tilted - hold flat"; }), "status event");
    T.screenshot("tilted");
    setTimeout(function () {
      settings.tiltComp = true;
      onAccel({ x: Math.sin(40 / D), y: 0, z: -Math.cos(40 / D) });
      T.ok(shown.status !== "tilted - hold flat", "no hint with compensation on: " + shown.status);
      onAccel({ x: 0, y: 0, z: -1 });
      T.ok(shown.status !== "tilted - hold flat", "no hint when flat");
      done();
    }, 100);
  });
});

T.test("watch face down is flagged", function () {
  onAccel({ x: 0, y: 0, z: 1 });
  T.eq(shown.status, "upside down?");
  onAccel({ x: 0, y: 0, z: -1 });
});

T.test("tap locks the target; turning shows the bearing to follow", function (done) {
  feed(100, 5);
  target = undefined;
  draw();
  T.tap(88, 88);
  setTimeout(function () {
    T.eq(T.eventsOf("target").length, 1, "target events");
    T.eq(target, 100);
    T.eq(shown.status, "on target");
    feed(130, 5);
    T.eq(shown.status, "turn 30\xB0 left");
    T.screenshot("target");
    feed(70, 5);
    T.eq(shown.status, "turn 30\xB0 right");
    done();
  }, 300);
});

T.test("wraparound in the app: target 350, heading 10", function () {
  target = 350;
  feed(10, 5);
  T.eq(shown.status, "turn 20\xB0 left");
  target = undefined;
  draw();
});

T.test("strong interference replaces the heading", function (done) {
  feed(45, 5);
  for (var i = 0; i < 3; i++) onMag(rawFor(45, 1.8));
  var e = T.eventsOf("heading").pop();
  T.eq(e.interference, true);
  T.eq(e.smooth, null);
  T.eq(shown.centre, "interference|");
  T.screenshot("interference");
  setTimeout(function () {
    feed(45, 1);
    T.eq(shown.centre, "45\xB0|NE", "recovers");
    done();
  }, 100);
});

T.test("long press recalibrates", function (done) {
  T.touch(88, 88, true);
  setTimeout(function () {
    T.eq(mode, "main", "not yet at 300 ms");
    setTimeout(function () {
      T.eq(mode, "cal", "calibration screen while still held");
      T.touch(88, 88, false);
      setTimeout(function () {
        T.eq(T.eventsOf("target").length, 0, "release is not a tap");
        done();
      }, 200);
    }, 500);
  }, 300);
});

T.test("button returns to the launcher", function (done) {
  var load = T.spy(global, "load", function () {});
  T.press(100);
  setTimeout(function () { T.eq(load.calls.length, 1); done(); }, 1500); // T.press may start late
});
