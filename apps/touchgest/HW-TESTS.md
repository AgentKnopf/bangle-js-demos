# Hardware tests: Touch gestures

Run these on a real Bangle.js 2. Each case maps to an acceptance criterion of
the spec (criteria 9 and 10 are hardware-only; the others are covered by the
emulator tests, and the cases here check what the emulator can't: real
fingers, real timing and locking). Record every run in the results tables
below.

Before you start:

For AI-guided runs, follow the [AI hardware guide](../../hw-tests/AI-GUIDE.md).
`<device>` means the exact address/UUID confirmed by the human after scanning.
Start with `npm run watch -- run touchgest --device "<device>"` after installation.
“Console” below can use `npm run watch -- console '<JS>' --device "<device>"`;
add `--listen <seconds>` for later events. Disconnect before receiver/export
clients connect. Cases explicitly testing the Web IDE still require the IDE.

- Firmware/battery: run the guide's `first-contact` check and record the actual reply.
- Install over local BLE: `npm run watch -- install touchgest --device "<device>"`.
  Use the [AI guide](../../hw-tests/AI-GUIDE.md) for setup, verified uploads,
  console output and Web IDE fallback.
- Charge the watch above 50 %.
- Optional, for exact numbers: run
  `npm run watch -- console 'DEBUG=true' --listen 60 --device "<device>"` after the app starts; every gesture then prints
  one JSON line (`{"evt":"gesture","type":…,"dir":…,"speed":…}`) and rejected
  movements print `{"evt":"unknown",…}`.
- The counters at the bottom of the screen count `tap`, `dbl` (double tap),
  `long` (long press), `swp` (swipe) and `strk` (stroke). Restart the app to
  reset them.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-1 | 9 | App open, watch on the tester's wrist, tester looking at the screen | 1. Restart the app. 2. Do 20 deliberate, quick swipes **left** across the middle of the screen, about 1 s apart. After each, note whether the big label says `SWIPE LEFT`. 3. Repeat steps 1–2 for **right**, **up** and **down**. | At least 18 of 20 per direction show the matching label (`swp` counter = number recognized). Record the count per direction. |
| HW-2 | 9 (tuning) | Only if HW-1 failed | 1. Note which gesture the misses became (label or JSON line) and their `dist`/`dur`/`speed`. 2. Change only the constants at the top of `gestures.lib.js` (e.g. `SWIPE_MIN`, `SWIPE_MS`). 3. Re-upload and repeat HW-1. | HW-1 passes with constants changed only. Record old and new values. |
| HW-3 | 10 | App open, finger (not a stylus) | 1. Restart the app. 2. Tap 5 times, about 1 s apart, within ~5 mm of the **top** edge, centred. 3. Same for the **bottom**, **left** and **right** edges. 4. Tap once in each of the four corners. | Every edge tap shows `TAP` and increments `tap`: 20 of 20 edge taps; note corner taps separately (target 4 of 4). |
| HW-4 | 1, 2 | App open | 1. Tap once in the centre and lift. 2. Wait 2 s. 3. Tap twice quickly (as for a double click). 4. Do step 3 ten times. | Step 1: `TAP` appears about a third of a second after lifting, `tap` +1. Step 3: `DOUBLE TAP`, `dbl` +1, `tap` unchanged. At least 9 of 10 double taps recognized. |
| HW-5 | 5 | App open | 1. Put a finger on the centre and keep it still. 2. Watch the screen, then lift after about 2 s. 3. Repeat 5 times. | `LONG PRESS` appears while the finger is still down (after ~0.6 s), and lifting adds nothing (`tap` unchanged). 5 of 5. |
| HW-6 | 4, 6 | App open | 1. Drag slowly and straight from the bottom to the top over about 2 s. 2. Draw a slow wobbly zig-zag (at least 3 direction changes) from right to left over about 2 s. 3. Repeat each 5 times. | Step 1: `STROKE UP`, 5 of 5. Step 2: no new label and no counter change, 5 of 5 (with `DEBUG = true` an `unknown` line with `straight` below 0.8). |
| HW-7 | 3 | App open, `DEBUG = true` in the console | 1. Do 5 fast swipes left across the full width. 2. Do 5 gentle, unhurried swipes left. | Fast swipes show `fast` (speed > 600 px/s). Gentle ones show `normal` or `slow`. Record the speeds. |
| HW-8 | 7, trail | App open | 1. Drag a finger around the screen and lift. | A thin line follows the finger while moving and disappears about half a second after lifting. |
| HW-9 | lock edge case | Watch with the normal lock timeout (Settings) | 1. Open the app and leave it untouched for 30 s. 2. Press the button. 3. On the clock, wait for longer than the usual lock timeout. | Step 1: the screen stays unlocked and responds to touch. Step 2: back to the launcher/clock. Step 3: the watch locks as before (the app restored the lock timeout). |

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.

| Date | Firmware | Tester | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | HW-8 | HW-9 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | |

## Measurements

| Date | Tester | HW-1 left / right / up / down (of 20) | HW-3 edges (of 20), corners (of 4) | HW-4 double taps (of 10) | HW-7 fast speeds / gentle speeds (px/s) | Constants changed (HW-2) |
|---|---|---|---|---|---|---|
| | | | | | | |
