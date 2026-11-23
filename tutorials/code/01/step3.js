// Step 3: tap, double tap and long press, with timers
var TAP_MOVE = 12, TAP_MS = 300, DOUBLE_MS = 350, LONG_MS = 600;
var down = null, pendingTap = null, tapTimer, longTimer;

function emit(ev) {
  print(JSON.stringify(ev));
  g.reset().clear().setFont("Vector", 26).setFontAlign(0, 0);
  g.drawString(ev.type.toUpperCase(), 88, 70);
}
function dist(ax, ay, bx, by) { return Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)); }

function press(p) {
  down = { x0: p.x, y0: p.y, t0: p.t, x: p.x, y: p.y, path: 0, moved: 0, long: false };
  if (pendingTap && p.t - pendingTap.t < DOUBLE_MS) { clearTimeout(tapTimer); down.second = true; }
  longTimer = setTimeout(function () {
    if (down.second) { pendingTap = null; emit({ type: "tap" }); } // the first tap was a tap after all
    down.long = true;
    emit({ type: "longpress" });
  }, LONG_MS);
}
function move(p) {
  down.path += dist(down.x, down.y, p.x, p.y);
  down.x = p.x; down.y = p.y;
  down.moved = Math.max(down.moved, dist(down.x0, down.y0, p.x, p.y));
  if (down.moved >= TAP_MOVE) clearTimeout(longTimer);   // moved too far for a long press
}
function release(p) {
  clearTimeout(longTimer);
  var d = down; down = null;
  if (d.long) return;                                     // already reported while held
  if (d.moved < TAP_MOVE && p.t - d.t0 < TAP_MS) {
    if (d.second) { pendingTap = null; emit({ type: "doubletap" }); return; }
    pendingTap = { t: p.t };                              // wait: a second tap may follow
    tapTimer = setTimeout(function () { pendingTap = null; emit({ type: "tap" }); }, DOUBLE_MS);
    return;
  }
  if (d.second) { pendingTap = null; emit({ type: "tap" }); }
}
function feed(p) {                                        // p = {x, y, b, t}, t in ms
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
g.clear().setFont("6x8", 2).setFontAlign(0, 0).drawString("tap, double tap\nor hold", 88, 88);
