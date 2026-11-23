# Hello harness

A tiny tap counter that proves the emulator test harness end to end and
serves as a template for new apps.

- Tap the screen: the count goes up.
- No tap for 60 s: the count resets.
- Button: back to the launcher.

## Files

| File | What it is |
|---|---|
| `hello.lib.js` | Logic module, stored as `hello` (`require("hello")`) |
| `hello.app.js` | UI, input and timers |
| `icon-src.js` | Icon drawing code; `node tools/make-icon.js hello` writes `app.png` and `app-icon.js` |
| `tests/logic.test.js` | Tests the module with plain numbers |
| `tests/app.test.js` | Runs the app with real touch input, timers, button and `kill` |
| `HW-TESTS.md` | Checks a person runs on a real watch |

Run the tests: `npm test -- hello`.
