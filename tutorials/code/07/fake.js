// Emulator only: the emulator has no accelerometer, so this fakes one.
// Paste it into the left-hand console, then fake("walk"); fake() stops.
// Kinds: still, fidget, walk, run, type (typing: small, fast wrist moves).
var fakeIv;
function fake(kind) {
  if (fakeIv) clearInterval(fakeIv);
  fakeIv = undefined;
  if (!kind) return;
  var t = 0, k = 0;
  fakeIv = setInterval(function () {
    t += 0.08;
    var w = 2 * Math.PI * t, m = 1;
    if (kind == "still") m = 1 + 0.02 * (Math.random() - 0.5);
    if (kind == "fidget") m = 1 + 0.12 * (Math.random() - 0.5);
    if (kind == "walk") m = 1 + 0.2 * Math.sin(2 * w);
    if (kind == "run") m = 1 + 0.6 * Math.sin(2.8 * w);
    if (kind == "type") m = 1 + 0.14 * Math.sin(5 * w);
    Bangle.emit("accel", { x: 0, y: 0, z: -m, mag: m, diff: 0 });
    if ((kind == "walk" || kind == "run") && ++k % 6 == 0) Bangle.emit("step", 0);
  }, 80);
}
