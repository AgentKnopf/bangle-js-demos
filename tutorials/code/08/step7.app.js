// gest.app.js, step 7: none, threshold and refractory time turn scores into events
Bangle.setPollInterval(80); // 12.5 Hz, the rate the model will be trained at
var LABELS = ["none", "flick-left", "flick-right", "twist", "raise", "shake"];
var N = 19, det, rec, model, shown, top = [], state = {};

function i8(g) { var v = Math.round(g * 100); return v < -128 ? -128 : v > 127 ? 127 : v; } // g x 100 as int8

// Motion-onset detector: while armed, a window starts when |a| leaves 1 g +/- 0.3 g
// (or at once if d.now), and keeps the 3 samples from before the onset.
function detector(onWindow) {
  var pre = [], win = null, d = { armed: true, now: false };
  d.feed = function (a) {
    var s = [i8(a.x), i8(a.y), i8(a.z)];
    if (!win && d.armed && (d.now || Math.abs(a.mag - 1) > 0.3)) win = pre.slice();
    if (win) {
      win.push(s);
      if (win.length == N) { var w = win; win = null; pre = []; onWindow(w); }
    } else { pre.push(s); if (pre.length > 3) pre.shift(); }
  };
  return d;
}

function countRecs(label) { // complete lines only: a cut-off last line doesn't count
  var f = require("Storage").open("gest." + label, "r"), n = 0, l;
  while ((l = f.readLine()) !== undefined) if (l.charAt(l.length - 1) == "\n") n++;
  return n;
}

function onAccel(a) { if (det) det.feed(a); }
Bangle.on("accel", onAccel);

function drawRec(msg) {
  var r = Bangle.appRect, cx = r.x + r.w / 2;
  g.reset().clearRect(r).setFontAlign(0, -1).setFont("6x8", 2).drawString("Record", cx, r.y + 2);
  g.setFont("Vector", 26).drawString(rec.label, cx, r.y + 30);
  g.setFont("6x8", 2).drawString(rec.count + " saved", cx, r.y + 66);
  g.setFont("6x8").drawString(msg, cx, r.y + 96).drawString("tap: arm  btn: back", cx, r.y2 - 12);
}

function onRecWindow(w) {
  det.armed = false;
  var xyz = [];
  w.forEach(function (s) { xyz.push(s[0], s[1], s[2]); });
  var line = JSON.stringify({ v: 1, label: rec.label, hz: 12.5, n: N, t: Date.now(), xyz: xyz });
  require("Storage").open("gest." + rec.label, "a").write(line + "\n");
  rec.count++;
  Bangle.buzz(60).then(function () { setTimeout(function () { Bangle.buzz(60); }, 150); }); // two buzzes: saved
  drawRec("saved");
}

function startRec(label) {
  rec = { label: label, count: countRecs(label) };
  det = detector(onRecWindow);
  det.armed = false;
  Bangle.setUI({ mode: "custom", btn: showMenu, touch: function () {
    if (det.armed) return;
    det.armed = true;
    det.now = label == "none"; // "none" records whatever happens next
    Bangle.buzz(60);           // one buzz: armed
    drawRec("armed: move now");
  } });
  drawRec("");
}

function recMenu() {
  var m = { "": { title: "Record" }, "< Back": showMenu };
  LABELS.forEach(function (l) { m[l + " (" + countRecs(l) + ")"] = function () { startRec(l); }; });
  E.showMenu(m);
}

function loadModel() { // returns {tf, inp, out, meta} or {err}; never throws
  var S = require("Storage"), meta = S.readJSON("gestmodel.json", true), raw = S.read(".tfmodel"), tf;
  if (!raw || !meta) return { err: "no model" };
  try {
    tf = require("tensorflow").create(meta.arena, E.toString(raw)); // needs a flat string in RAM
  } catch (e) { return { err: String(e.message || e) }; }
  var inp = tf.getInput(), out = tf.getOutput();
  if (out.length != meta.labels.length)
    return { err: "model has " + out.length + " outputs, gestmodel.json " + meta.labels.length + " labels" };
  if (inp.length != meta.n * 3) return { err: "model input " + inp.length + ", expected " + meta.n * 3 };
  return { tf: tf, inp: inp, out: out, meta: meta };
}

function drawRun(big, small) {
  var r = Bangle.appRect, cx = r.x + r.w / 2;
  g.reset().clearRect(r).setFontAlign(0, -1).setFont("6x8", 2).drawString("Run", cx, r.y + 2);
  g.setFont("Vector", 26).drawString(big, cx, r.y + 30);
  if (small) g.setFont("6x8").drawString(g.wrapString(small, r.w - 8).join("\n"), cx, r.y + 70);
}

function decide(best, t, state) { // best = {name, p}
  if (best.name == "none" || best.p <= model.meta.thresh) return "";
  if (state.last !== undefined && t - state.last < 1000) return ""; // refractory: 1 s
  state.last = t;
  return best.name;
}

function drawTop() { // the detected gesture, and the top 3 scores of the last window
  var r = Bangle.appRect, cx = r.x + r.w / 2;
  g.reset().clearRect(r).setFontAlign(0, -1).setFont("6x8", 2).drawString("Run", cx, r.y + 2);
  g.setFont("Vector", 30).drawString(shown || "...", cx, r.y + 30);
  g.setFont("6x8").setFontAlign(-1, -1);
  top.forEach(function (e, i) {
    var y = r.y + 80 + i * 16;
    g.drawString(e.name, r.x + 6, y);
    g.drawRect(r.x + 80, y, r.x2 - 6, y + 8).fillRect(r.x + 80, y, r.x + 80 + Math.round((r.w - 86) * e.p), y + 8);
  });
}

function onRunWindow(w) {
  var m = model, k = 0, i;
  w.forEach(function (s) { // the same normalisation as on the PC
    for (var j = 0; j < 3; j++) m.inp[k++] = Math.max(-1.27, Math.min(1.27, s[j] * m.meta.scale));
  });
  var t0 = getTime();
  m.tf.invoke();
  console.log("inference", Math.round((getTime() - t0) * 1000), "ms");
  top = [];
  for (i = 0; i < m.out.length; i++) top.push({ name: m.meta.labels[i], p: m.out[i] });
  top.sort(function (a, b) { return b.p - a.p; });
  top = top.slice(0, 3);
  var name = decide(top[0], Date.now(), state);
  if (name) {
    shown = name;
    Bangle.buzz(80);
    det.armed = false; // refractory: ignore movement for 1 s
    setTimeout(function () { if (det) det.armed = true; }, 1000);
  }
  drawTop();
}

function startRun() {
  var m = loadModel();
  Bangle.setUI({ mode: "custom", btn: showMenu });
  if (m.err == "no model") return drawRun("no model", "train one on the PC, upload tfgest-model.js");
  if (m.err) return drawRun("error", m.err);
  model = m;
  shown = undefined; top = []; state = {};
  det = detector(onRunWindow);
  drawTop();
}

function manageMenu() {
  var S = require("Storage"), md = S.readJSON("gestmodel.json", true), raw = S.read(".tfmodel"), n = 0;
  LABELS.forEach(function (l) { n += countRecs(l); });
  var m = { "": { title: "Manage" }, "< Back": showMenu };
  m["Model " + (raw ? raw.length + " B" : "none")] = function () {};
  if (md) {
    m["Input " + md.n + "x3 " + md.quant] = function () {};
    m[md.labels.length + " labels"] = function () { E.showAlert(md.labels.join("\n")).then(manageMenu); };
  }
  m["Recordings " + n] = function () {};
  E.showMenu(m);
}

function showMenu() {
  det = undefined;
  model = undefined; // drops the interpreter, which frees its arena
  Bangle.setUI();
  E.showMenu({
    "": { title: "Gestures" },
    "Record": recMenu,
    "Run": startRun,
    "Manage": manageMenu,
    "Exit": function () { load(); }
  });
}

Bangle.loadWidgets();
Bangle.drawWidgets();
showMenu();
