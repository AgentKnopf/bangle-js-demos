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
// Whole app: menu, playback, tap/button stop, errors, kill. Bangle.buzz is a
// spy (in the emulator it resolves at once), the motor pin write is recorded.
var battery = 80;
T.spy(E, "getBattery", function () { return battery; });   // emulator returns 0
eval(require("Storage").read("hapticpat.app.js"));
DEBUG = true;

var tick, buzz, pin;
T.beforeEach(function () {
  T.capture();
  battery = 80;
  T.spy(E, "getBattery", function () { return battery; });
  buzz = T.spy(Bangle, "buzz", function () { return Promise.resolve(); });
  pin = [];
  T.spy(global, "digitalWrite", function (p, v) { pin.push({ t: Date.now(), v: v }); });
  // The harness's virtual clock can skip past timers that an input handler creates.
  tick = setInterval(function () {}, 10);
});
T.afterEach(function () { clearInterval(tick); if (player.isPlaying()) player.stop(); showMenu(); });

function find(name) { return H.BUILTINS.filter(function (p) { return p.name === name; })[0]; }

T.test("the menu lists the built-ins and the cap setting", function (done) {
  showMenu();
  setTimeout(function () { T.screenshot("menu"); done(); }, 300);
});

T.test("1: ramp up through the app: 9 step events, buzz() for the on steps, done:end", function (done) {
  settings.cap = 1;
  play(find("ramp up"));
  setTimeout(function () { T.screenshot("ramp-up-playing"); }, 820);
  setTimeout(function () {
    var b = T.eventsOf("buzz");
    T.eq(b.map(function (e) { return [e.ms, e.s, e.sEff]; }),
      [[150, 0.2, 0.2], [50, 0, 0], [150, 0.4, 0.4], [50, 0, 0], [150, 0.6, 0.6], [50, 0, 0], [150, 0.8, 0.8], [50, 0, 0], [300, 1, 1]]);
    T.eq(buzz.calls, [[150, 0.2], [150, 0.4], [150, 0.6], [150, 0.8], [300, 1]]);
    T.eq(T.eventsOf("done").map(function (e) { return e.reason; }), ["end"]);
    T.screenshot("ramp-up-done");
    setTimeout(done, 50);
  }, 1500);
});

T.test("2: with cap 50 % every sEff is <= 0.5 and buzz() never gets more", function (done) {
  settings.cap = 0.5;
  play(find("swell"));
  setTimeout(function () {
    var b = T.eventsOf("buzz");
    T.ok(b.length > 20, "steps " + b.length);
    b.forEach(function (e) { T.ok(e.sEff <= 0.5, "sEff " + e.sEff); });
    buzz.calls.forEach(function (c) { T.ok(c[1] <= 0.5, "buzz strength " + c[1]); });
    settings.cap = 1;
    done();
  }, 5000);
}, { timeout: 20000 });

T.test("6: tapping the screen stops playback within 50 ms", function (done) {
  play(find("rhythm"));
  var tapAt;
  setTimeout(function () { tapAt = Date.now(); T.tap(88, 100, 60); }, 1000);
  setTimeout(function () {
    var d = T.eventsOf("done");
    T.eq(d.length, 1); T.eq(d[0].reason, "stop");
    var release = tapAt + 60;
    var off = pin.filter(function (p) { return p.v === 0 && p.t >= tapAt; })[0];
    T.ok(off, "motor pin driven low");
    T.ok(off.t - release <= 50, "motor off " + (off.t - release) + " ms after the tap");
    T.ok(!player.isPlaying());
    T.eq(T.eventsOf("buzz").filter(function (e) { return e.t > 1100; }).length, 0, "no steps after the tap");
    T.screenshot("stopped");
    setTimeout(done, 50);   // let the screenshot run before afterEach shows the menu
  }, 1600);
});

T.test("the button stops playback", function (done) {
  play(find("rhythm"));
  setTimeout(function () { T.press(50); }, 500);
  setTimeout(function () {
    T.eq(T.eventsOf("done").map(function (e) { return e.reason; }), ["stop"]);
    T.ok(pin.some(function (p) { return p.v === 0; }), "motor off");
    done();
  }, 900);
});

T.test("5: playback stops at 60 s with done:limit", function (done) {
  play({ name: "long", repeat: 200, steps: [[100, 0.5], [300, 0]] });
  setTimeout(function () {
    var d = T.eventsOf("done");
    T.eq(d.length, 1); T.eq(d[0].reason, "limit"); T.near(d[0].t, 60000, 100);
    done();
  }, 62000);
}, { timeout: 90000 });

T.test("8: invalid pattern JSON shows an error and logs no buzz events", function (done) {
  T.ok(playJSON('{"name":"bad","steps":[[100,-1]]}'), "error returned");
  T.ok(playJSON("{not json"), "error returned");
  setTimeout(function () {
    T.eq(T.eventsOf("buzz").length, 0); T.eq(buzz.calls.length, 0);
    T.eq(T.eventsOf("error").length, 2);
    T.eq(playing, null);
    T.screenshot("invalid");
    setTimeout(done, 50);
  }, 300);
});

T.test("a custom pattern file shows up in the menu and plays", function (done) {
  require("Storage").write(CUSTOM, '{"name":"mine","steps":[[100,1],[100,0],[100,1]]}');
  showMenu();
  playJSON(require("Storage").read(CUSTOM));
  setTimeout(function () {
    T.eq(buzz.calls.length, 2);
    T.eq(T.eventsOf("done")[0].reason, "end");
    require("Storage").erase(CUSTOM);
    done();
  }, 1000);
});

T.test("low battery caps strength at 50 % and shows a note", function (done) {
  battery = 10;
  settings.cap = 1;
  play(find("pulse"));
  T.ok(playing.lowBattery, "note shown");
  T.screenshot("low-battery");
  setTimeout(function () {
    T.eq(buzz.calls, [[200, 0.5]]);
    done();
  }, 500);
});

T.test("starting a pattern while one plays stops the old one first", function (done) {
  play(find("rhythm"));
  setTimeout(function () { play(find("pulse")); }, 300);
  setTimeout(function () {
    T.eq(T.eventsOf("done").map(function (e) { return e.reason; }), ["stop", "end"]);
    done();
  }, 1000);
});

T.test("kill during playback turns the motor off", function (done) {
  play(find("SOS"));
  setTimeout(function () {
    pin = [];
    T.emit(E, "kill", undefined, function () {
      T.ok(pin.length >= 1 && pin[0].v === 0, "motor pin low");
      T.eq(T.eventsOf("done").map(function (e) { return e.reason; }), ["stop"]);
      T.ok(!player.isPlaying());
      done();
    });
  }, 250);
});

T.test("the cap setting is saved", function () {
  var m = null;
  T.spy(E, "showMenu", function (menu) { m = menu; });
  showMenu();
  m["Strength cap"].onchange(1);
  T.eq(require("Storage").readJSON(SETTINGS).cap, 0.5);
  T.eq(settings.cap, 0.5);
  m["Strength cap"].onchange(3);
  T.eq(require("Storage").readJSON(SETTINGS).cap, 1);
});
