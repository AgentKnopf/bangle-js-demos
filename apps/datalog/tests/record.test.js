// Whole app: 60 s of synthetic 12.5 Hz accel, stopped with a long button press.
eval(require("Storage").read("datalog.app.js"));
DEBUG = true;
T.beforeEach(function () {
  T.capture();
  T.spy(E, "getBattery", function () { return 80; });
});

var name;
T.test("60 s of 12.5 Hz accel gives a parseable header and 750 +/- 2 'a' lines", function (done) {
  // A call-through spy on StorageFile.prototype.write records the call but
  // the data never reaches flash, so wrap the opened file instead.
  var writes = 0, open = ST.open;
  T.spy(ST, "open", function (n, m) {
    var f = open.call(ST, n, m), w = f.write;
    if (m === "a") f.write = function (s) { writes++; return w.call(f, s); };
    return f;
  });
  cfg = { a: 80, h: 0, p: 0, m: 0, s: 0, label: "walk" };
  startLog();
  name = logger.name;
  T.eq(T.eventsOf("start")[0].src, { a: 80 });
  var n = 0;
  var iv = setInterval(function () {
    Bangle.emit("accel", { x: 0.1 * Math.sin(n / 5), y: -0.02, z: 0.98, mag: 1, diff: 0 });
    if (++n >= 750) clearInterval(iv);
  }, 80);
  setTimeout(function () { T.screenshot("logging"); }, 30000);
  setTimeout(function () {
    T.eq(n, 750, "events sent");
    T.press(1300); // long press stops the recording
    setTimeout(function () {
      T.eq(logger, undefined, "stopped");
      var stop = T.eventsOf("stop")[0];
      T.eq(stop.reason, "user");
      var header, a = 0, other = 0, last = -1, mono = true;
      D.eachLine(ST, name, function (l) {
        if (!header) { header = JSON.parse(l); return; }
        var s = D.parseSample(l);
        if (s && s.type === "a") { a++; if (s.t <= last) mono = false; last = s.t; } else other++;
      });
      T.eq(header.v, 1);
      T.eq(header.label, "walk");
      T.eq(header.src, { a: 80 });
      T.ok(Math.abs(header.start - Date.now()) < 70000, "start is epoch ms");
      T.ok(Math.abs(a - 750) <= 2, "a lines: " + a);
      T.eq(other, 0);
      T.ok(mono, "timestamps increase");
      var size = ST.open(name, "r").getLength();
      T.eq(writes, stop.writes, "every flash write went through the logger");
      T.ok(writes <= size / 512, writes + " write() calls for " + size + " bytes (limit " + (size / 512) + ")");
      T.eq(screen, "recs", "recordings list shown");
      T.screenshot("recordings");
      done();
    }, 1600);
  }, 60100);
}, { timeout: 120000 });

T.test("short press does not stop; tap opens the stop menu", function (done) {
  cfg = { a: 80, h: 0, p: 0, m: 0, s: 0, label: "" };
  startLog();
  T.press(200);
  setTimeout(function () {
    T.ok(logger, "still logging after a short press");
    T.tap(88, 100);
    setTimeout(function () {
      T.eq(screen, "menu");
      T.ok(logger, "still logging behind the menu");
      stopLog("user");
      done();
    }, 500);
  }, 1500);
});

T.test("recordings in the same minute get -2, -3 suffixes", function () {
  cfg = { a: 80, h: 0, p: 0, m: 0, s: 0, label: "" };
  var base = D.baseName(new Date()), got = [];
  for (var i = 0; i < 3; i++) { startLog(); got.push(logger.name); stopLog("user"); }
  var names = D.list(ST);
  T.ok(D.has(names, base), "base name used earlier in this minute");
  T.eq(got, [base + "-2", base + "-3", base + "-4"]);
});
