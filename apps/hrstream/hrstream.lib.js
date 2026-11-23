// Heart-rate streaming logic: BLE encodings, line framing and the
// disconnected-buffer. No Bangle/NRF/g calls here; the app injects `send`.
exports.THRESHOLD = 50;
exports.BUFFER = 60;
exports.MAX_LINE = 100;
exports.CSV_HEADER = "watch_ms,host_ms,bpm,conf";

function int(v, lo, hi) {
  var n = Math.round(+v);
  if (!isFinite(n)) n = lo;
  return n < lo ? lo : (n > hi ? hi : n);
}
exports.clampBpm = function (bpm) { return int(bpm, 0, 255); };

// Heart Rate Measurement (0x2A37): flags byte, then uint8 BPM.
// contact true/false sets "sensor contact supported" (bit 2) and
// "contact detected" (bit 1); undefined leaves both clear.
exports.encodeHRS = function (bpm, contact) {
  var flags = 0;
  if (contact === true) flags = 0x06;
  else if (contact === false) flags = 0x04;
  return [flags, int(bpm, 0, 255)];
};

exports.isConfident = function (conf, threshold) {
  return +conf >= (threshold === undefined ? exports.THRESHOLD : threshold);
};

function cleanT(t) { t = Math.round(+t); return isFinite(t) ? t : 0; }

exports.formatLine = function (s) {
  var o = { t: cleanT(s.t), bpm: int(s.bpm, 0, 255), conf: int(s.conf, 0, 100) };
  o.bat = (s.bat === undefined || s.bat === null || !isFinite(+s.bat)) ? null : int(s.bat, 0, 100);
  return "HR " + JSON.stringify(o);
};

exports.formatStatus = function (t, on) {
  return "ST " + JSON.stringify({ t: cleanT(t), evt: "stream", on: !!on });
};

// Receiver side: "HR {...}" / "ST {...}" -> {type, data}; anything else
// (console output sharing the UART) -> null. The REPL can leave a ">"
// prompt in front of a line, so the prefix is searched, not anchored.
// String.indexOf on 2v29 firmware can report a match for a needle whose
// first character is the haystack's last one, so check every hit.
function find(s, x) {
  for (var i = 0; i + x.length <= s.length; i++) {
    i = s.indexOf(x, i);
    if (i < 0) return -1;
    if (s.substr(i, x.length) === x) return i;
  }
  return -1;
}

exports.parseLine = function (line) {
  line = String(line).trim();
  var i = find(line, "HR {"), j = find(line, "ST {");
  if (i < 0 || (j >= 0 && j < i)) i = j;
  if (i < 0 || (i > 0 && /[A-Za-z0-9]/.test(line.charAt(i - 1)))) return null;
  try { return { type: line.substr(i, 2), data: JSON.parse(line.substr(i + 3)) }; } catch (e) { return null; }
};

exports.csvRow = function (d, hostMs) {
  return [d.t, hostMs, d.bpm, d.conf].join(",");
};

exports.create = function (opts) {
  opts = opts || {};
  var max = opts.max || exports.BUFFER;
  var thr = opts.threshold === undefined ? exports.THRESHOLD : opts.threshold;
  var send = opts.send || function () {};
  var s = {
    buffer: [], history: [], connected: false, ready: false, streaming: true,
    lastGood: 0, last: null, threshold: thr
  };
  // h = {bpm, confidence}; t = watch ms; bat = battery %.
  s.onHRM = function (h, t, bat) {
    var bpm = int(h.bpm, 0, 255), conf = int(h.confidence, 0, 100);
    var ok = exports.isConfident(conf, thr) && bpm > 0;
    if (ok) s.lastGood = bpm;
    s.last = { bpm: bpm, conf: conf, ok: ok };
    s.history.push(ok ? bpm : null);
    while (s.history.length > max) s.history.shift();
    var sample = { t: t, bpm: bpm, conf: conf, bat: bat };
    var res = { sample: sample, confident: ok, hrs: exports.encodeHRS(s.lastGood, ok), line: exports.formatLine(sample), sent: false };
    if (!s.streaming) return res;
    if (s.connected && s.ready) { send(res.line); res.sent = true; }
    else {
      s.buffer.push(sample);
      while (s.buffer.length > max) s.buffer.shift();
    }
    return res;
  };
  s.connect = function () { s.connected = true; s.ready = false; };
  // Called once the client has had time to subscribe: sends the buffered
  // samples (original t, oldest first) and streams live from then on.
  s.flush = function () {
    if (!s.connected) return 0;
    s.ready = true;
    var b = s.buffer;
    s.buffer = [];
    for (var i = 0; i < b.length; i++) send(exports.formatLine(b[i]));
    return b.length;
  };
  s.disconnect = function () { s.connected = false; s.ready = false; };
  s.setStreaming = function (on, t) {
    s.streaming = !!on;
    var line = exports.formatStatus(t, s.streaming);
    if (s.connected && s.ready) send(line);
    return line;
  };
  return s;
};
