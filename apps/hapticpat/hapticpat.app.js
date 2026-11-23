// Haptic pattern player: pick a pattern from the menu, feel it, tap the screen
// or press the button to stop. Safety limits live in the "haptic" module.
var DEBUG = false;
var H = require("haptic");
var G = require("gestures");
var SETTINGS = "hapticpat.json";
var CUSTOM = "hapticpat.pat.json";  // optional pattern JSON uploaded by the user
var CAPS = [0.25, 0.5, 0.75, 1];
var settings = require("Storage").readJSON(SETTINGS, 1) || {};
if (CAPS.indexOf(settings.cap) < 0) settings.cap = 1;
var seed = 1;           // drifting rhythm seed; changes each play so it never feels the same
var playing = null;     // {name, step, lowBattery} for the play screen
var uiTimer, menuTimer;

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }

// Bangle.buzz(0) is a 200 ms buzz, not "off", and a second buzz call queues
// behind the first, so stopping drives the motor pin low directly.
function motorOff() { if (typeof VIBRATE !== "undefined") digitalWrite(VIBRATE, 0); }

var player = H.createPlayer({
  motor: { on: function (ms, s) { return Bangle.buzz(ms, s); }, off: motorOff },
  now: function () { return Date.now(); },
  log: log,
  onStep: function (st) { if (playing) { playing.step = st; drawPlay(); } },
  onDone: function (reason) {
    if (uiTimer) clearInterval(uiTimer);
    uiTimer = undefined;
    if (!playing) return;
    playing.done = reason;
    playing.step = null;
    playing.elapsed = Date.now() - playing.started;
    drawPlay();
    if (menuTimer) clearTimeout(menuTimer);
    menuTimer = setTimeout(function () { menuTimer = undefined; showMenu(); }, 1000);
  }
});

var rec = G.create({ instantTap: true });
rec.on("gesture", function (ev) {
  if (player.isPlaying()) { log({ evt: "touchstop", type: ev.type }); player.stop(); }
});

function drawPlay() {
  var r = Bangle.appRect, cx = r.x + r.w / 2;
  g.reset().clearRect(r);
  g.setFontAlign(0, 0).setFont("Vector", 22).drawString(playing.name, cx, r.y + 18);
  var s = playing.step ? playing.step.sEff : 0;
  var bx = r.x + 20, bw = r.w - 40, by = r.y + 40, bh = 40;
  g.drawRect(bx, by, bx + bw, by + bh);
  if (s > 0) g.fillRect(bx + 2, by + 2, bx + 2 + Math.round((bw - 4) * s), by + bh - 2);
  g.setFont("6x8", 2).drawString(Math.round(s * 100) + "%", cx, by + bh + 14);
  var el = playing.done ? playing.elapsed : player.elapsed();
  g.drawString((el / 1000).toFixed(1) + " s", cx, by + bh + 34);
  g.setFont("6x8", 1);
  if (playing.done) g.drawString(playing.done === "end" ? "done" : playing.done === "limit" ? "stopped: 60 s limit" : "stopped", cx, r.y2 - 22);
  else g.drawString("tap or button: stop", cx, r.y2 - 22);
  if (playing.lowBattery) g.drawString("Low battery: max 50%", cx, r.y2 - 8);
  else g.drawString("cap " + Math.round(settings.cap * 100) + "%", cx, r.y2 - 8);
}

function showError(msg) {
  playing = null;
  E.showMessage(msg, "Invalid pattern");
  Bangle.setUI({ mode: "custom", btn: showMenu, touch: showMenu });
}

function play(p) {
  if (menuTimer) clearTimeout(menuTimer);
  menuTimer = undefined;
  var battery = E.getBattery();
  E.showMenu();  // close the menu and free its handlers
  playing = { name: p.name || "pattern", step: null, started: Date.now(), lowBattery: battery < H.LIMITS.LOW_BATTERY };
  Bangle.setUI({
    mode: "custom",
    drag: function (e) { rec.feed({ x: e.x, y: e.y, b: e.b, t: getTime() * 1000 }); },
    btn: function () { if (player.isPlaying()) player.stop(); else showMenu(); }
  });
  rec.reset();
  drawPlay();
  var err = player.play(p, { cap: settings.cap, battery: battery, seed: seed++ });
  if (err) { showError(err); return err; }
  if (player.isPlaying()) uiTimer = setInterval(drawPlay, 200);
  return null;
}

// Play pattern JSON text, e.g. from the IDE: playJSON('{"name":"x","steps":[[100,1]]}')
function playJSON(text) {
  var r = H.parse(text);
  if (r.error) { log({ evt: "error", msg: r.error }); showError(r.error); return r.error; }
  return play(r.pattern);
}

function showMenu() {
  if (player.isPlaying()) player.stop();
  if (menuTimer) clearTimeout(menuTimer);
  menuTimer = undefined;
  playing = null;
  var m = { "": { title: "Haptics", back: function () { load(); } } };
  H.BUILTINS.forEach(function (p) { m[p.name] = function () { play(p); }; });
  if (require("Storage").read(CUSTOM) !== undefined) {
    m["custom"] = function () { playJSON(require("Storage").read(CUSTOM)); };
  }
  m["Strength cap"] = {
    value: CAPS.indexOf(settings.cap), min: 0, max: CAPS.length - 1,
    format: function (v) { return Math.round(CAPS[v] * 100) + "%"; },
    onchange: function (v) {
      settings.cap = CAPS[v];
      require("Storage").writeJSON(SETTINGS, settings);
      log({ evt: "cap", cap: settings.cap });
    }
  };
  E.showMenu(m);
}

E.on("kill", function () {
  if (player.isPlaying()) player.stop();
  motorOff();
});

Bangle.loadWidgets();
Bangle.drawWidgets();
showMenu();
