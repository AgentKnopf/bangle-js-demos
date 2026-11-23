# Hardware test cases

Emulator tests cover the logic. Anything that needs real sensors, the
vibration motor, the radio or human judgement is a hardware test case,
written in each app's `apps/<id>/HW-TESTS.md`, using [TEMPLATE.md](TEMPLATE.md).

Rules:

- One row per [HW] acceptance criterion in the spec (split it if it has several checks).
- Steps a tester can follow without reading the code; expected results with numbers (counts, tolerances, durations).
- Testers add a results row per run (date, firmware version, initials, PASS/FAIL/SKIP per case, notes) in a PR.
