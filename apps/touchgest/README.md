# Touch gestures

Turns raw touchscreen events into a small, reliable vocabulary of gestures:
tap, double tap, long press, swipe (4 directions, with speed) and slow stroke.
The recognizer is a reusable module, `gestures`, for other apps.

- The big label shows the last gesture (`SWIPE LEFT`, `DOUBLE TAP`, …) with its
  direction, distance (px), duration (ms), speed (px/s) and speed class
  (`slow` < 150, `normal`, `fast` > 600).
- A thin trail follows the finger and is cleared 500 ms after release.
- Counters per gesture type at the bottom.
- Button: back to the launcher. The app keeps the watch unlocked while open
  and restores the lock timeout on exit.

## Gesture rules (defaults, constants at the top of `gestures.lib.js`)

| Gesture | Rule |
|---|---|
| tap | moved < 12 px, released within 300 ms; reported after the 350 ms double-tap window |
| doubletap | second tap starts < 350 ms after the first release, within 30 px |
| longpress | moved < 12 px, held ≥ 600 ms; fires while still held, the release adds nothing |
| swipe | straight-line distance ≥ 40 px, duration ≤ 600 ms; direction = dominant axis, ties horizontal |
| stroke | distance ≥ 40 px, duration > 600 ms, straightness (distance ÷ path length) ≥ 0.8 |

Anything else (a 400 ms still press, a 25 px drag, a wobbly slow path) is
ignored; with `unknown: true` it is reported as `{type:"unknown", reason}`.

## Module

```js
var G = require("gestures");
var r = G.create({ instantTap: false });   // any threshold can be overridden, e.g. {LONG_MS: 800}
r.on("gesture", function (ev) { /* {type, dir, dist, dur, speed, speedClass, x0, y0, x1, y1, t} */ });
r.feed({x: x, y: y, b: b, t: t});          // t in ms; the app forwards drag events here
r.reset();                                 // drop the current gesture (e.g. watch locked)
```

- `instantTap: true` reports `tap` at release and then `doubletap` as an extra
  event if a second tap follows.
- `dir` is set for `swipe` and `stroke` only. Screen y grows down, so `up` means y decreased.
- Duration 0 counts as 1 ms. A release sample without `x`/`y` uses the last point.
- After `reset()` while the finger is down, the rest of that touch is ignored.
- `G.direction(dx, dy)` and `G.speedClass(pxPerS)` are exported helpers.

Another app in this repo can ship the module by listing
`{"name":"gestures","url":"../touchgest/gestures.lib.js"}` in its `storage`.

## Files

| File | What it is |
|---|---|
| `gestures.lib.js` | Recognizer module, stored as `gestures` |
| `touchgest.app.js` | Demo UI: label, details, trail, counters |
| `icon-src.js` | Icon drawing code; `node tools/make-icon.js touchgest` writes `app.png` and `app-icon.js` |
| `tests/gestures.test.js` | The module through `feed()` with synthetic points, incl. a 26-gesture table |
| `tests/app.test.js` | The whole app with touchscreen input through the firmware |
| `HW-TESTS.md` | Checks a person runs on a real watch |

Run the tests: `npm test -- touchgest`. Tutorial: [`tutorials/01-touch-gestures.md`](../../tutorials/01-touch-gestures.md).
