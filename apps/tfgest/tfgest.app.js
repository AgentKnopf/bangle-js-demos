// TensorFlow Lite wrist gestures: record labelled gesture windows, run a
// model trained on the PC, manage model and recordings.
// Main menu: Record / Run / Manage / Exit. In Record and Run the button goes back to the menu.
var DEBUG = false;
var G = require("tfgest");
var S = require("Storage");
var META = "gestmodel.json", MODEL = ".tfmodel", TW = "tfgest.tw.json";
var mode = "menu", det, model, state = {}, rec = {}, shown, lastTop = [];

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }
function meta() { return S.readJSON(META, true); }
function labels() { var m = meta(); return (m && m.labels) || G.LABELS; }
function recFile(label) { return "gest." + label; }

function countRecs(label) {
  var f = S.open(recFile(label), "r"), n = 0, l;
  while ((l = f.readLine()) !== undefined) if (l.charAt(l.length - 1) === "\n") n++;
  return n;
}

// Sensor input. Tests call feed() with explicit timestamps.
function feed(a, t) { if (det) det.feed(a, t); }
function onAccel(a) { feed(a, Date.now()); }
function listen(on) {
  Bangle.removeListener("accel", onAccel);
  if (on) Bangle.on("accel", onAccel);
}

function title(s) {
  var r = Bangle.appRect;
  g.reset().clearRect(r).setFont("6x8", 2).setFontAlign(0, -1).drawString(s, r.x + r.w / 2, r.y + 2);
  return r;
}

// ---- Record ----
function drawRec(msg) {
  var r = title("Record");
  g.setFont("Vector", 26).drawString(rec.label, r.x + r.w / 2, r.y + 30);
  g.setFont("6x8", 2).drawString(rec.count + " saved", r.x + r.w / 2, r.y + 66);
  g.setFont("6x8").drawString(msg, r.x + r.w / 2, r.y + 96);
  g.drawString("tap: arm  btn: back", r.x + r.w / 2, r.y2 - 12);
}

function armRec() {
  if (rec.armed) return;
  rec.armed = true;
  var t = Date.now();
  // "none" is captured at once; gestures at the next motion onset, or after 3 s
  det.arm(rec.label === "none" ? t : t + 3000);
  Bangle.buzz(60);
  log({ evt: "arm", label: rec.label });
  drawRec("armed: move now");
}

function onRecWindow(xyz, t) {
  rec.armed = false;
  var line = G.encode(rec.label, xyz, t, G.HZ);
  S.open(recFile(rec.label), "a").write(line + "\n");
  rec.count++;
  log({ evt: "rec", label: rec.label, n: xyz.length / 3, count: rec.count });
  Bangle.buzz(60).then(function () { setTimeout(function () { Bangle.buzz(60); }, 150); });
  drawRec("saved");
}

function startRec(label) {
  mode = "rec";
  rec = { label: label, count: countRecs(label), armed: false };
  det = G.detector({ armedOnly: true, onWindow: onRecWindow });
  listen(true);
  Bangle.setUI({ mode: "custom", touch: armRec, btn: showMenu });
  drawRec("");
}

function recMenu() {
  var m = { "": { title: "Record" }, "< Back": showMenu };
  labels().forEach(function (l) { m[l + " (" + countRecs(l) + ")"] = function () { startRec(l); }; });
  E.showMenu(m);
}

// ---- Run ----
function drawRun(err) {
  var r = title("Run");
  var cx = r.x + r.w / 2;
  if (err) {
    g.setFont("Vector", 26).drawString(err === "no model" ? "no model" : "error", cx, r.y + 40);
    if (err !== "no model") g.setFont("6x8").drawString(g.wrapString(err, r.w - 8).join("\n"), cx, r.y + 76);
    else g.setFont("6x8").drawString("train one on the PC,\nupload tfgest-model.js", cx, r.y + 76);
    return;
  }
  g.setFont("Vector", 30).drawString(shown || "...", cx, r.y + 30);
  g.setFont("6x8").setFontAlign(-1, -1);
  lastTop.forEach(function (e, i) {
    var y = r.y + 80 + i * 16;
    g.drawString(e.name, r.x + 6, y);
    g.drawRect(r.x + 80, y, r.x2 - 6, y + 8).fillRect(r.x + 80, y, r.x + 80 + Math.round((r.w - 86) * e.p), y + 8);
  });
}

function loadModel() {
  var tfLib;
  try { tfLib = require("tensorflow"); } catch (e) { tfLib = undefined; }
  var raw = S.read(MODEL);
  // a RAM copy: the interpreter needs a flat string, Storage.read returns a flash string
  return G.load(tfLib, raw && E.toString(raw), meta(), G.HZ);
}

function onRunWindow(xyz, t) {
  var t0 = getTime();
  G.fill(model.inp, xyz, model.meta);
  try { model.tf.invoke(); } catch (e) { log({ evt: "error", msg: String(e.message || e) }); return; }
  var p = G.probs(model.out, model.meta), ms = Math.round((getTime() - t0) * 1000);
  lastTop = G.top(p, model.meta.labels, 3);
  log({ evt: "infer", t: t, ms: ms, top: lastTop });
  var name = G.decide(lastTop[0], model.meta, t, state, 1000);
  if (name) {
    shown = name;
    det.hold(t + 1000);           // refractory period after a detection
    log({ evt: "detect", t: t, name: name, p: lastTop[0].p });
    Bangle.buzz(80);
  }
  drawRun();
}

function startRun() {
  mode = "run";
  shown = undefined; lastTop = []; state = {};
  var m = loadModel();
  Bangle.setUI({ mode: "custom", btn: showMenu });
  if (m.err) { model = undefined; log({ evt: "run", err: m.err }); drawRun(m.err); return; }
  model = m; model.meta = meta();
  det = G.detector({ onWindow: onRunWindow });
  listen(true);
  log({ evt: "run", labels: model.meta.labels });
  drawRun();
}

// Runs the stored test windows (from train.py) through the model: compares the
// top class with the PC's and reports the slowest inference time.
function selfTest() {
  var m = loadModel(), tw = S.readJSON(TW, true);
  if (m.err || !tw) { E.showAlert(m.err || "no test windows").then(manageMenu); return; }
  var md = meta(), same = 0, maxMs = 0, res = [];
  tw.windows.forEach(function (w) {
    var t0 = getTime();
    G.fill(m.inp, w.xyz, md);
    m.tf.invoke();
    var ms = (getTime() - t0) * 1000, best = G.top(G.probs(m.out, md), md.labels, 1)[0];
    if (ms > maxMs) maxMs = ms;
    var pc = md.quant === "float" ? w.pcFloat : w.pcInt8;
    if (best.name === pc) same++;
    res.push(best.name);
  });
  m = undefined;
  log({ evt: "selftest", same: same, total: tw.windows.length, maxMs: Math.round(maxMs), got: res });
  E.showAlert(same + "/" + tw.windows.length + " match PC\nmax " + Math.round(maxMs) + " ms").then(manageMenu);
}

// ---- Manage ----
function deleteRecs() {
  E.showPrompt("Delete all\nrecordings?").then(function (yes) {
    if (yes) {
      S.list(/^gest\./, { sf: true }).forEach(function (f) { S.open(f, "r").erase(); });
      log({ evt: "deleted" });
    }
    manageMenu();
  });
}

function manageMenu() {
  mode = "manage";
  var md = meta(), raw = S.read(MODEL), n = 0;
  labels().forEach(function (l) { n += countRecs(l); });
  var m = { "": { title: "Manage" }, "< Back": showMenu };
  m["Model " + (raw ? raw.length + " B" : "none")] = function () {};
  if (md && md.labels) {
    m["Input " + md.n + "x3 " + (md.quant || "")] = function () {};
    m[md.labels.length + " labels"] = function () { E.showAlert(md.labels.join("\n")).then(manageMenu); };
  }
  m["Recordings " + n] = function () {};
  m["Test windows"] = selfTest;
  m["Delete recordings"] = deleteRecs;
  E.showMenu(m);
}

// ---- Menu ----
function stop() {
  listen(false);
  det = undefined;
  model = undefined;    // frees the interpreter and its arena
}

function showMenu() {
  stop();
  mode = "menu";
  Bangle.setUI();
  E.showMenu({
    "": { title: "TF gestures" },
    "Record": recMenu,
    "Run": startRun,
    "Manage": manageMenu,
    "Exit": function () { load(); }
  });
}

E.on("kill", stop);
Bangle.setPollInterval(80); // 12.5 Hz, the rate the model was trained at
Bangle.loadWidgets();
Bangle.drawWidgets();
showMenu();
