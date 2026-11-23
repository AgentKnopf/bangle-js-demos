// Wrist-gesture logic for tfgest: recording format, motion-onset detector,
// model checks, input normalisation and turning probabilities into events.
// No Bangle/g/Date.now() here; TensorFlow is passed in, so tests can fake it.
exports.N = 19;          // samples per window: 1.5 s at 12.5 Hz
exports.HZ = 12.5;
exports.SCALE = 0.01;    // stored int8 value * SCALE = g
exports.LABELS = ["none", "flick-left", "flick-right", "twist", "raise", "shake"];

function clampI8(v) { v = Math.round(v); return v < -128 ? -128 : v > 127 ? 127 : v; }
exports.toI8 = function (g) { return clampI8(g / exports.SCALE); };

// One recording as a JSON line (without the newline).
exports.encode = function (label, xyz, t, hz) {
  var a = [];
  for (var i = 0; i < xyz.length; i++) a.push(clampI8(xyz[i]));
  return JSON.stringify({ v: 1, label: label, hz: hz || exports.HZ, n: xyz.length / 3, t: t, xyz: a });
};

// Parses and checks one line; returns the record or undefined.
exports.parse = function (line) {
  var r;
  try { r = JSON.parse(line); } catch (e) { return; }
  if (!r || r.v !== 1 || typeof r.label !== "string" || !r.xyz || r.xyz.length !== r.n * 3) return;
  for (var i = 0; i < r.xyz.length; i++) {
    var v = r.xyz[i];
    if (typeof v !== "number" || v !== Math.round(v) || v < -128 || v > 127) return;
  }
  return r;
};

// Motion-onset detector. Keeps the last `pre` samples; when |a| leaves
// 1 g +/- thresh it captures a window of n samples (including the pre samples)
// and calls onWindow(Int8Array xyz, t).
// opts: {thresh, n, pre, onWindow}. hold(t) ignores onsets until time t.
exports.detector = function (opts) {
  var n = opts.n || exports.N, pre = opts.pre === undefined ? 3 : opts.pre;
  var thresh = opts.thresh || 0.3;
  var ring = new Int8Array(pre * 3 || 3), rN = 0, rHead = 0;
  var win = new Int8Array(n * 3), wN = -1, holdUntil = 0, armed = false, armTimeout = 0;
  function start() {
    wN = 0;
    for (var k = rN; k > 0; k--) {
      var i = ((rHead - k + pre) % pre) * 3;
      win[wN * 3] = ring[i]; win[wN * 3 + 1] = ring[i + 1]; win[wN * 3 + 2] = ring[i + 2]; wN++;
    }
  }
  return {
    feed: function (a, t) {
      var x = clampI8(a.x / exports.SCALE), y = clampI8(a.y / exports.SCALE), z = clampI8(a.z / exports.SCALE);
      if (wN < 0) {
        var m = a.mag !== undefined ? a.mag : Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        var onset = Math.abs(m - 1) > thresh && t >= holdUntil;
        if (armed && !onset && t >= armTimeout) onset = true;  // record mode: give up waiting
        if (onset && (armed || !opts.armedOnly)) { armed = false; start(); }
      }
      if (wN >= 0) {
        win[wN * 3] = x; win[wN * 3 + 1] = y; win[wN * 3 + 2] = z;
        if (++wN === n) { wN = -1; rN = 0; if (opts.onWindow) opts.onWindow(new Int8Array(win), t); return; }
      } else if (pre) {
        ring[rHead * 3] = x; ring[rHead * 3 + 1] = y; ring[rHead * 3 + 2] = z;
        rHead = (rHead + 1) % pre; if (rN < pre) rN++;
      }
    },
    // record mode: capture at the next onset, or at time `until` if nothing happens
    arm: function (until) { armed = true; armTimeout = until; },
    capturing: function () { return wN >= 0; },
    hold: function (t) { holdUntil = t; }
  };
};

// Checks gestmodel.json. Returns "" or an error message.
exports.checkMeta = function (m) {
  if (!m || m.v !== 1) return "no gestmodel.json";
  if (!m.labels || !m.labels.length) return "no labels";
  if (!m.n || !m.scale) return "bad gestmodel.json";
  return "";
};

// Checks a loaded model against its metadata and the app's sample rate.
exports.checkModel = function (meta, inLen, outLen, hz) {
  var e = exports.checkMeta(meta);
  if (e) return e;
  if (outLen !== meta.labels.length) return "model has " + outLen + " outputs, gestmodel.json " + meta.labels.length + " labels";
  if (inLen !== meta.n * 3) return "model input " + inLen + ", expected " + (meta.n * 3);
  if (hz && meta.hz && Math.abs(meta.hz - hz) > 0.01) return "model wants " + meta.hz + " Hz, app runs " + hz + " Hz";
  return "";
};

// Creates the interpreter. tfLib: require("tensorflow") or undefined.
// Returns {tf, inp, out} or {err}. Never throws.
exports.load = function (tfLib, model, meta, hz) {
  if (!model) return { err: "no model" };
  var e = exports.checkMeta(meta);
  if (e) return { err: e };
  if (!tfLib) return { err: "no tensorflow" };
  var tf, inp, out;
  try {
    tf = tfLib.create(meta.arena || 8000, model);
    inp = tf.getInput(); out = tf.getOutput();
  } catch (x) {
    var msg = String(x && x.message || x);
    return { err: "model failed: " + msg + (/rena|RAM|memory/.test(msg) ? " (arena " + (meta.arena || 8000) + ")" : "") };
  }
  if (!inp || !out) return { err: "model failed: no tensors (arena too small?)" };
  e = exports.checkModel(meta, inp.length, out.length, hz);
  if (e) return { err: e };
  return { tf: tf, inp: inp, out: out };
};

// Writes a window (int8 values) into the model input, normalised as on the PC.
exports.fill = function (inp, xyz, meta) {
  var s = meta.scale, q = inp instanceof Int8Array, i;
  for (i = 0; i < xyz.length; i++) {
    var g = xyz[i] * s;
    if (g > 1.27) g = 1.27; if (g < -1.27) g = -1.27;
    inp[i] = q ? clampI8(g / (meta.inScale || s) + (meta.inZero || 0)) : g;
  }
};

// Output scores as probabilities (dequantised if the output is int8).
exports.probs = function (out, meta) {
  var p = [], q = out instanceof Int8Array;
  for (var i = 0; i < out.length; i++) p.push(q ? (out[i] - (meta.outZero || -128)) * (meta.outScale || 1 / 256) : out[i]);
  return p;
};

// Top k as [{name, p}], highest first.
exports.top = function (p, labels, k) {
  var idx = [];
  for (var i = 0; i < p.length; i++) idx.push(i);
  idx.sort(function (a, b) { return p[b] - p[a]; });
  var r = [];
  for (i = 0; i < Math.min(k || 3, idx.length); i++) r.push({ name: labels[idx[i]], p: Math.round(p[idx[i]] * 1000) / 1000 });
  return r;
};

// Turns the top class into an event: not "none", above thresh, and at least
// refractoryMs after the previous detection. state = {last}. Returns the name or "".
exports.decide = function (best, meta, t, state, refractoryMs) {
  if (refractoryMs === undefined) refractoryMs = 1000;
  if (!best || best.name === "none" || best.p <= (meta.thresh || 0.7)) return "";
  if (state.last !== undefined && t - state.last < refractoryMs) return "";
  state.last = t;
  return best.name;
};
