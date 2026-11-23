// Pure logic: names, line format, chunked writer, reader, CSV, export server.
var D = T.requireRAM("datalog");
var ST = require("Storage");

function fakeClock(t) { var c = { t: t, now: function () { return c.t; } }; return c; }
function lines(name) { var o = []; D.eachLine(ST, name, function (l) { o.push(l); }); return o; }

T.test("file names: log.<yyyymmdd>-<hhmm>, -2/-3 on collision, at most 20 chars", function () {
  var d = new Date(2026, 10, 23, 10, 15, 42);
  T.eq(D.baseName(d), "log.20261123-1015");
  var taken = ["log.20261123-1015", "log.20261123-1015-2"];
  T.eq(D.fileName(d, function (n) { return D.has(taken, n); }), "log.20261123-1015-3");
  T.eq(D.fileName(new Date(2026, 0, 2, 3, 4), function () { return false; }), "log.20260102-0304");
  T.ok("log.20261123-1015-99".length <= 20);
  T.eq(D.isLogName("log.20261123-1015"), true);
  T.eq(D.isLogName("log.20261123-1015-2"), true);
  T.eq(D.isLogName("log.2026112x-1015"), false);
  T.eq(D.isLogName("log.txt"), false);
  T.eq(D.isLogName("log.20261123-10151"), false);
});

T.test("sample lines: 5 fields, type codes and decimals per the format", function () {
  T.eq(D.sampleLine("a", 120.4, { x: -0.0249, y: 0.9812, z: 0.1101 }), "120,a,-0.02,0.98,0.11");
  T.eq(D.sampleLine("a", 0, { x: -0.001, y: 0, z: 1 }), "0,a,0.00,0.00,1.00", "no -0.00");
  T.eq(D.sampleLine("h", 1003, { bpm: 71, confidence: 88 }), "1003,h,71,88,");
  T.eq(D.sampleLine("p", 1010, { pressure: 1009.4123, temperature: 31.24, altitude: 3 }), "1010,p,1009.41,31.2,");
  T.eq(D.sampleLine("m", 2000, { heading: 123.456 }), "2000,m,123.5,,");
  T.eq(D.sampleLine("m", 2000, { heading: NaN }), "2000,m,,,", "uncalibrated heading is empty");
  T.eq(D.sampleLine("s", 10000, { n: 7 }), "10000,s,7,,");
  T.eq(D.header(1732000000000, "walk", { a: 80, h: 1000, p: 1000 }), '{"v":1,"start":1732000000000,"label":"walk","src":{"a":80,"h":1000,"p":1000}}');
});

T.test("writer buffers into ~1 KB chunks and the file reads back", function () {
  var c = fakeClock(5000);
  var L = D.createLogger({ storage: ST, name: "log.20260101-0900", start: 1767258000000, label: "sit", src: { a: 80 }, now: c.now }).start();
  for (var i = 0; i < 750; i++) { c.t = 5000 + i * 80; L.sample("a", { x: 0.01 * (i % 7), y: -0.5, z: 0.98 }); }
  T.ok(L.writes > 0 && L.writes < 20, "writes " + L.writes);
  L.stop();
  var size = ST.open(L.name, "r").getLength();
  T.eq(size, L.written);
  T.ok(L.writes <= size / 512, L.writes + " writes for " + size + " bytes");
  var ls = lines(L.name);
  T.eq(JSON.parse(ls[0]), { v: 1, start: 1767258000000, label: "sit", src: { a: 80 } });
  T.eq(ls.length, 751);
  T.eq(ls[1], "0,a,0.00,-0.50,0.98");
  T.eq(ls[750], "59920,a,0.00,-0.50,0.98");
  T.eq(ls[749], "59840,a,0.06,-0.50,0.98");
  T.eq(L.counts.a, 750);
});

T.test("rate limit per source; clock set back keeps timestamps monotonic", function () {
  var c = fakeClock(1e6);
  var L = D.createLogger({ storage: ST, name: "log.20260101-0901", start: 0, src: { a: 160, h: 1000 }, now: c.now }).start();
  var got = [];
  for (var t = 0; t <= 800; t += 80) if (L.due("a", t)) got.push(t);
  T.eq(got, [0, 160, 320, 480, 640, 800], "160 ms from an 80 ms poll");
  T.eq(L.due("p", 0), false, "source not enabled");
  T.eq(L.elapsed(1e6 + 5000), 5000);
  T.eq(L.elapsed(1e6 - 3600000), 5000, "clock set back an hour: time stands still");
  T.eq(L.elapsed(1e6 - 3600000 + 80), 5080);
  T.eq(L.elapsed(1e6 + 10000), 3615000, "forward jumps are kept");
  L.stop();
});

T.test("stops at 95 % of the free space seen at start, file stays valid", function () {
  var c = fakeClock(0);
  var fake = { getFree: function () { return 2000; }, open: function (n, m) { return ST.open(n, m); } };
  var L = D.createLogger({ storage: fake, name: "log.20260101-0902", start: 0, src: { a: 80 }, now: c.now }).start();
  var i = 0;
  while (L.state === "logging" && i < 1000) { c.t = i * 80; L.sample("a", { x: 0, y: 0, z: 1 }); i++; }
  T.eq(L.state, "stopped");
  T.eq(L.reason, "full");
  T.ok(L.written <= 1900, "written " + L.written);
  T.ok(L.written > 1800, "used most of it: " + L.written);
  var ls = lines(L.name);
  T.eq(ls.length, L.count + 1);
  T.eq(L.dropped, 0, "nothing dropped: stopping is not losing");
});

T.test("failed writes: buffer is capped, losses are counted in a trailer line", function () {
  var c = fakeClock(0), fail = true, real;
  var fake = {
    getFree: function () { return 1e6; },
    open: function (n, m) {
      real = ST.open(n, m);
      return { write: function (s) { if (fail) throw new Error("flash busy"); real.write(s); } };
    }
  };
  var L = D.createLogger({ storage: fake, name: "log.20260101-0903", start: 0, src: { a: 80 }, chunk: 256, maxBuf: 1024, now: c.now }).start();
  for (var i = 0; i < 100; i++) { c.t = i * 80; L.sample("a", { x: 0, y: 0, z: 1 }); }
  T.ok(L.errors > 0, "write errors seen");
  T.ok(L.dropped > 0, "dropped " + L.dropped);
  T.ok(L.pending() <= 1024, "buffer capped");
  fail = false;
  L.stop();
  var ls = lines(L.name);
  T.eq(JSON.parse(ls[ls.length - 1]), { dropped: L.dropped });
  T.eq(ls.length, 1 + L.count + 1, "header + kept samples + trailer");
});

T.test("reader skips a partial last line", function () {
  var f = ST.open("log.20260101-0904", "a");
  f.write('{"v":1,"start":0,"label":"","src":{"a":80}}\n0,a,0.00,0.00,1.00\n80,a,0.00,0.00,1.00\n160,a,0.0');
  T.eq(lines("log.20260101-0904"), ['{"v":1,"start":0,"label":"","src":{"a":80}}', "0,a,0.00,0.00,1.00", "80,a,0.00,0.00,1.00"]);
  var inf = D.info(ST, "log.20260101-0904");
  T.eq(inf.n, 2);
  T.eq(inf.ms, 80);
  T.eq(inf.header.src, { a: 80 });
});

T.test("CSV conversion expands type codes into columns", function () {
  T.eq(D.CSV_HEADER, "t_ms,type,accel_x,accel_y,accel_z,hr_bpm,hr_conf,pressure_hpa,temp_c,heading_deg,steps,label");
  T.eq(D.toCSV("120,a,-0.02,0.98,0.11", "walk"), "120,a,-0.02,0.98,0.11,,,,,,,walk");
  T.eq(D.toCSV("1003,h,71,88,", "walk"), "1003,h,,,,71,88,,,,,walk");
  T.eq(D.toCSV("1010,p,1009.41,31.2,", ""), "1010,p,,,,,,1009.41,31.2,,,");
  T.eq(D.toCSV("2000,m,123.5,,", ""), "2000,m,,,,,,,,123.5,,");
  T.eq(D.toCSV("10000,s,7,,", ""), "10000,s,,,,,,,,,7,");
  T.eq(D.toCSV('{"dropped":3}', ""), null);
  T.eq(D.toCSV("1,x,1,2,3", ""), null);
});

T.test("export server: LIST, GET in chunks, unknown file and command", function () {
  var out = [];
  var S = D.createServer({ storage: ST, write: function (s) { out.push(s); }, batch: 2 });
  S.feed("LI");
  T.eq(out.length, 0, "waits for the newline");
  S.feed("ST\r\n");
  var names = D.list(ST);
  T.eq(out.length, names.length + 1);
  T.eq(out[0], 'F {"name":"log.20260101-0900","bytes":' + ST.open("log.20260101-0900", "r").getLength() + '}\n');
  T.eq(out[out.length - 1], "END\n");
  out = [];
  S.feed("\x10GET log.20260101-0904\n");
  T.eq(out, ['{"v":1,"start":0,"label":"","src":{"a":80}}\n', "0,a,0.00,0.00,1.00\n", "80,a,0.00,0.00,1.00\n", "END\n"], "partial last line is not sent");
  out = [];
  S.feed("GET log.nope\nHELLO\n");
  T.eq(out, ['ERR {"msg":"no such file"}\n', "END\n", 'ERR {"msg":"unknown command"}\n', "END\n"]);
});
