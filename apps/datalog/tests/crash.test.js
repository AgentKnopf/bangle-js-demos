// Whole app: kill mid-recording, and a reset that cuts a write in half.
eval(require("Storage").read("datalog.app.js"));
DEBUG = true;
T.beforeEach(function () {
  T.capture();
  T.spy(E, "getBattery", function () { return 80; });
});

function feed(n, cb) {
  var i = 0, iv = setInterval(function () {
    Bangle.emit("accel", { x: 0.01 * i, y: 0, z: 1 });
    Bangle.emit("HRM", { bpm: 70, confidence: 90 });
    if (++i >= n) { clearInterval(iv); setTimeout(cb, 50); }
  }, 80);
}
function readBack(name) {
  var out = { lines: 0, bad: 0, header: null };
  D.eachLine(ST, name, function (l) {
    if (!out.header) { out.header = JSON.parse(l); return; }
    if (l.charAt(0) === "{") return;
    if (D.parseSample(l)) out.lines++; else out.bad++;
  });
  return out;
}

T.test("kill mid-recording flushes; the file has only complete lines", function (done) {
  cfg = { a: 80, h: 1000, p: 0, m: 0, s: 0, label: "sit" };
  startLog();
  var name = logger.name;
  feed(300, function () {
    T.ok(logger.pending() > 0, "unflushed data in RAM");
    var count = logger.count;
    T.emit(E, "kill", undefined, function () {
      T.eq(logger, undefined);
      T.eq(T.eventsOf("stop")[0].reason, "kill");
      var r = readBack(name);
      T.eq(r.header.label, "sit");
      T.eq(r.lines, count, "every sample made it to flash");
      T.eq(r.bad, 0);
      done();
    });
  });
});

T.test("reset during a write: reader ignores the cut-off last line", function (done) {
  cfg = { a: 80, h: 0, p: 0, m: 0, s: 0, label: "" };
  startLog();
  var name = logger.name;
  feed(200, function () {
    var flushed = 0;
    D.eachLine(ST, name, function () { flushed++; });
    // Hard reset: no kill handler, the RAM buffer is lost and the last
    // write stopped half-way through a line.
    clearInterval(tick);
    logger = undefined;
    ST.open(name, "a").write("15920,a,0.1");
    var r = readBack(name);
    T.eq(r.bad, 0, "no broken lines");
    T.eq(r.lines + 1, flushed, "only complete lines");
    var raw = [], f = ST.open(name, "r"), l;
    while ((l = f.readLine()) !== undefined) raw.push(l);
    T.eq(raw[raw.length - 1], "15920,a,0.1", "the partial line really is in the file");
    T.eq(D.info(ST, name).n, r.lines);
    done();
  });
});
