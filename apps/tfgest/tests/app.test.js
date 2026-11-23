// The whole app in the emulator. TensorFlow is missing in the emulator, so
// Run-mode tests replace require("tensorflow") with a fake interpreter.
eval(require("Storage").read("tfgest.app.js"));
DEBUG = true;
var S = require("Storage");
var errors = [];
T.beforeEach(function () { T.capture(); });

var seed = 5;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; }
function rest() { return { x: 0.04 * rnd(), y: 0.04 * rnd(), z: -1 + 0.04 * rnd() }; }
function burst(i) { return { x: [0.9, 1.6, 2.5, -0.8, -2.2, 0.4][i % 6], y: 0.2, z: -1 }; }
var tNow = Date.now();
function play(ms, f) { for (var i = 0; ms > 0; ms -= 80, i++, tNow += 80) feed(f(i), tNow); }

// fake require("tensorflow"); out = the scores the next invoke() returns
var FAKE = { outLen: 6, next: [0.02, 0.9, 0.04, 0.02, 0.01, 0.01], invoked: 0, created: 0 };
function useFakeTF() {
  var orig = require;
  T.spy(global, "require", function (n) {
    if (n !== "tensorflow") return orig(n);
    return { create: function (arena, model) {
      FAKE.created++; FAKE.arena = arena; FAKE.model = model;
      var inp = new Float32Array(57), out = new Float32Array(FAKE.outLen);
      return { getInput: function () { return inp; }, getOutput: function () { return out; },
        invoke: function () { FAKE.invoked++; FAKE.lastIn = new Float32Array(inp); for (var i = 0; i < out.length; i++) out[i] = FAKE.next[i] || 0; } };
    } };
  });
}
function storeModel(labels) {
  S.write(".tfmodel", "TFL3 fake model bytes");
  S.writeJSON("gestmodel.json", { v: 1, labels: labels || G.LABELS, n: 19, hz: 12.5, scale: 0.01, quant: "int8", io: "float32", thresh: 0.7, arena: 8000 });
}
function noErrors() {
  T.eq(T.eventsOf("error").length, 0, "error events");
}

T.test("starts in the main menu", function (done) {
  T.eq(mode, "menu");
  T.screenshot("menu");
  setTimeout(done, 100);
});

// ---- criterion 1 ----
T.test("Record: synthetic accel writes lines that parse with exactly n x 3 values in range", function (done) {
  var buzz = T.spy(Bangle, "buzz", function () { return Promise.resolve(); });
  startRec("twist");
  T.eq(rec.count, 0);
  play(1000, rest);
  T.tap(88, 100);                       // arm
  setTimeout(function () {
    T.eq(T.eventsOf("arm").length, 1, "armed");
    T.eq(buzz.calls.length, 1, "one buzz when armed");
    play(500, rest);
    play(480, burst);                   // includes values beyond +/-1.27 g
    play(1500, rest);
    T.eq(T.eventsOf("rec").length, 1, "one recording");
    T.screenshot("record");
    var f = S.open("gest.twist", "r"), l, n = 0;
    while ((l = f.readLine()) !== undefined) {
      var r = G.parse(l);
      T.ok(r, "line parses: " + l);
      T.eq(r.label, "twist"); T.eq(r.n, 19); T.eq(r.hz, 12.5); T.eq(r.xyz.length, 57);
      r.xyz.forEach(function (v) { T.ok(v >= -128 && v <= 127 && v === Math.round(v), "int8 " + v); });
      T.ok(r.xyz.some(function (v) { return v === 127; }), "2.5 g clamped to 127");
      n++;
    }
    T.eq(n, 1, "lines in gest.twist");
    setTimeout(function () {
      T.eq(buzz.calls.length, 3, "two buzzes when saved");
      done();
    }, 400);
  }, 300);
});

T.test("Record: 'none' is captured at once, and a second recording appends", function (done) {
  T.spy(Bangle, "buzz", function () { return Promise.resolve(); });
  startRec("none");
  T.tap(88, 100);
  setTimeout(function () {
    play(1600, rest);
    startRec("none");
    T.tap(88, 100);
    setTimeout(function () {
      play(1600, rest);
      T.eq(rec.count, 2);
      T.eq(countRecs("none"), 2, "2 lines");
      T.eq(countRecs("twist"), 1, "twist untouched");
      done();
    }, 300);
  }, 300);
});

T.test("button in Record goes back to the menu and stops listening", function (done) {
  startRec("shake");
  T.press(100);
  setTimeout(function () { T.eq(mode, "menu"); T.eq(det, undefined); done(); }, 1500);
});

// ---- criterion 3 ----
T.test("Run with no model stored shows 'no model' and logs no errors", function (done) {
  T.ok(!S.read(".tfmodel"), "no model in Storage");
  startRun();
  setTimeout(function () {
    var ev = T.eventsOf("run");
    T.eq(ev.length, 1); T.eq(ev[0].err, "no model");
    noErrors();
    T.eq(model, undefined);
    T.screenshot("run-no-model");
    play(3000, burst);                  // movement in this state must not crash
    T.press(100);
    setTimeout(function () { T.eq(mode, "menu"); done(); }, 1500);
  }, 300);
});

T.test("Run without tensorflow (the emulator) reports it instead of crashing", function () {
  storeModel();
  startRun();
  T.eq(T.eventsOf("run")[0].err, "no tensorflow");
  showMenu();
});

// ---- criterion 4 ----
T.test("Run refuses a model whose outputs do not match gestmodel.json labels", function (done) {
  useFakeTF();
  FAKE.outLen = 5;
  storeModel();
  startRun();
  setTimeout(function () {
    T.eq(T.eventsOf("run")[0].err, "model has 5 outputs, gestmodel.json 6 labels");
    T.eq(model, undefined, "not running");
    T.screenshot("run-mismatch");
    setTimeout(function () { FAKE.outLen = 6; showMenu(); done(); }, 200);
  }, 300);
});

T.test("Run refuses a model trained at another sample rate", function () {
  useFakeTF();
  storeModel();
  var m = S.readJSON("gestmodel.json"); m.hz = 25; S.writeJSON("gestmodel.json", m);
  startRun();
  T.eq(T.eventsOf("run")[0].err, "model wants 25 Hz, app runs 12.5 Hz");
  showMenu();
});

T.test("Run: a burst is classified, shown, buzzed; refractory 1 s; leaving frees the model", function (done) {
  useFakeTF();
  var buzz = T.spy(Bangle, "buzz", function () { return Promise.resolve(); });
  storeModel();
  FAKE.invoked = 0;
  startRun();
  T.ok(model && model.tf, "model loaded");
  T.eq(FAKE.arena, 8000, "arena from gestmodel.json");
  T.eq(FAKE.model, "TFL3 fake model bytes", "model passed as a RAM string");
  play(1000, rest);
  play(480, burst);
  play(1100, rest);
  T.eq(FAKE.invoked, 1, "one inference");
  T.near(FAKE.lastIn[3 * 3], 0.9, 0.001, "input normalised to g");
  var det1 = T.eventsOf("detect");
  T.eq(det1.length, 1); T.eq(det1[0].name, "flick-left");
  T.eq(T.eventsOf("infer")[0].top.length, 3, "top-3 logged");
  T.eq(buzz.calls.length, 1, "buzz on detection");
  T.eq(shown, "flick-left");
  drawRun();
  T.screenshot("run-detect");
  setTimeout(function () { runPart2(done); }, 200);
}, { timeout: 120000 });

function runPart2(done) {
  // a second burst within the 1 s refractory period after the window is ignored
  play(240, burst); play(1600, rest);
  T.eq(T.eventsOf("detect").length, 1, "still one detection");
  // later bursts classed "none" or below the threshold are not events
  FAKE.next = [0.95, 0.01, 0.01, 0.01, 0.01, 0.01];
  play(480, burst); play(1600, rest);
  FAKE.next = [0.1, 0.1, 0.6, 0.1, 0.05, 0.05];
  play(480, burst); play(1600, rest);
  T.eq(T.eventsOf("detect").length, 1, "none / low probability ignored");
  T.ok(FAKE.invoked >= 3, "inferences: " + FAKE.invoked);
  noErrors();
  T.press(100);
  setTimeout(function () {
    T.eq(mode, "menu"); T.eq(model, undefined, "interpreter freed");
    play(480, burst);
    T.eq(T.eventsOf("infer").length, FAKE.invoked, "no inference after leaving");
    FAKE.next = [0.02, 0.9, 0.04, 0.02, 0.01, 0.01];
    done();
  }, 1500);
}

T.test("Manage: test windows compare with the PC answers", function (done) {
  useFakeTF();
  storeModel();
  var w = []; for (var i = 0; i < 57; i++) w.push(0);
  S.writeJSON("tfgest.tw.json", { v: 1, windows: [
    { label: "flick-left", xyz: w, pcFloat: "flick-left", pcInt8: "flick-left" },
    { label: "twist", xyz: w, pcFloat: "twist", pcInt8: "twist" }] });
  manageMenu();
  T.screenshot("manage");
  setTimeout(selfTest, 200);
  setTimeout(function () {
    var e = T.eventsOf("selftest")[0];
    T.eq(e.same, 1); T.eq(e.total, 2); T.eq(e.got, ["flick-left", "flick-left"]);
    T.screenshot("selftest");
    done();
  }, 300);
});

T.test("Manage: delete recordings asks first; cancel keeps, confirm deletes", function (done) {
  T.ok(countRecs("none") === 2, "recordings exist");
  deleteRecs();
  setTimeout(function () {
    T.screenshot("delete-prompt");
    T.tap(140, 150);                    // "No" button of E.showPrompt
    setTimeout(function () {
      T.eq(countRecs("none"), 2, "kept after No");
      deleteRecs();
      setTimeout(function () {
        T.tap(40, 150);                 // "Yes"
        setTimeout(function () {
          T.eq(T.eventsOf("deleted").length, 1);
          T.eq(S.list(/^gest\./, { sf: true }).length, 0, "all gest.* gone");
          done();
        }, 500);
      }, 300);
    }, 500);
  }, 300);
});

T.test("kill stops the sensor; Exit in the menu returns to the launcher", function (done) {
  var load = T.spy(global, "load", function () {});
  startRec("raise");
  T.ok(det, "recording");
  T.emit(E, "kill", undefined, function () {
    T.eq(det, undefined, "detector stopped");
    var menu = T.spy(E, "showMenu");
    showMenu();
    menu.calls[0][0]["Exit"]();
    T.eq(load.calls.length, 1, "load() calls");
    done();
  });
});
