# Compass with calibration

A compass you can trust: it does its own hard- and soft-iron calibration,
knows when the watch is tilted, smooths angles the right way and lets you
lock a bearing to follow.

- **First start** (or no/corrupt `compass.json`): calibration screen. Rotate the
  watch slowly in all directions; the ring fills as each axis covers enough
  range. It finishes when all three axes span `MIN_RANGE` counts, or after
  20 s if each spans at least a quarter of that.
- **Main screen:** compass rose (N in red), heading in degrees (0–359) and a
  16-point cardinal label. The triangle at the top is where the watch points.
- **Status line:** `tilted - hold flat` when the face is more than 25° from
  flat with tilt compensation off (70° with it on), `upside down?` when the
  face points down, `interference` in the centre when the field strength is
  more than ±40 % away from the calibrated value.
- **Tap:** lock the current heading as the target. The status line then says
  `turn 30° left` / `turn 30° right` / `on target`, and a blue dot on the rose
  marks the target.
- **Long press (600 ms):** recalibrate.

Tap and long press come from the touch-gesture recognizer of prototype 01
(`require("gestures")`, shipped from `apps/touchgest`).
- **Button:** back to the launcher.

The magnetometer is switched on with the app id `compasscal` and off again in
the `kill` handler.

## Files

| File | What it is |
|---|---|
| `compasscal.lib.js` | Logic module, stored as `compasscal`: calibrator, heading and tilt maths, circular smoothing, bearing difference, cardinal labels |
| `../touchgest/gestures.lib.js` | The touch-gesture module from prototype 01, stored as `gestures`; gives tap and long press (`instantTap: true`, since the compass has no double tap) |
| `compasscal.app.js` | UI, sensor and touch handlers (they only forward to the module) |
| `icon-src.js` | Icon drawing code; `node tools/make-icon.js compasscal` writes `app.png` and `app-icon.js` |
| `tests/logic.test.js` | Module tests with synthetic magnetometer and accelerometer data |
| `tests/app.test.js` | Whole app: calibration, restart, headings, tilt hint, target, long press, button |
| `tests/corrupt.test.js` | A corrupt `compass.json` opens calibration without errors |
| `HW-TESTS.md` | Checks a person runs on a real watch |

## Storage

`compass.json` (calibration):

```json
{"v":1,"offset":[12.5,-40.0,3.0],"scale":[1.02,0.97,1.01],"norm":150,"t":1732000000}
```

`offset` = (max + min) / 2 per axis, `scale` = average range / axis range
(clamped to 0.5–2), `norm` = average range / 2, the expected field strength
after correction (used for the interference check), `t` = Unix seconds.

`compasscal.json` (optional settings): `{"decl":0,"tiltComp":true}`.
`decl` is the magnetic declination in degrees added to the heading (default 0,
so the app shows magnetic north); `tiltComp` turns tilt compensation on/off.

## Debug events

With `DEBUG = true` the app logs one JSON line per event:

- `{"evt":"heading","raw":123.4,"smooth":121.9,"tilt":8,"interference":false}`
- `{"evt":"mode","mode":"cal"}` / `"main"`, `{"evt":"calibrated","offset":[…],"scale":[…],"norm":150}`
- `{"evt":"status","text":"tilted - hold flat"}`, `{"evt":"target","target":100}`, `{"evt":"draw","part":"rose"}`

## Constants to tune on a real watch

In `compasscal.lib.js`: `MIN_RANGE` (calibration range per axis, raw counts),
`MAG_SIGN` (sign of each magnetometer axis relative to the accelerometer
axes), `TILT_HINT`, `TILT_MAX_COMP`, `INTERFERENCE`. The flat heading formula
`atan2(-x, y)` is the one the firmware uses for its own `heading` (2v16 and
later), so only `MAG_SIGN` should need changing; see `HW-TESTS.md`.

Run the tests: `npm test -- compasscal`.
