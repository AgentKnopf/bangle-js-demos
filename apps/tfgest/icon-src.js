// Drawn on `i`, a 48x48 Graphics, by tools/make-icon.js: a tiny network over a wrist flick.
i.setColor(1, 0, 1).fillCircle(24, 24, 22);
i.setColor(1, 1, 1);
var L = [[12, 14], [12, 24], [12, 34]], M = [[24, 18], [24, 30]], R = [[36, 24]];
L.forEach(function (a) { M.forEach(function (b) { i.drawLine(a[0], a[1], b[0], b[1]); }); });
M.forEach(function (a) { R.forEach(function (b) { i.drawLine(a[0], a[1], b[0], b[1]); }); });
L.concat(M, R).forEach(function (p) { i.fillCircle(p[0], p[1], 3); });
