# Bangle.js 2 demos

Small, self-contained prototype apps for the [Bangle.js 2](https://www.espruino.com/Bangle.js2)
watch, each with a tutorial, tests that run headlessly in the real Espruino
firmware, and a list of checks for real hardware.

## Prototypes

| # | App folder | Topic | Level | Tutorial | Status |
|---|---|---|---|---|---|
| 0 | [`apps/hello`](apps/hello) | Harness example: tap counter | — | — | done |
| 1 | [`apps/touchgest`](apps/touchgest) | Touch gesture recognizer | beginner | [01](tutorials/01-touch-gestures.md) | done |
| 2 | [`apps/hapticpat`](apps/hapticpat) | Haptic pattern player with safety limits | beginner | [02](tutorials/02-haptic-patterns.md) | done |
| 3 | [`apps/compasscal`](apps/compasscal) | Compass with calibration | beginner/intermediate | [03](tutorials/03-compass-heading.md) | emulator tests pass; HW tests pending |
| 4 | [`apps/baroalt`](apps/baroalt) | Barometer altitude, stair counting, temperature | intermediate | [04](tutorials/04-barometer-altitude.md) | emulator tests pass; HW tests pending |
| 5 | `apps/hrstream` | Heart rate over BLE to phone/PC | intermediate | `tutorials/05-hr-ble-streaming.md` | planned |
| 6 | `apps/datalog` | On-watch data logging and export | intermediate | `tutorials/06-data-logging.md` | planned |
| 7 | `apps/actcls` | Rule-based activity / restlessness classifier | intermediate/advanced | `tutorials/07-activity-classifier.md` | planned |
| 8 | `apps/tfgest` | TensorFlow Lite wrist-gesture classifier | advanced | `tutorials/08-tflite-wrist-gestures.md` | planned |

App ids are proposals; the PR that adds a prototype may rename it and updates this table.

## Layout

```
apps/<id>/                 one folder per app (BangleApps loader format)
  metadata.json            app loader metadata; "storage" lists the files to upload
  <id>.app.js              the app
  *.lib.js                 testable logic as a Storage module (optional, recommended)
  app-icon.js, app.png     icon (generate with tools/make-icon.js from icon-src.js)
  tests/*.test.js          emulator tests (tests/fixtures/* are uploaded to Storage)
  HW-TESTS.md              checks a person runs on a real watch, plus results
  README.md                what the app does and how to use it
tutorials/NN-<slug>.md     one tutorial per prototype; images in tutorials/img/NN/
hw-tests/                  template and how-to for hardware test cases
tools/                     emulator harness, screenshot and icon tools, checks
```

## Running the tests

You need Node.js 18 or newer. There are no npm dependencies.

```sh
npm test                 # check app metadata, then run every app's emulator tests
npm test -- hello        # only one app (several ids allowed)
npm test -- hello --verbose            # also show the watch's console output
npm run check            # only the metadata/layout checks
npm run test:harness     # self-test of the harness itself
```

The first run downloads the Bangle.js 2 emulator from the Espruino Web IDE at a
pinned revision (firmware 2v29.74) into `.cache/emulator/` and checks its
SHA-256. Set `BANGLE_EMU_DIR=/path/to/EspruinoWebIDE/emu` to use another build.

Tests run in **virtual time**: when the watch is idle the clock jumps straight
to the next timer, so a test that waits 10 minutes of watch time takes a few
milliseconds, and every run gives the same result.

Results go to the terminal and to `build/test-results.json`; screenshots taken
by tests go to `build/screenshots/<id>/`. CI runs the same commands on every
push and pull request (`.github/workflows/test.yml`).

## Screenshots for tutorials

```sh
node tools/screenshot.js hello                       # -> build/screenshots/hello/screen.png
node tools/screenshot.js hello --load --tap 88,88 --tap 88,88 --scale 2 --shot tutorials/img/00/two-taps.png
```

Run `node tools/screenshot.js` without arguments for all steps (`--js`, `--wait`, `--swipe`, `--press`, ...).

## Contributing

Read [AGENTS.md](AGENTS.md) before adding or changing an app: it lists the
conventions every prototype follows, how to write tests, and what the
emulator can and can't do.
