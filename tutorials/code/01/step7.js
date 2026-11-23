// Step 7: the gesture module in a small app (a cut-down touchgest.app.js)
var G = require("gestures");
var rec = G.create();                       // or G.create({ instantTap: true, LONG_MS: 800 })
var savedLockTimeout = Bangle.getOptions().lockTimeout;

function show(ev) {
  g.reset().clear().setFont("Vector", 24).setFontAlign(0, 0);
  g.drawString(ev.type.toUpperCase() + (ev.dir ? "\n" + ev.dir.toUpperCase() : ""), 88, 60);
  if (ev.speed !== undefined) g.setFont("6x8", 2).drawString(ev.dist + " px " + ev.dur + " ms\n" +
    ev.speed + " px/s\n" + ev.speedClass, 88, 135);
}
rec.on("gesture", function (ev) { print(JSON.stringify(ev)); show(ev); });

function onLock(locked) { if (locked) rec.reset(); }   // drop a half-done gesture
E.on("kill", function () {                               // leaving the app: put things back
  Bangle.removeListener("lock", onLock);
  Bangle.setOptions({ lockTimeout: savedLockTimeout });
});

Bangle.setOptions({ lockTimeout: 0 });                   // the touchscreen is off while locked
Bangle.setLocked(false);
Bangle.on("lock", onLock);
Bangle.setUI({
  mode: "custom",
  drag: function (e) { rec.feed({ x: e.x, y: e.y, b: e.b, t: getTime() * 1000 }); },
  btn: function () { load(); }
});
g.clear().setFont("6x8", 2).setFontAlign(0, 0).drawString("tap, hold\nor swipe", 88, 88);
