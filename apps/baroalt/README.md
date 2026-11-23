# Barometer altitude

Relative altitude, floors climbed and descended, a 10-minute altitude
sparkline, and the barometer's temperature, labelled honestly as
"sensor temp".

- **Main screen:** pressure (hPa), relative altitude (m since start or the last
  reset), an absolute altitude estimate from the sea-level reference, floors
  up / down, temperature with the label `sensor temp`, the hint line
  `reads warm when worn - swipe`, and the sparkline (one point per 10 s).
- **Tap:** reset relative altitude and floors to zero.
- **Long press (600 ms):** sea-level reference menu (±1 hPa steps, 850–1100);
  "back" saves it to `baroalt.json`.
- **Swipe:** why the temperature reads warm; tap or swipe to go back.
- **Button:** back to the launcher.

The barometer is switched on with the app id `baroalt` and off again in the
`kill` handler.

## How the floor counter works

1. Samples from the `pressure` event are averaged into 1 s buckets (any rate
   from below 1 Hz to over 10 Hz works). The first 2 s after power-on are
   discarded.
2. A sample more than 1 hPa away from the smoothed pressure is rejected as a
   spike (doors, wind, pressing the case), unless the jump lasts 3 s or more,
   in which case it is accepted as a real change.
3. Pressure is smoothed with an exponential moving average (time constant
   4 s) and turned into altitude with `h = 44330 × (1 − (p/p0)^(1/5.255))`.
4. **Rate gate:** each 1 s change is judged 8 s later by the rate over a 16 s
   window centred on it. Changes slower than 0.05 m/s (weather drift, noise)
   move the floor anchor along silently; faster ones are climbing.
5. **Hysteresis:** a floor is counted when the (gated) altitude is 3.0 m above
   or below the anchor; the anchor then moves by 3.0 m. Floors therefore show
   up about 8 s after the altitude crosses the line.
6. Optional step cross-check (`"stepCheck":true` in `baroalt.json`, off by
   default): floors only count if at least 4 steps were seen in the last 15 s,
   so a lift ride counts nothing.

## Files

| File | What it is |
|---|---|
| `baroalt.lib.js` | Logic module, stored as `baroalt`: barometric formula, resampling, spike rejection, smoothing, rate gate, floor counter, sparkline history, tap/long-press recognizer |
| `baroalt.app.js` | UI, sensor and touch handlers (they only forward to the module) |
| `icon-src.js` | Icon drawing code; `node tools/make-icon.js baroalt` writes `app.png` and `app-icon.js` |
| `tests/logic.test.js` | Module tests with synthetic pressure traces (climb, noise, 1 h drift, spikes, reset, lift) |
| `tests/app.test.js` | Whole app with synthetic `pressure` events: floors, reset, label and hint, menu, kill, button |
| `tests/replay.test.js`, `tests/fixtures/baroclimb.csv` | Replays a pressure trace from Storage. The fixture is synthetic (made by `tests/gen-baroclimb.js`); real recordings in the same `t,p,temp` format can be dropped in |
| `HW-TESTS.md` | Checks a person runs on a real watch |

## Storage

`baroalt.json`: `{"v":1,"p0":1013.25,"floorM":3.0,"stepCheck":false}`.

## Debug events

With `DEBUG = true` the app logs once per second:

```json
{"evt":"baro","p":1009.42,"alt":3.1,"altS":2.9,"temp":31.2,"up":1,"down":0}
```

`alt` is the relative altitude of that second's average, `altS` the smoothed
one. Also `{"evt":"reset"}`, `{"evt":"mode","mode":"main"|"hint"|"menu"}`
and `{"evt":"p0","p0":1014.25}`.

## Notes

- The firmware's own `altitude` field and `Bangle.setOptions({seaLevelPressure})`
  exist on real Bangle.js 2 firmware (they are compiled in only with a
  pressure sensor, so the emulator reports the option as unknown). The app
  computes altitude itself, so it behaves the same in both.
- The emulator has no barometer; all tests use synthetic data.

Run the tests: `npm test -- baroalt`.
