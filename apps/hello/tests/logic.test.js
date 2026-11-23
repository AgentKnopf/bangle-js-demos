// Pure logic: no screen, no sensors, just the module.
var H = require("hello");

T.test("counts taps", function () {
  var c = H.create();
  T.eq(c.tap(0), 1);
  T.eq(c.tap(100), 2);
  T.eq(c.count(), 2);
});

T.test("resets after the quiet period, not before", function () {
  var c = H.create({ resetMs: 1000 });
  c.tap(0);
  T.eq(c.tick(999), false, "999 ms");
  T.eq(c.tick(1000), true, "1000 ms");
  T.eq(c.count(), 0);
});

T.test("tick with no taps does nothing", function () {
  T.eq(H.create().tick(1e9), false);
});

T.test("labels", function () {
  T.eq(H.label(0), "0 taps");
  T.eq(H.label(1), "1 tap");
  T.eq(H.label(12), "12 taps");
});
