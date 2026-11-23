// Step 4: swipes with direction and speed
var TAP_MOVE = 12, TAP_MS = 300, DOUBLE_MS = 350, LONG_MS = 600;
var SWIPE_MIN = 40, SWIPE_MS = 600, SLOW = 150, FAST = 600;
var down = null, pendingTap = null, tapTimer, longTimer;

function emit(ev) {
  print(JSON.stringify(ev));
  g.reset().clear().setFont("Vector", 24).setFontAlign(0, 0);
  g.drawString(ev.type.toUpperCase() + (ev.dir ? "\n" + ev.dir.toUpperCase() : ""), 88, 60);
  if (ev.speed !== undefined) g.setFont("6x8", 2).drawString(ev.dist + " px " + ev.dur + " ms\n" +
    ev.speed + " px/s\n" + ev.speedClass, 88, 135);
}
function dist(ax, ay, bx, by) { return Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)); }
function direction(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";  // ties go horizontal
  return dy < 0 ? "up" : "down";                                        // screen y grows downwards
}
function describe(d, t1) {
  var dur = Math.max(1, Math.round(t1 - d.t0));            // same timestamp: 1 ms, never divide by 0
  var dd = dist(d.x0, d.y0, d.x, d.y), speed = Math.round(dd * 1000 / dur);
  return { dir: direction(d.x - d.x0, d.y - d.y0), dist: Math.round(dd), dur: dur, speed: speed,
    speedClass: speed < SLOW ? "slow" : speed > FAST ? "fast" : "normal" };
}

function press(p) {
  down = { x0: p.x, y0: p.y, t0: p.t, x: p.x, y: p.y, path: 0, moved: 0, long: false };
  if (pendingTap && p.t - pendingTap.t < DOUBLE_MS) { clearTimeout(tapTimer); down.second = true; }
  longTimer = setTimeout(function () {
    if (down.second) { pendingTap = null; emit({ type: "tap" }); }
    down.long = true;
    emit({ type: "longpress" });
  }, LONG_MS);
}
function move(p) {
  down.path += dist(down.x, down.y, p.x, p.y);
  down.x = p.x; down.y = p.y;
  down.moved = Math.max(down.moved, dist(down.x0, down.y0, p.x, p.y));
  if (down.moved >= TAP_MOVE) clearTimeout(longTimer);
}
function release(p) {
  if (p.x !== down.x || p.y !== down.y) move(p);          // the release may carry the last point
  clearTimeout(longTimer);
  var d = down; down = null;
  if (d.long) return;
  if (d.moved < TAP_MOVE && p.t - d.t0 < TAP_MS) {
    if (d.second) { pendingTap = null; emit({ type: "doubletap" }); return; }
    pendingTap = { t: p.t };
    tapTimer = setTimeout(function () { pendingTap = null; emit({ type: "tap" }); }, DOUBLE_MS);
    return;
  }
  if (d.second) { pendingTap = null; emit({ type: "tap" }); }
  var ev = describe(d, p.t);
  if (ev.dist >= SWIPE_MIN && ev.dur <= SWIPE_MS) { ev.type = "swipe"; emit(ev); }
}
function feed(p) {
  if (p.b && !down) press(p);
  else if (p.b) move(p);
  else if (down) release(p);
}

Bangle.setLocked(false);
Bangle.setUI({
  mode: "custom",
  drag: function (e) { feed({ x: e.x, y: e.y, b: e.b, t: getTime() * 1000 }); },
  btn: function () { load(); }
});
g.clear().setFont("6x8", 2).setFontAlign(0, 0).drawString("swipe in any\ndirection", 88, 88);
