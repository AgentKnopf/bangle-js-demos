// gest.app.js, step 5: a Manage page for the uploaded model
Bangle.setPollInterval(80); // 12.5 Hz, the rate the model will be trained at
var LABELS = ["none", "flick-left", "flick-right", "twist", "raise", "shake"];
var N = 19, det, rec;

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
  Bangle.setUI();
  E.showMenu({
    "": { title: "Gestures" },
    "Record": recMenu,
    "Run": function () { E.showAlert("comes in step 6").then(showMenu); },
    "Manage": manageMenu,
    "Exit": function () { load(); }
  });
}

Bangle.loadWidgets();
Bangle.drawWidgets();
showMenu();
