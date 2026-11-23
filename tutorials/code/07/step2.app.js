// act.app.js, step 2: 4 s windows every 2 s, and their features
Bangle.setPollInterval(80); // 12.5 Hz, fixed; also turns off the power-save slowdown
var WIN = 50, HOP = 25;     // in samples: 4 s windows, a new one every 2 s
var buf = [], n = 0, f, prev;

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

function draw() {
  var r = Bangle.appRect, x = r.x + 20, y = r.y + 10;
  g.reset().clearRect(r).setFont("6x8", 2).setFontAlign(-1, -1);
  if (!f) return g.drawString("waiting...", x, y);
  g.drawString("mean   " + f.meanMag.toFixed(3), x, y);
  g.drawString("sd     " + f.sdMag.toFixed(3), x, y + 22);
  g.drawString("p2p    " + f.p2p.toFixed(3), x, y + 44);
  g.drawString("zeroX  " + f.zeroX, x, y + 66);
  g.drawString("orient " + f.orient.toFixed(1), x, y + 88);
}

function onAccel(a) {
  buf.push({ x: a.x, y: a.y, z: a.z, mag: a.mag });
  if (buf.length > WIN) buf.shift();
  if (++n % HOP || buf.length < WIN) return;
  f = features(buf);
  f.orient = prev ? angle(f, prev) : 0;
  prev = f;
  draw();
}

Bangle.on("accel", onAccel);
Bangle.setUI({ mode: "custom", btn: function () { load(); } });
Bangle.loadWidgets();
Bangle.drawWidgets();
draw();
