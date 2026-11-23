# Hardware tests: HR stream

Run these on a real Bangle.js 2. Each case maps to an acceptance criterion of
the spec ([HW] ones, plus [EMU] ones the emulator could only check with spies
because it has no HRM and no radio). Record every run in the results table below.

Before you start:

- Firmware: note `process.env.VERSION` (Web IDE console).
- Install the app from this repo (Web IDE: upload the files listed in `metadata.json`, or the app loader).
- Charge the watch above 50 %.
- Disconnect the Web IDE before each case unless the case says otherwise, then
  start the app from the launcher (services are only applied while nothing is connected).
- Receiver page: serve `apps/hrstream/` (`python3 -m http.server`) and open
  `http://localhost:8000/receiver.html` in desktop Chrome/Edge.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-1 | 7 | Watch on wrist, app open, phone with a generic BLE heart-rate app (e.g. nRF Connect, or a fitness app that pairs with HR straps) | 1. In the phone app, scan for heart-rate sensors. 2. Connect to the Bangle. 3. Watch the BPM for 60 s. 4. Note the watch's BPM at the same moments. | The Bangle appears as a heart-rate sensor; the phone shows a BPM within ±1 of the watch's number at least 50 of 60 s (it lags up to 1 s). In nRF Connect, `0x2A37` notifications are 2 bytes, first byte `06` while the watch shows a solid number. |
| HW-2 | 7, 4 | As HW-1, nRF Connect showing `0x2A37` notifications | 1. Take the watch off and lay it on the table for 20 s. 2. Put it back on. | While off the wrist the watch shows the number grey with "no reading"; notifications have first byte `04` and the BPM byte stays at the last confident value (it does not jump around). Back on the wrist it returns to `06` and live values. Grey is clearly distinguishable from solid on the real LCD: yes / no. |
| HW-3 | 8 | Watch on wrist at rest, app open, receiver page open | 1. Press Connect, choose the Bangle. 2. Wait 5 min 10 s. 3. Press Download CSV. 4. Open the CSV in a spreadsheet; count rows with `watch_ms` within the first 300 s after the first row. | Page shows live BPM and the chart. CSV header is `watch_ms,host_ms,bpm,conf`. At least 294 of 300 expected rows (< 2 % missing; one row per second). Record: rows ____ , missing ____ %. |
| HW-4 | 9 | Watch on wrist, sitting still for 2 min first; chest strap (record model) or a manual pulse count | 1. With the receiver page or the watch screen, note the watch BPM. 2. At the same time count your pulse for 60 s (or read the chest strap). 3. Repeat 3 times. | Each of the 3 readings agrees within ±5 BPM. Record watch / reference: ____ / ____, ____ / ____, ____ / ____. |
| HW-5 | 10, 3 | HW-3 running and streaming | 1. Press Disconnect on the page. Wait 30 s (watch shows `not connected`). 2. Press Connect again. 3. Wait 10 s, download the CSV. | Stream resumes without restarting the app. Within about 2 s of reconnecting, the ~30 rows from the gap arrive (CSV has no gap longer than 2 s across the disconnect) and no duplicate `watch_ms` values. |
| HW-6 | 3 | App open, not connected for at least 90 s | 1. Connect the receiver page. 2. Download the CSV after 5 s. | The first rows are 60 consecutive seconds from before the connection (oldest first), then live rows. If fewer arrive, note how many: ____ (the app waits 1.5 s after connect before flushing; if rows are lost, the client was not subscribed yet). |
| HW-7 | 5 | Receiver page connected | 1. Tap the watch screen. 2. Wait 10 s. 3. Tap again. | Page shows `stream: paused` after the first tap and no new samples for 10 s; `on` after the second tap, then samples resume. The phone HR app (if connected) also stops updating while paused. |
| HW-8 | 6 | App open; then connect the Web IDE | 1. Press the button to exit. 2. In the Web IDE console run `Bangle.isHRMOn()`. 3. Look at the back of the watch. | Returns `false`; the green HRM LED is off. |
| HW-9 | edge case: services on `kill` | After HW-8, IDE disconnected | 1. With nRF Connect, scan and connect to the watch. 2. Look at the service list. 3. Reboot the watch (hold the button) and repeat. | After exiting the app, the Heart Rate Service `0x180D` is no longer listed (UART `6e400001…` still is). If it is still listed until the reboot, record FAIL with notes: `kill` did not clear services, or the clear only applied after a disconnect. |
| HW-10 | edge case: shared console | Web IDE connected to the watch over Bluetooth | 1. Start the app from the IDE (`load("hrstream.app.js")`). 2. Watch the IDE console for 10 s. 3. Type `1+1` in the console. | `HR {...}` lines appear about once a second; the console still answers `=2`. |

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.

| Date | Firmware | Tester | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | HW-8 | HW-9 | HW-10 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |
