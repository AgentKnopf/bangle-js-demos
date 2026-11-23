# Hardware tests: Data logger

Run these on a real Bangle.js 2. Each case maps to an acceptance criterion of
the spec ([HW] ones, plus [EMU] ones the emulator could only check with
synthetic sensor events, mocks or without a radio). Record every run in the
results table below.

Before you start:

- Firmware: note `process.env.VERSION` (Web IDE console).
- Install the app from this repo (Web IDE: upload the files listed in `metadata.json`, or the app loader).
- Charge the watch to 100 % for HW-1/HW-2, above 50 % for the others.
- Export page: serve `apps/datalog/` (`python3 -m http.server`) and open `http://localhost:8000/export.html`
  in desktop Chrome/Edge. Python: `pip install bleak`.
- Write measurements into the Notes column or the "Measurements" section at the end.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-1 | 7 | Watch on wrist, 100 % battery, Web IDE disconnected. Note the battery % and the time. | 1. Data logger: Accel 12.5Hz, Heart rate 1s, others off, Label `walk`. 2. Start. 3. Let the screen lock; wear it normally for 30 min (some walking). 4. Unlock, hold the button 1 s. 5. Note battery % and the sample count on the recordings list. | Recording stops only when you hold the button. Duration on the list is 30:00 ± 0:10. Samples ≈ 22 500 accel + 1 800 HR = 24 300 (record the number; within ±2 %). |
| HW-2 | 7 | After HW-1 | 1. On the watch: Export (PC). 2. Export page: Connect, then **CSV** for the HW-1 recording. 3. Open the CSV in LibreOffice/Excel/Google Sheets. | Download completes (record time taken: ____ s). The CSV opens with the 12 named columns; rows with type `a` ≈ 22 500 and `h` ≈ 1 800; `t_ms` never decreases; `label` is `walk`. |
| HW-3 | 8 | HW-1 values | 1. Compute drain = battery at start − battery at end. 2. Write it into the tutorial's "Battery" table (`tutorials/06-data-logging.md`). | Drain recorded in % per 30 min (expect a few %; record it, no pass threshold). |
| HW-4 | 1 (real accel rate) | Watch on the table, still, screen locked, for 2 min first | 1. Accel 12.5Hz only. Start. 2. Leave it untouched for 60 s with the screen locked. 3. Stop, export as CSV. 4. Count `a` rows. | 750 ± 10 rows in 60 s, i.e. the accelerometer did not drop to 1.25 Hz (powerSave) while still. Repeat with 25Hz: 1500 ± 20. Record both counts. |
| HW-5 | 2, 3 | Recording running (Accel 12.5Hz) for 20 s | 1. In the Web IDE (connect; logging continues) run `load()`. 2. Reopen Data logger → Recordings, open the recording. | Duration ≈ the time it ran; Delete prompt etc. work. Export it: every line is complete (5 fields), the last sample is within 1 s of the moment of `load()` (the `kill` handler flushed). |
| HW-6 | 3 | Recording running for 30 s, Web IDE connected | 1. Force a watchdog reset, which skips `kill`: in the IDE console run `E.enableWatchdog(1, false); while (1) {}`. The watch reboots within a few seconds. (Holding the button is not a hard reset: at 1.5 s it loads the clock and `kill` runs.) 2. Open Data logger → Recordings. 3. Export the recording (CSV and raw log). | Recording is listed (duration may show `?:??` or be computed); raw log has a header and only complete lines, or a last partial line that the CSV conversion drops. At most the last ~1 KB of samples (≈ 4 s at 12.5 Hz) is missing. |
| HW-7 | 4 | Fill the flash so little is free: Web IDE console `require("Storage").write("filler", "", 0, require("Storage").getFree() - 60000)` | 1. Start Accel 25Hz. 2. Wait until it stops (about 2 min). 3. Delete `filler` afterwards: `require("Storage").erase("filler")`. | "storage full" alert; the recording is listed and exports as valid CSV; the file is ≤ 57 000 bytes (95 % of the free space at start). |
| HW-8 | 5 (over BLE) | Two recordings on the watch; Export (PC) open | 1. Export page: Connect. 2. Check the list. 3. Download **raw log** of one. 4. `python3 export.py list` and `python3 export.py get <name> --raw`. 5. Press the button on the watch, then connect with the Web IDE. | Page and Python both list both files with the same byte sizes as the Storage view; the raw downloads are identical (`cmp`) and match the IDE Storage view download. After leaving Export mode the IDE console works again (`1+1` → `=2`). |
| HW-9 | 6 | One recording | 1. Recordings → tap it → Delete → **No**. 2. Repeat with **Yes**. | After No it is still listed; after Yes it is gone from the list and from the IDE Storage view. |
| HW-10 | stop by long press while locked | Recording running, screen locked | 1. Without unlocking, hold the button about 1 s, then release. | Logging stops (recordings list appears) and the watch does not jump to the clock. If the firmware's own long-press (clock reload, 1.5 s) wins, record FAIL and how long you held. |
| HW-11 | other sources | Watch on wrist | 1. Enable Heart rate 1s, Pressure 1s, Compass 1s (rotate the watch a full circle first to calibrate), Steps 10s. 2. Record 2 min while walking. 3. Export CSV. | `h` ≈ 120 rows with plausible BPM; `p` ≈ 120 rows near local pressure (900–1050 hPa); `m` ≈ 120 rows with headings 0–360 (empty only before calibration); `s` 12 rows whose sum ≈ your step count. |
| HW-12 | battery < 10 % | Battery at 11–12 % | 1. Start Accel 12.5Hz. 2. Wait until it stops. | "battery low" alert at 9 %; the recording exports as valid CSV. (SKIP if you can't get the battery there.) |

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.

| Date | Firmware | Tester | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | HW-8 | HW-9 | HW-10 | HW-11 | HW-12 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | | |

## Measurements

| Run | Battery start → end (30 min) | Samples a / h (HW-1) | Export time (HW-2) | 12.5 Hz / 25 Hz rows per 60 s (HW-4) |
|---|---|---|---|---|
| | | | | |
