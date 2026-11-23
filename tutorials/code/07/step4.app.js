// act.app.js, step 4: debounce, confidence and a timeline
Bangle.setPollInterval(80); // 12.5 Hz, fixed; also turns off the power-save slowdown
var WIN = 50, HOP = 25;     // in samples: 4 s windows, a new one every 2 s
var buf = [], n = 0, f, prev, c, steps = 0, lastSteps = 0;
var COLORS = { still: "#00f", fidget: "#f0f", walk: "#0f0", run: "#f00", unknown: "#000" };
var hist = []; // raw class of the last 150 windows (5 min), oldest first

function features(s) { // s: [{x, y, z, mag}, ...]
  var len = s.length, sum = 0, mn = 1e9, mx = -1e9, gx = 0, gy = 0, gz = 0, i;
  for (i = 0; i < len; i++) {
    var v = s[i].mag;
    sum += v; mn = Math.min(mn, v); mx = Math.max(mx, v);
    gx += s[i].x; gy += s[i].y; gz += s[i].z;
  }
  var mean = sum / len, ss = 0, zx = 0, sg = 0;
  for (i = 0; i < len; i++) {
    var d = s[i].mag - mean;
    ss += d * d;
    if (d > 0.01) { if (sg < 0) zx++; sg = 1; }          // a small band stops
    else if (d < -0.01) { if (sg > 0) zx++; sg = -1; }   // noise counting as crossings
  }
  return { meanMag: mean, sdMag: Math.sqrt(ss / len), p2p: mx - mn, zeroX: zx,
    gx: gx / len, gy: gy / len, gz: gz / len };
}

function angle(a, b) { // degrees between two mean gravity vectors
  var l = Math.sqrt((a.gx * a.gx + a.gy * a.gy + a.gz * a.gz) * (b.gx * b.gx + b.gy * b.gy + b.gz * b.gz));
  if (!l) return 0;
  var c = (a.gx * b.gx + a.gy * b.gy + a.gz * b.gz) / l;
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

function classify(f) { // returns {cls, conf}
  var sd = f.sdMag, zx = f.zeroX, o = f.orient, m = Math.min;
  function res(cls, margin) { return { cls: cls, conf: Math.max(0, m(1, margin / 0.5)) }; }
  if (sd < 0.01 && o < 5) return res("still", m((0.01 - sd) / 0.01, (5 - o) / 5));
  if (sd >= 0.35 && zx >= 10) return res("run", m((sd - 0.35) / 0.35, (zx - 9) / 10));
  if (sd >= 0.08 && sd < 0.35 && zx >= 6 && zx <= 20)
    return res("walk", m((sd - 0.08) / 0.08, (0.35 - sd) / 0.35, (zx - 5) / 6, (21 - zx) / 20));
  if (f.steps >= 3) return res("walk", (f.steps - 2) / 3);
  if (sd < 0.08 && f.steps == 0) return res("fidget", m((0.08 - sd) / 0.08, Math.max((sd - 0.01) / 0.01, (o - 5) / 5)));
  return { cls: "unknown", conf: 0 };
}

function debounce(need) { // a new class is shown after `need` windows in a row
  var cand = "", count = 0, shown = "...";
  return function (cls) {
    if (cls === cand) count++; else { cand = cls; count = 1; }
    if (count >= need) shown = cand;
    return shown;
  };
}
var deb = debounce(2), shown = "...";

function draw() {
  var r = Bangle.appRect, cx = r.x + r.w / 2, y = r.y, conf = c ? c.conf : 0;
  g.reset().clearRect(r).setFontAlign(0, -1).setFont("Vector", 34).drawString(shown, cx, y + 4);
  g.drawRect(r.x + 18, y + 44, r.x2 - 18, y + 52);
  g.fillRect(r.x + 18, y + 44, r.x + 18 + Math.round((r.w - 36) * conf), y + 52);
  g.setFont("6x8").drawString("confidence " + Math.round(conf * 100) + "%", cx, y + 56);
  var x0 = r.x + 8, w = r.w - 16, ty = r.y2 - 28; // timeline: one column per window
  for (var i = 0; i < hist.length; i++)
    g.setColor(COLORS[hist[i]]).fillRect(x0 + Math.floor(i * w / 150), ty, x0 + Math.floor((i + 1) * w / 150) - 1, ty + 12);
  g.setColor(g.theme.fg).drawRect(x0 - 1, ty - 1, x0 + w, ty + 13);
  g.setFontAlign(-1, -1).drawString("-5m", x0, ty + 15).setFontAlign(1, -1).drawString("now", x0 + w, ty + 15);
}

function onAccel(a) {
  buf.push({ x: a.x, y: a.y, z: a.z, mag: a.mag });
  if (buf.length > WIN) buf.shift();
  if (++n % HOP || buf.length < WIN) return;
  f = features(buf);
  f.orient = prev ? angle(f, prev) : 0;
  f.steps = steps + lastSteps; // steps in the last 4 s
  lastSteps = steps;
  steps = 0;
  prev = f;
  c = classify(f);
  shown = deb(c.cls);
  hist.push(c.cls);
  if (hist.length > 150) hist.shift();
  draw();
}

Bangle.on("accel", onAccel);
Bangle.on("step", function () { steps++; });
Bangle.setUI({ mode: "custom", btn: function () { load(); } });
Bangle.loadWidgets();
Bangle.drawWidgets();
draw();
