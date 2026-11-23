// Whole app: synthetic HRM events with no connection, then a simulated connect.
eval(require("Storage").read("hrstream.app.js"));
DEBUG = true;
var println;
T.beforeEach(function () {
  T.capture();
  println = T.spy(Bluetooth, "println", function () {});
  T.spy(NRF, "updateServices", function () {});
  T.spy(E, "getBattery", function () { return 64; });
});

function feed(n, t0, cb) {
  var i = 0;
  var iv = setInterval(function () {
    Bangle.emit("HRM", { bpm: 60 + (i % 20), confidence: 90, raw: [] });
    if (++i >= n) { clearInterval(iv); setTimeout(cb, 50); }
  }, 1000);
}

T.test("no connection: buffer fills to 60 and no more, nothing on the UART", function (done) {
  feed(75, 0, function () {
    T.eq(S.buffer.length, 60, "buffer length");
    T.eq(println.calls.length, 0, "Bluetooth.println calls");
    var h = T.eventsOf("hrm");
    T.eq(h.length, 75);
    T.eq(h[74].buf, 60);
    T.eq(h[59].buf, 60);
    T.eq(h[58].buf, 59);
    done();
  });
}, { timeout: 120000 });

T.test("simulated connect flushes all 60 buffered lines in order, then streams live", function (done) {
  var expected = S.buffer.map(function (s) { return s.t; });
  T.emit(NRF, "connect", "aa:bb:cc:dd:ee:ff", function () {
    T.eq(S.connected, true);
    T.eq(println.calls.length, 0, "waits for the client to subscribe");
    setTimeout(function () {
      T.eq(println.calls.length, 60, "flushed lines");
      var got = println.calls.map(function (c) { return HR.parseLine(c[0]).data.t; });
      T.eq(got, expected, "original t, oldest first");
      T.eq(T.eventsOf("flush")[0].n, 60);
      T.eq(S.buffer.length, 0);
      Bangle.emit("HRM", { bpm: 75, confidence: 90 });
      setTimeout(function () {
        T.eq(println.calls.length, 61, "live line");
        T.ok(/^HR \{"t":\d+,"bpm":75,"conf":90,"bat":64\}$/.test(println.calls[60][0]), println.calls[60][0]);
        T.screenshot("connected");
        done();
      }, 100);
    }, FLUSH_MS + 100);
  });
});

T.test("disconnect goes back to buffering; reconnect resumes", function (done) {
  T.emit(NRF, "disconnect", 19, function () {
    feed(3, 0, function () {
      T.eq(println.calls.length, 0);
      T.eq(S.buffer.length, 3);
      T.emit(NRF, "connect", "aa", function () {
        setTimeout(function () {
          T.eq(println.calls.length, 3);
          T.eq(S.buffer.length, 0);
          done();
        }, FLUSH_MS + 100);
      });
    });
  });
});
