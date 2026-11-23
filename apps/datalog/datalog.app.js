// Data logger: records chosen sensors to a StorageFile (header + compact
// CSV), shows progress while logging, lists/deletes recordings and serves
// them to a PC over the UART (LIST / GET).
var DEBUG = false;
var APP = "datalog";
var D = require("datalog");
var ST = require("Storage");
var SETTINGS = "datalog.json", INDEX = "datalog.idx.json";
var LONG_MS = 1000; // button hold that stops a recording
var SRC = ["a", "h", "p", "m", "s"];
var NAMES = { a: "Accel", h: "Heart rate", p: "Pressure", m: "Compass", s: "Steps" };
var settings = ST.readJSON(SETTINGS, 1) || {};
var cfg = settings.cfg || { a: 80, h: 0, p: 0, m: 0, s: 0, label: "" };
var logger, tick, btnWatch, holdTimer, screen, steps = { up: undefined, n: 0 }, exportState;

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }
function labels() { return settings.labels || D.DEFAULT_LABELS; }
function index() { return ST.readJSON(INDEX, 1) || {}; }
function kb(n) { return n < 1000 ? n + " B" : (n / 1024).toFixed(n < 10240 ? 1 : 0) + " kB"; }
function hms(ms) {
  var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return (h ? h + ":" + ("0" + m).substr(-2) : m) + ":" + ("0" + s % 60).substr(-2);
}

// ---- sensor input: every handler forwards a plain object here ----
function onSample(type, o) {
  if (!logger) return;
  logger.sample(type, o, getTime() * 1000);
  if (logger.state !== "logging") stopLog(logger.reason);
}
function onAccel(a) { onSample("a", a); }
function onHRM(h) { onSample("h", h); }
function onPressure(p) { onSample("p", p); }
function onMag(m) { onSample("m", m); }
function onStep(up) {
  if (steps.up !== undefined) steps.n += up - steps.up;
  steps.up = up;
}

function sensors(on) {
  var src = logger.src;
  if (src.a) {
    if (on) { Bangle.setPollInterval(src.a < 80 ? src.a : 80); Bangle.on("accel", onAccel); }
    else { Bangle.removeListener("accel", onAccel); Bangle.setPollInterval(80); Bangle.setOptions({ powerSave: true }); }
  }
  if (src.h) { if (on) Bangle.on("HRM", onHRM); else Bangle.removeListener("HRM", onHRM); Bangle.setHRMPower(on, APP); }
  if (src.p) { if (on) Bangle.on("pressure", onPressure); else Bangle.removeListener("pressure", onPressure); Bangle.setBarometerPower(on, APP); }
  if (src.m) { if (on) Bangle.on("mag", onMag); else Bangle.removeListener("mag", onMag); Bangle.setCompassPower(on, APP); }
  if (src.s) { steps = { up: undefined, n: 0 }; if (on) Bangle.on("step", onStep); else Bangle.removeListener("step", onStep); }
}

function exists(n) { return D.has(ST.list(undefined, { sf: true }), n); }

function startLog() {
  var src = {}, any = false;
  SRC.forEach(function (k) { if (cfg[k]) { src[k] = cfg[k]; any = true; } });
  if (!any) return E.showAlert("Choose at least one source").then(mainMenu);
  if (E.getBattery() < D.LOW_BATTERY) return E.showAlert("Battery low").then(mainMenu);
  settings.cfg = cfg;
  ST.writeJSON(SETTINGS, settings);
  var name = D.fileName(new Date(), exists);
  logger = D.createLogger({ storage: ST, name: name, start: Date.now(), label: cfg.label, src: src, now: function () { return getTime() * 1000; } });
  logger.src = src;
  logger.start();
  sensors(true);
  tick = setInterval(onTick, 1000);
  log({ evt: "start", name: name, src: src, label: cfg.label, free: logger.free0 });
  logScreen();
}

function onTick() {
  if (!logger) return;
  var t = logger.elapsed(getTime() * 1000);
  if (logger.due("s", t, 500)) { logger.add("s", D.sampleLine("s", t, { n: steps.n }), t); steps.n = 0; }
  if (E.getBattery() < D.LOW_BATTERY) return stopLog("battery");
  if (logger.state !== "logging") return stopLog(logger.reason);
  if (screen === "log" && !Bangle.isLocked()) drawLog();
}

// reason: user | full | battery | kill
function stopLog(reason) {
  if (!logger) return;
  var L = logger;
  logger = undefined;
  if (tick) clearInterval(tick);
  tick = undefined;
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = undefined;
  if (L.src.s && steps.n && L.state === "logging") { var t = L.elapsed(getTime() * 1000); L.add("s", D.sampleLine("s", t, { n: steps.n }), t); }
  logger = L; sensors(false); logger = undefined;
  L.stop(reason);
  var idx = index();
  idx[L.name] = { ms: Math.round(L.lastT), n: L.count };
  ST.writeJSON(INDEX, idx);
  log({ evt: "stop", reason: L.reason, name: L.name, n: L.count, counts: L.counts, bytes: L.written, writes: L.writes, dropped: L.dropped });
  if (reason === "kill") return;
  if (L.reason === "full") E.showAlert("storage full", "Logging stopped").then(recMenu);
  else if (L.reason === "battery") E.showAlert("battery low", "Logging stopped").then(recMenu);
  else recMenu();
}

// ---- screens ----
function drawLog() {
  var r = Bangle.appRect, x = r.x + 6, y = r.y + 4, L = logger;
  if (!L) return;
  var free = ST.getFree();
  g.reset().clearRect(r).setFont("6x8", 2).setFontAlign(-1, -1);
  g.drawString("REC " + (cfg.label || "no label"), x, y);
  g.setFont("Vector", 30).drawString(hms(L.elapsed(getTime() * 1000)), x, y + 20);
  g.setFont("6x8", 2);
  g.drawString(L.count + " samples", x, y + 58);
  g.drawString("used " + kb(L.written + L.pending()), x, y + 78);
  g.drawString("free " + kb(free), x, y + 98);
  g.drawString("bat " + E.getBattery() + "%", x, y + 118);
  g.setFont("6x8").drawString("hold BTN: stop, tap: menu", x, r.y2 - 10);
  log({ evt: "draw", screen: "log", n: L.count, used: L.written + L.pending(), free: free });
}

function logScreen() {
  screen = "log";
  Bangle.setUI({
    mode: "custom",
    touch: function () { if (logger) stopMenu(); },
    remove: function () { if (btnWatch) clearWatch(btnWatch); btnWatch = undefined; }
  });
  btnWatch = setWatch(function (e) {
    log({ evt: "btn", state: e.state });
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = undefined;
    if (e.state) holdTimer = setTimeout(function () { holdTimer = undefined; stopLog("user"); }, LONG_MS);
  }, BTN1, { repeat: true, edge: "both", debounce: 25 });
  g.clear();
  Bangle.drawWidgets();
  drawLog();
}

function stopMenu() {
  screen = "menu";
  E.showMenu({
    "": { title: "Recording", back: logScreen },
    "Stop": function () { stopLog("user"); },
    "Continue": logScreen
  });
}

function choice(k) {
  var opts = D.RATES[k], i = 0;
  for (var j = 0; j < opts.length; j++) if (opts[j][0] === cfg[k]) i = j;
  return {
    value: i, min: 0, max: opts.length - 1,
    format: function (v) { return opts[v][1]; },
    onchange: function (v) { cfg[k] = opts[v][0]; }
  };
}

function mainMenu() {
  screen = "main";
  var ls = [""].concat(labels()), li = 0;
  for (var j = 0; j < ls.length; j++) if (ls[j] === cfg.label) li = j;
  var m = { "": { title: "Data logger", back: function () { load(); } } };
  SRC.forEach(function (k) { m[NAMES[k]] = choice(k); });
  m.Label = {
    value: li, min: 0, max: ls.length - 1,
    format: function (v) { return ls[v] || "none"; },
    onchange: function (v) { cfg.label = ls[v]; }
  };
  m.Start = startLog;
  m.Recordings = recMenu;
  m["Export (PC)"] = exportScreen;
  E.showMenu(m);
}

function recMenu() {
  screen = "recs";
  var names = D.list(ST).reverse(), idx = index();
  if (!names.length) return E.showMenu({ "": { title: "Recordings", back: mainMenu }, "(none)": mainMenu });
  E.showScroller({
    h: 40, c: names.length,
    draw: function (i, r) {
      var n = names[i], e = idx[n], bytes = ST.open(n, "r").getLength();
      g.setFont("6x8", 2).setFontAlign(-1, -1).drawString(n.substr(4), r.x + 4, r.y + 3);
      g.setFont("6x8").drawString(kb(bytes) + "  " + (e ? hms(e.ms) : "?:??") + (e ? "  " + e.n + " samples" : ""), r.x + 4, r.y + 25);
      g.drawLine(r.x, r.y + r.h - 1, r.x + r.w - 1, r.y + r.h - 1);
    },
    select: function (i) { recDetail(names[i]); },
    back: mainMenu
  });
  log({ evt: "recs", names: names });
}

function recDetail(n) {
  screen = "detail";
  var e = index()[n];
  if (!e) { var inf = D.info(ST, n); e = { ms: inf.ms, n: inf.n }; }
  var m = { "": { title: n.substr(4), back: recMenu } };
  m[kb(ST.open(n, "r").getLength())] = function () {};
  m[hms(e.ms) + ", " + e.n + " samples"] = function () {};
  m.Delete = function () { confirmDelete(n); };
  E.showMenu(m);
}

function confirmDelete(n) {
  screen = "confirm";
  E.showPrompt("Delete " + n.substr(4) + "?", { title: "Delete", buttons: { "Yes": true, "No": false } }).then(function (yes) {
    if (yes) {
      ST.open(n, "r").erase();
      var idx = index();
      delete idx[n];
      ST.writeJSON(INDEX, idx);
    }
    log({ evt: yes ? "delete" : "keep", name: n });
    recMenu();
  });
}

// The console normally owns the UART input, so export mode moves it to
// LoopbackA and handles the raw lines itself; leaving export restores it.
function exportScreen() {
  screen = "export";
  var st = { prev: E.getConsole(), devs: [] };
  [typeof Bluetooth === "undefined" ? undefined : Bluetooth, typeof USB === "undefined" ? undefined : USB].forEach(function (dev) {
    if (!dev || typeof dev.on !== "function" || typeof dev.write !== "function") return;
    var srv = D.createServer({
      storage: ST,
      write: function (s) { dev.write(s); },
      defer: function (fn) { setTimeout(fn, 20); }
    });
    var h = function (d) { log({ evt: "cmd", data: d }); srv.feed(d); };
    dev.on("data", h);
    st.devs.push({ dev: dev, h: h, srv: srv });
  });
  exportState = st;
  E.setConsole("LoopbackA", { force: true });
  log({ evt: "export", on: true, prev: st.prev });
  Bangle.setUI({ mode: "custom", back: function () { exportStop(); mainMenu(); }, remove: exportStop });
  var r = Bangle.appRect;
  g.reset().clearRect(r).setFontAlign(0, -1).setFont("6x8", 2);
  g.drawString("Export mode", r.x + r.w / 2, r.y + 10);
  g.setFont("6x8").drawString("Connect from the PC page\nand choose a recording.\n\n" + D.list(ST).length + " recording(s)\n\nIDE console is off here.\nBTN: back", r.x + r.w / 2, r.y + 40);
}

function exportStop() {
  var st = exportState;
  if (!st) return;
  exportState = undefined;
  st.devs.forEach(function (d) { d.dev.removeListener("data", d.h); });
  E.setConsole(st.prev);
  log({ evt: "export", on: false });
}

E.on("kill", function () {
  exportStop();
  stopLog("kill");
  log({ evt: "kill" });
});

Bangle.loadWidgets();
Bangle.drawWidgets();
mainMenu();
