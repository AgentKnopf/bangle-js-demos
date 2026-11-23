# Hardware tests: Haptic patterns

Run these on a real Bangle.js 2. Criteria 9–11 of the spec are
hardware-only. The emulator tests check every timing and limit from the log,
but the emulator has no motor and its `Bangle.buzz` Promise resolves at once,
so the cases below also check, on the real motor, what those tests could only
check on paper: the motor really stops on tap, steps don't run together when
the real Promise is used, and the low-battery rule. Record every run in the
results tables below.

Before you start:

- Firmware: note `process.env.VERSION` (Web IDE console).
- Install the app from this repo (Web IDE: upload `hapticpat.app.js`,
  `haptic.lib.js` as `haptic`, `../touchgest/gestures.lib.js` as `gestures`,
  `app-icon.js` evaluated as `hapticpat.img`; or use an app loader pointing at
  this repo).
- Charge the watch above 50 % (except HW-8).
- Wear the watch on the wrist as normal, strap snug. Quiet room.
- In Settings, check that vibration is enabled (`Quiet mode` off). If buzzing is
  disabled in the firmware, nothing will be felt.
- Optional, for exact numbers: keep the Web IDE connected and run
  `DEBUG = true` after the app starts; every step then prints one JSON line
  (`{"evt":"buzz",…}`) and each play ends with `{"evt":"done","reason":…}`.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-1 | 9 | Menu open, `Strength cap` 100 % | 1. Play `swell` 3 times; count the distinct strength levels you feel going up. 2. Have a second tester do the same without seeing the screen. | Each tester feels 6 distinct rising levels (and 6 falling) in at least 2 of 3 plays. Record the number of levels each tester could tell apart. |
| HW-2 | 9 (threshold) | IDE connected | 1. In the console run `play({name:"t",steps:[[300,0.05],[500,0],[300,0.1],[500,0],[300,0.15],[500,0],[300,0.2]]})`. 2. Note which of the 4 buzzes you feel. | Record the lowest strength felt (0.05 / 0.1 / 0.15 / 0.2). Firmware maps strength s to PWM duty 0.4 + 0.6·s, so even 0.05 may be felt; this is a tuning note, not pass/fail. |
| HW-3 | 10 | Menu open, cap 100 % | 1. Play `rhythm` and tap along on the table. 2. Play `drifting rhythm` 3 times and tap along. 3. Ask: is it irregular? Can you still follow a beat? | `rhythm` feels steady. `drifting rhythm` is described as irregular (pauses vary, some beats missing or doubled) but the tester can still tap along. Record yes/no for "irregular" and for "still a beat". |
| HW-4 | 11 | Menu open | 1. Play `rhythm`. 2. During a strong tap of the beat, tap the screen once. 3. Repeat 5 times. Then do it with the **button** 5 times. | The vibration stops at once (no further beat, no tail felt beyond the tap itself), screen shows `stopped`. 10 of 10. |
| HW-5 | 11 (timing) | Menu open, a second person with a phone camera at 240 fps (slow motion) if available | 1. Film the watch from the side lying on a table during HW-4 step 2. 2. Count frames from the finger lifting to the watch no longer moving. | Motor stops within ~50 ms of the finger lifting (≤ 12 frames at 240 fps). Record the frame count. Skip if no slow-motion camera. |
| HW-6 | 1, 3 | Menu open, cap 100 % | 1. Play `ramp up`: 5 buzzes of rising strength, the last one longer. 2. In the console run `play({name:"long",steps:[[3000,1]]})` and time the buzz with a stopwatch. | Step 1: 5 separate buzzes, each stronger than the one before. Step 2: the buzz lasts about 1 s, not 3 s (clamped). |
| HW-7 | 2, 4, 5 | IDE connected | 1. Set `Strength cap` to 25 % and play `pulse`, then 100 % and play `pulse`. 2. Run `play({name:"flat",repeat:20,steps:[[1000,1]]})` and note when the motor pauses. 3. Run `play({name:"long",repeat:100,steps:[[200,0.5],[800,0]]})` and time it. | Step 1: the 25 % pulse is clearly weaker. Step 2: after about 6 s of buzzing the motor pauses for about 4 s, and the pattern carries on with pauses. Step 3: stops by itself after 60 s (±1 s), screen shows `stopped: 60 s limit`. |
| HW-8 | low battery | Battery below 15 % (check `E.getBattery()` in the console) | 1. Open the app, cap 100 %, play `pulse`. | Screen shows `Low battery: max 50%`; the pulse feels weaker than at full charge. With `DEBUG = true`, `sEff` is 0.5. |
| HW-9 | kill | Menu open | 1. Play `drifting rhythm`. 2. While it plays, long-press the button (≈1.5 s) to go back to the clock. | The motor stops as the app exits and doesn't buzz again. |
| HW-10 | overlap | IDE connected, `DEBUG = true` | 1. Play `SOS` and listen/feel. | You feel `... --- ...` with clear gaps; no element is merged into the next. The log shows 17 `buzz` events and `done` with reason `end` at about 2900 ms. |

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.

| Date | Firmware | Tester | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | HW-8 | HW-9 | HW-10 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

## Measurements

| Date | Tester | HW-1 levels felt up / down (of 6) | HW-2 lowest strength felt | HW-3 irregular? beat? | HW-4 stops (of 10) | HW-5 frames to stop @ fps | HW-7 limit stop time (s) |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
