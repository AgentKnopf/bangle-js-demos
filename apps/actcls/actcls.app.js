// Activity classifier: still / fidget / walk / run from the accelerometer,
// with a restlessness score, a 30 min timeline and minutes per class today.
// Swipe left/right: main page <-> summary page. Button: back to the launcher.
var DEBUG = false;
var A = require("actcls");
var FILE = "actcls.json";
// pure colours of the 3-bit display, so nothing is dithered
var COLORS = { still: "#00f", fidget: "#f0f", walk: "#0f0", run: "#f00", unknown: "#000" };
var page = 0, last, timer;
var tl = A.timeline(120, 15000);
var sum = A.summary(require("Storage").readJSON(FILE, true));
var C;

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }

function save() {
  require("Storage").writeJSON(FILE, sum.json());
  log({ evt: "save", day: sum.json().day, min: sum.json().min });
}

function onWindow(w) {
  last = w;
  log({ evt: "win", t: w.t, meanMag: w.meanMag, sdMag: w.sdMag, p2p: w.p2p, zeroX: w.zeroX,
    orient: w.orient, steps: w.steps, cls: w.cls, conf: w.conf, hz: w.hz, n: w.n });
  if (w.changed) log({ evt: "show", t: w.t, cls: w.shown });
  tl.add(A.code(w.cls), w.t);
  if (sum.add(w.cls, A.HOP_MS, w.t)) save();
  draw();
}

// Sensor input. Tests call feed() with explicit timestamps.
function feed(a, t) { C.onAccel(a, t); }
function onAccel(a) { feed(a, Date.now()); }
function onStep() { C.onStep(Date.now()); }

function drawMain(r) {
  var cx = r.x + r.w / 2, y = r.y;
  var cls = C.shown() || "...";
  g.setColor(g.theme.fg).setFontAlign(0, -1).setFont("Vector", 34).drawString(cls, cx, y + 4);
  // confidence bar for the latest window
  var conf = last ? last.conf : 0;
  g.setColor(g.theme.fg).drawRect(r.x + 18, y + 44, r.x2 - 18, y + 52);
  g.fillRect(r.x + 18, y + 44, r.x + 18 + Math.round((r.w - 36) * conf), y + 52);
  g.setFont("6x8").setFontAlign(0, -1).drawString("confidence " + Math.round(conf * 100) + "%", cx, y + 56);
  var rs = C.restless();
  g.setFont("Vector", 18).drawString("Restless " + (rs < 0 ? "--" : rs), cx, y + 72);
  if (last && last.off) g.setFont("6x8").drawString("off wrist?", cx, y + 94);
  // timeline: 120 slots of 15 s = last 30 min, oldest on the left
  var slots = tl.get(), x0 = r.x + 8, w = r.w - 16, ty = r.y2 - 28;
  for (var i = 0; i < slots.length; i++) {
    var name = A.CLASSES[slots[i]];
    if (!name) continue;
    g.setColor(COLORS[name]).fillRect(x0 + Math.floor(i * w / slots.length), ty,
      x0 + Math.floor((i + 1) * w / slots.length) - 1, ty + 12);
  }
  g.setColor(g.theme.fg).drawRect(x0 - 1, ty - 1, x0 + w, ty + 13);
  g.setFont("6x8").setFontAlign(-1, -1).drawString("-30m", x0, ty + 15);
  g.setFontAlign(1, -1).drawString("now", x0 + w, ty + 15);
}

function drawSummary(r) {
  var j = sum.json(), names = ["still", "fidget", "walk", "run"], max = 1, i;
  for (i = 0; i < 4; i++) max = Math.max(max, j.min[names[i]]);
  g.setColor(g.theme.fg).setFont("6x8", 2).setFontAlign(0, -1).drawString("Today", r.x + r.w / 2, r.y + 4);
  g.setFont("6x8").drawString(j.day || "", r.x + r.w / 2, r.y + 22);
  for (i = 0; i < 4; i++) {
    var y = r.y + 40 + i * 28, n = j.min[names[i]];
    g.setColor(g.theme.fg).setFontAlign(-1, -1).drawString(names[i], r.x + 6, y);
    g.setFontAlign(1, -1).drawString(n + " min", r.x2 - 6, y);
    g.setColor(COLORS[names[i]]).fillRect(r.x + 6, y + 10, r.x + 6 + Math.round((r.w - 12) * n / max), y + 18);
  }
}

function draw() {
  var r = Bangle.appRect;
  g.reset().clearRect(r);
  if (page) drawSummary(r); else drawMain(r);
}

function onSwipe(dir) {
  if (!dir) return;
  page = page ? 0 : 1;
  log({ evt: "page", page: page });
  draw();
}

E.on("kill", function () {
  Bangle.removeListener("accel", onAccel);
  Bangle.removeListener("step", onStep);
  save();
});

C = A.create({ onWindow: onWindow });
Bangle.setPollInterval(80); // 12.5 Hz; also turns off the firmware's automatic powerSave rate switching
Bangle.on("accel", onAccel);
Bangle.on("step", onStep);
if (sum.roll(Date.now())) save();
Bangle.setUI({ mode: "custom", swipe: onSwipe, btn: function () { load(); } });
Bangle.loadWidgets();
Bangle.drawWidgets();
draw();
