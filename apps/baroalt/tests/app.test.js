// Whole app in the emulator. There is no barometer in the emulator, so the
// tests emit synthetic 'pressure' events on a timer (virtual time).
var S = require("Storage");
eval(S.read("baroalt.app.js"));
DEBUG = true;
T.beforeEach(function () { T.capture(); });

var feeder;
// Emit pressure for altitude hOf(tSec) every `ms` until `seconds`, then call cb.
function play(hOf, seconds, ms, cb) {
  var t = 0;
  feeder = setInterval(function () {
    Bangle.emit("pressure", { pressure: B.pressureAt(hOf(t), 1013.25), temperature: 31.2, altitude: 0 });
    t += ms / 1000;
    if (t > seconds) { clearInterval(feeder); feeder = undefined; setTimeout(cb, 10); }
  }, ms);
}
function ramp(t, t0, t1, h0, h1) { return t <= t0 ? h0 : t >= t1 ? h1 : h0 + (h1 - h0) * (t - t0) / (t1 - t0); }
function lastBaro() { return T.eventsOf("baro").pop(); }
function restart() { stop(); start(); }

T.test("starts waiting for the barometer, power on with the app id", function (done) {
  var power = T.spy(Bangle, "setBarometerPower");
  restart();
  T.eq(power.calls[power.calls.length - 1], [1, "baroalt"]);
  T.eq(mode, "main");
  T.eq(tracker.last(), null);
  T.screenshot("waiting");
  setTimeout(done, 100);
});

T.test("criterion 1 (app): 9.5 m climb over 60 s shows 3 floors up", function (done) {
  play(function (t) { return ramp(t, 10, 70, 0, 9.5); }, 100, 1000, function () {
    var e = lastBaro();
    T.eq(e.up, 3, "up");
    T.eq(e.down, 0, "down");
    T.near(e.altS, 9.5, 0.2);
    T.near(e.temp, 31.2, 0.01);
    T.ok(T.eventsOf("baro").length >= 95, "one debug event per second: " + T.eventsOf("baro").length);
    T.screenshot("climbed");
    setTimeout(done, 100);
  });
}, { timeout: 200000 });

T.test("debug event has the documented fields", function (done) {
  var p = B.pressureAt(9.5);
  onPressure({ pressure: p, temperature: 31.2, altitude: 0 });
  setTimeout(function () {
    onPressure({ pressure: p, temperature: 31.2, altitude: 0 });
    var e = lastBaro();
    T.eq(Object.keys(e), ["evt", "p", "alt", "altS", "temp", "up", "down"]);
    T.eq(e.p, Math.round(p * 100) / 100);
    done();
  }, 1000);
});

T.test("tap resets altitude and floors to zero", function (done) {
  T.tap(88, 100);
  setTimeout(function () {
    T.eq(T.eventsOf("reset").length, 1);
    T.eq(tracker.last().up, 0);
    T.eq(tracker.last().altS, 0);
    done();
  }, 300);
});

T.test("criterion 5 (app): up 3 then down 2 at 4 Hz", function (done) {
  restart();
  play(function (t) { return t < 80 ? ramp(t, 10, 70, 0, 9.5) : ramp(t, 90, 135, 9.5, 2.7); }, 170, 250, function () {
    var e = lastBaro();
    T.eq(e.up, 3, "up");
    T.eq(e.down, 2, "down");
    T.near(e.altS, 3, 0.5, "relative altitude");
    T.screenshot("up3-down2");
    setTimeout(done, 100);
  });
}, { timeout: 300000 });

T.test("criterion 4 (app): a 3 hPa spike event is rejected", function (done) {
  restart();
  var n = 0;
  feeder = setInterval(function () {
    n++;
    Bangle.emit("pressure", { pressure: n === 20 ? 1007 : 1010, temperature: 30, altitude: 0 });
    if (n > 40) {
      clearInterval(feeder);
      setTimeout(function () {
        T.eq(tracker.rejected(), 1);
        T.eq(lastBaro().up + lastBaro().down, 0);
        T.ok(T.eventsOf("baro").every(function (e) { return Math.abs(e.altS) < 0.05; }), "altitude flat");
        done();
      }, 10);
    }
  }, 1000);
}, { timeout: 120000 });

T.test("criterion 7: the label always reads 'sensor temp' and the hint is one swipe away", function (done) {
  var ds = T.spy(g, "drawString");
  function drawn() { return ds.calls.map(function (c) { return String(c[0]); }); }
  function hasLabel() { return drawn().some(function (s) { return s === "sensor temp"; }); }
  restart();
  T.ok(hasLabel(), "waiting screen");
  ds.calls = [];
  play(function () { return B.altitude(1010); }, 5, 1000, function () {
    T.ok(T.eventsOf("baro").length > 0, "has data");
    T.ok(hasLabel(), "with data");
    ds.calls = [];
    tracker.reset();
    draw();
    T.ok(hasLabel(), "after reset");
    T.swipe(150, 100, 30, 100, 150);
    setTimeout(function () {
      T.eq(mode, "hint", "swipe opens the hint");
      T.ok(drawn().some(function (s) { return s === "the case, against your"; }), "hint text");
      T.screenshot("hint");
      T.tap(88, 100);
      setTimeout(function () {
        T.eq(mode, "main", "tap goes back");
        T.ok(hasLabel(), "label again");
        done();
      }, 300);
    }, 500);
  });
});

T.test("long press opens the sea-level menu; the setting is saved", function (done) {
  T.touch(88, 100, true);
  setTimeout(function () {
    setTimeout(function () {
      T.eq(mode, "menu");
      T.touch(88, 100, false);
      T.screenshot("menu");
      settings.p0 = 1020;
      saveSettings();
      T.eq(S.readJSON("baroalt.json"), { v: 1, p0: 1020, floorM: 3, stepCheck: false });
      setupUI();
      showMain();
      T.near(tracker.absAltitude(settings.p0), B.altitude(1010, 1020), 0.01);
      done();
    }, 500);
  }, 300);
});

T.test("kill switches the barometer off and stops listening", function (done) {
  var power = T.spy(Bangle, "setBarometerPower");
  T.emit(E, "kill", undefined, function () {
    T.eq(power.calls[0], [0, "baroalt"]);
    var before = T.eventsOf("baro").length;
    T.emit(Bangle, "pressure", { pressure: 1000, temperature: 20, altitude: 0 }, function () {
      T.emit(Bangle, "pressure", { pressure: 1000, temperature: 20, altitude: 0 }, function () {
        T.eq(T.eventsOf("baro").length, before, "no more events");
        start();
        done();
      });
    });
  });
});

T.test("altitude near zero never shows as -0.0", function () {
  T.eq(signed(-0.04), "+0.0");
  T.eq(signed(0.04), "+0.0");
  T.eq(signed(-0.06), "-0.1");
  T.eq(signed(9.5), "+9.5");
});

T.test("button returns to the launcher", function (done) {
  var load = T.spy(global, "load", function () {});
  T.press(100);
  setTimeout(function () { T.eq(load.calls.length, 1); done(); }, 1500); // T.press may start late
});
