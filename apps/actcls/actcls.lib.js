// Rule-based activity classifier. Pure logic: samples with explicit timestamps
// in, window results out. No Bangle/g/Date.now() here so tests can drive it.
var CLS = ["", "still", "fidget", "walk", "run", "unknown"];
exports.CLASSES = CLS;
exports.code = function (name) { var i = CLS.indexOf(name); return i < 0 ? 0 : i; };

// Default rules; to be tuned on hardware (see HW-TESTS.md).
exports.RULES = {
  stillSd: 0.01, stillOrient: 5,
  fidgetSd: 0.08,
  walkSdMin: 0.08, walkSdMax: 0.35, walkZxMin: 6, walkZxMax: 20, walkSteps: 3,
  runSd: 0.35, runZx: 10,
  zxBand: 0.01,        // |a| must leave mean +/- band to count a crossing (noise guard)
  minCover: 0.8,       // windows with less than 80 % of the expected samples are unknown
  postureDeg: 30, postureWeight: 10,
  offWristSd: 0.002, offWristMs: 120000
};
exports.WIN_MS = 4000;
exports.HOP_MS = 2000;
exports.REST_WINDOWS = 150;   // 5 min of 2 s hops

function r3(v) { return Math.round(v * 1000) / 1000; }

// Features of one window. m, x, y, z: arrays (plain or typed) of length n.
// zeroX here is the raw crossing count; create() rescales it to a full window.
exports.features = function (m, x, y, z, n, band) {
  if (band === undefined) band = exports.RULES.zxBand;
  var i, sum = 0, sx = 0, sy = 0, sz = 0, mn = Infinity, mx = -Infinity;
  for (i = 0; i < n; i++) {
    var v = m[i];
    sum += v; if (v < mn) mn = v; if (v > mx) mx = v;
    if (x) { sx += x[i]; sy += y[i]; sz += z[i]; }
  }
  var mean = sum / n, ss = 0, zx = 0, s = 0;
  for (i = 0; i < n; i++) {
    var d = m[i] - mean;
    ss += d * d;
    if (d > band) { if (s < 0) zx++; s = 1; }
    else if (d < -band) { if (s > 0) zx++; s = -1; }
  }
  return { meanMag: mean, sdMag: Math.sqrt(ss / n), p2p: mx - mn, zeroX: zx,
    gx: sx / n, gy: sy / n, gz: sz / n };
};

// Angle in degrees between two mean-gravity vectors.
exports.angle = function (a, b) {
  var la = Math.sqrt(a.gx * a.gx + a.gy * a.gy + a.gz * a.gz);
  var lb = Math.sqrt(b.gx * b.gx + b.gy * b.gy + b.gz * b.gz);
  if (!la || !lb) return 0;
  var c = (a.gx * b.gx + a.gy * b.gy + a.gz * b.gz) / (la * lb);
  if (c > 1) c = 1; if (c < -1) c = -1;
  return Math.acos(c) * 180 / Math.PI;
};

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function minOf() {
  var m = Infinity;
  for (var i = 0; i < arguments.length; i++) if (arguments[i] < m) m = arguments[i];
  return m;
}

// f: {sdMag, zeroX, orient, steps}. Returns {cls, conf}. conf is the smallest
// relative distance to a boundary of the matching rule; 50 % away gives 1.
exports.classify = function (f, R) {
  R = R || exports.RULES;
  var sd = f.sdMag, zx = f.zeroX, o = f.orient, st = f.steps, m;
  function res(cls, margin) { return { cls: cls, conf: Math.round(clamp01(margin / 0.5) * 100) / 100 }; }
  if (sd < R.stillSd && o < R.stillOrient)
    return res("still", minOf((R.stillSd - sd) / R.stillSd, (R.stillOrient - o) / R.stillOrient));
  if (sd >= R.runSd && zx >= R.runZx)
    return res("run", minOf((sd - R.runSd) / R.runSd, (zx - R.runZx + 1) / R.runZx));
  var bySd = sd >= R.walkSdMin && sd < R.walkSdMax && zx >= R.walkZxMin && zx <= R.walkZxMax;
  if (bySd || st >= R.walkSteps) {
    m = bySd ? minOf((sd - R.walkSdMin) / R.walkSdMin, (R.walkSdMax - sd) / R.walkSdMax,
      (zx - R.walkZxMin + 1) / R.walkZxMin, (R.walkZxMax - zx + 1) / R.walkZxMax) : 0;
    if (st >= R.walkSteps) m = Math.max(m, (st - R.walkSteps + 1) / R.walkSteps);
    return res("walk", m);
  }
  if (sd < R.fidgetSd && st === 0)
    return res("fidget", minOf((R.fidgetSd - sd) / R.fidgetSd,
      Math.max((sd - R.stillSd) / R.stillSd, (o - R.stillOrient) / R.stillOrient)));
  return { cls: "unknown", conf: 0 };
};

// Restlessness 0..100 over windows classed still/fidget: fidget share plus a
// weighted count of posture changes, capped. -1 when there are no rest windows.
exports.restlessness = function (codes, flags, n, R) {
  R = R || exports.RULES;
  var rest = 0, fid = 0, post = 0;
  for (var i = 0; i < n; i++) {
    var c = codes[i];
    if (c === 1 || c === 2) { rest++; if (c === 2) fid++; if (flags[i]) post++; }
  }
  if (!rest) return -1;
  return Math.min(100, Math.round(100 * fid / rest + R.postureWeight * post));
};

// A new class is shown only after it was seen in n consecutive windows.
// push(cls) returns true when the shown class changed.
exports.debounce = function (n) {
  var cand = "", candN = 0, shown = "";
  return {
    push: function (cls) {
      if (cls === cand) candN++; else { cand = cls; candN = 1; }
      if (candN >= n && shown !== cand) { shown = cand; return true; }
      return false;
    },
    shown: function () { return shown; }
  };
};

// Streaming classifier. opts: {rules, onWindow(w)}.
exports.create = function (opts) {
  opts = opts || {};
  var R = opts.rules || exports.RULES;
  var WIN = exports.WIN_MS, HOP = exports.HOP_MS, CAP = 256;
  var bx = new Float32Array(CAP), by = new Float32Array(CAP), bz = new Float32Array(CAP),
    bm = new Float32Array(CAP), head = 0, count = 0;
  // times are stored relative to the first sample: Float64Array keeps only float32 precision on 2v29
  var bt = new Int32Array(CAP), base;
  var wm = new Float32Array(CAP), wx = new Float32Array(CAP), wy = new Float32Array(CAP),
    wz = new Float32Array(CAP);
  var stepT = new Int32Array(64), sHead = 0, sCount = 0;
  var hc = new Uint8Array(exports.REST_WINDOWS), hf = new Uint8Array(exports.REST_WINDOWS), hHead = 0, hN = 0;
  var nextEnd, prevF, quietMs = 0, deb = exports.debounce(2);

  function windowAt(E) {
    E -= base;
    var start = E - WIN, n = 0, i, k, dts = [];
    // collect samples in [start, E), oldest first
    for (k = count; k > 0; k--) {
      i = (head - k + CAP) % CAP;
      if (bt[i] >= start && bt[i] < E) {
        wm[n] = bm[i]; wx[n] = bx[i]; wy[n] = by[i]; wz[n] = bz[i];
        if (n) dts.push(bt[i] - bt[(i - 1 + CAP) % CAP]);
        n++;
      }
    }
    var steps = 0;
    for (k = 0; k < sCount; k++) {
      var st = stepT[(sHead - 1 - k + 64) % 64];
      if (st >= start && st < E) steps++;
    }
    var w = { evt: "win", t: E + base, meanMag: 0, sdMag: 0, p2p: 0, zeroX: 0, orient: 0, steps: steps,
      cls: "unknown", conf: 0, hz: 0, n: n };
    if (n >= 2) {
      dts.sort(function (a, b) { return a - b; });
      var dt = dts[dts.length >> 1];
      var span = n * dt, cover = span / WIN;
      var f = exports.features(wm, wx, wy, wz, n, R.zxBand);
      // crossings per full window of covered time, so a changed poll rate keeps the same scale
      f.zeroX = Math.round(f.zeroX * WIN / span);
      f.orient = prevF ? exports.angle(f, prevF) : 0;
      f.steps = steps;
      w.meanMag = r3(f.meanMag); w.sdMag = r3(f.sdMag); w.p2p = r3(f.p2p);
      w.zeroX = f.zeroX; w.orient = Math.round(f.orient * 10) / 10;
      w.hz = Math.round(10000 / dt) / 10;
      if (cover >= R.minCover) {
        var c = exports.classify(f, R);
        w.cls = c.cls; w.conf = c.conf;
        prevF = f;
        quietMs = f.sdMag < R.offWristSd ? quietMs + HOP : 0;
        if (quietMs > R.offWristMs) w.off = 1;
      }
    }
    w.changed = deb.push(w.cls);
    w.shown = deb.shown();
    hc[hHead] = exports.code(w.cls);
    hf[hHead] = w.orient > R.postureDeg ? 1 : 0;
    hHead = (hHead + 1) % hc.length; if (hN < hc.length) hN++;
    w.restless = exports.restlessness(hc, hf, hN, R);
    if (opts.onWindow) opts.onWindow(w);
    return w;
  }

  return {
    onAccel: function (a, t) {
      var last;
      if (base === undefined) base = t;
      if (nextEnd === undefined) nextEnd = t + WIN;
      for (var g = 0; t >= nextEnd && g < 3; g++) { last = windowAt(nextEnd); nextEnd += HOP; }
      if (t >= nextEnd) nextEnd = t + HOP; // long gap: skip ahead instead of emitting many empty windows
      var m = a.mag !== undefined ? a.mag : Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      bx[head] = a.x; by[head] = a.y; bz[head] = a.z; bm[head] = m; bt[head] = t - base;
      head = (head + 1) % CAP; if (count < CAP) count++;
      return last;
    },
    onStep: function (t) {
      if (base === undefined) base = t;
      stepT[sHead] = t - base; sHead = (sHead + 1) % 64; if (sCount < 64) sCount++;
    },
    shown: function () { return deb.shown(); },
    restless: function () { return exports.restlessness(hc, hf, hN, R); }
  };
};

// Last `slots` class codes, one slot per slotMs (default 30 min of 15 s slots).
exports.timeline = function (slots, slotMs) {
  slots = slots || 120; slotMs = slotMs || 15000;
  var c = new Uint8Array(slots), lastSlot;
  return {
    add: function (code, t) {
      var s = Math.floor(t / slotMs);
      if (lastSlot !== undefined) {
        var gap = s - lastSlot;
        if (gap >= slots) c.fill(0);
        else for (var k = 1; k < gap; k++) c[(lastSlot + k) % slots] = 0;
      }
      if (lastSlot === undefined || s >= lastSlot) { c[s % slots] = code; lastSlot = s; }
    },
    get: function () { // oldest first
      var out = [];
      for (var k = 1; k <= slots; k++) out.push(lastSlot === undefined ? 0 : c[(lastSlot + k) % slots]);
      return out;
    }
  };
};

function pad(n) { return (n < 10 ? "0" : "") + n; }
exports.dayStr = function (t) {
  var d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};

// Daily minutes per class, stored as {"v":1,"day":"YYYY-MM-DD","min":{...}}.
exports.summary = function (data) {
  var day, min, sec;
  function reset(d) {
    day = d; min = { still: 0, fidget: 0, walk: 0, run: 0 }; sec = {};
    for (var k in min) sec[k] = 0;
  }
  reset(data && data.day);
  if (data && data.v === 1 && data.min) for (var k in min) { min[k] = data.min[k] | 0; sec[k] = min[k] * 60; }
  return {
    // Rolls the day over if t is on another day. Returns true if it did.
    roll: function (t) { var d = exports.dayStr(t); if (d !== day) { reset(d); return true; } return false; },
    // Adds ms of class cls at time t. Returns true if the stored minutes changed.
    add: function (cls, ms, t) {
      var changed = this.roll(t);
      if (sec[cls] !== undefined) {
        sec[cls] += ms / 1000;
        var m = Math.floor(sec[cls] / 60);
        if (m !== min[cls]) { min[cls] = m; changed = true; }
      }
      return changed;
    },
    json: function () { return { v: 1, day: day, min: { still: min.still, fidget: min.fidget, walk: min.walk, run: min.run } }; }
  };
};

// ---- replaying prototype-06 logs ----
// Lines starting with "{" are metadata (header first); sample lines are
// "<ms since start>,<type>,<v1>,<v2>,<v3>" with empty fields where a value is missing.
exports.parseLine = function (line) {
  if (!line) return;
  line = line.trim();
  if (line.charAt(0) === "{") { try { return { hdr: JSON.parse(line) }; } catch (e) { return; } }
  var p = line.split(",");
  if (p.length < 3) return;
  var t = parseFloat(p[0]);
  if (isNaN(t)) return;
  return { t: t, type: p[1], v: [parseFloat(p[2]), parseFloat(p[3]), parseFloat(p[4])] };
};

// src: a string (whole file) or an object with readLine() (a StorageFile).
// Only complete lines are used, so a partial last line after a crash is ignored.
// Returns {label, windows: [{t, cls, ...}]}.
exports.replay = function (src, opts) {
  opts = opts || {};
  var out = { label: undefined, windows: [] };
  var c = exports.create({ rules: opts.rules, onWindow: function (w) {
    out.windows.push(opts.full ? w : { t: w.t, cls: w.cls, shown: w.shown });
  } });
  var start = 0, pos = 0;
  function next() {
    if (typeof src !== "string") { var l = src.readLine(); return (l && l.charAt(l.length - 1) === "\n") ? l : undefined; }
    var e = src.indexOf("\n", pos);
    // check the hit: 2v29 indexOf can report a false match at the end of the string
    if (e < pos || src.charAt(e) !== "\n") return;
    var s = src.substring(pos, e); pos = e + 1; return s;
  }
  var line, r;
  while ((line = next()) !== undefined) {
    r = exports.parseLine(line);
    if (!r) continue;
    if (r.hdr) { // header, or other metadata such as a {"dropped":N} trailer
      if (r.hdr.start !== undefined) { out.label = r.hdr.label; start = r.hdr.start; }
      continue;
    }
    if (r.type === "a") c.onAccel({ x: r.v[0], y: r.v[1], z: r.v[2] }, start + r.t);
    else if (r.type === "s") { // steps since the previous "s" line
      var ns = isNaN(r.v[0]) ? 1 : Math.min(r.v[0], 64);
      for (var k = 0; k < ns; k++) c.onStep(start + r.t);
    }
  }
  return out;
};

// Confusion matrix: rows = true label, columns = predicted class.
exports.confusion = function () {
  var m = {};
  return {
    add: function (truth, pred) { if (!m[truth]) m[truth] = {}; m[truth][pred] = (m[truth][pred] || 0) + 1; },
    m: m,
    accuracy: function (truth) {
      var row = m[truth] || {}, n = 0;
      for (var k in row) n += row[k];
      return n ? (row[truth] || 0) / n : 0;
    }
  };
};
