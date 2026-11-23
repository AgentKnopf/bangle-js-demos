// Whole app: export mode, commands typed into the console device.
eval(require("Storage").read("datalog.app.js"));
DEBUG = true;
var c = 0;
var L1 = D.createLogger({ storage: ST, name: "log.20260101-0900", start: Date.now(), label: "walk", src: { a: 80, h: 1000 }, now: function () { return c; } }).start();
for (var i = 0; i < 100; i++) { c = i * 80; L1.sample("a", { x: 0, y: 0, z: 1 }); if (i % 12 === 0) L1.sample("h", { bpm: 70, confidence: 80 }); }
L1.stop();
ST.open("log.20260101-0905", "a").write('{"v":1,"start":0,"label":"","src":{"a":80}}\n0,a,0.00,0.00,1.00\n');
var CON = eval(E.getConsole()); // the device the emulator console types into

var out, setConsole;
T.beforeEach(function () {
  T.capture();
  out = "";
  // Really moving the console would also hide the test runner's output.
  setConsole = T.spy(E, "setConsole", function () {});
  T.spy(CON, "write", function (s) { out += s; });
});

T.test("entering export moves the console off the UART", function () {
  exportScreen();
  T.eq(setConsole.calls[0], ["LoopbackA", { force: true }]);
  T.eq(screen, "export");
  T.screenshot("export");
});

T.test("LIST returns one F line per recording, then END", function (done) {
  CON.emit("data", "LIS");
  CON.emit("data", "T\n");
  setTimeout(function () {
    T.eq(out, 'F {"name":"log.20260101-0900","bytes":' + ST.open("log.20260101-0900", "r").getLength() + '}\n' +
      'F {"name":"log.20260101-0905","bytes":' + ST.open("log.20260101-0905", "r").getLength() + '}\nEND\n');
    done();
  }, 100);
});

T.test("GET returns the file's lines verbatim, then END", function (done) {
  var expected = "";
  D.eachLine(ST, "log.20260101-0900", function (l) { expected += l + "\n"; });
  CON.emit("data", "GET log.2026");
  CON.emit("data", "0101-0900\r\n");
  setTimeout(function () {
    T.eq(out.length, expected.length + 4);
    T.eq(out, expected + "END\n");
    T.eq(out.split("\n").length - 1, 1 + L1.count + 1, "header + samples + END");
    T.eq(L1.counts.a, 100);
    done();
  }, 1000);
});

T.test("unknown file and unknown command answer ERR then END", function (done) {
  CON.emit("data", "GET log.missing\nFOO\n");
  setTimeout(function () {
    T.eq(out, 'ERR {"msg":"no such file"}\nEND\nERR {"msg":"unknown command"}\nEND\n');
    done();
  }, 200);
});

T.test("leaving export restores the console and stops listening", function (done) {
  var prev = exportState.prev;
  T.press(100);
  setTimeout(function () {
    T.eq(setConsole.calls[0], [prev]);
    T.eq(exportState, undefined);
    T.eq(screen, "main");
    CON.emit("data", "LIST\n");
    setTimeout(function () { T.eq(out, "", "no answer after leaving"); done(); }, 100);
  }, 500);
});
