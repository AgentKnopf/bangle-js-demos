// Step 6: the step 5 app plus a JSON log of every step and checked pattern JSON
var DEBUG = true;       // one JSON line per step in the console
var H = require("haptic");
var G = require("gestures");
var CAP = 1;            // the real app lets you pick 25/50/75/100 % in the menu
var playing = null;     // {name, step, started, lowBattery} for the play screen
var menuTimer;

function log(o) { if (DEBUG) print(JSON.stringify(o)); }
function motorOff() { digitalWrite(VIBRATE, 0); }   // stop at once, don't queue a buzz

function drawPlay() {
  var s = playing.step ? playing.step.sEff : 0;     // strength after cap and battery rules
  g.reset().clear().setFontAlign(0, 0).setFont("Vector", 22).drawString(playing.name, 88, 18);
  g.drawRect(20, 40, 156, 80);
  if (s > 0) g.fillRect(22, 42, 22 + Math.round(132 * s), 78);
  g.setFont("6x8", 2).drawString(Math.round(s * 100) + "%", 88, 94);
  g.drawString(((playing.done ? playing.elapsed : Date.now() - playing.started) / 1000).toFixed(1) + " s", 88, 114);
  g.setFont("6x8", 1).drawString(!playing.done ? "tap or button: stop" : playing.done === "end" ? "done" : "stopped: " + playing.done, 88, 150);
  if (playing.lowBattery) g.drawString("Low battery: max 50%", 88, 164);
}

var player = H.createPlayer({
  motor: { on: function (ms, s) { return Bangle.buzz(ms, s); }, off: motorOff },
  log: log,
  onStep: function (st) { if (playing) { playing.step = st; drawPlay(); } },
  onDone: function (reason) {
    if (!playing) return;
    playing.done = reason; playing.step = null; playing.elapsed = Date.now() - playing.started;
    drawPlay();
    menuTimer = setTimeout(showMenu, 1000);              // back to the menu after a second
  }
});

var rec = G.create({ instantTap: true });              // tap reported on release, no waiting
rec.on("gesture", function () { if (player.isPlaying()) player.stop(); });

function play(p) {
  if (menuTimer) clearTimeout(menuTimer);
  var battery = E.getBattery();
  E.showMenu();                                        // close the menu and free its handlers
  playing = { name: p.name, step: null, started: Date.now(), lowBattery: battery < H.LIMITS.LOW_BATTERY };
  Bangle.setUI({
    mode: "custom",
    drag: function (e) { rec.feed({ x: e.x, y: e.y, b: e.b, t: getTime() * 1000 }); },
    btn: function () { if (player.isPlaying()) player.stop(); else showMenu(); }
  });
  rec.reset();
  drawPlay();
  var err = player.play(p, { cap: CAP, battery: battery, seed: Math.round(Math.random() * 1e6) });
  if (err) showError(err);
}

function showError(msg) {
  playing = null;
  E.showMessage(msg, "Invalid pattern");
  Bangle.setUI({ mode: "custom", btn: showMenu, touch: showMenu });
}

// Play pattern JSON text from the IDE: playJSON('{"name":"x","steps":[[100,1]]}')
function playJSON(text) {
  var r = H.parse(text);
  if (r.error) { log({ evt: "error", msg: r.error }); showError(r.error); return r.error; }
  play(r.pattern);
}

function showMenu() {
  if (player.isPlaying()) player.stop();
  if (menuTimer) clearTimeout(menuTimer);
  menuTimer = undefined;
  playing = null;
  var m = { "": { title: "Haptics", back: function () { load(); } } };
  H.BUILTINS.forEach(function (p) { m[p.name] = function () { play(p); }; });
  E.showMenu(m);
}

E.on("kill", function () { if (player.isPlaying()) player.stop(); motorOff(); });
showMenu();
