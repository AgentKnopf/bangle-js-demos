# Conventions for every prototype

Rules for anyone (person or agent) adding an app, test, tutorial or hardware
test case to this repo. The specs for the prototypes live outside the repo;
this file holds the rules that apply to all of them.

## Workflow

- One pull request per prototype, from a branch named `proto/NN-<slug>`
  (for example `proto/01-touch-gestures`). Only the initial scaffold was
  pushed straight to `main`.
- A prototype PR contains `apps/<id>/` (complete, see below),
  `tutorials/NN-<slug>.md` with its images, and the updated row in the
  README prototype table.
- Don't change `tools/` in a prototype PR. If the harness is missing
  something or has a bug, raise it so it is fixed in its own PR.
- Before opening the PR: `npm test` and `npm run test:harness` pass locally;
  CI must be green before merge.
- Commit messages: short imperative subject (`Add touch gesture recognizer`),
  and end with
  `Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>`
  when an agent wrote the change.

## App folder

`apps/<id>/` where `<id>` is lowercase letters/digits, at most 20 characters,
and unique enough not to clash with BangleApps ids already on a watch.
`npm run check` enforces the mechanical parts:

- `metadata.json` in BangleApps loader format with `id`, `name`,
  `shortName`, `version` (`0.01`), `description`, `icon` (`app.png`),
  `type` (`app`), `tags`, `supports: ["BANGLEJS2"]`, `readme`, `storage`;
  add `"allow_emulator": true` when the app runs in the emulator and `data`
  for files the app creates.
- `storage` includes `<id>.app.js` and `<id>.img`
  (`{"name":"<id>.img","url":"app-icon.js","evaluate":true}`). Storage
  names are at most 28 characters.
- Icon: draw it in `icon-src.js` and run `node tools/make-icon.js <id>`; it
  writes `app.png` (48×48) and `app-icon.js` using the real firmware's
  Graphics. Commit all three.
- `README.md`, `HW-TESTS.md` (from `hw-tests/TEMPLATE.md`) and at least one
  `tests/*.test.js`.
- Keep each source file under about 20 KB.

## Code conventions

- Plain ES5-ish JavaScript as Espruino runs it; no build step. Avoid
  features Espruino lacks (see gotchas below).
- **Separate logic from input.** Put the logic in a module (`<name>.lib.js`
  stored as `{"name":"<name>","url":"<name>.lib.js"}` and loaded with
  `require("<name>")`) whose functions take plain objects and timestamps:
  `feed({x,y,b,t})`, `onAccel({x,y,z,mag})`, `encodeHRS(bpm, contact)`. Sensor
  and touch handlers in the app only forward to it. No `Bangle`, `g` or
  `Date.now()` calls inside pure logic unless injected, so tests can drive it.
- **Power:** switch sensors on with the app id (`Bangle.setHRMPower(1, "<id>")`)
  and off again in an `E.on('kill', …)` handler or when the feature stops.
  (The `kill` event is on `E`, not `Bangle`.)
- **Exit:** the button returns to the launcher (`Bangle.setUI` with a `btn`
  or `back` handler, or `Bangle.showLauncher()`), unless the spec says
  otherwise.
- **Logging for tests:** a module-level `var DEBUG = false;`. When on, the
  app prints one-line JSON events with `console.log(JSON.stringify({evt:"…", …}))`.
  Field names follow the spec's data formats.
- **No personal data:** keep nothing beyond what the spec lists; never send
  data anywhere except the explicitly connected device.

## Writing tests

Each `apps/<id>/tests/*.test.js` runs in a fresh emulator (fresh Storage)
after the app's `storage` files and `tests/fixtures/*` are uploaded. The
file is evaluated at the top level, then its tests run one after another.

```js
var G = require("touchgest");             // a Storage module from metadata.json

T.test("tap after the double-tap window", function (done) {
  var got = [];
  var r = G.create({});
  r.on("gesture", function (ev) { got.push(ev.type); });
  r.feed({x: 88, y: 88, b: 1, t: 0});
  r.feed({x: 88, y: 88, b: 0, t: 100});
  setTimeout(function () { T.eq(got, ["tap"]); done(); }, 500);  // virtual time
});
```

To test the whole app, evaluate it at the top of the test file; its globals
become visible to the tests:

```js
eval(require("Storage").read("hello.app.js"));
DEBUG = true;
T.beforeEach(function () { T.capture(); });
```

### The `T` API

| Call | What it does |
|---|---|
| `T.test(name, fn, {timeout})` | Register a test. `fn()` is synchronous, `fn(done)` is async (call `done()` or `done(err)`), or return a Promise. Default timeout 60 000 ms virtual. |
| `T.beforeEach(fn)`, `T.afterEach(fn)` | Run around every test. |
| `T.ok(v, msg)`, `T.eq(a, b, msg)`, `T.near(a, b, tol, msg)`, `T.throws(fn, msg)`, `T.fail(msg)` | Assertions. `eq` compares objects/arrays by JSON. A failure inside a timer callback still fails the right test. |
| `T.spy(obj, "fn")` / `T.spy(obj, "fn", impl)` | Record calls (`.calls` is an array of argument arrays), optionally replacing the function. Restored after each test. Works for missing functions too, e.g. `T.spy(NRF, "updateServices", function(){})`. |
| `T.requireRAM(name)` | Load a Storage module as a RAM copy. Code run from Storage executes from emulated flash and is about 10x slower; use this for tests that replay thousands of samples. |
| `T.capture()` | Start collecting the app's JSON `console.log` lines into `T.events` (clears it). `T.eventsOf("buzz")` filters by `evt`. |
| `T.emit(obj, evt, arg, cb)` | `obj.emit(evt, arg)` and call `cb` after the handlers ran. |
| `T.tap(x, y)`, `T.swipe(x0, y0, x1, y1, ms)`, `T.touch(x, y, pressed)` | Real touchscreen input through the firmware (fires `touch`, `drag`, `swipe` like the Web IDE emulator). |
| `T.press(ms)`, `T.button(pressed)` | Press BTN1 (fires `setWatch` and `Bangle.setUI` handlers). |
| `T.screenshot(name)` | Save the screen to `build/screenshots/<id>/<name>.png`. |

Input and screenshots are carried out by the harness after the current JS
task returns, so check their effects in a `setTimeout` (a few hundred ms of
virtual time is plenty).

### Virtual time

The watch clock only moves when the watch is idle, and then it jumps to the
next timer. `setTimeout(fn, 600000)` fires immediately in wall time with
`Date.now()`/`getTime()` 10 minutes later. Long scenarios (60 s playback
limits, 1 h drift) are cheap. Code running in one task sees time stand
still; timestamps you feed to pure functions should be explicit numbers.
Each test file starts at 2026-01-01 09:00:00 UTC.

### Sensor data

The emulator has no sensor data (see below). Feed samples to your logic
functions directly, or emit the event the app listens to:
`T.emit(Bangle, "accel", {x:0, y:0, z:-1, mag:1, diff:0}, cb)`. For recorded
data, put files in `tests/fixtures/` and read them with `require("Storage")`.

## What the emulator does (firmware 2v29.74, checked with the harness)

| Area | Emulator behaviour |
|---|---|
| Graphics, fonts, `Bangle.appRect`, `E.showMenu` etc. | Real firmware, screenshots work |
| Touch, swipe, BTN1, `Bangle.setUI` | Work through the firmware's own input path |
| Storage, StorageFiles (`open(name,"a")`, `list(re,{sf:true})`) | Work; 8 MB, fresh per test file. StorageFile names up to 27 chars work, 28 fail |
| Timers, Promises, `E.*` | Work, in virtual time |
| `Bangle.buzz(ms, s)` | Returns a Promise that resolves at once, whatever `ms` is; overlapping calls don't error. Time steps yourself and spy on `buzz` |
| Accelerometer | `getAccel()` is all zeros, no `accel` events |
| HRM, compass, barometer, GPS | `set*Power()` returns false, `is*On()` stays false, no events; `getCompass()` is null, `getPressure()` returns undefined |
| `Bangle.setOptions({seaLevelPressure})` | Unknown option — compute altitude in the app |
| `Bangle.setOptions({powerSave:false})`, gesture options (`gestureStartThresh` …) | Exist |
| `require("tensorflow")` | Not in the emulator build (`Module "tensorflow" not found`). TF tests are [HW] |
| `NRF.setServices` | Accepted, no effect. `NRF.updateServices` and `Bluetooth.println` don't exist: spy them |
| `E.getBattery()` | Returns 0. Spy it in tests: `T.spy(E, "getBattery", function(){return 80;})` |
| Locking | The emulated watch never locks |

## Gotchas

Firmware 2v29.74 in the emulator. Unless noted, assume the real watch behaves the same.

- **`String.indexOf` false matches:** it can return a match when the needle runs off the end of the string: `"tap: set target".indexOf("tilt") === 14`, `"abct".indexOf("tx") === 3`, `"hello".indexOf("oz") === 4`. The upstream master source still looks affected, and Bangle.js 2 builds use the same code path, so expect it on the watch too. Don't use `s.indexOf(x) >= 0` as "contains": compare whole strings, or check `s.substr(i, x.length) === x` at the index found. If an app relies on substring search, add an HW-TESTS case.
- **Code in Storage is slow:** functions loaded with `require()` or defined in a Storage file run from flash, about 10x slower in the emulator (2000 calls of a 40-line `feed()`: 17.4 s vs 1.9 s). Use `T.requireRAM(name)` in heavy tests.
- **Regex has no `{n}` quantifier:** `/^a\d{2}$/.test("a12")` is false. Write `\d\d` or use `+`.
- **No hoisting from Storage:** top-level function declarations in an app file loaded from Storage aren't hoisted. Define functions before using them.
- `StorageFile.readLine()` keeps the trailing `"\n"`.
- `emit()` is asynchronous in Espruino: handlers run after the current task. Use `T.emit` or a `setTimeout`.
- `Array.prototype.slice.call(arguments)` is not supported; copy `arguments` in a loop.
- `JSON.stringify(undefined)` returns `"null"`.
- An uncaught error can lose its error object when another callback in the same idle step uses try/catch; the harness still fails the test, with "uncaught exception (error lost)". Find the real error by running the code without the other callback.
- Evaluating the app at the top level of a test runs its startup code (UI, `setUI`, sensor power). Keep startup idempotent and cheap, or test the module instead.
- `load()` in an app restarts the interpreter and would end the test: spy it (`T.spy(global, "load", function(){})`).

## Hardware tests

Everything tagged [HW] in a spec becomes a case in `apps/<id>/HW-TESTS.md`,
written from `hw-tests/TEMPLATE.md`. Each case is a numbered `HW-n` that
names the spec criterion, the setup, numbered steps a tester can follow
without reading code, and a measurable expected result. Testers fill the
results table (date, firmware, tester, PASS/FAIL per case, notes) in a PR.

## Tutorials

`tutorials/NN-<slug>.md` from `tutorials/TEMPLATE.md`, following the
outline in the prototype's spec. Each step has a short runnable snippet.
Screenshots come from the emulator (`tools/screenshot.js` or
`T.screenshot`) and live in `tutorials/img/NN/`. Facts the emulator could not
confirm are marked as needing a real watch.
