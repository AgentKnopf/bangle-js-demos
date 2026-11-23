// Barometer logic: altitude from pressure, 1 Hz resampling, spike rejection,
// smoothing, drift gate and floor counting. Plain numbers in, plain objects
// out, so emulator tests can replay synthetic or recorded pressure.
exports.P_STD = 1013.25;      // hPa, standard sea-level pressure
exports.FLOOR_M = 3.0;        // metres per floor
exports.TC = 4;               // s, time constant of the exponential moving average
exports.DISCARD_MS = 2000;    // first readings after power-on are discarded
exports.SPIKE_HPA = 1;        // samples further than this from the average are rejected...
exports.SPIKE_MAX_MS = 3000;  // ...unless the jump lasts this long (then it is real)
exports.DRIFT_RATE = 0.05;    // m/s; slower changes are weather drift
exports.GATE_DELAY = 8;       // s; each change is judged by the rate over +/- this many seconds around it
exports.STEP_WIN_MS = 15000;  // optional step cross-check: steps must be this recent...
exports.STEP_MIN = 4;         // ...and at least this many
exports.HIST_STEP = 10;       // s per sparkline point
exports.HIST_LEN = 60;        // points: 10 minutes

// Barometric formula, metres above the level where pressure is p0 (hPa).
exports.altitude = function (p, p0) {
  return 44330 * (1 - Math.pow(p / (p0 || exports.P_STD), 1 / 5.255));
};
// Inverse, for synthetic data: pressure at altitude h for sea-level p0.
exports.pressureAt = function (h, p0) {
  return (p0 || exports.P_STD) * Math.pow(1 - h / 44330, 5.255);
};

exports.create = function (opts) {
  opts = opts || {};
  var floorM = opts.floorM || exports.FLOOR_M;
  var stepCheck = !!opts.stepCheck;
  var tStart, bucket, sum = 0, n = 0, temp;
  var pS, rejSince, lastSec, zero, altAbs, prevAltS, anchor = 0, lvl = 0;
  var up = 0, down = 0, rejected = 0;
  var ring = [], pend = [], hist = [], histSec, steps = [];
  var last = null;

  function stepsRecent(tMs) {
    while (steps.length && tMs - steps[0] > exports.STEP_WIN_MS) steps.shift();
    return steps.length >= exports.STEP_MIN;
  }

  // One resampled second: pAvg is the mean of the accepted samples in it.
  function second(sec, pAvg) {
    var dt = lastSec === undefined ? 1 : Math.min(sec - lastSec, 60);
    lastSec = sec;
    if (pS === undefined) pS = pAvg;
    else pS += (pAvg - pS) * (1 - Math.exp(-dt / exports.TC));
    altAbs = exports.altitude(pS, exports.P_STD);
    if (zero === undefined) zero = altAbs;
    var altS = altAbs - zero;
    var alt = exports.altitude(pAvg, exports.P_STD) - zero;

    // Rate gate: each one-second change is judged GATE_DELAY s later, by the
    // rate over a window centred on it, so the start and end of a climb count
    // in full. Changes slower than DRIFT_RATE (weather, noise) move the anchor
    // along silently. lvl is the delayed altitude the floor counter sees.
    var D = exports.GATE_DELAY;
    ring.push([sec, altS]);
    while (ring.length > 1 && sec - ring[0][0] > 2 * D) ring.shift();
    if (prevAltS !== undefined) pend.push([sec, altS - prevAltS]);
    prevAltS = altS;
    var span = sec - ring[0][0];
    var rate = span > 0 ? (altS - ring[0][1]) / span : 0;
    var counts = !stepCheck || stepsRecent(sec * 1000);
    while (pend.length && pend[0][0] <= sec - D) {
      var inc = pend.shift()[1];
      lvl += inc;
      if (Math.abs(rate) < exports.DRIFT_RATE) anchor += inc;
      // Hysteresis: count a floor when lvl is a full floor beyond the anchor.
      while (lvl - anchor >= floorM) { anchor += floorM; if (counts) up++; }
      while (anchor - lvl >= floorM) { anchor -= floorM; if (counts) down++; }
    }

    if (histSec === undefined || sec - histSec >= exports.HIST_STEP) {
      hist.push(altS);
      if (hist.length > exports.HIST_LEN) hist.shift();
      histSec = sec;
    }
    last = { p: pAvg, alt: alt, altS: altS, temp: temp, up: up, down: down, t: sec * 1000 };
    return last;
  }

  return {
    // s = {p (hPa), temp (C), t (ms)}. Returns the result for a finished
    // second, or null (still collecting, discarded or rejected).
    feed: function (s) {
      if (!s || typeof s.p !== "number" || !isFinite(s.p)) return null;
      if (tStart === undefined) tStart = s.t;
      if (s.t - tStart < exports.DISCARD_MS) return null;
      if (pS !== undefined && Math.abs(s.p - pS) > exports.SPIKE_HPA) {
        if (rejSince === undefined) rejSince = s.t;
        if (s.t - rejSince < exports.SPIKE_MAX_MS) { rejected++; return null; }
        pS = s.p; // the jump persisted: accept the new level
      }
      rejSince = undefined;
      if (typeof s.temp === "number") temp = s.temp;
      var sec = Math.floor(s.t / 1000), out = null;
      if (bucket !== undefined && sec !== bucket && n) out = second(bucket, sum / n);
      if (sec !== bucket) { bucket = sec; sum = 0; n = 0; }
      sum += s.p;
      n++;
      return out;
    },
    onStep: function (tMs) { steps.push(tMs); stepsRecent(tMs); },
    // Relative altitude and floors back to zero; smoothing carries on.
    reset: function () {
      if (altAbs !== undefined) zero = altAbs;
      anchor = 0; lvl = 0; prevAltS = 0; up = 0; down = 0; ring = []; pend = []; hist = []; histSec = undefined;
      if (last) { last.alt -= last.altS; last.altS = 0; last.up = 0; last.down = 0; }
    },
    // Absolute altitude estimate from the smoothed pressure and a sea-level reference.
    absAltitude: function (p0) { return pS === undefined ? undefined : exports.altitude(pS, p0); },
    last: function () { return last; },
    history: function () { return hist; },
    rejected: function () { return rejected; }
  };
};

// ---- tap / long press from drag events {x,y,b,t} ----
// Same thresholds and event shape as the touch-gesture module (tap: < 12 px
// and < 300 ms; long press: < 12 px held 600 ms, fired while held).
exports.createPress = function (opts) {
  opts = opts || {};
  var MOVE = opts.move || 12, TAP_MS = opts.tapMs || 300, LONG_MS = opts.longMs || 600;
  var handlers = [], down, timer;
  function emit(ev) { for (var i = 0; i < handlers.length; i++) handlers[i](ev); }
  function clear() { if (timer) clearTimeout(timer); timer = undefined; }
  return {
    on: function (evt, fn) { if (evt === "gesture") handlers.push(fn); },
    feed: function (e) {
      if (e.b) {
        if (!down) {
          down = { x0: e.x, y0: e.y, t0: e.t, moved: false, long: false };
          var d = down;
          timer = setTimeout(function () {
            timer = undefined;
            if (down === d && !d.moved) { d.long = true; emit({ type: "longpress", x0: d.x0, y0: d.y0, dur: LONG_MS, t: d.t0 + LONG_MS }); }
          }, LONG_MS);
        } else if ((e.x - down.x0) * (e.x - down.x0) + (e.y - down.y0) * (e.y - down.y0) >= MOVE * MOVE) {
          down.moved = true;
          clear();
        }
      } else if (down) {
        var p = down;
        down = undefined;
        clear();
        var dur = e.t - p.t0;
        if (!p.long && !p.moved && dur < TAP_MS) emit({ type: "tap", x0: p.x0, y0: p.y0, dur: dur, t: e.t });
      }
    },
    reset: function () { clear(); down = undefined; }
  };
};
