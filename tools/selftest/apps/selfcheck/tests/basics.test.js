// Each test name says what the harness must report for it.
var spied;

T.test("[pass] sync assertions", function () {
  T.eq(1 + 1, 2);
  T.eq({ a: [1, 2] }, { a: [1, 2] });
  T.ok("x");
  T.near(0.1 + 0.2, 0.3, 1e-9);
  T.throws(function () { throw new Error("x"); });
});

T.test("[fail] sync eq mismatch", function () { T.eq(1, 2); });
T.test("[fail] near out of tolerance", function () { T.near(1, 2, 0.5); });
T.test("[fail] app error thrown synchronously", function () { undefinedFunction(); });

T.test("[pass] async done after 10 min of virtual time", function (done) {
  var t0 = Date.now();
  setTimeout(function () { T.near(Date.now() - t0, 600000, 50); done(); }, 600000);
}, { timeout: 700000 });

T.test("[fail] async assertion inside a timer", function (done) {
  setTimeout(function () { T.eq("a", "b"); done(); }, 10);
});

T.test("[fail] uncaught error inside a timer", function (done) {
  setTimeout(function () { nope.nope = 1; done(); }, 10);
});

T.test("[fail] done(error)", function (done) { done(new Error("reported")); });
T.test("[fail] timeout", function (done) {}, { timeout: 1000 });

T.test("[pass] promise resolves", function () {
  return new Promise(function (resolve) { setTimeout(resolve, 100); });
});
T.test("[fail] promise rejects", function () { return Promise.reject(new Error("no")); });

T.test("[pass] spy records and replaces", function () {
  spied = T.spy(Bangle, "buzz", function () { return Promise.resolve(); });
  Bangle.buzz(100, 0.5);
  T.eq(spied.calls, [[100, 0.5]]);
});
T.test("[pass] spies are restored after each test", function () {
  T.ok(Bangle.buzz !== spied, "Bangle.buzz restored");
});

T.test("[pass] host tap reaches the firmware touch handler", function (done) {
  Bangle.on("touch", function h(b, xy) {
    Bangle.removeListener("touch", h);
    T.eq([xy.x, xy.y], [40, 50]);
    done();
  });
  T.tap(40, 50);
});

T.test("[pass] host swipe reaches the firmware swipe handler", function (done) {
  Bangle.on("swipe", function h(lr, ud) {
    Bangle.removeListener("swipe", h);
    T.eq([lr, ud], [-1, 0]);
    done();
  });
  T.swipe(150, 88, 30, 88, 150);
});

T.test("[pass] T.emit waits for handlers", function (done) {
  var got;
  Bangle.on("accel", function h(a) { Bangle.removeListener("accel", h); got = a.mag; });
  T.emit(Bangle, "accel", { x: 0, y: 0, z: -1, mag: 1, diff: 0 }, function () { T.eq(got, 1); done(); });
});

T.test("[pass] capture parses console.log JSON", function (done) {
  T.capture();
  console.log(JSON.stringify({ evt: "x", v: 1 }));
  console.log("not json");
  T.eq(T.eventsOf("x"), [{ evt: "x", v: 1 }]);
  done();
});

T.test("[pass] timer created in a touch handler fires on time", function (done) {
  var t0 = Date.now(), fired;
  setTimeout(function () {}, 3000); // a later timer must not delay the new one
  Bangle.on("drag", function h(e) {
    if (e.b) return;
    Bangle.removeListener("drag", h);
    setTimeout(function () { fired = Date.now() - t0; }, 350);
  });
  T.tap(88, 88);
  setTimeout(function () { T.ok(fired !== undefined && fired < 500, "350 ms timer fired by 1000 ms (at " + fired + ")"); done(); }, 1000);
});

T.test("[pass] button press is not delayed by pending timers", function (done) {
  var t0 = Date.now(), at;
  setTimeout(function () {}, 3000);
  setWatch(function () { at = Date.now() - t0; }, BTN1, { edge: "rising", debounce: 50, repeat: false });
  T.press(100);
  setTimeout(function () { T.ok(at !== undefined && at < 300, "press seen by 300 ms (at " + at + ")"); done(); }, 1000);
});

T.test("[fail] uncaught error whose exception is cleared by another callback's try/catch", function (done) {
  setTimeout(function () { var u; u.type; done(); }, 600);
  setTimeout(function () { try { JSON.parse("{"); } catch (e) {} }, 600);
});

T.test("[pass] spy on a built-in prototype method", function () {
  var f = require("Storage").open("spytest", "w");
  var s = T.spy(StorageFile.prototype, "write");
  f.write("a\n");
  T.eq(s.calls.length, 1);
});
T.test("[pass] built-in prototype method works after its spy is restored", function () {
  var f = require("Storage").open("spytest2", "a");
  f.write("b\n");
  T.eq(require("Storage").open("spytest2", "r").readLine(), "b\n");
});

T.test("[pass] T.requireRAM loads a module copy into RAM", function () {
  var m = T.requireRAM("selfmod");
  T.eq(m.add(2, 3), 5);
  T.eq(m.name, "selfmod");
  T.throws(function () { T.requireRAM("no-such-module"); });
});
