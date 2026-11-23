# AI-guided tests on a real Bangle.js 2

Use this with any assistant that can run commands **on the computer beside
the watch**. A cloud runner cannot reach the human's Bluetooth adapter.
The assistant installs apps over BLE, runs console commands and reads replies;
the human supplies physical actions and measurements. The Web IDE is a fallback,
not the normal upload path.

**Hardware status:** the tooling's metadata mapping, upload expressions and icons
are tested in firmware 2v29.74 in the emulator; packet handling, timeouts and
disconnects have no-radio tests. This CLI has **not been tested with a real
watch, Bluetooth adapter, macOS or Windows**. Neither this guide nor a successful
upload marks a hardware case PASS.

## Conversation contract

1. Read `AGENTS.md` and the chosen app's `HW-TESTS.md`. Those tables define the
   case IDs and numeric gates. Do not substitute an easier test or inferred result.
2. Ask what computer/OS, watch model, firmware and time the human has available.
   Confirm permission to install the selected apps. Ask before a reset, flash-fill,
   deletion of existing data or any other disruptive step.
3. Show **one action at a time**, then wait for confirmation. Do not send the
   human this whole guide as a checklist. Say what to do, how long to wait,
   exactly what to observe, and the expected result for that step.
4. Never assume a gesture worked, a buzz was felt, a screen appeared, or a
   measurement passed. Ask for counts, timing, readings, error text or a photo.
   Ask about ambiguous replies. Record SKIP with a reason when unavailable.
5. Keep a case ledger (app, HW-ID, setup, observations, measurements, outcome).
   Separate emulator evidence, console evidence and human observations. Keep
   recordings local; do not upload personal sensor traces or photos without permission.

## Local prerequisites

- Bangle.js **2**, BLE enabled and connectable, within about 1 m. Normal cases:
  battery above 50%; battery-drain cases have their own starting levels below.
  Do not update firmware or erase the watch just to match the emulator.
- Node.js 18+ (`node --version`), Python 3.10+ (`python3 --version` on macOS/Linux,
  `python --version` on Windows), and a working BLE adapter. Clone this repository
  and run commands from its root.
- Disconnect Gadgetbridge, the Web IDE, app loader, phone fitness apps, nRF
  Connect and any receiver/export page before the shell connects. One client at
  a time. Exit Data logger's Export mode with the watch button before using
  the console, because it handles UART as its own protocol.
- If the watch uses Bluetooth whitelisting, pairing or a passkey, have the human
  permit this computer in the watch settings. Do not silently weaken security.

Install the optional **Python** transport in a local virtual environment.
There are still no npm dependencies, and emulator tests do not use Bluetooth.

macOS/Linux:

```sh
python3 -m venv .venv-watch
.venv-watch/bin/python -m pip install -r tools/requirements-watch.txt
export WATCH_PYTHON="$PWD/.venv-watch/bin/python"
```

Windows PowerShell (native Windows Python, not WSL):

```powershell
python -m venv .venv-watch
.\.venv-watch\Scripts\python.exe -m pip install -r tools/requirements-watch.txt
$env:WATCH_PYTHON = (Resolve-Path .\.venv-watch\Scripts\python.exe).Path
```

`--python <executable>` overrides `WATCH_PYTHON`. Use it if an assistant's shell
does not retain environment variables. `npm run watch -- --help` lists options.

### OS checks and library choice

The transport pins **Bleak 2.1.1**, Python >=3.10. Its native backends use
CoreBluetooth on macOS, BlueZ D-Bus on Linux, and WinRT on Windows. This avoids
Node noble's platform-specific native bindings and Linux raw-HCI privileges.
The Espruino npm CLI is another legitimate tool, but is not required here.

| OS | Before scanning |
|---|---|
| macOS | Enable Bluetooth. Allow the application hosting Python (Terminal, iTerm, editor or AI desktop app) under System Settings → Privacy & Security → Bluetooth. Restart that host after changing permission. macOS returns a device **UUID**, not a MAC address; copy the scan value unchanged. Prefer macOS 12.3+; upstream documents a scan issue on 12.0–12.2. A privacy-related SIGABRT belongs to the host application's Bluetooth usage description/permission, not watch firmware. Try an approved terminal instead. |
| Linux | Use BlueZ >=5.55 with `bluetoothd` running and a local user permitted to use system D-Bus Bluetooth services. Check `bluetoothctl show` (look for `Powered: yes`) and `rfkill list bluetooth`. Ask the human/admin to fix a blocked adapter or policy denial. Do **not** run the assistant as root or grant capabilities to Node: Bleak does not need noble's raw-HCI workaround. Sandboxes/containers need access to the host Bluetooth D-Bus, so prefer the actual local desktop session. |
| Windows | Use native Windows 10 16299+ for the pinned release (prefer supported Windows 11), a BLE-capable adapter and current driver. Turn Bluetooth on in Settings and allow Bluetooth/app access where policy requires it. Run a clean terminal Python, not a GUI/STA event loop or WSL without an explicitly configured adapter. If WinRT reports an STA threading error, use a standalone terminal process. |

References checked for this workflow:
[pinned Bleak package/platform dependencies](https://github.com/hbldh/bleak/blob/v2.1.1/pyproject.toml),
[pinned Bleak supported platforms](https://github.com/hbldh/bleak/blob/v2.1.1/README.rst),
[Bleak troubleshooting](https://bleak.readthedocs.io/en/stable/troubleshooting.html),
[Espruino BLE UART and console protocol](https://www.espruino.com/Interfacing),
[app loader file and `.info` semantics](https://github.com/espruino/EspruinoAppLoaderCore/blob/master/js/appinfo.js).
Upstream “latest” platform support may differ from the pinned release.

## First contact, before installing or testing anything

Scan (does not connect or change watch storage):

```sh
npm run watch -- scan
```

Output is one JSON object per advertising UART device, with `device`, `name`,
and `rssi`. Names are not unique and UART devices are not necessarily watches.
Ask the human to identify their watch; never pick an arbitrary nearby device.
In commands below replace `<device>` with the exact address/UUID, and quote it.

**The first connection must be this read-only contact check:**

```sh
npm run watch -- first-contact --device "<device>"
```

Expect a confirmed `first-contact` result such as
`{"ok":true,"value":{"version":"2v29.74","board":"BANGLEJS2","battery":83}}`,
then `{"disconnected":true}` and exit code 0. This runs `process.env.VERSION`,
`process.env.BOARD` and `E.getBattery()` without installing an app or resetting.
It cancels an unfinished console input line, so do not use it during an
interactive console operation. Record the **actual** firmware and battery.
Stop if the board is not BANGLEJS2, the reply is missing, or the battery is
unsuitable. `first-contact` is not a firmware updater.

### Connection/upload failures

All commands have bounded scan/connect/per-command timeouts (`--timeout 2..300`,
default 20 s) and a nonzero exit code on an unconfirmed operation.

| Failure | Assistant's next action |
|---|---|
| Bluetooth off/unavailable | Ask the human to turn on/unblock the adapter and enable Bluetooth on the watch; check OS status, then rescan. |
| Permission denied | Follow the OS row above. Do not retry endlessly, run as root or change policy without approval. |
| Watch not found | Confirm the human selected the right device, distance, watch power and connectable setting. Disconnect other clients, then scan again. |
| Already connected elsewhere | Disconnect Gadgetbridge on the phone, Web IDE/app loader tabs, receiver/export pages and other BLE apps. Wait for advertising to resume, rescan, then retry. A scan miss or generic timeout **cannot prove** which app holds the connection. Diagnostics describe possibilities, not a false certainty. |
| Upload interrupted, readback false, no acknowledgement, timeout or cancellation | Stop. Files may be partial; do not launch. Confirm radio/connection health, reconnect, rerun the **whole** install and require all verifications plus the final listing. There is no automatic retry, resume or rollback. `.info` is erased before upload and written last, reducing the chance of launching a partial install; interruption near the end can still leave an entry. Existing app files may already have changed. |
| UART absent or console unresponsive | Exit Data logger Export mode; disconnect other clients. Some apps alter BLE services. Ask the human to return to the clock, then rescan. If a reset is needed, explain loss of current recording state and obtain approval first. |

For diagnostics use Bleak's `BLEAK_LOGGING=1` (PowerShell:
`$env:BLEAK_LOGGING="1"`). Logs contain nearby device addresses; keep them local
and redact before publishing.

## Install, verify, run, collect console output

Inspect the planned file names, sizes and exact Storage commands without Python,
Bluetooth or any watch side effects:

```sh
npm run watch -- install touchgest --dry-run
```

After the human approves installing that app:

```sh
npm run watch -- install touchgest --device "<device>"
```

The command returns to the clock (stopping the current app), uploads **all**
`metadata.json` storage entries, and verifies each 192-byte chunk by reading
it back. It resolves cross-app URLs, for example hapticpat's
`../touchgest/gestures.lib.js` → Storage `gestures`. It evaluates `app-icon.js`
**on the watch**, storing the binary result as `<id>.img`, not the JS text.
It preserves existing default-data files and writes `<id>.info` last with
the loader's `id`, launcher name, `src`, `icon`, `version`, `tags`, `files`,
and optional `data`/`sortorder`. Data without initial content is not uploaded.
No network modules, minification, arbitrary loader customizations or firmware
updates are performed. This tool supports this repository's app metadata,
not every possible BangleApps package.

Success means exit code 0, every write/readback `ok:true,value:true`, a final
`Storage.list` including the expected files, `verify launcher entry` true,
and `disconnected:true`. Upload can take minutes. App files are replaced, not
backed up; inspect the dry-run and back up any customized versions first.
Shared modules are uploaded as declared, so use matching repository versions.

To list files independently and launch:

```sh
npm run watch -- list --device "<device>"
npm run watch -- run touchgest --device "<device>"
```

`run` registers a one-shot disconnect handler to call `load("touchgest.app.js")`
after the connection closes, so BLE service changes can take effect.
Ask what appears on the screen; its reply
confirms scheduling, not that the UI launched correctly.

The shell console works while the app is running. **It does not reset the app.**
It evaluates JS, prints a tagged JSON result (`value`), captures printed lines
as `console`, and disconnects. For example:

```sh
npm run watch -- console 'E.getBattery()' --device "<device>"
npm run watch -- console 'DEBUG=true' --listen 60 --device "<device>"
npm run watch -- console 'Bangle.isCompassOn()' --device "<device>"
```

During the 60-second listener ask the human to perform just the agreed action.
`--listen 0..3600` records later events without keeping a permanent connection.
After disconnect the app keeps running; DEBUG remains until reload.
The CLI uses an eval scope: top-level `var` declarations are local to that
invocation; use `global.name=...` only when a later invocation needs the value.
Async results need `print(...)` plus sufficient `--listen` (for example 35 seconds
for baroalt HW-0's 30-second rate measurement). Prefer delayed
`load()` for console reload tests, so an acknowledgement can be read first:

```sh
npm run watch -- console 'setTimeout(function(){load();},1000);true' --device "<device>"
```

PowerShell single-quoted JS works for examples above. For scripts containing
complex nested quotes, save a local `.js` file and use `exec`.
For TF model deployment (not part of app metadata):

```sh
npm run watch -- exec apps/tfgest/model/tfgest-model.js --timeout 120 --device "<device>"
```

Require the printed `tfgest model stored`, a successful reply and a clean
disconnect; then run HW-1. Use `tfgest-model-float.js` only for its specified
compatibility comparison, recording both outcomes. Do not confuse the optional
PC training environment with the small BLE virtual environment.

**Release the connection** before using HR receivers or Data logger export.
Their case-specific IDE references mean “console” unless a case explicitly
tests the IDE itself. Use the real Web IDE for HR stream HW-10's IDE integration
case; a shell console alone cannot prove the IDE UI works.

## Suggested session order

Do not try to finish hours-long tests while the human waits at the desk.
Agree on a session and record the remaining cases as SKIP/pending.

| Session | Apps and priorities | Ask for |
|---|---|---|
| Desk | 01 touchgest, 02 hapticpat, 05 hrstream | Gesture counts in each direction, timings and motor feel; second tester/slow-motion camera if available; pulse/chest-strap reference; phone BLE receiver and desktop Chrome/Edge |
| Compass | 03 compasscal: HW-0 axis-sign check early, then calibration/tilts | Magnetic-north phone compass, metal-free location, four cardinal readings and tilt angles |
| Stairs/weather | 04 baroalt, HW-0 sample rate early | Safe staircase, actual floor height, lift if available, thermometer, local QNH, one-hour stationary run |
| Recording | 06 datalog | Space for logs, 30-minute 100%-battery run and exports; schedule disruptive tests separately |
| Activity | 07 actcls, datalog also installed for HW-1 | Two people × four labelled recordings; four-hour battery run; distinguish observations from replay accuracy |
| ML | 08 tfgest | **HW-1 first**, before collecting a training set: check int8 compatibility, then float if needed; HW-3 arena check; sample-model baseline vs personally trained results |

For browser pages serve the correct root explicitly:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory apps/hrstream
# http://localhost:8000/receiver.html
python3 -m http.server 8000 --bind 127.0.0.1 --directory apps/datalog
# http://localhost:8000/export.html
```

Run only one server at a time on that port, stop it afterwards, and use native
Windows `python` if needed. Ask before opening/listening on a local port.
For Data logger, select **Export (PC)** on the watch; with other clients
disconnected, the BLE venv can run:

```sh
.venv-watch/bin/python apps/datalog/export.py list
.venv-watch/bin/python apps/datalog/export.py get <recording-name> --raw -o build/recording.txt
node apps/actcls/tools/evaluate.js <raw-log-files...>
```

Create `build/` if needed. On Windows replace the Python executable with
`.\.venv-watch\Scripts\python.exe`. The existing export client selects by
Bangle name prefix, so ensure only the intended watch is available.
It does not use `watch --device`. Exit Export mode before shell console commands.

## Safety, disruptive cases and cleanup

These are optional sessions, not prerequisites to ordinary testing. For each,
explain the effect and ask for explicit confirmation. Back up recordings/settings
first with the IDE Storage view or the app's export facility. Never erase all
Storage, format the watch or delete unrelated files.

- **02 HW-8:** battery **below 15%**. **06 HW-12:** start at about **11–12%**,
  expect the logger to stop at 9%. Do not force discharge with a tight loop,
  bypass safeguards, fake `E.getBattery()` or treat injected battery values as
  hardware evidence. SKIP if the human cannot naturally reach the level.
  Charge afterwards. Stop if the watch becomes hot or uncomfortable.
- **06 HW-6 watchdog:** intentionally reboots without the app's `kill` cleanup,
  possibly losing the last chunk of the test recording. With the test recording
  running, after confirmation:
  `npm run watch -- console 'setTimeout(function(){E.enableWatchdog(1,false);while(1){}},1000);true' --device "<device>"`.
  This lets the acknowledgement return before the watchdog operation. The human
  must confirm the reboot. A disconnection alone is not success. After reboot,
  first-contact again and examine/export the recording per the case.
- **06 HW-7 flash-fill:** inspect `require("Storage").getFree()` and confirm
  `"filler"` is not an existing user file (`require("Storage").read("filler")`).
  Only if free >60000 and the name is unused, after approval:
  `npm run watch -- console 'require("Storage").write("filler","",0,require("Storage").getFree()-60000)' --device "<device>"`.
  This consumes nearly all free flash and can disrupt other apps. Keep a cleanup
  note even if the case aborts. Afterwards:
  `npm run watch -- console 'require("Storage").erase("filler");require("Storage").read("filler")===undefined' --device "<device>"`.
  Require `value:true` and confirm free space recovered. Do not create filler
  when there is too little free space, and never erase another file instead.
- **Compass:** HW-1 clears `compass.json` (calibration), not `compasscal.json`
  (options). Save existing contents before a deliberate recalibration.
  HW-3's temporary `compasscal.json` must be removed afterwards if it did not
  exist before, or restored from backup if it did.
- **Barometer:** restore the previous `baroalt.json`. If only resetting this
  session's option, use
  `var s=require("Storage"),c=s.readJSON("baroalt.json",1)||{};c.stepCheck=false;s.writeJSON("baroalt.json",c)`
  through `console`, preserving floor height and pressure settings.
- **TF 08 HW-8:** removes `.tfmodel`. Back up a personalized model first.
  Restore the original model afterwards, or redeploy the same tested model
  script and recheck HW-1. Restoring the bundled sample over a user's trained
  model is **not** restoration.
- Exit each app with its button. Check that active sensors/motor stopped using
  the app's power case; restore temporary options/DEBUG by reloading. Disconnect
  receivers and stop local servers.
- To remove a test app:
  `npm run watch -- uninstall touchgest --device "<device>"`.
  Uninstall preserves data/recordings and files owned by another installed app
  (for example `gestures` when hapticpat still needs it); it prints erased and
  retained names. Ask before deleting saved recordings or settings separately.

## Failure handling and tuning

Record the original failure before changing anything: firmware, repo commit,
case ID, exact setup, error/log, counts and measurements. Repeat the **same**
scenario once when safe; distinguish Bluetooth transport trouble from app behavior.
No speculative tuning just to turn a row green. Agree on a change, keep the
original gate, change one parameter group at a time, rerun emulator checks and
the failing hardware case, then relevant neighboring cases.

| App | Where to inspect/tune |
|---|---|
| 01 touchgest | `apps/touchgest/gestures.lib.js`: `SWIPE_MIN`, `SWIPE_MS` and other recognizer thresholds. This file is shared by hapticpat, so reinstall/retest both when changed. |
| 02 hapticpat | `apps/hapticpat/haptic.lib.js`: patterns and `LIMITS`; `hapticpat.app.js`: UI/strength cap. **Do not relax duty, duration or low-battery safeguards** to pass a feel test. |
| 03 compasscal | `apps/compasscal/compasscal.lib.js`: `MAG_SIGN`, axis order/`atan2(-x,y)`, calibration and smoothing; `compass.json`: calibration; `compasscal.json`: tilt-compensation option. Confirm cardinal readings before changing signs. |
| 04 baroalt | `apps/baroalt/baroalt.lib.js`: filters/gating; `baroalt.json`: `floorM`, `stepCheck`, `p0`. Use measured floor height, not a value chosen to fit the count. |
| 05 hrstream | `apps/hrstream/hrstream.lib.js`: `THRESHOLD`, confidence and ring/stream logic; `hrstream.app.js`: sensor/service setup; `receiver.html`: subscription/CSV. Check another client is not holding BLE first. |
| 06 datalog | `apps/datalog/datalog.lib.js`: `CHUNK`, `MAX_BUF`, `FULL_RATIO`, `LOW_BATTERY`, rate table; `datalog.app.js`: sensor setup and flush/kill handlers; `export.py`/`export.html`: export protocol. Preserve battery/flash limits. |
| 07 actcls | `apps/actcls/actcls.lib.js`: `RULES`, `WIN_MS`, `HOP_MS` and `debounce(2)` in `create()`. Tune from held-out real logs, then run `node apps/actcls/tools/evaluate.js <raw-log-files...>`. |
| 08 tfgest | `apps/tfgest/tfgest.lib.js`: onset/refractory and confidence logic; uploaded `gestmodel.json`: `thresh`, `arena`, labels, quantization; source metadata in `apps/tfgest/model/gestmodel.json` and generated model scripts. Run HW-1/HW-3 before diagnosing live recognition. |

**Known issue, 07 HW-3:** a single nose-scratch is expected to be capable of
failing. Four-second windows overlap by 50%, so one movement can affect two
windows and pass the current two-window debounce. Record the actual 5-trial
count as PASS/FAIL against the unchanged ≥4/5 gate. Candidate follow-up:
three-window debounce, with tests for added transition latency and genuine
activity changes. Do not silently implement that fix during a baseline run.

## Record results and follow up

Fill the existing Results and Measurements tables in `apps/<id>/HW-TESTS.md`.
Use one row per run: date, real firmware, consenting tester initials/alias,
PASS/FAIL/SKIP per ID, and measured values plus reasons in Notes.
An unrun case is SKIP/pending, never PASS. For long notes add a dated subsection
linked from the row. Record the tested commit, OS/adapter/transport, model variant,
changed constants and whether the watch was connected during a battery run.
Also update tutorial measurement tables where the case asks for them.

Before proposing code fixes, summarize observed failures and cleanup status to
the human. Prepare a results PR and, when needed, a separate fix PR or issue:
reproduction, expected numeric gate, actual numbers, minimal redacted logs,
suspected source and proposed validation. Ask before publishing to GitHub;
do not attach raw personal recordings by default. Run `npm test`,
`npm run test:harness` and `npm run test:watch` for tooling/code changes.
On Windows the last script's Python test command can be run separately with
`python -m unittest discover -s tools -p watch_ble_test.py`.

## Fallback only: Web IDE or custom app loader

If the local BLE transport cannot be made to work, record the blocker and agree
to switch. Disconnect the shell client first.

- [Espruino Web IDE](https://www.espruino.com/ide/): connect using Web Bluetooth
  in a supported local browser. The dry-run JSON lists destination names and
  Storage-write commands, including evaluated icons and the generated `.info`.
  Upload each source to its **metadata destination name**, evaluate icon
  expressions, and create the exact generated `<id>.info` from the dry-run,
  last. Do not send an app to RAM and assume it is installed. Verify
  `require("Storage").list()` and `.info` contents in the console.
- Custom app loader: point a compatible BangleApps loader/catalog at a hosted
  checkout of this repository (or add its apps to your loader fork). Follow that
  loader's custom URL/repository instructions; it must serve metadata and every
  referenced relative file, including `../touchgest/gestures.lib.js`. An arbitrary
  GitHub repository URL is **not** automatically an installable loader catalog.
  Let the loader evaluate icons and write `.info`. Record the actual loader URL
  and version used.

The authoritative steps and gates remain the same regardless of transport.
