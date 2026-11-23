// Step 4: a seeded, drifting rhythm; tap left: "ramp up", middle: "swell", right: drifting rhythm
function swell(levels, stepMs, gapMs, holdMs) {
  var steps = [], k;
  for (k = 1; k <= levels; k++) steps.push([stepMs, Math.round(k / levels * 100) / 100], [gapMs, 0]);
  steps.push([holdMs, 1], [gapMs, 0]);
  for (k = levels; k >= 1; k--) steps.push([stepMs, Math.round(k / levels * 100) / 100], [gapMs, 0]);
  steps.pop();                         // no gap at the very end
  return steps;
}
function random(seed) {            // Park-Miller: exact in doubles, same on every device
  var s = seed % 2147483647 || 1;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function drifting(seed) {
  var rnd = random(seed), steps = [];
  for (var c = 0; c < 12; c++) {
    var pause = Math.round(540 * (1 + (rnd() * 2 - 1) * 0.15));
    var odd = c % 4 === 3, how = odd ? (rnd() < 0.5 ? "skip" : "double") : "";
    if (how === "skip") { steps.push([800, 0]); continue; }
    if (how === "double") steps.push([80, 0.8], [120, 0], [60, 0.5], [120, 0]);
    steps.push([80, 0.8], [120, 0], [60, 0.5], [pause, 0]);
  }
  return steps;
}
var seed = 1;
var RAMP = { name: "ramp up", steps: [[150, 0.2], [50, 0], [150, 0.4], [50, 0], [150, 0.6], [50, 0], [150, 0.8], [50, 0], [300, 1.0]] };
var SWELL = { name: "swell", steps: swell(6, 150, 60, 400) };
var timer;

function draw(p, i, s, t, note) {
  g.reset().clear().setFontAlign(0, 0).setFont("Vector", 22).drawString(p.name, 88, 16);
  g.drawRect(20, 36, 156, 66);
  if (s > 0) g.fillRect(22, 38, 22 + Math.round(132 * s), 64);
  g.setFont("6x8", 2).drawString("step " + i + "  " + Math.round(s * 100) + "%", 88, 80);
  g.drawString(t + " ms", 88, 100);
  var total = 0, x = 4;
  p.steps.forEach(function (st) { total += st[0]; });
  p.steps.forEach(function (st) {      // the envelope: one bar per step, height = strength
    var w = st[0] * 168 / total;
    if (st[1] > 0) g.fillRect(x, 160 - Math.round(st[1] * 40), x + w - 1, 160);
    x += w;
  });
  var mx = 4 + Math.min(t, total) * 168 / total;
  g.setColor("#f00").drawLine(mx, 116, mx, 162);
  g.setColor(g.theme.fg).setFont("6x8", 1).drawString(note, 88, 170);
}

function playSteps(p) {
  if (timer) clearTimeout(timer);
  var steps = p.steps, start = Date.now(), at = 0, i = 0;
  function next() {
    var t = Math.round(Date.now() - start);
    if (i >= steps.length) { timer = undefined; draw(p, i, 0, t, "done: tap left, middle, right"); return; }
    var st = steps[i++];
    if (st[1] > 0) Bangle.buzz(st[0], st[1]);
    draw(p, i - 1, st[1], t, "playing");
    at += st[0];
    timer = setTimeout(next, Math.max(0, start + at - Date.now()));   // absolute time, no drift
  }
  next();
}

Bangle.setUI({
  mode: "custom",
  touch: function (btn, xy) {
    if (xy.x < 58) playSteps(RAMP);
    else if (xy.x < 118) playSteps(SWELL);
    else { playSteps({ name: "drift " + seed, steps: drifting(seed) }); seed++; }  // new seed each time
  },
  btn: function () { load(); }
});
playSteps({ name: "drift 42", steps: drifting(42) });
