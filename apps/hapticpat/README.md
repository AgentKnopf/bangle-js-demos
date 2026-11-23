# Haptic patterns

Plays vibration patterns described as data, on the single vibration motor,
with safety limits enforced by the player.

- The menu lists the built-ins: `pulse`, `double`, `ramp up`, `swell`, `rhythm`,
  `drifting rhythm`, `SOS`, and `custom` if `hapticpat.pat.json` exists.
- While playing, the screen shows the pattern name, a strength bar for the
  current step and the elapsed time.
- Tap the screen or press the button to stop at once. A second press returns
  to the menu; the menu's back button exits to the launcher.
- `Strength cap` in the menu: 25 / 50 / 75 / 100 %, saved in `hapticpat.json`.

## Safety limits (in the player, `haptic.lib.js`)

| Limit | Rule |
|---|---|
| Strength cap | every step's strength × the cap |
| Max on-time | an "on" step longer than 1000 ms is clamped to 1000 ms |
| Duty cycle | in any rolling 10 s window the motor is on ≤ 60 %; pauses are inserted |
| Total | 60 s per play, then `done:limit` |
| Low battery | `E.getBattery() < 15`: strength ≤ 0.5, note on screen |
| Stop | motor pin driven low immediately (`digitalWrite(VIBRATE, 0)`) |

Steps are scheduled from the start time, so a long pattern doesn't drift, and
motor calls never overlap: an "on" step waits for the previous
`Bangle.buzz()` Promise.

## Patterns

```json
{"name":"ramp up","repeat":1,
 "steps":[[150,0.2],[50,0],[150,0.4],[50,0],[150,0.6],[50,0],[150,0.8],[50,0],[300,1.0]]}
```

Each step is `[durationMs, strength]`, strength 0–1 (0 = pause). Built-ins
may use `gen(seed)` instead of `steps` (`drifting rhythm`: ±15 % pauses, every
4th beat skipped or doubled, seeded). Invalid patterns (negative/NaN values,
strength > 1, bad JSON) show an error and play nothing. To play your own,
upload JSON as `hapticpat.pat.json` and pick `custom`, or run
`playJSON('{"name":"x","steps":[[100,1]]}')` in the IDE.

## Debug log

With `DEBUG = true`: `{"evt":"buzz","i":3,"ms":150,"s":0.6,"sEff":0.45,"t":1234}`
per step (`clamped` added when a step was cut), `{"evt":"pause","ms":…,"reason":"duty"}`
for inserted pauses, `{"evt":"done","reason":"end|stop|limit","t":…}` at the
end, `{"evt":"error","msg":…}` for rejected patterns.

## Firmware notes (from `libs/banglejs/jswrap_bangle.c`)

- `Bangle.buzz(0)` buzzes for the default 200 ms; it does not stop the motor.
- A `buzz()` during a running buzz is queued after it, not overlapped.
- Strength s is PWM duty `0.4 + 0.6·s`; `time` is clamped to 5000 ms.
- In the emulator `Bangle.buzz()` resolves at once, so tests spy on it.

## Files

| File | What it is |
|---|---|
| `haptic.lib.js` | Patterns, validation, limits (`planner`/`plan`) and player, stored as `haptic` |
| `hapticpat.app.js` | Menu, play screen, stop by tap (via the `gestures` module from `apps/touchgest`) or button |
| `icon-src.js` | Icon drawing code; `node tools/make-icon.js hapticpat` writes `app.png` and `app-icon.js` |
| `tests/haptic.test.js` | The module with a fake motor in virtual time |
| `tests/app.test.js` | The whole app with `Bangle.buzz` spied and real touch/button input |
| `HW-TESTS.md` | Checks a person runs on a real watch |

The app ships `../touchgest/gestures.lib.js` as `gestures` (see `metadata.json`).
Run the tests: `npm test -- hapticpat`. Tutorial: [`tutorials/02-haptic-patterns.md`](../../tutorials/02-haptic-patterns.md).
