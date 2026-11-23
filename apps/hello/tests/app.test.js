// Whole app in the emulator: real touch input, timers, button and kill.
eval(require("Storage").read("hello.app.js"));
DEBUG = true;
T.beforeEach(function () { T.capture(); });

T.test("tapping the screen counts and logs a JSON event", function (done) {
  T.tap(88, 88);
  setTimeout(function () {
    var taps = T.eventsOf("tap");
    T.eq(taps.length, 1, "tap events");
    T.eq(taps[0].n, 1);
    T.eq(counter.count(), 1);
    T.screenshot("one-tap");
    done();
  }, 300);
});

T.test("count resets after 60 s without taps (virtual time)", function (done) {
  T.tap(88, 88);
  setTimeout(function () { T.eq(T.eventsOf("reset").length, 0, "no reset at 30 s"); }, 30000);
  setTimeout(function () {
    T.eq(T.eventsOf("reset").length, 1, "reset events");
    T.eq(counter.count(), 0);
    done();
  }, 61000);
}, { timeout: 120000 });

T.test("button returns to the launcher", function (done) {
  var load = T.spy(global, "load", function () {});
  T.press(100);
  setTimeout(function () {
    T.eq(load.calls.length, 1, "load() calls");
    done();
  }, 500);
});

T.test("kill handler clears the timer and logs", function (done) {
  onTap();
  T.ok(resetTimer, "timer running");
  T.emit(E, "kill", undefined, function () {
    T.eq(resetTimer, undefined);
    T.eq(T.eventsOf("kill").length, 1);
    done();
  });
});
