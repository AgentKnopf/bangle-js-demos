// A corrupt compass.json must open the calibration screen without errors.
var S = require("Storage");
S.write("compass.json", '{"v":1,"offset":[12.5,-40');

eval(S.read("compasscal.app.js"));

T.test("criterion 5: corrupt compass.json opens calibration", function (done) {
  T.eq(cal, null);
  T.eq(mode, "cal");
  onMag({ x: 1, y: 2, z: 3 });
  T.screenshot("corrupt-file");
  setTimeout(done, 100);
});

T.test("wrong structure also opens calibration", function () {
  E.emit("kill");
  S.writeJSON("compass.json", { v: 1, offset: [0, 0], scale: "x" });
  mode = undefined;
  start();
  T.eq(cal, null);
  T.eq(mode, "cal");
});
