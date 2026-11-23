# Hardware tests: TF wrist gestures (`tfgest`)

Run these on a real Bangle.js 2. Each case maps to an acceptance criterion
of the spec. Record every run in the results table below.

Before you start:

For AI-guided runs, follow the [AI hardware guide](../../hw-tests/AI-GUIDE.md).
`<device>` means the exact address/UUID confirmed by the human after scanning.
Start with `npm run watch -- run tfgest --device "<device>"` after installation.
“Console” below can use `npm run watch -- console '<JS>' --device "<device>"`;
add `--listen <seconds>` for later events. Disconnect before receiver/export
clients connect. Cases explicitly testing the Web IDE still require the IDE.

- Firmware/battery: run the guide's `first-contact` check and record the actual reply.
- Install over local BLE: `npm run watch -- install tfgest --device "<device>"`.
  Use the [AI guide](../../hw-tests/AI-GUIDE.md) for setup, verified uploads,
  console output and Web IDE fallback.
- Upload the model: `npm run watch -- exec apps/tfgest/model/tfgest-model.js --timeout 120 --device "<device>"`.
  Require `tfgest model stored`, a successful reply and disconnect; run HW-1
  before collecting training data. The guide explains float fallback and restore.
- Charge the watch above 50 %.
- For debug JSON events, after the app starts run
  `npm run watch -- console 'DEBUG=true' --listen 60 --device "<device>"`.

| ID | Spec criterion | Setup | Steps | Expected (measurable) |
|---|---|---|---|---|
| HW-1 | 7 (same answer as the PC) | Model uploaded (int8, `tfgest-model.js`) | 1. Open the app, **Manage → Test windows**. 2. Read the alert. 3. If it shows an error instead, note it and repeat with `model/tfgest-model-float.js` (upload, then step 1). | `≥ 4/5 match PC` for int8 (`5/5` for float). Record the result for each model that was tried |
| HW-2 | 8 (inference time) | As HW-1, console | 1. **Manage → Test windows** 3 times. 2. Read `maxMs` from the `selftest` events (also on the alert). 3. In **Run**, make 10 gestures and read `ms` from the `infer` events. | Every value **≤ 100 ms**; record the largest |
| HW-3 | 7 (model loads; arena) | Console | 1. In the console: `var m=E.toString(require("Storage").read(".tfmodel")); var tf=require("tensorflow").create(8000,m); print(tf.getInput().length, tf.getOutput().length, process.memory().free)`. 2. Repeat with 4000 and 2000 instead of 8000. | First line prints `57 6 <free>`. Record the smallest arena that still works and `free`. If `create` throws, record the message |
| HW-4 | 9 (live gestures) | Person who recorded the training data (or the sample model, see note); app in **Run**, watch on the wrist, arm resting on a table | 1. Perform `flick-left` 10 times, 3 s apart. 2. Count how often the screen shows `flick-left`. 3. Repeat for `flick-right`, `twist`, `raise`, `shake`. | **≥ 8 of 10** per gesture |
| HW-5 | 9 (false detections) | App in **Run**, watch on the wrist | 1. Walk normally for 2 min with the arm swinging. 2. Count detections (buzzes / names shown). | **≤ 2** detections in 2 min |
| HW-6 | 1, record on HW | App open, **Record → twist** | 1. Tap, feel one buzz, twist the wrist. 2. Feel two buzzes. 3. Repeat 4 times. 4. In the console: `require("Storage").open("gest.twist","r").readLine()`. | 1 buzz when armed, 2 when saved; count goes up by 1 each time; the line parses, `n` 19, `xyz` has 57 integers −128..127 |
| HW-7 | Full loop (record → train → deploy) | PC with `pc/requirements.txt` installed | 1. Record ≥ 20 of each label in 3 or more sittings at least 10 min apart. 2. Download the `gest.*` files (Web IDE storage view, "save" each StorageFile) into a folder. 3. `python3 apps/tfgest/pc/train.py --data <folder>`. 4. Upload the new `model/tfgest-model.js`. 5. Repeat HW-1, HW-4 and HW-5. | `train.py` exits 0 (test accuracy ≥ 85 %, ≤ 20 KB, ops supported); record the confusion matrix and the HW-4/HW-5 counts |
| HW-8 | 3 (no model, on HW) | Delete the model: `require("Storage").erase(".tfmodel")` | 1. Open **Run**. | Screen shows `no model`; no exception in the console |
| HW-9 | Refractory and threshold | App in **Run**, console | 1. Shake continuously for 5 s. | At most one `detect` per second; no exception |

Note on HW-4: the bundled sample model was trained on **synthetic** data, so
it may recognise real gestures poorly. HW-4/HW-5 only count against the
spec's targets with a model trained on your own recordings (HW-7). With the
sample model, record the counts anyway as a baseline.

Things to look out for and note in Notes: the converter's int8 model uses
per-channel quantised `CONV_2D` and recent op versions; Espruino's TFLM
build is from around 2020. If the int8 model fails in HW-1/HW-3 but the
float one works, note both messages.

## Results

One row per run. Use PASS / FAIL / SKIP per case and explain FAIL or SKIP in Notes.
Record measurements (match counts, ms, arena, gesture counts) in Notes.

| Date | Firmware | Tester | HW-1 | HW-2 | HW-3 | HW-4 | HW-5 | HW-6 | HW-7 | HW-8 | HW-9 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | |
