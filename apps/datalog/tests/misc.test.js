// Whole app: sensor power, kill, all sources together, settings and exit.
var calls = [];
["setHRMPower", "setBarometerPower", "setCompassPower"].forEach(function (f) {
  var o = Bangle[f];
  Bangle[f] = function (on, id) { calls.push([f, on ? 1 : 0, id]); return o.call(Bangle, on, id); };
});
eval(require("Storage").read("datalog.app.js"));
DEBUG = true;
T.beforeEach(function () {
  T.capture();
  T.spy(E, "getBattery", function () { return 80; });
});

T.test("all sources: sensors on with the app id, one timeline, off on kill", function (done) {
  var poll = T.spy(Bangle, "setPollInterval");
  cfg = { a: 40, h: 1000, p: 1000, m: 200, s: 10000, label: "stairs" };
  startLog();
  var name = logger.name;
  T.eq(calls, [["setHRMPower", 1, "datalog"], ["setBarometerPower", 1, "datalog"], ["setCompassPower", 1, "datalog"]]);
  T.eq(poll.calls[0], [40]);
  var k = 0, up = 1000;
  var iv = setInterval(function () {
    k++;
    Bangle.emit("accel", { x: 0, y: 0, z: 1 });
    if (k % 5 === 0) Bangle.emit("mag", { heading: k % 360 });
    if (k % 25 === 0) { Bangle.emit("HRM", { bpm: 80, confidence: 70 }); Bangle.emit("pressure", { pressure: 1000.5, temperature: 25, altitude: 0 }); }
    if (k % 20 === 0) Bangle.emit("step", up += 2);
    if (k >= 1000) clearInterval(iv);
  }, 40);
  setTimeout(function () {
    calls = [];
    T.emit(E, "kill", undefined, function () {
      T.eq(calls, [["setHRMPower", 0, "datalog"], ["setBarometerPower", 0, "datalog"], ["setCompassPower", 0, "datalog"]]);
      var counts = T.eventsOf("stop")[0].counts;
      T.ok(Math.abs(counts.a - 1000) <= 2, "a " + counts.a);
      T.ok(Math.abs(counts.m - 200) <= 2, "m " + counts.m);
      T.ok(Math.abs(counts.h - 40) <= 1, "h " + counts.h);
      T.ok(Math.abs(counts.p - 40) <= 1, "p " + counts.p);
      T.eq(counts.s, 5, "s every 10 s plus the rest at stop");
      var types = {}, last = -1, steps = 0;
      D.eachLine(ST, name, function (l) {
        var s = D.parseSample(l);
        if (!s) return;
        T.ok(s.t >= last, "one monotonic timeline");
        last = s.t;
        types[s.type] = 1;
        if (s.type === "s") steps += +s.v[0];
      });
      T.eq(Object.keys(types).sort(), ["a", "h", "m", "p", "s"]);
      T.eq(steps, 98, "step deltas add up (50 events of +2, the first sets the baseline)");
      done();
    });
  }, 40100);
}, { timeout: 120000 });

T.test("settings menu edits the label list the app offers", function (done) {
  var menu = T.spy(E, "showMenu", function (m) { return m; });
  eval(ST.read("datalog.settings.js"))(function () {});
  var m = menu.calls[0][0];
  T.eq(m.walk.value, true);
  T.eq(m.sleep.value, false);
  m.walk.onchange(false);
  m.sleep.onchange(true);
  var saved = ST.readJSON("datalog.json").labels;
  T.eq(D.has(saved, "walk"), false);
  T.eq(D.has(saved, "sleep"), true);
  menu.restore();
  settings = ST.readJSON("datalog.json");
  mainMenu();
  setTimeout(function () {
    T.eq(D.has(labels(), "sleep"), true, "app reads the new list");
    done();
  }, 100);
});

T.test("no source chosen: nothing starts", function (done) {
  var alert = T.spy(E, "showAlert");
  cfg = { a: 0, h: 0, p: 0, m: 0, s: 0, label: "" };
  startLog();
  T.eq(logger, undefined);
  T.eq(alert.calls[0][0], "Choose at least one source");
  done();
});

T.test("back from the main menu exits to the launcher", function (done) {
  mainMenu();
  var load = T.spy(global, "load", function () {});
  T.press(100);
  setTimeout(function () { T.eq(load.calls.length, 1); done(); }, 500);
});
