// Step 6: the step 5 app plus a scripted test through feed()
var TAP_MOVE = 12, TAP_MS = 300, DOUBLE_MS = 350, LONG_MS = 600;
var SWIPE_MIN = 40, SWIPE_MS = 600, SLOW = 150, FAST = 600, STRAIGHT_MIN = 0.8;
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
  if (ev.dist < SWIPE_MIN) return;                        // too short for a swipe or stroke
  var straight = d.path ? ev.dist / d.path : 1;           // 1.0 = ruler-straight
  if (ev.dur <= SWIPE_MS) { ev.type = "swipe"; emit(ev); }
  else if (straight >= STRAIGHT_MIN) { ev.type = "stroke"; emit(ev); }
  else print("ignored: straightness " + straight.toFixed(2));
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

// --- Step 6: a scripted test that drives feed() with made-up points ---
var got = [], results = [];
var showOnScreen = emit;                          // keep the screen version for later
emit = function (ev) { got.push(ev.type + (ev.dir ? " " + ev.dir : "")); };
function tap(x, y, t) { feed({ x: x, y: y, b: 1, t: t }); feed({ x: x, y: y, b: 0, t: t + 80 }); }
function line(x0, y0, x1, y1, t, ms, n) {        // press, n moves, release
  feed({ x: x0, y: y0, b: 1, t: t });
  for (var i = 1; i <= n; i++) feed({ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n, b: 1, t: t + ms * i / n });
  feed({ x: x1, y: y1, b: 0, t: t + ms });
}
var cases = [
  ["tap", function (t) { tap(88, 88, t); }, ["tap"]],
  ["double tap", function (t) { tap(88, 88, t); tap(90, 90, t + 200); }, ["doubletap"]],
  ["swipe left", function (t) { line(138, 88, 38, 88, t, 150, 5); }, ["swipe left"]],
  ["stroke up", function (t) { line(88, 150, 88, 40, t, 1000, 10); }, ["stroke up"]],
  ["zig-zag", function (t) {
    [[150, 88], [125, 128], [100, 88], [75, 128], [50, 88]].forEach(function (q, i) {
      feed({ x: q[0], y: q[1], b: 1, t: t + i * 250 });
    });
    feed({ x: 50, y: 88, b: 0, t: t + 1000 });
  }, []]
];
var k = 0;
function next() {
  if (k >= cases.length) {                        // all done: show the results, use the app again
    emit = showOnScreen;
    var passed = results.filter(function (r) { return r.charAt(0) === "P"; }).length;
    g.reset().clear().setFont("Vector", 26).setFontAlign(0, 0).drawString(passed + "/" + cases.length + " passed", 88, 25);
    g.setFont("Vector", 18).setFontAlign(-1, 0);
    results.forEach(function (r, i) { g.drawString(r, 4, 62 + i * 22); });
    return;
  }
  var c = cases[k++];
  got = [];
  c[1](getTime() * 1000);
  setTimeout(function () {                        // wait out the double-tap window
    var ok = JSON.stringify(got) === JSON.stringify(c[2]);
    results.push((ok ? "PASS " : "FAIL ") + c[0]);
    print(results[results.length - 1], JSON.stringify(got));
    next();
  }, 500);
}
next();
