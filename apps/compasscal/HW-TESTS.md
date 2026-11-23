# Hardware tests: Compass with calibration

Run these on a real Bangle.js 2. Each case maps to an acceptance criterion of
the spec (03 — Compass and heading). Record every run in the results table
below.

Before you start:

For AI-guided runs, follow the [AI hardware guide](../../hw-tests/AI-GUIDE.md).
`<device>` means the exact address/UUID confirmed by the human after scanning.
Start with `npm run watch -- run compasscal --device "<device>"` after installation.
“Console” below can use `npm run watch -- console '<JS>' --device "<device>"`;
add `--listen <seconds>` for later events. Disconnect before receiver/export
clients connect. Cases explicitly testing the Web IDE still require the IDE.

- Firmware/battery: run the guide's `first-contact` check and record the actual reply.
- Install over local BLE: `npm run watch -- install compasscal --device "<device>"`.
  Use the [AI guide](../../hw-tests/AI-GUIDE.md) for setup, verified uploads,
  console output and Web IDE fallback.
- Charge the watch above 50 % unless a case says otherwise.
- You need a phone with a compass app (set it to **magnetic** north, not true
  north), and a spot outdoors or indoors at least 1 m away from metal, magnets,
  laptops and speakers.
- To see the debug lines, run `npm run watch -- console 'DEBUG=true' --listen 60 --device "<device>"`
  while the app is running.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-0 | axis signs (`MAG_SIGN`, flat formula) | App installed, calibrated (HW-1 steps 1–4), watch flat on a table, Web IDE connected | 1. Point the top of the watch (12 o'clock) at magnetic north using the phone. 2. Read the heading. 3. Turn the watch clockwise to east (90°), then south, then west, reading each time. | Heading increases clockwise: ≈0, ≈90, ≈180, ≈270 (±15°). If it decreases, or is off by 90°/180°, record the readings in Notes; the fix is the sign/order of axes in `MAG_SIGN` or the `atan2(-x, y)` formula. |
| HW-1 | 7 | Watch off the wrist, flat, away from metal; phone compass next to it on the same surface | 1. Delete `compass.json` (Web IDE → Storage) and open the app. 2. The calibration screen shows "Rotate the watch slowly in all directions". 3. Rotate the watch slowly through all orientations (figure-eight, face up/down, on each edge) until the main screen appears. Note how long it took (s) and the final `offset`/`scale` from `require("Storage").readJSON("compass.json")`. 4. Put the watch flat. 5. For each of N, E, S, W (phone reading 0, 90, 180, 270): align the watch top with the phone's direction and wait 3 s. 6. Record watch heading vs phone heading for all four. | Calibration finishes in ≤ 30 s. Each of the four headings is within ±10° of the phone. Record the four differences and the calibration time. |
| HW-2 | 8 | After HW-1, tilt compensation on (default, `compasscal.json` absent or `"tiltComp":true`), watch on the wrist | 1. Hold the arm so the watch face is flat and note the heading (H0). 2. Without turning your body, roll the wrist 30° towards you; wait 3 s; note H1. 3. Roll 30° away; note H2. 4. Pitch the watch 30° (12 o'clock up); note H3. 5. Pitch 30° down; note H4. Use the `tilt` value from the debug `heading` line, or a protractor, to check each tilt is 25–35°. | All of \|H1−H0\|, \|H2−H0\|, \|H3−H0\|, \|H4−H0\| < 10°. No "tilted" hint at 30°. Record all five headings and tilts. |
| HW-3 | 6 (real sensors) | After HW-1, set `"tiltComp":false` in `compasscal.json` (Web IDE: `require("Storage").writeJSON("compasscal.json",{tiltComp:false})`), restart app | 1. Hold flat: no hint. 2. Tilt the watch ~40° in any direction. 3. Tilt back to flat. 4. Delete `compasscal.json` afterwards. | Step 2 shows `tilted - hold flat` within 1 s; step 3 removes it. Record the debug `tilt` value at which the hint appears (expected ≈ 25°). |
| HW-4 | 9 | App open | 1. In the Web IDE console run `Bangle.isCompassOn()` while the app is open. 2. Press the button to exit to the clock. 3. Run `Bangle.isCompassOn()` again. | Step 1 prints `true`, step 3 prints `false` (unless another app/widget turned it on: note which in Notes). |
| HW-5 | interference edge case | After HW-1, app open, a steel object or a magnet (e.g. a phone speaker) | 1. Bring the object slowly towards the watch. 2. Move it away again. | The centre shows `interference` instead of a heading before the heading swings wildly; it returns to a heading within 2 s after the object is removed. Note the distance at which it appeared. |
| HW-6 | tap / long press | App open on the main screen | 1. Point the watch at something and tap the screen. 2. Turn your body ~30° to the left. 3. Turn back. 4. Long-press the screen for 1 s. | 1: status says `on target` and a blue dot sits under the top pointer. 2: status says `turn ~30° right` (you must turn right to get back). 3: `on target` again. 4: calibration screen opens. |
| HW-7 | redraw / flicker | App open on the main screen | Turn slowly through 360° and watch the screen. | The rose and numbers update without visible flashing of the whole screen; the status line does not flicker. |

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.
Record the measurements (heading differences, tilts, calibration time) in Notes.

| Date | Firmware | Tester | HW-0 | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |
