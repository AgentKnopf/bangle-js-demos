# 02 — Designing vibration patterns

The Bangle.js 2 has one small vibration motor and no speaker, so buzzing is
how it gets your attention. In this tutorial you describe vibration patterns
as data (pulses, ramps, swells, rhythms that drift), play them with a tiny
player that keeps accurate time, and put safety limits in one place so a bad
pattern can't run the motor flat-out forever. Tapping the screen stops
playback, using the gesture module from tutorial 01.

![The swell pattern playing at 67 % strength](img/02/finished.png)

## What you need

- A Bangle.js 2, or just the [Espruino Web IDE](https://www.espruino.com/ide/) with its Bangle.js 2 emulator.
- Parts that need a real watch: **feeling** the patterns. The emulator accepts
  every `Bangle.buzz()` call but there is no motor, so you check timing and
  strengths from a log instead.
- Earlier tutorials this one reuses: [01 — Reading the touchscreen properly](01-touch-gestures.md) (tap to stop).

The finished app is in [`apps/hapticpat`](../apps/hapticpat): the patterns,
limits and player are in `haptic.lib.js`, the menu and screens in
`hapticpat.app.js`.

## 1. One buzz

`Bangle.buzz(time, strength)` runs the motor for `time` ms at `strength`
(0–1, default 1) and returns a Promise that resolves when it has finished:

```js
Bangle.buzz(200, 1).then(function () {
  print("first buzz done");
  return Bangle.buzz(100, 0.5);
}).then(function () { print("second buzz done"); });
print("this prints first: buzz() does not block");
```

Things worth knowing, checked against the Espruino source
(`libs/banglejs/jswrap_bangle.c`) and the emulator:

- `buzz()` returns at once; your code keeps running while the motor runs.
  That is asynchronous code on Espruino: Promises and timers, no threads.
- `time` is clamped to 1–5000 ms, and **`time` 0 means the default 200 ms**, so
  `Bangle.buzz(0)` is a buzz, not "stop".
- If you call `buzz()` while a buzz is still running, the firmware queues the
  new one after the current one (the Promises are chained). Calls never
  overlap, but a "stop" sent as a buzz would wait in the queue.
- Strength drives the motor's PWM duty cycle as `0.4 + 0.6 × strength`, so any
  strength above 0 gives at least 40 % duty. How weak a step you can still feel
  is a question for a real watch.
- In the emulator the Promise resolves immediately whatever `time` is. Code
  that waits for the Promise to time its steps would run far too fast there,
  so the player in this tutorial keeps its own time.

To switch the motor off immediately, drive its pin low:
`digitalWrite(VIBRATE, 0)`. Any buzz still queued finishes (silently) on its own.

**You learned:** `Bangle.buzz` is asynchronous and returns a Promise, and a
few of its edge cases.

## 2. Patterns as data

A pattern is a list of steps, each `[durationMs, strength]`; strength 0 is a
pause:

```json
{"name":"ramp up","repeat":1,
 "steps":[[150,0.2],[50,0],[150,0.4],[50,0],[150,0.6],[50,0],[150,0.8],[50,0],[300,1.0]]}
```

A tiny player walks the list. The trick is to schedule every step from the
**start time**, not by chaining "wait for the last one, then wait some
more": small delays in each timer would otherwise add up, and a 60 s pattern
would end noticeably late.

```js
function playSteps(steps) {
  var start = Date.now(), at = 0, i = 0;
  function next() {
    if (i >= steps.length) { print("done after", Date.now() - start, "ms"); return; }
    var st = steps[i++];
    if (st[1] > 0) Bangle.buzz(st[0], st[1]);
    print("step", i - 1, st[0], "ms at", st[1]);
    at += st[0];
    setTimeout(next, Math.max(0, start + at - Date.now()));   // absolute time, no drift
  }
  next();
}
playSteps([[150, 0.2], [50, 0], [150, 0.4], [50, 0], [150, 0.6], [50, 0], [150, 0.8], [50, 0], [300, 1.0]]);
```

Data is easier to change, store, send and check than code full of nested
`setTimeout`s. It also means every safety rule can live in the player,
whatever pattern you feed it.

**You learned:** separate the pattern (data) from playback (code), and
schedule from a fixed start time.

## 3. Strength envelopes

A ramp raises strength step by step. A *swell* ramps up, holds and ramps
down. The small motor reacts slowly, so back-to-back steps of different
strength blur into one buzz. A short gap between steps lets each level be felt
on its own:

```js
function swell(levels, stepMs, gapMs, holdMs) {
  var steps = [], k;
  for (k = 1; k <= levels; k++) steps.push([stepMs, Math.round(k / levels * 100) / 100], [gapMs, 0]);
  steps.push([holdMs, 1], [gapMs, 0]);
  for (k = levels; k >= 1; k--) steps.push([stepMs, Math.round(k / levels * 100) / 100], [gapMs, 0]);
  steps.pop();                         // no gap at the very end
  return steps;
}
print(JSON.stringify(swell(6, 150, 60, 400)));
```

That is the app's built-in `swell`: six levels up (0.17 … 1.0), a 400 ms hold,
six levels down, 60 ms gaps. Whether a tester can tell all six levels apart
is one of the hardware checks.

**You learned:** envelopes are just generated step lists, and gaps make steps
distinguishable on a small motor.

## 4. Rhythm and variation

A steady beat is a short step list repeated. The app's `rhythm` is
`[[80,0.8],[120,0],[60,0.5],[540,0]]` (a strong and a weak tap, 800 ms per
beat, 75 per minute) with `"repeat": 10`.

To make a beat feel alive, vary it: change each cycle's pause by up to
±15 %, and every 4th beat skip it or play it twice. Use a **seeded** random
generator rather than `Math.random()`, so the same seed always gives the same
pattern and a test can check it:

```js
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
print(JSON.stringify(drifting(42)) === JSON.stringify(drifting(42)));  // true
print(JSON.stringify(drifting(42)) === JSON.stringify(drifting(7)));   // false
```

In the app, patterns may have a `gen(seed)` function instead of `steps`; the
`drifting rhythm` built-in works that way, and the app uses a new seed each
time you play it.

**You learned:** deterministic randomness: variety for the user,
repeatability for tests.

## 5. Safety first

Patterns come from anywhere (a file, a phone, a typo), so the **player**
enforces the limits, not the patterns:

| Limit | Rule |
|---|---|
| Strength cap | every strength × the user's cap (25 / 50 / 75 / 100 %, in the menu) |
| Max on-time | no single "on" step longer than 1000 ms; longer ones are clamped |
| Duty cycle | in any rolling 10 s window the motor is on at most 60 % of the time; the player inserts pauses |
| Total time | 60 s per play, then stop with `done:limit` |
| Low battery | `E.getBattery() < 15`: strength capped at 0.5 and a note on screen |
| Stop | tap or button: motor off at once (`digitalWrite(VIBRATE, 0)`) |

The module applies all of them in one function, `planner()`, that turns a
pattern into the steps actually played, one at a time (so a long pattern
never sits in memory as a whole). With `haptic.lib.js` uploaded to Storage as
`haptic`:

```js
var H = require("haptic");
var p = H.plan({ name: "flat out", repeat: 20, steps: [[3000, 1]] }, { cap: 0.5, battery: 80 });
p.steps.slice(0, 9).forEach(function (s) { print(JSON.stringify(s)); });
print("ends at", p.end, "ms, limited:", p.limited);
```

You'll see each 3000 ms step clamped to 1000 ms (`clamped: 3000`), strength
0.5 instead of 1, and after six seconds of buzzing a `{pause: …, reason: "duty"}`
step, because a 10 s window may hold at most 6 s of motor time.

The duty rule only has to look at windows that **end** where an "on" step
ends: while the motor is on, the on-time in a trailing window can only grow,
so the end of each step is where a window is fullest. Before each on step the
planner checks that window and delays the step just enough.

Stopping is the one thing that must never wait. `player.stop()` clears the
timer and drives the motor pin low in the same call. In the app, tapping the
screen goes through the gesture module from tutorial 01 with `instantTap: true`,
so the tap is reported on release instead of after the double-tap window.
With both modules on the watch (`haptic`, and `gestures` from
`apps/touchgest/gestures.lib.js`), this plays `rhythm` until you tap:

```js
var H = require("haptic");
var player = H.createPlayer({
  motor: { on: function (ms, s) { return Bangle.buzz(ms, s); },
           off: function () { digitalWrite(VIBRATE, 0); } },
  log: function (o) { print(JSON.stringify(o)); }
});
var G = require("gestures");
var rec = G.create({ instantTap: true });
rec.on("gesture", function () { if (player.isPlaying()) player.stop(); });
Bangle.setUI({
  mode: "custom",
  drag: function (e) { rec.feed({ x: e.x, y: e.y, b: e.b, t: getTime() * 1000 }); },
  btn: function () { player.stop(); }
});
player.play(H.BUILTINS[4], { cap: 1, battery: E.getBattery() });
```

![Stopped by a tap](img/02/stopped.png) ![Low battery note](img/02/low-battery.png)

**You learned:** enforce limits in one place, between the data and the motor.

## 6. Testing without feeling

The emulator can't vibrate, and its `Bangle.buzz` Promise resolves at once.
What it *can* do is run the player in real firmware and log what it would
do. With `DEBUG` on, the player prints one JSON line per step and one at the
end:

```json
{"evt":"buzz","i":3,"ms":150,"s":0.6,"sEff":0.45,"t":1234}
{"evt":"done","reason":"end","t":1100}
```

`sEff` is the strength after the cap and battery rules, `t` the time since
the start. Tests in the repo give the player a fake motor and check the log
in virtual time, so a 60 s limit takes milliseconds to test:

```js
var H = require("haptic");
var log = [];
var player = H.createPlayer({
  motor: { on: function (ms, s) { return new Promise(function (res) { setTimeout(res, ms); }); },
           off: function () {} },
  log: function (o) { log.push(o); print(JSON.stringify(o)); }
});
player.play(H.BUILTINS[2], { cap: 0.5, battery: 80 });   // "ramp up" at 50 %
```

Invalid patterns are rejected before anything plays:

```js
var H = require("haptic");
print(JSON.stringify(H.parse('{"name":"bad","steps":[[100,-1]]}')));  // {"error":"step 0: strength must be 0..1"}
print(JSON.stringify(H.parse("{not json")));                           // {"error":"not valid JSON"}
```

![The error screen for an invalid pattern](img/02/invalid.png)

What the log can show: step order, durations, strengths after limits, timing
against the plan (±100 ms over a 60 s pattern), and that stop turns the motor
off within 50 ms. What it can't: whether the steps *feel* different, whether
a drifting rhythm still feels like a beat, and how fast the real motor spins
down. Those are hardware checks.

**You learned:** what can be verified off-device (everything about timing and
limits) and what can't (perception).

## Test it in the emulator

```sh
npm test -- hapticpat
```

- [`apps/hapticpat/tests/haptic.test.js`](../apps/hapticpat/tests/haptic.test.js):
  the module with a fake motor: the 9 `ramp up` steps, the cap on every
  built-in, the 1000 ms clamp, the duty cycle over 20 s of 100 % on, the 60 s
  limit, drift over a 59 s pattern, seeded drifting rhythm, invalid patterns,
  empty patterns, never-overlapping motor calls.
- [`apps/hapticpat/tests/app.test.js`](../apps/hapticpat/tests/app.test.js):
  the whole app with `Bangle.buzz` spied: playback, a real touchscreen tap
  stopping the motor within 50 ms, the button, low battery, kill, the error
  screen, the saved cap.

One of the tests (`T` is the harness's test API, so this runs under `npm test`):

```js
T.test("4: 20 s of 100 % on gets pauses so no 10 s window is over 60 % on", function (done) {
  var r = rig();
  r.player.play({ name: "flat out", repeat: 20, steps: [[1000, 1]] }, { battery: 80 });
  setTimeout(function () {
    T.ok(r.of("pause").length > 0, "pauses inserted");
    T.ok(maxDuty(r.of("buzz")) <= 6000 + 1, "worst 10 s window");
    done();
  }, 60000);
}, { timeout: 120000 });
```

In the emulator, `E.getBattery()` returns 0, so the app shows the low-battery
note; the tests stub it.

## Try it on the watch

[`apps/hapticpat/HW-TESTS.md`](../apps/hapticpat/HW-TESTS.md) lists the checks
that need a wrist: telling the six `swell` levels apart, whether `drifting
rhythm` feels irregular but still like a beat, how fast the motor stops, and
the lowest strength you can still feel.

![The menu](img/02/menu.png)

## Going further

- Add patterns from a phone: send the pattern JSON over Bluetooth and play it
  with `playJSON()`; the limits still apply.
- Use patterns as notifications: a different rhythm per contact or app.
- Make a metronome whose tempo you set with swipes (tutorial 01).
- Measure the motor: log `E.getPowerUsage()` or battery drop during a long
  pattern at different strengths.
