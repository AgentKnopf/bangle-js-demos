// Drawn on `i`, a 48x48 Graphics, by tools/make-icon.js: a walking signal trace.
i.setColor(0, 0.6, 0).fillCircle(24, 24, 22);
i.setColor(1, 1, 1);
var pts = [4, 26, 10, 26, 14, 14, 19, 36, 24, 10, 29, 38, 34, 18, 38, 26, 44, 26];
for (var k = 0; k < pts.length - 2; k += 2) {
  i.drawLine(pts[k], pts[k + 1], pts[k + 2], pts[k + 3]);
  i.drawLine(pts[k], pts[k + 1] + 1, pts[k + 2], pts[k + 3] + 1);
}
