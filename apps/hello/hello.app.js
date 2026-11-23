// Hello harness: tap the screen to count, the count resets after a minute
// without taps, the button returns to the launcher.
var DEBUG = false;
var H = require("hello");
var counter = H.create();
var resetTimer;

function log(o) { if (DEBUG) console.log(JSON.stringify(o)); }

function draw() {
  var r = Bangle.appRect;
  g.reset().clearRect(r);
  g.setFontAlign(0, 0).setFont("Vector", 56).drawString(counter.count(), r.x + r.w / 2, r.y + r.h / 2 - 10);
  g.setFont("6x8", 2).drawString(H.label(counter.count()), r.x + r.w / 2, r.y2 - 20);
}

function onTap() {
  var n = counter.tap(Date.now());
  log({ evt: "tap", n: n });
  draw();
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(function () {
    resetTimer = undefined;
    if (counter.tick(Date.now())) { log({ evt: "reset" }); draw(); }
  }, H.RESET_MS);
}

E.on("kill", function () {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = undefined;
  log({ evt: "kill", n: counter.count() });
});

Bangle.setUI({ mode: "custom", touch: onTap, btn: function () { load(); } });
Bangle.loadWidgets();
Bangle.drawWidgets();
draw();
