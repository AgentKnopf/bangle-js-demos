// act.app.js, step 1: show |a| and the measured sample rate
Bangle.setPollInterval(80); // 12.5 Hz, fixed; also turns off the power-save slowdown
var n = 0, t0, mag = 0, mn = 9, mx = 0;

function draw() {
  var r = Bangle.appRect, cx = r.x + r.w / 2;
  var hz = n > 1 ? (n - 1) / ((Date.now() - t0) / 1000) : 0;
  g.reset().clearRect(r).setFontAlign(0, -1);
  g.setFont("Vector", 40).drawString(mag.toFixed(2), cx, r.y + 16);
  g.setFont("6x8", 2).drawString("|a| in g", cx, r.y + 60);
  g.drawString(mn.toFixed(2) + " .. " + mx.toFixed(2), cx, r.y + 86); // range in the last 2 s
  g.drawString(hz.toFixed(1) + " Hz", cx, r.y + 112);
}

function onAccel(a) { // a = {x, y, z, diff, mag}, in g
  if (!n) t0 = Date.now();
  n++;
  mag = a.mag;
  mn = Math.min(mn, mag);
  mx = Math.max(mx, mag);
  if (n % 25 == 0) { draw(); mn = 9; mx = 0; } // every 25 samples = 2 s
}

Bangle.on("accel", onAccel);
Bangle.setUI({ mode: "custom", btn: function () { load(); } });
Bangle.loadWidgets();
Bangle.drawWidgets();
draw();
