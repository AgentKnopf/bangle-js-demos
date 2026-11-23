// Emulator only: the emulator has no accelerometer and no TensorFlow.
// Paste this into the left-hand console after the app has started.
//   fake()          resting wrist: 1 g plus a little noise at 12.5 Hz; fake(false) stops
//   gesture()       one 0.7 s flick along x (up to 2.5 g) in the stream
//   fakeTF(scores)  require("tensorflow") returns a stand-in interpreter whose
//                   invoke() always outputs `scores`, one number per label
var fakeIv, fakeQ = [];
function fake(on) {
  if (fakeIv) clearInterval(fakeIv);
  fakeIv = undefined;
  if (on === false) return;
  fakeIv = setInterval(function () {
    var a = fakeQ.length ? fakeQ.shift() : { x: 0.02 * (Math.random() - 0.5), y: 0.02 * (Math.random() - 0.5), z: -1 };
    a.mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    a.diff = 0;
    Bangle.emit("accel", a);
  }, 80);
}
function gesture() {
  [0.9, 1.6, 2.5, -0.8, -2.2, 0.4, 1.2, -0.6, 0.3].forEach(function (x) { fakeQ.push({ x: x, y: 0.2, z: -1 }); });
}
var realRequire = require;
function fakeTF(scores) {
  global.require = function (name) {
    if (name !== "tensorflow") return realRequire(name);
    return { create: function (arena, model) {
      if (typeof model !== "string") throw new Error("model must be a string");
      var inp = new Float32Array(57), out = new Float32Array(scores.length);
      return { getInput: function () { return inp; }, getOutput: function () { return out; },
        invoke: function () { out.set(scores); } };
    } };
  };
}
