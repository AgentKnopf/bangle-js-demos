// Step 2: a pattern as data, played from a fixed start time
var RAMP = { name: "ramp up", steps: [[150, 0.2], [50, 0], [150, 0.4], [50, 0], [150, 0.6], [50, 0], [150, 0.8], [50, 0], [300, 1.0]] };
var timer;

function draw(name, i, s, t, note) {
  g.reset().clear().setFontAlign(0, 0).setFont("Vector", 22).drawString(name, 88, 20);
  g.drawRect(20, 45, 156, 85);
  if (s > 0) g.fillRect(22, 47, 22 + Math.round(132 * s), 83);
  g.setFont("6x8", 2).drawString("step " + i + "  " + Math.round(s * 100) + "%", 88, 105);
  g.drawString(t + " ms", 88, 128);
  g.setFont("6x8", 1).drawString(note, 88, 160);
}

function playSteps(p) {
  if (timer) clearTimeout(timer);
  var steps = p.steps, start = Date.now(), at = 0, i = 0;
  function next() {
    var t = Math.round(Date.now() - start);
    if (i >= steps.length) { timer = undefined; draw(p.name, i, 0, t, "done, tap to replay"); return; }
    var st = steps[i++];
    if (st[1] > 0) Bangle.buzz(st[0], st[1]);
    print("step", i - 1, st[0], "ms at", st[1], "t", t);
    draw(p.name, i - 1, st[1], t, "playing");
    at += st[0];
    timer = setTimeout(next, Math.max(0, start + at - Date.now()));   // absolute time, no drift
  }
  next();
}

Bangle.setUI({ mode: "custom", touch: function () { playSteps(RAMP); }, btn: function () { load(); } });
playSteps(RAMP);
