// Pure logic: encodings, framing and the disconnected buffer.
var HR = require("hrstream");

T.test("encodeHRS: exact bytes for a table of cases", function () {
  var cases = [
    [[72], [0x00, 72]],
    [[0], [0x00, 0]],
    [[255], [0x00, 255]],
    [[256], [0x00, 255]],
    [[400], [0x00, 255]],
    [[-5], [0x00, 0]],
    [[71.6], [0x00, 72]],
    [[NaN], [0x00, 0]],
    [[undefined], [0x00, 0]],
    [[72, true], [0x06, 72]],
    [[72, false], [0x04, 72]],
    [[300, true], [0x06, 255]]
  ];
  cases.forEach(function (c) {
    T.eq(HR.encodeHRS(c[0][0], c[0][1]), c[1], "encodeHRS(" + c[0].join(",") + ")");
  });
});

T.test("formatLine: prefix + valid JSON under 100 bytes, normal and edge values", function () {
  T.eq(HR.formatLine({ t: 1732000000123, bpm: 72, conf: 85, bat: 64 }), 'HR {"t":1732000000123,"bpm":72,"conf":85,"bat":64}');
  var edge = [
    { t: 1732000000123, bpm: 72, conf: 85, bat: 64 },
    { t: 0, bpm: 0, conf: 0, bat: 0 },
    { t: 9999999999999, bpm: 999, conf: 250, bat: 300 },
    { t: -1, bpm: -10, conf: -3, bat: -1 },
    { t: 1e20, bpm: 72.4, conf: 85.6, bat: 64.5 },
    { t: NaN, bpm: NaN, conf: undefined, bat: undefined },
    { t: "x", bpm: "72", conf: null, bat: null }
  ];
  edge.forEach(function (s) {
    var l = HR.formatLine(s);
    T.eq(l.substr(0, 3), "HR ", "prefix");
    T.ok(l.length < HR.MAX_LINE, "length " + l.length);
    T.eq(l.split("\n").length, 1, "no newline inside");
    var o = JSON.parse(l.substr(3));
    T.ok(o.bpm >= 0 && o.bpm <= 255, "bpm range " + o.bpm);
    T.ok(o.conf >= 0 && o.conf <= 100, "conf range " + o.conf);
    T.ok(o.bat === null || (o.bat >= 0 && o.bat <= 100), "bat range");
    T.eq(typeof o.t, "number");
  });
  T.eq(HR.formatStatus(1732000000123, true), 'ST {"t":1732000000123,"evt":"stream","on":true}');
  T.eq(HR.formatStatus(5, 0), 'ST {"t":5,"evt":"stream","on":false}');
});

T.test("parseLine ignores console noise; csvRow matches the receiver CSV", function () {
  T.eq(HR.parseLine('HR {"t":1,"bpm":72,"conf":85,"bat":64}\r\n'), { type: "HR", data: { t: 1, bpm: 72, conf: 85, bat: 64 } });
  T.eq(HR.parseLine('ST {"t":1,"evt":"stream","on":false}').data.on, false);
  T.eq(HR.parseLine('>HR {"t":2,"bpm":70,"conf":80,"bat":null}').data.t, 2, "REPL prompt in front");
  T.eq(HR.parseLine(">"), null);
  T.eq(HR.parseLine("WHR {x}"), null);
  T.eq(HR.parseLine("abcH"), null, "needle's first char at the end of the line");
  T.eq(HR.parseLine("xST"), null);
  T.eq(HR.parseLine("=undefined"), null);
  T.eq(HR.parseLine("HR {broken"), null);
  T.eq(HR.CSV_HEADER, "watch_ms,host_ms,bpm,conf");
  T.eq(HR.csvRow({ t: 1, bpm: 72, conf: 85 }, 99), "1,99,72,85");
});

T.test("buffer keeps the last 60 samples while disconnected, flush sends them in order", function () {
  var sent = [];
  var s = HR.create({ send: function (l) { sent.push(l); } });
  for (var i = 0; i < 75; i++) s.onHRM({ bpm: 60 + i % 30, confidence: 90 }, 1000 * i, 50);
  T.eq(sent.length, 0, "nothing written without a client");
  T.eq(s.buffer.length, 60);
  s.connect();
  s.onHRM({ bpm: 70, confidence: 90 }, 75000, 50);
  T.eq(sent.length, 0, "still buffering until the client is ready");
  T.eq(s.flush(), 60);
  T.eq(sent.length, 60);
  var ts = sent.map(function (l) { return HR.parseLine(l).data.t; });
  T.eq(ts[0], 16000, "oldest kept sample first");
  T.eq(ts[59], 75000, "newest last");
  for (var j = 1; j < 60; j++) T.ok(ts[j] > ts[j - 1], "in order");
  s.onHRM({ bpm: 71, confidence: 90 }, 76000, 50);
  T.eq(sent.length, 61, "live after flush");
  s.disconnect();
  s.onHRM({ bpm: 72, confidence: 90 }, 77000, 50);
  T.eq(sent.length, 61);
  T.eq(s.buffer.length, 1);
});

T.test("low confidence keeps the last confident BPM in the HRS value", function () {
  var s = HR.create({});
  T.eq(s.onHRM({ bpm: 80, confidence: 10 }, 0).hrs, [0x04, 0], "0 before any confident reading");
  T.eq(s.onHRM({ bpm: 72, confidence: 50 }, 1000).hrs, [0x06, 72], "threshold is inclusive");
  var r = s.onHRM({ bpm: 140, confidence: 49 }, 2000);
  T.eq(r.hrs, [0x04, 72]);
  T.eq(r.confident, false);
  T.eq(HR.parseLine(r.line).data.bpm, 140, "low-confidence sample still goes to the UART line");
  T.eq(s.history, [null, 72, null]);
});

T.test("paused stream neither sends nor buffers", function () {
  var sent = [];
  var s = HR.create({ send: function (l) { sent.push(l); } });
  s.connect(); s.flush();
  T.eq(s.setStreaming(false, 5), 'ST {"t":5,"evt":"stream","on":false}');
  s.onHRM({ bpm: 70, confidence: 90 }, 6);
  T.eq(sent, ['ST {"t":5,"evt":"stream","on":false}']);
  T.eq(s.buffer.length, 0);
});
