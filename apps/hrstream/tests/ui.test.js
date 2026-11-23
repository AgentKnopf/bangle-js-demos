// Whole app: greyed-out rendering, HRS value and tap-to-toggle.
eval(require("Storage").read("hrstream.app.js"));
DEBUG = true;
var println, upd;
T.beforeEach(function () {
  T.capture();
  println = T.spy(Bluetooth, "println", function () {});
  upd = T.spy(NRF, "updateServices", function () {});
  T.spy(E, "getBattery", function () { return 64; });
});

// Grey is drawn dithered (checkerboard), so a greyed number has dark pixels
// but no two horizontally adjacent ones.
function bpmPixels() {
  var r = Bangle.appRect, dark = 0, pairs = 0;
  for (var y = r.y + 32; y < r.y + 76; y++) {
    var prev = false;
    for (var x = r.x; x <= r.x2; x++) {
      var d = g.getPixel(x, y) !== g.theme.bg;
      if (d) { dark++; if (prev) pairs++; }
      prev = d;
    }
  }
  return { dark: dark, pairs: pairs };
}
function lastHRS() { var c = upd.calls[upd.calls.length - 1][0]; return c[0x180D][0x2A37].value; }

T.test("confident sample renders solid and sets the HRS value", function (done) {
  T.emit(Bangle, "HRM", { bpm: 72, confidence: 85 }, function () {
    var p = bpmPixels();
    T.ok(p.dark > 100, "digits drawn: " + p.dark);
    T.ok(p.pairs > 50, "solid digits: " + p.pairs);
    T.eq(T.eventsOf("draw").pop().grey, false);
    T.eq(lastHRS(), [0x06, 72]);
    done();
  });
});

T.test("low-confidence sample renders greyed out and does not change the HRS BPM", function (done) {
  T.emit(Bangle, "HRM", { bpm: 131, confidence: 30 }, function () {
    var p = bpmPixels();
    T.ok(p.dark > 50, "digits drawn: " + p.dark);
    T.eq(p.pairs, 0, "dithered (greyed) digits");
    var d = T.eventsOf("draw").pop();
    T.eq(d.grey, true);
    T.eq(d.bpm, 131);
    T.eq(lastHRS(), [0x04, 72], "BPM byte stays at the last confident value");
    T.screenshot("low-confidence");
    done();
  });
});

T.test("tap toggles streaming and emits ST lines with the right state", function (done) {
  T.emit(NRF, "connect", "aa", function () {
    setTimeout(function () {
      println.calls = [];
      T.tap(88, 120);
      setTimeout(function () {
        T.eq(S.streaming, false, "paused after first tap");
        T.eq(println.calls.length, 1);
        var st = HR.parseLine(println.calls[0][0]);
        T.eq(st.type, "ST");
        T.eq(st.data.evt, "stream");
        T.eq(st.data.on, false);
        T.eq(T.eventsOf("stream")[0].on, false);
        var nUpd = upd.calls.length;
        Bangle.emit("HRM", { bpm: 70, confidence: 90 });
        setTimeout(function () {
          T.eq(println.calls.length, 1, "no HR line while paused");
          T.eq(upd.calls.length, nUpd, "no HRS notify while paused");
          T.screenshot("paused");
          T.tap(88, 120);
          setTimeout(function () {
            T.eq(S.streaming, true, "streaming after second tap");
            var st2 = HR.parseLine(println.calls[1][0]);
            T.eq(st2.type, "ST");
            T.eq(st2.data.on, true);
            T.eq(T.eventsOf("stream").map(function (e) { return e.on; }), [false, true]);
            done();
          }, 300);
        }, 100);
      }, 300);
    }, FLUSH_MS + 100);
  });
});
