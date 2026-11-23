# Hardware tests: Barometer altitude

Run these on a real Bangle.js 2. Each case maps to an acceptance criterion of
the spec (04 — Barometer: altitude, stairs and temperature). Record every run
in the results table below.

Before you start:

For AI-guided runs, follow the [AI hardware guide](../../hw-tests/AI-GUIDE.md).
`<device>` means the exact address/UUID confirmed by the human after scanning.
Start with `npm run watch -- run baroalt --device "<device>"` after installation.
“Console” below can use `npm run watch -- console '<JS>' --device "<device>"`;
add `--listen <seconds>` for later events. Disconnect before receiver/export
clients connect. Cases explicitly testing the Web IDE still require the IDE.

- Firmware/battery: run the guide's `first-contact` check and record the actual reply.
- Install over local BLE: `npm run watch -- install baroalt --device "<device>"`.
  Use the [AI guide](../../hw-tests/AI-GUIDE.md) for setup, verified uploads,
  console output and Web IDE fallback.
- Charge the watch above 50 % unless a case says otherwise.
- For debug lines, run `npm run watch -- console 'DEBUG=true' --listen 60 --device "<device>"` while the app runs.
- Know the floor height of your building if you can (stairs × step height);
  the app assumes 3.0 m per floor.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-0 | sample rate (UNVERIFIED in spec) | App open, Web IDE connected | 1. Run `var n=0,f=function(){n++};Bangle.on('pressure',f);setTimeout(function(){Bangle.removeListener('pressure',f);print(n/30+" Hz")},30000)`. 2. Wait 30 s. 3. Repeat with the watch lying still for 2 min first (power-save mode). | Record both rates in Notes. Any rate from ~0.5 Hz to ~12 Hz is fine; the app resamples to 1 Hz. |
| HW-1 | 8 | Watch on the wrist, app open at the bottom of a staircase of at least 3 floors | 1. Stand still 10 s. 2. Tap the screen to reset (shows `+0.0 m`, `up 0 down 0`). 3. Walk up 3 floors at normal pace without stopping on landings for long. 4. Stand still 15 s at the top. 5. Note floors and relative altitude. 6. Repeat once going down 3 floors. | Up: `up 3` (±1), relative altitude ≈ +3 × floor height. Down: `down 3` (±1). Record counts, altitudes and the real number of floors. |
| HW-2 | 9 | `baroalt.json` set to `{"v":1,"p0":1013.25,"floorM":3,"stepCheck":true}` (Web IDE: `require("Storage").writeJSON("baroalt.json",{v:1,p0:1013.25,floorM:3,stepCheck:true})`), app restarted, building with a lift | 1. Reset with a tap in the lift. 2. Ride ≥ 3 floors, standing still. 3. Wait 15 s after the doors open. 4. Note floors and altitude. 5. Walk up 1–2 floors of stairs. 6. Set `stepCheck` back to `false` afterwards. | Lift: `up 0` while the altitude shows the climb (record it). Stairs afterwards: floors counted (±1). Also note what the count is with `stepCheck:false` on the same lift (expected: it counts the lift). |
| HW-3 | 10 | Room thermometer; watch worn for at least 30 min | 1. Note the room thermometer reading and the watch's temperature while worn. 2. Take the watch off and lay it on a table away from sunlight and heat. 3. After 30 min note both readings again. | Worn reading is higher than the room (expected several °C). Off the wrist it moves towards the room reading. Record all four numbers. The label always says `sensor temp`. |
| HW-4 | 3 (real weather) | Watch lying still on a table, app open, Web IDE connected, ideally on a day with changing weather | 1. Reset with a tap. 2. Leave it for 1 hour without moving it. 3. Note relative altitude and floors. | Floors: `up 0 down 0`. Relative altitude may drift by several metres (record it; ~8 m per hPa of weather change). |
| HW-5 | 4 (real spikes) | App open, watch on a table | 1. Press firmly on the watch face/case for 1 s, five times. 2. Open and close a door of a closed room quickly, or blow across the watch. | No floors counted; relative altitude moves less than 1 m and returns. Record max change. |
| HW-6 | power | App open | 1. In the Web IDE run `Bangle.isBarometerOn()`. 2. Press the button to leave the app. 3. Run `Bangle.isBarometerOn()` again. | Step 1: `true`; step 3: `false` (unless another app/widget uses it: note which). |
| HW-7 | absolute altitude | Local sea-level pressure (QNH) from a weather service, and a known altitude (map) | 1. Long-press, set the sea-level value to the QNH (±1 hPa steps), press back. 2. Read `abs ~… m`. | Within ±10 m of the known altitude (record both). The value survives an app restart. |

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.
Record the measurements (floor counts, altitudes, temperatures, rates) in Notes.

| Date | Firmware | Tester | HW-0 | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |
