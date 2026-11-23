// Compass with its own calibration, tilt awareness and a target bearing.
// Tap: lock the current heading as target. Long press: recalibrate.
// Button: back to the launcher.
var DEBUG = false;
var C = require("compasscal");
var G = require("gestures");
var S = require("Storage");
var APP_ID = "compasscal";

var settings;
var cal;                  // calibration from compass.json, or null
var mode;                 // "cal" | "main"
var calib;                // calibrator while in "cal" mode
var smoother = C.createSmoother(C.SMOOTH_N);
var accel;                // last accel sample
var target;               // locked bearing in degrees, or undefined
var heading;              // last smoothed heading (rounded), or undefined
var interfering = false;
var shown = {};           // what is on screen, so only changed parts are redrawn
// instantTap: no double tap here, so report taps without the double-tap delay.
var press = G.create({ instantTap: true });

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }
function r1(n) { return Math.round(n * 10) / 10; }

function geom() {
  var r = Bangle.appRect;
  return { r: r, cx: r.x + r.w / 2, cy: r.y + 66, rad: 58 };
}

// ---- calibration screen ----
function drawCalFrame() {
  var q = geom();
  g.reset().clearRect(q.r);
  g.setFontAlign(0, 0).setFont("6x8", 2).drawString("Calibrate", q.cx, q.r.y + 8);
  g.setFont("6x8").drawString("Rotate the watch slowly", q.cx, q.r.y2 - 18);
  g.drawString("in all directions", q.cx, q.r.y2 - 8);
}

function drawRing(p) {
  var q = geom(), cy = q.cy + 4, ro = 48, ri = 38;
  g.reset().setColor(g.theme.bg).fillCircle(q.cx, cy, ro + 1);
  g.setColor(g.theme.fg).drawCircle(q.cx, cy, ro).drawCircle(q.cx, cy, ri);
  var end = Math.round(p * 60);
  g.setColor(0, 0.6, 1);
  for (var i = 0; i < end; i++) {
    var a0 = i * 6 / 57.29578, a1 = (i + 1) * 6 / 57.29578;
    g.fillPoly([
      q.cx + ri * Math.sin(a0), cy - ri * Math.cos(a0), q.cx + ro * Math.sin(a0), cy - ro * Math.cos(a0),
      q.cx + ro * Math.sin(a1), cy - ro * Math.cos(a1), q.cx + ri * Math.sin(a1), cy - ri * Math.cos(a1)
    ]);
  }
  g.setColor(g.theme.fg).setFontAlign(0, 0).setFont("Vector", 20).drawString(Math.round(p * 100) + "%", q.cx, cy);
  shown.p = p;
}

function startCal() {
  mode = "cal";
  calib = C.createCalibrator();
  shown = {};
  log({ evt: "mode", mode: mode });
  drawCalFrame();
  drawRing(0);
}

function finishCal() {
  cal = calib.result(Math.round(Date.now() / 1000));
  S.writeJSON(C.CAL_FILE, cal);
  log({ evt: "calibrated", offset: cal.offset, scale: cal.scale, norm: cal.norm });
  startMain();
}

// ---- main screen ----
function startMain() {
  mode = "main";
  calib = undefined;
  smoother.reset();
  heading = undefined;
  shown = {};
  g.reset().clearRect(Bangle.appRect);
  log({ evt: "mode", mode: mode });
  drawRose();
  drawCentre();
  drawStatus();
}

function drawRose() {
  var q = geom(), h = heading === undefined ? 0 : heading;
  g.reset().setColor(g.theme.bg).fillCircle(q.cx, q.cy, q.rad + 6);
  g.setColor(g.theme.fg).drawCircle(q.cx, q.cy, q.rad);
  for (var d = 30; d < 360; d += 30) {
    if (d % 90 === 0) continue;
    var a = (d - h) / 57.29578, s = Math.sin(a), c = Math.cos(a);
    g.drawLine(q.cx + (q.rad - 5) * s, q.cy - (q.rad - 5) * c, q.cx + q.rad * s, q.cy - q.rad * c);
  }
  var L = ["N", "E", "S", "W"];
  g.setFontAlign(0, 0).setFont("6x8", 2);
  for (var i = 0; i < 4; i++) {
    var b = (i * 90 - h) / 57.29578;
    g.setColor(i ? g.theme.fg : "#f00");
    g.drawString(L[i], q.cx + (q.rad - 14) * Math.sin(b), q.cy - (q.rad - 14) * Math.cos(b) + 1);
  }
  if (target !== undefined && heading !== undefined) {
    var t = (target - h) / 57.29578;
    g.setColor(0, 0.6, 1).fillCircle(q.cx + q.rad * Math.sin(t), q.cy - q.rad * Math.cos(t), 5);
  }
  // fixed pointer at 12 o'clock: the direction the watch points
  g.setColor(g.theme.fg).fillPoly([q.cx - 6, q.cy - q.rad - 2, q.cx + 6, q.cy - q.rad - 2, q.cx, q.cy - q.rad + 9]);
  shown.rose = heading;
  shown.roseT = target;
  shown.centre = undefined; // the rose background covers the centre text
}

function centreText() {
  if (interfering) return ["interference", ""];
  if (heading === undefined) return ["---", ""];
  return [heading + "\xB0", C.cardinal(heading)];
}

function drawCentre() {
  var q = geom(), t = centreText(), key = t.join("|");
  if (shown.centre === key) return;
  g.reset().setColor(g.theme.bg).fillRect(q.cx - 34, q.cy - 18, q.cx + 34, q.cy + 22);
  g.setColor(g.theme.fg).setFontAlign(0, 0);
  if (interfering) g.setFont("6x8").drawString(t[0], q.cx, q.cy);
  else {
    g.setFont("Vector", 22).drawString(t[0], q.cx, q.cy - 4);
    g.setFont("6x8").drawString(t[1], q.cx, q.cy + 15);
  }
  shown.centre = key;
}

function statusText() {
  var tilt = C.tilt(accel);
  if (tilt > 90) return "upside down?";
  if ((!settings.tiltComp && tilt > C.TILT_HINT) || tilt > C.TILT_MAX_COMP) return "tilted - hold flat";
  if (target !== undefined && heading !== undefined && !interfering) return C.turnText(C.diff(target, heading));
  if (target === undefined) return "tap: set target";
  return "";
}

function drawStatus() {
  var r = Bangle.appRect, s = statusText();
  if (shown.status === s) return;
  g.reset().clearRect(r.x, r.y2 - 17, r.x2, r.y2);
  g.setFontAlign(0, 0).setFont("6x8", s.length > 14 ? 1 : 2).drawString(s, r.x + r.w / 2, r.y2 - 8);
  log({ evt: "status", text: s });
  shown.status = s;
}

function draw() {
  if (mode !== "main") return;
  if (shown.rose !== heading || shown.roseT !== target) { drawRose(); log({ evt: "draw", part: "rose" }); }
  drawCentre();
  drawStatus();
}

// ---- sensor input: plain objects in, so tests can call these directly ----
function onMag(m) {
  if (mode === "cal") {
    calib.add(m, Date.now());
    var p = Math.round(calib.progress() * 20) / 20;
    if (p !== shown.p) drawRing(p);
    if (calib.done(Date.now())) finishCal();
    return;
  }
  if (!cal || !m) return;
  var v = C.correct(cal, m);
  var r = C.heading(v, accel, settings.tiltComp);
  var raw = C.norm360(r.h + settings.decl);
  interfering = C.interference(cal, v);
  var smooth = interfering ? undefined : smoother.add(raw);
  log({ evt: "heading", raw: r1(raw), smooth: smooth === undefined ? null : r1(smooth), tilt: Math.round(r.tilt), interference: interfering });
  if (smooth !== undefined) heading = Math.round(smooth) % 360;
  draw();
}

function onAccel(a) {
  accel = a;
  if (mode === "main") drawStatus();
}

press.on("gesture", function (ev) {
  if (ev.type === "longpress") { log({ evt: "gesture", type: ev.type }); startCal(); }
  else if (ev.type === "tap" && mode === "main" && heading !== undefined) {
    target = heading;
    log({ evt: "target", target: target });
    draw();
  }
});

function stop() {
  Bangle.setCompassPower(0, APP_ID);
  Bangle.removeListener("mag", onMag);
  Bangle.removeListener("accel", onAccel);
  press.reset();
}

function start() {
  settings = { decl: 0, tiltComp: true };
  var st = S.readJSON(C.SETTINGS_FILE, 1) || {};
  for (var k in st) settings[k] = st[k];
  cal = C.parseCal(S.readJSON(C.CAL_FILE, 1));
  Bangle.setUI({
    mode: "custom",
    drag: function (e) { press.feed({ x: e.x, y: e.y, b: e.b, t: Date.now() }); },
    btn: function () { load(); }
  });
  Bangle.loadWidgets();
  Bangle.drawWidgets();
  Bangle.setCompassPower(1, APP_ID);
  Bangle.on("mag", onMag);
  Bangle.on("accel", onAccel);
  if (cal) startMain(); else startCal();
}

E.on("kill", stop);
start();
