// Step 2: one stroke per touch: start, end, path length, duration
var stroke = null;

function show(lines) {
  g.reset().clearRect(0, 0, 175, 60).setFont("6x8", 2).setFontAlign(0, 0);
  lines.forEach(function (l, i) { g.drawString(l, 88, 12 + i * 18); });
}

function feed(p) {               // p = {x, y, b, t}, t in ms
  if (p.b && !stroke) {          // finger down: start
    g.clear();
    stroke = { x0: p.x, y0: p.y, t0: p.t, x: p.x, y: p.y, path: 0 };
  } else if (p.b) {              // finger moving
    g.reset().drawLine(stroke.x, stroke.y, p.x, p.y);
    stroke.path += Math.sqrt(Math.pow(p.x - stroke.x, 2) + Math.pow(p.y - stroke.y, 2));
    stroke.x = p.x; stroke.y = p.y;
  } else if (stroke) {           // finger up: report and forget
    var s = stroke, dx = s.x - s.x0, dy = s.y - s.y0, dur = p.t - s.t0;
    stroke = null;
    print("stroke", { dx: dx, dy: dy, path: Math.round(s.path), dur: dur });
    show(["dx " + dx + "  dy " + dy, "path " + Math.round(s.path) + " px", Math.round(dur) + " ms"]);
  }
}

Bangle.setLocked(false);
Bangle.setUI({
  mode: "custom",
  drag: function (e) { feed({ x: e.x, y: e.y, b: e.b, t: getTime() * 1000 }); },
  btn: function () { load(); }
});
g.clear();
show(["drag a finger"]);
