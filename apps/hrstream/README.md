# HR stream

Streams the optical heart-rate sensor over Bluetooth LE in two ways at once:

- as a standard **Heart Rate Service** (`0x180D` / `0x2A37`), so generic
  fitness and BLE heart-rate apps can show the watch's BPM;
- as **JSON lines on the Nordic UART** (`HR {...}` / `ST {...}`), for custom
  tools such as the included `receiver.html` page.

## On the watch

- Big number: current BPM. It is drawn grey (dithered) and "no reading" is
  shown while the confidence is below 50 %.
- Top: `connected` / `not connected`, and whether streaming is on.
- Bottom: a sparkline of the last 60 readings (confident ones only).
- **Tap**: pause or resume streaming. The sensor stays on.
- **Button**: exit. The HRM is switched off and the custom services are removed.

While no client is connected the app keeps the last 60 samples and sends them
(with their original timestamps) about 1.5 s after a client connects.

## Data formats

```
HR {"t":1732000000123,"bpm":72,"conf":85,"bat":64}
ST {"t":1732000000123,"evt":"stream","on":true}
```

- `t` is watch time (`Date.now()`, ms). One `HR` line per `HRM` event (about 1 Hz), always under 100 bytes.
- The console (REPL) shares the UART, so receivers must ignore every line that has no `HR ` / `ST ` prefix.
- Heart Rate Measurement value: `[flags, bpm]`. `flags` is `0x06` (sensor contact supported and detected)
  when the confidence is at least 50 %, otherwise `0x04` (contact supported, not detected), and the BPM byte
  keeps the last confident value (0 until there is one). BPM is capped at 255.
- Receiver CSV: `watch_ms,host_ms,bpm,conf`.

## Receiver page

Open `receiver.html` in Chrome or Edge (desktop or Android) next to
`hrstream.lib.js` (it loads that file for parsing), for example with
`python3 -m http.server` in this folder and `http://localhost:8000/receiver.html`.
Press **Connect**, pick the Bangle, and the page shows live BPM, a chart, the
HRS value, and lets you download the session as CSV. Press Connect again after
a disconnect to resume; repeated samples are dropped by watch timestamp.

If a phone app doesn't see the Heart Rate Service, forget the device in the
phone's Bluetooth settings and reconnect: phones cache GATT tables, and the
watch only applies new services when nothing is connected.

## Files

| File | What it is |
|---|---|
| `hrstream.lib.js` | Logic module, stored as `hrstream`: `encodeHRS`, `formatLine`, `formatStatus`, `parseLine`, `csvRow`, and the buffering streamer `create()` |
| `hrstream.app.js` | UI, HRM power, BLE services, connect/disconnect handling |
| `receiver.html` | Web Bluetooth receiver: live BPM, chart, CSV download |
| `icon-src.js` | Icon drawing code (`node tools/make-icon.js hrstream`) |
| `tests/logic.test.js` | Encodings, framing, buffer and HRS rules with plain values |
| `tests/buffer.test.js` | Whole app: 75 synthetic `HRM` events offline, then a simulated connect |
| `tests/ui.test.js` | Whole app: greyed rendering (checked on the pixels), HRS value, tap toggles `ST` lines |
| `tests/kill.test.js` | Whole app: HRM power with the app id, `kill`, button exit |
| `HW-TESTS.md` | Checks on a real watch: phone app, receiver page, accuracy, reconnects |

Run the tests: `npm test -- hrstream`. Tutorial: [`tutorials/05-hr-ble-streaming.md`](../../tutorials/05-hr-ble-streaming.md).
