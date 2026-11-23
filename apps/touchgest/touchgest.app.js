// Touch gestures demo: shows the last recognized gesture with its numbers,
// draws a trail while the finger moves, counts each gesture type.
// The button returns to the launcher.
var DEBUG = false;
var G = require("gestures");
var TYPES = ["tap", "doubletap", "longpress", "swipe", "stroke"];
var SHORT = { tap: "tap", doubletap: "dbl", longpress: "long", swipe: "swp", stroke: "strk" };
var NAMES = { tap: "TAP", doubletap: "DOUBLE TAP", longpress: "LONG PRESS", swipe: "SWIPE", stroke: "STROKE" };
var counts = { tap: 0, doubletap: 0, longpress: 0, swipe: 0, stroke: 0 };
var last = null;         // last gesture event
var label = "TOUCH ME";  // big text currently on screen
var trail = null;        // [x0,y0,x1,y1,...] drag points of the current trail
var TRAIL_MAX = 200;     // coordinates kept (100 points) so memory stays bounded
var trailTimer;
var savedLockTimeout = Bangle.getOptions().lockTimeout;

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }

function labelFor(ev) {
  var s = NAMES[ev.type];
  if (ev.dir) s += " " + ev.dir.toUpperCase();
  return s;
}

function draw() {
  g.reset().clear();
  var cx = g.getWidth() / 2;
  var size = 30;
  g.setFontAlign(0, 0).setFont("Vector", size);
  while (size > 12 && g.stringWidth(label) > g.getWidth() - 8) g.setFont("Vector", size -= 2);
  g.drawString(label, cx, 50);
  g.setFont("6x8", 1);
  if (last) {
    if (last.dir) g.drawString("dir " + last.dir, cx, 80);
    g.drawString(last.dist + " px  " + last.dur + " ms", cx, 94);
    g.drawString(last.speed + " px/s  " + last.speedClass, cx, 108);
  } else g.drawString("tap, hold or swipe", cx, 94);
  var w = g.getWidth() / TYPES.length;
  TYPES.forEach(function (k, i) {
    var x = w * i + w / 2;
    g.drawString(SHORT[k], x, 150);
    g.drawString(counts[k], x, 164);
  });
  if (trail) {
    if (trail.length > 2) g.drawPoly(trail);
    else g.fillRect(trail[0] - 1, trail[1] - 1, trail[0] + 1, trail[1] + 1);
  }
}

function onGesture(ev) {
  if (ev.type === "unknown") {
    log({ evt: "unknown", reason: ev.reason, dist: ev.dist, dur: ev.dur, straight: ev.straight });
    return;
  }
  counts[ev.type]++;
  last = ev;
  label = labelFor(ev);
  var o = { evt: "gesture" };
  for (var k in ev) o[k] = ev[k];
  o.label = label;
  log(o);
  draw();
}

// unknown:true so rejected strokes reach onGesture; they are only logged when DEBUG is on.
var rec = G.create({ unknown: true });
rec.on("gesture", onGesture);

function onDrag(e) {
  var t = getTime() * 1000;
  if (e.b) {
    if (trailTimer) {
      // A new touch while the last trail is still shown: start a fresh one.
      clearTimeout(trailTimer);
      trailTimer = undefined;
      trail = null;
      draw();
    }
    g.reset();
    var n = trail ? trail.length : 0;
    if (n) g.drawLine(trail[n - 2], trail[n - 1], e.x, e.y);
    else g.fillRect(e.x - 1, e.y - 1, e.x + 1, e.y + 1);
    if (!trail) trail = [];
    if (n >= TRAIL_MAX) trail.splice(0, 2);
    trail.push(e.x, e.y);
  } else if (trail) {
    trailTimer = setTimeout(function () { trailTimer = undefined; trail = null; draw(); }, 500);
  }
  rec.feed({ x: e.x, y: e.y, b: e.b, t: t });
}

function onLock(locked) {
  if (locked) {
    rec.reset();
    trail = null;
    log({ evt: "lock" });
    draw();
  }
}

E.on("kill", function () {
  rec.reset();
  if (trailTimer) clearTimeout(trailTimer);
  trailTimer = undefined;
  Bangle.removeListener("lock", onLock);
  Bangle.setOptions({ lockTimeout: savedLockTimeout });
  log({ evt: "kill" });
});

// The touchscreen ignores input while locked, so keep the demo unlocked.
Bangle.setOptions({ lockTimeout: 0 });
Bangle.setLocked(false);
Bangle.on("lock", onLock);
Bangle.setUI({ mode: "custom", drag: onDrag, btn: function () { load(); } });
draw();
