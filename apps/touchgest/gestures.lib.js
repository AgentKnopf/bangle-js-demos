// Touch gesture recognizer: turns {x,y,b,t} touch samples into tap, doubletap,
// longpress, swipe and stroke events. No Bangle/g calls, so tests can feed it
// plain objects with explicit timestamps (ms).
//
//   var G = require("gestures");
//   var r = G.create({ instantTap: false });
//   r.on("gesture", function (ev) { ... });
//   r.feed({x: x, y: y, b: b, t: t});
//   r.reset();

// Thresholds (px, ms, px/s). Tune here, or override per recognizer: create({LONG_MS: 500}).
exports.TAP_MOVE = 12;       // tap and long press: max distance from the start point
exports.TAP_MS = 300;        // tap: max press duration
exports.DOUBLE_MS = 350;     // double tap: max gap from first release to second press
exports.DOUBLE_DIST = 30;    // double tap: max distance between the two presses
exports.LONG_MS = 600;       // long press: hold time, fires while still held
exports.SWIPE_MIN = 40;      // swipe and stroke: min straight-line distance
exports.SWIPE_MS = 600;      // swipe: max duration; longer is a stroke
exports.STRAIGHT_MIN = 0.8;  // stroke: min straightness (distance / path length)
exports.SLOW_SPEED = 150;    // below: "slow"
exports.FAST_SPEED = 600;    // above: "fast"; in between: "normal"

var KEYS = ["TAP_MOVE", "TAP_MS", "DOUBLE_MS", "DOUBLE_DIST", "LONG_MS",
  "SWIPE_MIN", "SWIPE_MS", "STRAIGHT_MIN", "SLOW_SPEED", "FAST_SPEED"];

exports.speedClass = function (speed, c) {
  c = c || exports;
  if (speed < c.SLOW_SPEED) return "slow";
  if (speed > c.FAST_SPEED) return "fast";
  return "normal";
};

// Dominant axis of the displacement; ties go horizontal. Screen y grows down.
exports.direction = function (dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
};

// opts: instantTap (report tap at once, doubletap as an extra event),
// unknown (emit {type:"unknown",reason} for rejected strokes), any threshold key.
exports.create = function (opts) {
  opts = opts || {};
  var c = {};
  KEYS.forEach(function (k) { c[k] = opts[k] !== undefined ? opts[k] : exports[k]; });
  var handlers = [];
  var s = null;        // current stroke while the finger is down
  var pending = null;  // last tap, waiting for a possible second tap
  var longTimer, tapTimer;
  var skip = false;    // after reset() mid-gesture: ignore samples until the finger lifts

  function emit(ev) {
    for (var i = 0; i < handlers.length; i++) handlers[i](ev);
  }
  function clearTimers() {
    if (longTimer) clearTimeout(longTimer);
    if (tapTimer) clearTimeout(tapTimer);
    longTimer = tapTimer = undefined;
  }
  function make(type, st, t1, x1, y1) {
    var dx = x1 - st.x0, dy = y1 - st.y0;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dur = t1 - st.t0;
    if (!(dur > 0)) dur = 1;
    var speed = dist * 1000 / dur;
    var ev = { type: type };
    if (type === "swipe" || type === "stroke" || type === "unknown") ev.dir = exports.direction(dx, dy);
    ev.dist = Math.round(dist);
    ev.dur = Math.round(dur);
    ev.speed = Math.round(speed);
    ev.speedClass = exports.speedClass(speed, c);
    ev.x0 = st.x0; ev.y0 = st.y0; ev.x1 = x1; ev.y1 = y1;
    ev.t = t1;
    return ev;
  }
  // Emit the waiting single tap (unless instantTap already did).
  function flushTap() {
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = undefined;
    var p = pending;
    pending = null;
    if (p && !opts.instantTap) emit(p);
  }
  function fireLong(t) {
    if (!s || s.fired) return;
    if (longTimer) clearTimeout(longTimer);
    longTimer = undefined;
    s.fired = true;
    if (s.dbl) flushTap();
    emit(make("longpress", s, s.t0 + c.LONG_MS, s.x, s.y));
  }
  function press(p) {
    s = { x0: p.x, y0: p.y, t0: p.t, x: p.x, y: p.y, t: p.t, path: 0, maxMove: 0, fired: false, dbl: false };
    if (pending) {
      var gx = p.x - pending.x0, gy = p.y - pending.y0;
      if (p.t - pending.t < c.DOUBLE_MS && Math.sqrt(gx * gx + gy * gy) <= c.DOUBLE_DIST) {
        // Could be a double tap: hold the first tap until this press is classified.
        if (tapTimer) clearTimeout(tapTimer);
        tapTimer = undefined;
        s.dbl = true;
      } else flushTap();
    }
    longTimer = setTimeout(function () { longTimer = undefined; fireLong(); }, c.LONG_MS);
  }
  function move(p) {
    var sx = p.x - s.x, sy = p.y - s.y;
    s.path += Math.sqrt(sx * sx + sy * sy);
    s.x = p.x; s.y = p.y; s.t = p.t;
    var mx = p.x - s.x0, my = p.y - s.y0;
    var m = Math.sqrt(mx * mx + my * my);
    if (m > s.maxMove) s.maxMove = m;
    if (s.maxMove >= c.TAP_MOVE && longTimer) { clearTimeout(longTimer); longTimer = undefined; }
  }
  function release(p) {
    if (p.x !== undefined && (p.x !== s.x || p.y !== s.y)) move(p);
    var st = s;
    s = null;
    if (longTimer) clearTimeout(longTimer);
    longTimer = undefined;
    if (st.fired) return;                     // long press already reported
    var t1 = p.t;
    var ev = make("unknown", st, t1, st.x, st.y);
    var dur = t1 - st.t0;
    if (st.maxMove < c.TAP_MOVE) {
      if (dur >= c.LONG_MS) { st.fired = true; emit(make("longpress", st, st.t0 + c.LONG_MS, st.x, st.y)); return; }
      if (dur < c.TAP_MS) {
        var tap = make("tap", st, t1, st.x, st.y);
        if (st.dbl) {
          var first = pending;
          pending = null;
          var d = make("doubletap", st, t1, st.x, st.y);
          d.x0 = first.x0; d.y0 = first.y0;
          emit(d);
          return;
        }
        pending = tap;
        if (opts.instantTap) emit(tap);
        else tapTimer = setTimeout(function () { tapTimer = undefined; flushTap(); }, c.DOUBLE_MS);
        return;
      }
      if (st.dbl) flushTap();
      ev.reason = "short hold";
    } else {
      if (st.dbl) flushTap();
      var straight = st.path > 0 ? ev.dist / st.path : 1;
      if (ev.dist >= c.SWIPE_MIN) {
        if (dur <= c.SWIPE_MS) { ev.type = "swipe"; emit(ev); return; }
        if (straight >= c.STRAIGHT_MIN) { ev.type = "stroke"; emit(ev); return; }
        ev.reason = "not straight";
      } else ev.reason = "too short";
      ev.straight = Math.round(straight * 100) / 100;
    }
    if (opts.unknown) emit(ev);
  }

  return {
    on: function (name, fn) { if (name === "gesture") handlers.push(fn); return this; },
    // p = {x, y, b, t}; b is 1 while touching, 0 on release; t in ms.
    feed: function (p) {
      if (skip) { if (!p.b) skip = false; return; }
      if (pending && !s && p.b && p.t - pending.t >= c.DOUBLE_MS) flushTap();
      if (p.b) {
        if (!s) press(p);
        else {
          move(p);
          if (!s.fired && s.maxMove < c.TAP_MOVE && p.t - s.t0 >= c.LONG_MS) fireLong();
        }
      } else if (s) {
        if (!s.fired && s.maxMove < c.TAP_MOVE && p.t - s.t0 >= c.LONG_MS) fireLong();
        release(p);
      }
    },
    // Drop the current gesture and any waiting tap without emitting (e.g. the watch locked).
    // If the finger is still down, the rest of that touch is ignored too.
    reset: function () { clearTimers(); skip = !!s; s = null; pending = null; },
    isDown: function () { return !!s; }
  };
};
