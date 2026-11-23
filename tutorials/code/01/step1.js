// Step 1: show the raw touch events (console and screen)
Bangle.setLocked(false); // the touchscreen is ignored while the watch is locked
g.clear();
function show(y, text) {
  g.reset().clearRect(0, y, 175, y + 30);
  g.setFont("6x8", 2).setFontAlign(0, 0).drawString(text, 88, y + 15);
}
show(0, "touch me");
Bangle.on("touch", function (button, xy) {
  print("touch", button, JSON.stringify(xy));
  show(40, "touch " + xy.x + "," + xy.y);
});
Bangle.on("drag", function (e) {
  print("drag", JSON.stringify(e), Math.round(getTime() * 1000) % 100000);
  show(80, "x" + e.x + " y" + e.y + " b" + e.b);
  show(115, "dx" + e.dx + " dy" + e.dy);
});
Bangle.on("swipe", function (lr, ud) {
  print("swipe", lr, ud);
  show(0, "swipe " + lr + " " + ud);
});
setWatch(function () { load(); }, BTN1); // button: back to the launcher
