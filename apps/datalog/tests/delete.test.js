// Whole app: recordings list, delete with confirm.
eval(require("Storage").read("datalog.app.js"));
DEBUG = true;
T.beforeEach(function () {
  T.capture();
  T.spy(E, "getBattery", function () { return 80; });
});

function record(cb) {
  cfg = { a: 80, h: 0, p: 0, m: 0, s: 0, label: "" };
  startLog();
  var n = logger.name, i = 0;
  var iv = setInterval(function () {
    Bangle.emit("accel", { x: 0, y: 0, z: 1 });
    if (++i >= 50) { clearInterval(iv); setTimeout(function () { stopLog("user"); cb(n); }, 10); }
  }, 80);
}
function openDelete(cb) {
  recMenu();
  setTimeout(function () {
    T.tap(88, 20); // first recording
    setTimeout(function () {
      T.eq(screen, "detail");
      T.tap(88, 122); // Delete
      setTimeout(function () { T.eq(screen, "confirm"); cb(); }, 600);
    }, 600);
  }, 300);
}

var name;
T.test("recording list shows the file with size and duration", function (done) {
  record(function (n) {
    name = n;
    T.eq(T.eventsOf("recs").pop().names, [n]);
    var e = ST.readJSON("datalog.idx.json");
    T.eq(e[n].n, 50);
    T.near(e[n].ms, 50 * 80, 1, "first sample 80 ms after start");
    T.screenshot("list");
    done();
  });
});

T.test("delete then No keeps the file", function (done) {
  openDelete(function () {
    T.screenshot("confirm");
    T.tap(130, 150); // No
    setTimeout(function () {
      T.eq(T.eventsOf("keep").length, 1);
      T.eq(D.list(ST), [name]);
      T.eq(screen, "recs");
      done();
    }, 600);
  });
});

T.test("delete then Yes removes the file and its index entry", function (done) {
  openDelete(function () {
    T.tap(40, 150); // Yes
    setTimeout(function () {
      T.eq(T.eventsOf("delete")[0].name, name);
      T.eq(D.list(ST), []);
      T.eq(ST.list(/^log\./, { sf: true }), []);
      T.eq(ST.readJSON("datalog.idx.json")[name], undefined);
      done();
    }, 600);
  });
});
