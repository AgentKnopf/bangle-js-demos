// Haptic patterns as data, and a player that enforces the safety limits.
// No Bangle/g calls: the motor, clock and logger are injected, so tests can
// drive it with plain objects in virtual time.
//
// A pattern is {name, repeat, steps:[[durationMs, strength0to1], ...]}, or
// {name, gen: function (seed) { return steps; }}. Strength 0 is a pause.

exports.LIMITS = {
  MAX_ON_MS: 1000,       // longest single "on" step; longer steps are clamped
  WINDOW_MS: 10000,      // rolling window for the duty-cycle rule
  MAX_DUTY: 0.6,         // max on-time share in any window
  MAX_TOTAL_MS: 60000,   // one play stops here with done:limit
  LOW_BATTERY: 15,       // E.getBattery() below this ...
  LOW_BATTERY_CAP: 0.5   // ... caps the strength here
};

// Park-Miller minimal standard generator: exact in doubles, so the same seed
// gives the same numbers on the watch and in any test.
exports.random = function (seed) {
  var s = Math.floor(Math.abs(seed)) % 2147483647;
  if (s === 0) s = 1;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

function r2(v) { return Math.round(v * 100) / 100; }

function swell() {
  var steps = [], k;
  for (k = 1; k <= 6; k++) steps.push([150, r2(k / 6)], [60, 0]);
  steps.push([400, 1], [60, 0]);
  for (k = 6; k >= 1; k--) steps.push([150, r2(k / 6)], [60, 0]);
  steps.pop();
  return steps;
}

var BEAT = [[80, 0.8], [120, 0], [60, 0.5], [540, 0]];

// Same beat as "rhythm"; each cycle's last pause varies by up to +/-15 %, and
// every DRIFT_N-th beat is skipped (motor silent) or doubled, chosen at random.
exports.DRIFT_N = 4;
exports.DRIFT_CYCLES = 12;
exports.driftingRhythm = function (seed) {
  var rnd = exports.random(seed === undefined ? 1 : seed);
  var steps = [];
  for (var c = 0; c < exports.DRIFT_CYCLES; c++) {
    var pause = Math.round(540 * (1 + (rnd() * 2 - 1) * 0.15));
    var odd = (c % exports.DRIFT_N) === exports.DRIFT_N - 1;
    var how = odd ? (rnd() < 0.5 ? "skip" : "double") : "";
    if (how === "skip") steps.push([80, 0], [120, 0], [60, 0], [pause, 0]);
    else {
      if (how === "double") steps.push([80, 0.8], [120, 0], [60, 0.5], [120, 0]);
      steps.push([80, 0.8], [120, 0], [60, 0.5], [pause, 0]);
    }
  }
  return steps;
};

exports.BUILTINS = [
  { name: "pulse", steps: [[200, 1]] },
  { name: "double", steps: [[120, 1], [100, 0], [120, 1]] },
  { name: "ramp up", repeat: 1, steps: [[150, 0.2], [50, 0], [150, 0.4], [50, 0], [150, 0.6], [50, 0], [150, 0.8], [50, 0], [300, 1.0]] },
  { name: "swell", steps: swell() },
  { name: "rhythm", repeat: 10, steps: BEAT },
  { name: "drifting rhythm", gen: exports.driftingRhythm },
  { name: "SOS", steps: [[100, 1], [100, 0], [100, 1], [100, 0], [100, 1], [300, 0],
    [300, 1], [100, 0], [300, 1], [100, 0], [300, 1], [300, 0],
    [100, 1], [100, 0], [100, 1], [100, 0], [100, 1]] }
];

function isNum(v) { return typeof v === "number" && isFinite(v); }

// Returns an error message, or null if the pattern is valid.
exports.validate = function (p) {
  if (!p || typeof p !== "object") return "pattern must be an object";
  var steps = p.steps;
  if (p.gen !== undefined) {
    if (typeof p.gen !== "function") return "gen must be a function";
    return null;
  }
  if (!Array.isArray(steps)) return "steps must be a list";
  if (p.repeat !== undefined && !(isNum(p.repeat) && p.repeat >= 1 && Math.floor(p.repeat) === p.repeat)) return "repeat must be a whole number >= 1";
  for (var i = 0; i < steps.length; i++) {
    var st = steps[i];
    if (!Array.isArray(st) || st.length !== 2) return "step " + i + " must be [ms, strength]";
    if (!isNum(st[0]) || st[0] < 0) return "step " + i + ": bad duration";
    if (!isNum(st[1]) || st[1] < 0 || st[1] > 1) return "step " + i + ": strength must be 0..1";
  }
  return null;
};

// Parse pattern JSON text. Returns {pattern} or {error}.
exports.parse = function (text) {
  var p;
  try { p = JSON.parse(text); } catch (e) { return { error: "not valid JSON" }; }
  if (p && p.gen !== undefined) return { error: "gen is not allowed in JSON" };
  var err = exports.validate(p);
  return err ? { error: err } : { pattern: p };
};

// Steps the pattern describes, before limits: the generated or listed steps.
function baseSteps(p, seed) {
  var base = p.gen ? p.gen(seed) : p.steps;
  var err = exports.validate({ steps: base });
  if (err) throw new Error(err);
  return base;
}

// Apply every safety limit and compute when each step starts, one step at a
// time so a long pattern never sits in memory as a whole.
// opts: cap (0..1, default 1), battery (percent; undefined = no battery rule), seed.
// next() returns {i, ms, s, sEff, at, clamped?} or {pause, at, reason:"duty"},
// or null at the end; then .end (ms) and .limited (hit the 60 s limit) are set.
exports.planner = function (p, opts) {
  opts = opts || {};
  var L = exports.LIMITS;
  var cap = isNum(opts.cap) ? Math.max(0, Math.min(1, opts.cap)) : 1;
  var low = isNum(opts.battery) && opts.battery < L.LOW_BATTERY;
  var base = baseSteps(p, opts.seed);
  var repeat = p.repeat || 1;
  var n = 0, total = base.length * repeat;
  var on = [];        // on intervals [start, end] that still touch the window
  var t = 0, queued = null;
  var maxOn = L.MAX_DUTY * L.WINDOW_MS;
  var self = { end: 0, limited: false, lowBattery: low, audible: false };
  for (var k = 0; k < base.length; k++) if (base[k][0] > 0 && base[k][1] * cap > 0) self.audible = true;

  function onIn(a, b) {
    var sum = 0;
    for (var j = 0; j < on.length; j++) sum += Math.max(0, Math.min(on[j][1], b) - Math.max(on[j][0], a));
    return sum;
  }
  function stop(limited) { self.end = Math.min(t, L.MAX_TOTAL_MS); self.limited = limited; n = total; queued = null; return null; }

  self.next = function () {
    if (queued) { var q = queued; queued = null; return q; }
    if (n >= total) return stop(self.limited);
    if (t >= L.MAX_TOTAL_MS) return stop(true);
    var src = base[n % base.length];
    var ms = src[0], s = src[1];
    var sEff = s * cap;
    if (low) sEff = Math.min(sEff, L.LOW_BATTERY_CAP);
    sEff = Math.round(sEff * 1000) / 1000;
    var step = { i: n, ms: ms, s: s, sEff: sEff };
    n++;
    var pause = null;
    if (sEff > 0 && ms > 0) {
      if (ms > L.MAX_ON_MS) { step.clamped = ms; step.ms = ms = L.MAX_ON_MS; }
      // Delay the step until the window that ends with it is at most MAX_DUTY on.
      var wait = 0;
      for (var guard = 0; guard < 50; guard++) {
        var excess = onIn(t + wait + ms - L.WINDOW_MS, t + wait) + ms - maxOn;
        if (excess <= 0.5) break;
        wait += Math.ceil(excess);
      }
      if (wait > 0) {
        pause = { pause: wait, at: t, reason: "duty" };
        t += wait;
        if (t >= L.MAX_TOTAL_MS) { t = L.MAX_TOTAL_MS; stop(true); return pause; }
      }
      if (t + ms > L.MAX_TOTAL_MS) { step.ms = ms = L.MAX_TOTAL_MS - t; self.limited = true; n = total; }
      on.push([t, t + ms]);
      while (on.length && on[0][1] <= t + ms - L.WINDOW_MS) on.shift();
    } else if (t + ms > L.MAX_TOTAL_MS) { self.limited = true; n = total; }
    step.at = t;
    t += ms;
    if (n >= total) self.end = Math.min(t, L.MAX_TOTAL_MS);
    if (pause) { queued = step; return pause; }
    return step;
  };
  return self;
};

// The whole plan at once (handy for tests and short patterns).
exports.plan = function (p, opts) {
  var pl = exports.planner(p, opts), steps = [], st;
  while ((st = pl.next())) steps.push(st);
  return { steps: steps, end: pl.end, limited: pl.limited, lowBattery: pl.lowBattery };
};

// opts: motor {on(ms, strength) -> Promise|undefined, off()}, now() -> ms,
// log(obj) for DEBUG lines, onStep(step, elapsedMs), onDone(reason).
exports.createPlayer = function (opts) {
  var motor = opts.motor, now = opts.now || function () { return Date.now(); };
  var log = opts.log || function () {};
  var cur = null;    // {pl, start, st, timer, busy, waiting}

  function finish(reason) {
    if (!cur) return;
    var c = cur;
    cur = null;
    if (c.timer) clearTimeout(c.timer);
    motor.off();
    log({ evt: "done", reason: reason, t: Math.round(now() - c.start) });
    if (opts.onDone) opts.onDone(reason);
  }
  function schedule(c) {
    c.st = c.pl.next();
    var at = c.st ? c.st.at : c.pl.end;
    c.timer = setTimeout(function () { c.timer = undefined; run(c); }, Math.max(0, c.start + at - now()));
  }
  function run(c) {
    if (c !== cur) return;
    var st = c.st;
    if (!st) { finish(c.pl.limited ? "limit" : "end"); return; }
    // Never overlap motor calls: wait for the previous buzz to finish.
    if (st.pause === undefined && st.sEff > 0 && c.busy) { c.waiting = true; return; }
    var t = Math.round(now() - c.start);
    if (st.pause !== undefined) log({ evt: "pause", ms: st.pause, reason: st.reason, t: t });
    else {
      var o = { evt: "buzz", i: st.i, ms: st.ms, s: st.s, sEff: st.sEff, t: t };
      if (st.clamped) o.clamped = st.clamped;
      log(o);
      if (st.sEff > 0 && st.ms > 0) {
        var pr = motor.on(st.ms, st.sEff);
        if (pr && typeof pr.then === "function") {
          c.busy = true;
          pr.then(function () {
            c.busy = false;
            if (c === cur && c.waiting) { c.waiting = false; run(c); }
          });
        }
      }
      if (opts.onStep) opts.onStep(st, t);
    }
    schedule(c);
  }

  return {
    // Returns null when playback started (or finished at once), or an error message.
    play: function (p, o) {
      if (cur) finish("stop");
      var err = exports.validate(p), pl;
      if (!err) { try { pl = exports.planner(p, o); } catch (e) { err = String(e.message || e); } }
      if (err) { log({ evt: "error", msg: err }); return err; }
      cur = { pl: pl, start: now(), st: null, busy: false, waiting: false };
      if (!pl.audible) { finish("end"); return null; }   // empty or all pauses: play nothing
      cur.st = pl.next();
      run(cur);
      return null;
    },
    stop: function () { finish("stop"); },
    isPlaying: function () { return !!cur; },
    elapsed: function () { return cur ? now() - cur.start : 0; }
  };
};
