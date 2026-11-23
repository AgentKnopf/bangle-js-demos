# Hardware tests: Activity classifier (`actcls`)

Run these on a real Bangle.js 2. Each case maps to an acceptance criterion
of the spec. Record every run in the results table below.

Before you start:

For AI-guided runs, follow the [AI hardware guide](../../hw-tests/AI-GUIDE.md).
`<device>` means the exact address/UUID confirmed by the human after scanning.
Start with `npm run watch -- run actcls --device "<device>"` after installation.
“Console” below can use `npm run watch -- console '<JS>' --device "<device>"`;
add `--listen <seconds>` for later events. Disconnect before receiver/export
clients connect. Cases explicitly testing the Web IDE still require the IDE.

- Firmware/battery: run the guide's `first-contact` check and record the actual reply.
- Install over local BLE: `npm run watch -- install actcls --device "<device>"`.
  Use the [AI guide](../../hw-tests/AI-GUIDE.md) for setup, verified uploads,
  console output and Web IDE fallback. For HW-1 also install `datalog`.
- Charge the watch above 50 % unless a case says otherwise.
- For window-event JSON, after the app starts run
  `npm run watch -- console 'DEBUG=true' --listen 60 --device "<device>"`.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-1 | 7 (accuracy on real recordings) | `datalog` installed, watch on the wrist of person A | 1. In `datalog` (add the labels `fidget` and `run` in its settings if they are missing), choose source accelerometer at 80 ms and label `sit`; start; sit quietly (reading, hands still) for 5 min; stop. 2. Repeat with label `fidget` (sitting, fidgeting: tapping fingers, shifting, moving the arm), 5 min. 3. Label `walk`: walk at a normal pace, 5 min. 4. Label `run`: jog, 5 min. 5. Repeat 1–4 with person B. 6. Download the 8 raw log files from the Web IDE storage view (not the CSV export). 7. On a PC: `node apps/actcls/tools/evaluate.js <files…>` (`sit` counts as `still`). 8. Paste the printed confusion table into the tutorial's "Accuracy on real recordings" section and into Notes. | Overall window accuracy **≥ 80 %**; per-class accuracy recorded |
| HW-2 | 8 (battery per hour) | Watch charged to 100 % and unplugged for 10 min first; no other app running | 1. Note `E.getBattery()` and the time. 2. Start the app, wear the watch normally (screen may lock) for **4 h**. 3. Note `E.getBattery()` again. 4. Divide the drop by 4. | Drop **≤ 1 % per hour** (the figure stated in the tutorial); record start %, end %, hours and the rate |
| HW-3 | 3 (debounce, live) | App open, watch on wrist, sitting still for 30 s so it shows `still` | 1. Make one quick arm movement (scratch your nose) and hold still again. 2. Watch the class for 10 s. 3. Repeat 5 times. | The large class label stays `still` at least 4 of 5 times (the timeline may show a coloured blip) |
| HW-4 | Edge case: arm movement while sitting | App open, sitting at a desk, console with `DEBUG = true` | 1. Type on a keyboard for 2 min. 2. Gesture while talking for 2 min. 3. Count `win` events by `cls`. | **≤ 10 %** of windows are `walk`; note the class mix |
| HW-5 | 1, 2 (sample rate and features on real data) | Console with `DEBUG = true`, watch lying flat on a table | 1. Leave it for 1 min. 2. Read 10 `win` events. | `hz` is 12.4–12.6, `n` 48–51, `sdMag < 0.01`, `cls` `still`; after > 2 min the screen shows `off wrist?` |
| HW-6 | Edge case: steps cross-check | Walking, console with `DEBUG = true` | 1. Walk 1 min. 2. Read the `steps` field of 10 windows. | `steps` 5–10 per 4 s window while walking; class `walk` |
| HW-7 | 6 (midnight rollover on real time) | App running before midnight, watch on charger is fine | 1. Before 23:59 note the summary page. 2. After 00:01, swipe to the summary page. 3. In the Web IDE, `require("Storage").readJSON("actcls.json")`. | `day` is the new date, minutes have restarted from 0 (only the minutes since midnight) |
| HW-8 | Firmware check: `String.indexOf` false match | Web IDE console | 1. Run `"hello".indexOf("oz")`. 2. Run `"abc\n".indexOf("\n", 10)`. | Note the results. The replay code checks every hit (`charAt(e) === "\n"`), so the app works either way; this records whether real firmware shares the emulator's bug (`4` instead of `-1`) |

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.
Record measurements (accuracy table, battery %, hours) in Notes.

| Date | Firmware | Tester | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | HW-8 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |
