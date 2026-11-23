# Data logger

Records sensor samples to flash in a compact, append-only format, keeps going
with the screen locked, survives crashes, and exports recordings to a PC as
CSV. It is the data-collection tool for the activity classifier (07) and the
TensorFlow gestures (08).

## On the watch

- **Main menu**: a rate per source (Accel 12.5/25/6.25 Hz, Heart rate 1 s/5 s,
  Pressure 1 s/10 s, Compass 5 Hz/1 s, Steps every 10 s/1 min, or off), a
  **Label** (from the list in Settings), **Start**, **Recordings**, **Export (PC)**.
- **While logging**: label, elapsed time, sample count, flash used / free, battery.
  The screen can lock; logging continues.
  **Hold the button for 1 s** to stop, or tap the screen for a Stop/Continue menu.
- **Recordings**: newest first, with size, duration and sample count. Tap one,
  then **Delete** asks Yes/No.
- **Export (PC)**: hands the Bluetooth UART to the export protocol until you
  press the button (the Web IDE console doesn't work on this screen).
- Logging stops by itself with "storage full" at 95 % of the free flash seen at
  start, and with "battery low" below 10 %.
- **Settings → Apps → Data logger** chooses which labels the menu offers. Labels
  are stored in `datalog.json` (`{"labels":[...]}`); you can add your own there.

## Log format

StorageFile `log.<yyyymmdd>-<hhmm>` (local time; `-2`, `-3` … if the minute is
taken). First line is a JSON header, then one CSV line per sample:

```
{"v":1,"start":1732000000000,"label":"walk","src":{"a":80,"h":1000,"p":1000}}
120,a,-0.02,0.98,0.11
1003,h,71,88,
1010,p,1009.41,31.2,
```

- Columns: `<ms since start>,<type>,<v1>,<v2>,<v3>`, always 5 fields (empty if unused).
- `a` accel x,y,z in g (2 decimals) · `h` bpm, confidence · `p` hPa (2 decimals), °C (1 decimal) ·
  `m` heading in degrees (1 decimal; empty while the compass is uncalibrated) · `s` steps since the previous `s` line.
- `start` is epoch ms; `src` maps each source to its interval in ms. `label` is `""` when none was chosen.
- Times come from `getTime()` differences. If the clock is set back during a recording, time stands
  still instead of going backwards, so the column is always non-decreasing.
- Samples are buffered in RAM and written in chunks of about 1 KB.
- A last line without a newline was cut off by a reset; readers must ignore it (`eachLine` does).
- If samples ever had to be dropped (flash writes failing), the file ends with a trailer line
  `{"dropped":N}`. Lines starting with `{` other than the first are metadata, not samples.
- Each source's rate is a fixed grid (e.g. one `h` line per 1000 ms at most); events faster than the
  grid are skipped, so the average rate matches `src`.

Reading it on the watch (07/08 can reuse this):

```js
var D = require("datalog");
D.eachLine(require("Storage"), "log.20261123-1015", function (line) {
  var s = D.parseSample(line); // {t, type, v:[v1,v2,v3]} or null for the header/trailer
});
```

## Export

UART protocol (newline-terminated):

```
PC → watch:  LIST
watch → PC:  F {"name":"log.20261123-1015","bytes":48210}   (one per file), then END
PC → watch:  GET log.20261123-1015
watch → PC:  the file's complete lines verbatim, then END
```

Errors answer `ERR {"msg":"..."}` then `END`.

- **Web page**: open `export.html` next to `datalog.lib.js` (e.g. `python3 -m http.server` in this folder,
  then `http://localhost:8000/export.html`) in Chrome/Edge, put the watch on **Export (PC)**, Connect,
  then **CSV** or **raw log** per recording.
- **Python**: `pip install bleak`, then `python3 export.py list` / `python3 export.py get <name>`.
  `python3 export.py convert <raw log file>` converts a file you downloaded with the Web IDE.
- **Web IDE**: the Storage view lists the StorageFile and can download it as the raw log.

CSV columns: `t_ms,type,accel_x,accel_y,accel_z,hr_bpm,hr_conf,pressure_hpa,temp_c,heading_deg,steps,label`.

## Files

| File | What it is |
|---|---|
| `datalog.lib.js` | Logic module, stored as `datalog`: names, line format, `createLogger`, `eachLine`/`parseSample`/`info`, `toCSV`, `createServer` (LIST/GET) |
| `datalog.app.js` | Menus, sensor power, logging screen, recordings, export mode |
| `datalog.settings.js` | Settings menu for the label list |
| `export.html` | Web Bluetooth export page (uses `datalog.lib.js`) |
| `export.py` | Python/bleak export and offline conversion |
| `tests/*.test.js` | Emulator tests (see the tutorial for what each covers) |
| `HW-TESTS.md` | Checks on a real watch |

Run the tests: `npm test -- datalog`. Tutorial: [`tutorials/06-data-logging.md`](../../tutorials/06-data-logging.md).
