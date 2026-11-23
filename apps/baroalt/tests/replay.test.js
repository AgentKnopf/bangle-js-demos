// Replay a recorded pressure trace from Storage (tests/fixtures/baroclimb.csv:
// t_ms,pressure_hPa,temp_C at 1 Hz). This one is synthetic: a 9.6 m climb in
// 60 s, a pause, then 3.6 m down, with +/-0.04 hPa noise. Swap in a recording
// from a real watch to check the detector against real data.
var B = require("baroalt");

function replay(name) {
  var lines = require("Storage").read(name).split("\n"), tr = B.create(), last = null;
  for (var i = 1; i < lines.length; i++) {
    var f = lines[i].split(",");
    if (f.length < 3) continue;
    var r = tr.feed({ t: Number(f[0]), p: Number(f[1]), temp: Number(f[2]) });
    if (r) last = r;
  }
  return last;
}

T.test("recorded climb: 3 floors up, 1 down", function () {
  var r = replay("baroclimb.csv");
  T.eq(r.up, 3, "up");
  T.eq(r.down, 1, "down");
  T.near(r.altS, 6.0, 0.5, "relative altitude");
  T.near(r.temp, 31.6, 0.11, "last temperature");
});
