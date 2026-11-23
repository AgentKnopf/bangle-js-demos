// Compass logic: calibration, heading maths, smoothing and bearings. Plain
// functions on plain objects, so emulator tests can drive everything with
// synthetic samples. Touch gestures come from the "gestures" module (touchgest).
exports.CAL_FILE = "compass.json";
exports.SETTINGS_FILE = "compasscal.json";
exports.MIN_RANGE = 120;      // raw counts each axis must span for a full calibration (tune on HW)
exports.CAL_TIMEOUT = 20000;  // ms; after this, accept if every axis spans MIN_RANGE/4
exports.SMOOTH_N = 5;         // samples in the circular mean
exports.TILT_HINT = 25;       // degrees from flat before the "tilted" hint (no compensation)
exports.TILT_MAX_COMP = 70;   // degrees; beyond this even tilt compensation is unreliable
exports.INTERFERENCE = 0.4;   // field magnitude more than +/-40 % from the calibrated norm
exports.ON_TARGET = 3;        // degrees
// Multiplied into the corrected magnetometer axes so they line up with the
// accelerometer axes. Flat heading is atan2(-x, y), the same formula the
// firmware uses for its own heading (360 - atan2(dx, dy), 2v16+). Confirm both
// on a real watch (HW-TESTS.md) and change only this constant.
exports.MAG_SIGN = [1, 1, 1];

var D = 180 / Math.PI;

function norm360(a) {
  a = a % 360;
  if (a < 0) a += 360;
  return a >= 360 ? 0 : a;
}
exports.norm360 = norm360;

function finite(n) { return typeof n === "number" && isFinite(n); }

// ---- calibration ----
exports.createCalibrator = function () {
  var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  var n = 0, start;
  function range(i) { return n ? mx[i] - mn[i] : 0; }
  function progress() {
    var s = 0;
    for (var i = 0; i < 3; i++) s += Math.min(1, range(i) / exports.MIN_RANGE);
    return s / 3;
  }
  return {
    add: function (m, t) {
      if (!m || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
      if (start === undefined) start = t;
      var v = [m.x, m.y, m.z];
      for (var i = 0; i < 3; i++) {
        if (v[i] < mn[i]) mn[i] = v[i];
        if (v[i] > mx[i]) mx[i] = v[i];
      }
      n++;
    },
    progress: progress,
    done: function (t) {
      if (!n) return false;
      if (progress() >= 1) return true;
      if (t - start < exports.CAL_TIMEOUT) return false;
      for (var i = 0; i < 3; i++) if (range(i) < exports.MIN_RANGE / 4) return false;
      return true;
    },
    // tSec: Unix time in seconds, stored as "t"
    result: function (tSec) {
      var r = [range(0), range(1), range(2)];
      var avg = (r[0] + r[1] + r[2]) / 3;
      var offset = [], scale = [];
      for (var i = 0; i < 3; i++) {
        offset.push((mx[i] + mn[i]) / 2);
        var s = r[i] > 0 ? avg / r[i] : 1;
        scale.push(Math.max(0.5, Math.min(2, s)));
      }
      return { v: 1, offset: offset, scale: scale, norm: avg / 2, t: tSec };
    }
  };
};

// Returns the calibration object, or null when it is missing or corrupt.
exports.parseCal = function (o) {
  if (!o || typeof o !== "object" || o.v !== 1) return null;
  if (!o.offset || !o.scale || o.offset.length !== 3 || o.scale.length !== 3) return null;
  for (var i = 0; i < 3; i++) {
    if (!finite(o.offset[i]) || !finite(o.scale[i]) || o.scale[i] <= 0) return null;
  }
  if (!finite(o.norm) || o.norm <= 0) return null;
  return o;
};

// Raw {x,y,z} -> corrected [x,y,z]
exports.correct = function (cal, m) {
  var v = [m.x, m.y, m.z], out = [];
  for (var i = 0; i < 3; i++) out.push((v[i] - cal.offset[i]) * cal.scale[i] * exports.MAG_SIGN[i]);
  return out;
};

// Degrees between the watch face's normal and straight up. Bangle.js 2 reads
// about {x:0,y:0,z:-1} lying flat face up; no accel data counts as flat.
exports.tilt = function (a) {
  if (!a) return 0;
  var n = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  if (!n) return 0;
  return Math.acos(Math.max(-1, Math.min(1, -a.z / n))) * D;
};

// v: corrected [x,y,z]; a: accel {x,y,z} in g. Returns {h, tilt} in degrees.
exports.heading = function (v, a, tiltComp) {
  var mx = v[0], my = v[1], mz = v[2];
  var t = exports.tilt(a);
  var h;
  var n = a ? Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) : 0;
  if (!tiltComp || !n) {
    h = Math.atan2(-mx, my);
  } else {
    // u: "up" in watch coordinates (flat face up -> (0,0,1)).
    var ux = -a.x / n, uy = -a.y / n, uz = -a.z / n;
    // f: the watch's 12 o'clock axis (y) projected onto the horizontal plane,
    // s = u x f. When flat, s = (-1,0,0) and f = (0,1,0), giving atan2(-x, y).
    var fx = -uy * ux, fy = 1 - uy * uy, fz = -uy * uz;
    var sx = uy * fz - uz * fy, sy = uz * fx - ux * fz, sz = ux * fy - uy * fx;
    h = Math.atan2(mx * sx + my * sy + mz * sz, mx * fx + my * fy + mz * fz);
  }
  return { h: norm360(h * D), tilt: t };
};

exports.magnitude = function (v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); };

exports.interference = function (cal, v) {
  return Math.abs(exports.magnitude(v) / cal.norm - 1) > exports.INTERFERENCE;
};

// Circular mean over the last n headings: average sin and cos, never degrees.
exports.createSmoother = function (n) {
  n = n || exports.SMOOTH_N;
  var buf = [];
  return {
    add: function (deg) {
      buf.push(deg / D);
      if (buf.length > n) buf.shift();
      var s = 0, c = 0;
      for (var i = 0; i < buf.length; i++) { s += Math.sin(buf[i]); c += Math.cos(buf[i]); }
      return norm360(Math.atan2(s, c) * D);
    },
    reset: function () { buf = []; }
  };
};

// Signed turn from heading to target in (-180, 180]; positive = turn right.
exports.diff = function (target, heading) {
  var d = norm360(target - heading);
  return d > 180 ? d - 360 : d;
};

exports.turnText = function (d) {
  var a = Math.round(Math.abs(d));
  if (a < exports.ON_TARGET) return "on target";
  return "turn " + a + "\xB0 " + (d > 0 ? "right" : "left");
};

var POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
exports.cardinal = function (deg) { return POINTS[Math.round(norm360(deg) / 22.5) % 16]; };
