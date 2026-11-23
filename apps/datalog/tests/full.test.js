// Whole app: getFree() mocked low.
eval(require("Storage").read("datalog.app.js"));
DEBUG = true;
T.beforeEach(function () {
  T.capture();
  T.spy(E, "getBattery", function () { return 80; });
});

T.test("low free space: logging stops with 'storage full', file stays readable", function (done) {
  T.spy(ST, "getFree", function () { return 3000; });
  var alert = T.spy(E, "showAlert");
  cfg = { a: 80, h: 0, p: 0, m: 0, s: 0, label: "" };
  startLog();
  var name = logger.name, n = 0;
  var iv = setInterval(function () {
    Bangle.emit("accel", { x: 0, y: 0.5, z: 0.87 });
    if (++n >= 400) clearInterval(iv);
  }, 80);
  setTimeout(function () {
    T.eq(logger, undefined, "stopped on its own");
    var stop = T.eventsOf("stop")[0];
    T.eq(stop.reason, "full");
    T.eq(alert.calls[0][0], "storage full");
    T.screenshot("storage-full");
    var size = ST.open(name, "r").getLength();
    T.ok(size <= 2850, "within 95 % of 3000: " + size);
    var header, lines = 0;
    D.eachLine(ST, name, function (l) { if (!header) header = JSON.parse(l); else if (D.parseSample(l)) lines++; else T.fail("bad line " + l); });
    T.eq(header.src, { a: 80 });
    T.eq(lines, stop.n);
    T.ok(lines > 100, "lines " + lines);
    done();
  }, 33000);
});

T.test("battery below 10 % stops and flushes", function (done) {
  var bat = 80;
  T.spy(E, "getBattery", function () { return bat; });
  cfg = { a: 80, h: 0, p: 0, m: 0, s: 0, label: "" };
  startLog();
  var name = logger.name;
  Bangle.emit("accel", { x: 0, y: 0, z: 1 });
  setTimeout(function () {
    bat = 9;
    setTimeout(function () {
      T.eq(logger, undefined);
      T.eq(T.eventsOf("stop")[0].reason, "battery");
      var n = 0;
      D.eachLine(ST, name, function () { n++; });
      T.eq(n, 2, "header + the one sample");
      done();
    }, 1500);
  }, 500);
});
