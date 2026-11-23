// Barometer: relative altitude, floors up/down, sparkline and sensor temperature.
// Tap: reset altitude and floors. Long press: sea-level reference menu.
// Swipe: why the temperature reads warm. Button: back to the launcher.
var DEBUG = false;
var B = require("baroalt");
var S = require("Storage");
var APP_ID = "baroalt";
var SETTINGS_FILE = "baroalt.json";
var TEMP_LABEL = "sensor temp";

var settings;
var tracker;
var mode;            // "main" | "hint" | "menu"
var press = B.createPress();

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }
function r1(n) { return n === undefined ? null : Math.round(n * 10) / 10; }
function r2(n) { return n === undefined ? null : Math.round(n * 100) / 100; }
// Rounded first, so small negative noise shows as "+0.0", not "-0.0".
function signed(n) { n = Math.round(n * 10) / 10; return (n >= 0 ? "+" : "") + n.toFixed(1); }

function loadSettings() {
  settings = { v: 1, p0: B.P_STD, floorM: B.FLOOR_M, stepCheck: false };
  var s = S.readJSON(SETTINGS_FILE, 1) || {};
  for (var k in s) settings[k] = s[k];
}

function saveSettings() {
  S.writeJSON(SETTINGS_FILE, { v: 1, p0: settings.p0, floorM: settings.floorM, stepCheck: settings.stepCheck });
}

function drawSpark(x, y, w, h, data) {
  g.setColor(0.5, 0.5, 0.5).drawRect(x, y, x + w - 1, y + h - 1);
  if (data.length < 2) return;
  var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data);
  if (mx - mn < 3) { var c = (mx + mn) / 2; mn = c - 1.5; mx = c + 1.5; } // at least 3 m tall
  var pts = [], step = (w - 3) / (B.HIST_LEN - 1);
  for (var i = 0; i < data.length; i++) {
    pts.push(x + 1 + (B.HIST_LEN - data.length + i) * step);
    pts.push(y + h - 2 - (data[i] - mn) / (mx - mn) * (h - 3));
  }
  g.setColor(0, 0.6, 1).drawPoly(pts);
}

function drawMain() {
  var r = Bangle.appRect, cx = r.x + r.w / 2, y = r.y, d = tracker.last();
  g.reset().clearRect(r).setFontAlign(0, -1);
  if (!d) {
    g.setFont("6x8", 2).drawString("Waiting for", cx, y + 30).drawString("barometer...", cx, y + 48);
  } else {
    g.setFont("6x8", 2).drawString(d.p.toFixed(1) + " hPa", cx, y + 2);
    g.setFont("Vector", 30).drawString(signed(d.altS) + " m", cx, y + 22);
    var abs = tracker.absAltitude(settings.p0);
    g.setFont("6x8").drawString("abs ~" + Math.round(abs) + " m @ " + settings.p0.toFixed(0) + " hPa", cx, y + 54);
    g.setFont("6x8", 2).drawString("up " + d.up + "  down " + d.down, cx, y + 66);
  }
  var t = d && d.temp !== undefined ? d.temp.toFixed(1) + "\xB0C" : "--";
  g.setFont("6x8", 2).setFontAlign(1, -1).drawString(t, cx + 8, y + 86);
  g.setFont("6x8").setFontAlign(-1, -1).drawString(TEMP_LABEL, cx + 12, y + 90);
  g.setFontAlign(0, -1).drawString("reads warm when worn - swipe", cx, y + 104);
  drawSpark(r.x + 4, y + 116, r.w - 8, r.y2 - y - 118, tracker.history());
}

function drawHint() {
  var r = Bangle.appRect, cx = r.x + r.w / 2;
  g.reset().clearRect(r).setFontAlign(0, -1);
  g.setFont("6x8", 2).drawString(TEMP_LABEL, cx, r.y + 4);
  var lines = [
    "The sensor sits inside",
    "the case, against your",
    "wrist. It reads closer",
    "to skin/case temperature",
    "than air: typically",
    "several degrees warm",
    "when worn. Take the",
    "watch off for ~30 min",
    "to read the room.",
    "",
    "tap to go back"
  ];
  g.setFont("6x8");
  for (var i = 0; i < lines.length; i++) g.drawString(lines[i], cx, r.y + 26 + i * 11);
}

function draw() {
  if (mode === "main") drawMain();
  else if (mode === "hint") drawHint();
}

// ---- input: plain objects in, so tests can call these directly ----
function onPressure(e) {
  if (!e) return;
  var r = tracker.feed({ p: e.pressure, temp: e.temperature, t: Date.now() });
  if (!r) return;
  log({ evt: "baro", p: r2(r.p), alt: r1(r.alt), altS: r1(r.altS), temp: r1(r.temp), up: r.up, down: r.down });
  if (mode === "main") drawMain();
}

function onStep() { tracker.onStep(Date.now()); }

function showMenu() {
  mode = "menu";
  log({ evt: "mode", mode: mode });
  E.showMenu({
    "": { title: "Sea level", back: function () { saveSettings(); setupUI(); showMain(); } },
    "hPa": {
      value: settings.p0, min: 850, max: 1100, step: 1,
      format: function (v) { return v.toFixed(2); },
      onchange: function (v) { settings.p0 = v; log({ evt: "p0", p0: v }); }
    }
  });
}

function showMain() { mode = "main"; log({ evt: "mode", mode: mode }); draw(); }
function showHint() { mode = "hint"; log({ evt: "mode", mode: mode }); draw(); }

press.on("gesture", function (ev) {
  if (mode === "hint") { if (ev.type === "tap") showMain(); return; }
  if (mode !== "main") return;
  if (ev.type === "tap") {
    tracker.reset();
    log({ evt: "reset" });
    draw();
  } else if (ev.type === "longpress") showMenu();
});

function setupUI() {
  press.reset();
  Bangle.setUI({
    mode: "custom",
    drag: function (e) { press.feed({ x: e.x, y: e.y, b: e.b, t: Date.now() }); },
    swipe: function () { if (mode === "main") showHint(); else if (mode === "hint") showMain(); },
    btn: function () { load(); }
  });
}

function stop() {
  Bangle.setBarometerPower(0, APP_ID);
  Bangle.removeListener("pressure", onPressure);
  Bangle.removeListener("step", onStep);
  press.reset();
}

function start() {
  loadSettings();
  tracker = B.create({ floorM: settings.floorM, stepCheck: settings.stepCheck });
  setupUI();
  Bangle.loadWidgets();
  Bangle.drawWidgets();
  Bangle.setBarometerPower(1, APP_ID);
  Bangle.on("pressure", onPressure);
  if (settings.stepCheck) Bangle.on("step", onStep);
  showMain();
}

E.on("kill", stop);
start();
