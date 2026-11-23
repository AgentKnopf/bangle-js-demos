// Data logger logic: file names, the log format, a chunked append-only
// writer, a crash-tolerant reader, CSV conversion and the UART export
// protocol. Storage and time are injected, so tests drive it directly.
exports.VERSION = 1;
exports.CHUNK = 1024;      // bytes per flash write
exports.MAX_BUF = 4096;    // RAM buffer cap if writes keep failing
exports.FULL_RATIO = 0.95; // stop at 95 % of the free space seen at start
exports.LOW_BATTERY = 10;

exports.ALL_LABELS = ["walk", "run", "sit", "stand", "stairs", "cycle", "sleep", "desk", "gesture-A", "gesture-B", "gesture-C", "gesture-D", "other"];
exports.DEFAULT_LABELS = ["walk", "run", "sit", "stand", "stairs", "gesture-A", "gesture-B", "gesture-C"];
// Per source: [interval ms (0 = off), menu text]
exports.RATES = {
  a: [[0, "off"], [80, "12.5Hz"], [40, "25Hz"], [160, "6.25Hz"]],
  h: [[0, "off"], [1000, "1s"], [5000, "5s"]],
  p: [[0, "off"], [1000, "1s"], [10000, "10s"]],
  m: [[0, "off"], [200, "5Hz"], [1000, "1s"]],
  s: [[0, "off"], [10000, "10s"], [60000, "1min"]]
};

function p2(n) { return (n < 10 ? "0" : "") + n; }
exports.baseName = function (d) {
  return "log." + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes());
};
// exists(name) -> bool. Same minute twice gives -2, -3, ...
exports.fileName = function (d, exists) {
  var b = exports.baseName(d), n = b, i = 2;
  while (exists(n)) n = b + "-" + (i++);
  return n;
};

// log.<8 digits>-<4 digits>[-n]. (Espruino regexes have no {n} quantifier.)
exports.isLogName = function (n) {
  if (n.length < 17 || n.substr(0, 4) !== "log." || n.charAt(12) !== "-") return false;
  var d = n.substr(4, 8) + n.substr(13, 4);
  for (var i = 0; i < d.length; i++) if (d.charAt(i) < "0" || d.charAt(i) > "9") return false;
  return n.length === 17 || n.charAt(17) === "-";
};
exports.list = function (st) {
  return st.list(/^log\./, { sf: true }).filter(exports.isLogName).sort();
};
exports.has = function (arr, x) {
  for (var i = 0; i < arr.length; i++) if (arr[i] === x) return true;
  return false;
};

exports.fmt = function (v, d) {
  if (typeof v !== "number" || !isFinite(v)) return "";
  var s = v.toFixed(d);
  return (+s === 0) ? (0).toFixed(d) : s; // no "-0.00"
};
exports.line = function (t, type, a, b, c) {
  return Math.round(t) + "," + type + "," + (a === undefined ? "" : a) + "," + (b === undefined ? "" : b) + "," + (c === undefined ? "" : c);
};
// Plain-object sample -> CSV line. o is the sensor event (or {n} for steps).
exports.sampleLine = function (type, t, o) {
  var f = exports.fmt;
  if (type === "a") return exports.line(t, "a", f(o.x, 2), f(o.y, 2), f(o.z, 2));
  if (type === "h") return exports.line(t, "h", f(o.bpm, 0), f(o.confidence, 0));
  if (type === "p") return exports.line(t, "p", f(o.pressure, 2), f(o.temperature, 1));
  if (type === "m") return exports.line(t, "m", f(o.heading, 1));
  if (type === "s") return exports.line(t, "s", f(o.n, 0));
};
exports.header = function (start, label, src) {
  return JSON.stringify({ v: exports.VERSION, start: start, label: label || "", src: src });
};

// opts: {storage, name, start (epoch ms), label, src {a:80,...}, now() -> ms
// from getTime(), chunk, maxBuf, ratio}
exports.createLogger = function (opts) {
  var st = opts.storage, src = opts.src || {};
  var chunk = opts.chunk || exports.CHUNK, maxBuf = opts.maxBuf || exports.MAX_BUF;
  var ratio = opts.ratio || exports.FULL_RATIO;
  var f, buf = "", limit = 0, t0 = 0, prev = 0, offset = 0, last = {};
  var L = { name: opts.name, state: "idle", reason: null, count: 0, counts: {}, written: 0, writes: 0, dropped: 0, errors: 0, lastT: 0, free0: 0 };

  L.start = function () {
    L.free0 = st.getFree();
    limit = Math.floor(L.free0 * ratio);
    f = st.open(L.name, "a");
    t0 = prev = opts.now();
    buf = exports.header(opts.start, opts.label, src) + "\n";
    L.state = "logging";
    return L;
  };
  // Monotonic ms since start: if the clock is set back, time stands still
  // instead of going backwards.
  L.elapsed = function (raw) {
    if (raw === undefined) raw = opts.now();
    if (raw < prev) offset += prev - raw;
    prev = raw;
    return raw + offset - t0;
  };
  // Rate limit per source on a fixed grid, so the average rate is exact;
  // slack (default 25 % of the interval) absorbs poll jitter.
  L.due = function (type, t, slack) {
    var iv = src[type], next = last[type];
    if (!iv || L.state !== "logging") return false;
    if (slack === undefined) slack = iv / 4;
    if (next !== undefined && t < next - slack) return false;
    last[type] = (next === undefined || t >= next + iv) ? t + iv : next + iv;
    return true;
  };
  L.flush = function () {
    if (!buf.length || !f) return true;
    try {
      f.write(buf);
      L.written += buf.length;
      L.writes++;
      buf = "";
      return true;
    } catch (e) { L.errors++; return false; }
  };
  L.add = function (type, line, t) {
    if (L.state !== "logging") return false;
    var s = line + "\n";
    if (L.written + buf.length + s.length > limit) { L.stop("full"); return false; }
    if (buf.length + s.length > maxBuf) { L.dropped++; return false; }
    buf += s;
    L.count++;
    L.counts[type] = (L.counts[type] || 0) + 1;
    if (t !== undefined) L.lastT = t;
    if (buf.length >= chunk) L.flush();
    return true;
  };
  L.sample = function (type, o, raw) {
    var t = L.elapsed(raw);
    if (!L.due(type, t)) return false;
    return L.add(type, exports.sampleLine(type, t, o), t);
  };
  L.pending = function () { return buf.length; };
  L.stop = function (reason) {
    if (L.state !== "logging") return L;
    L.state = "stopped";
    L.reason = reason || "user";
    L.flush();
    if (L.dropped) { buf = JSON.stringify({ dropped: L.dropped }) + "\n"; L.flush(); }
    return L;
  };
  return L;
};

// Calls fn(line) for every complete line (without "\n"). A last line with
// no newline was cut off by a reset during a write and is skipped.
exports.eachLine = function (st, name, fn) {
  var f = st.open(name, "r"), l, n = 0;
  while ((l = f.readLine()) !== undefined) {
    if (l.charAt(l.length - 1) !== "\n") break;
    if (fn(l.substr(0, l.length - 1)) === false) break;
    n++;
  }
  return n;
};
exports.parseSample = function (line) {
  var p = line.split(",");
  if (p.length !== 5 || line.charAt(0) === "{") return null;
  return { t: +p[0], type: p[1], v: [p[2], p[3], p[4]] };
};
exports.info = function (st, name) {
  var o = { name: name, bytes: st.open(name, "r").getLength(), header: null, ms: 0, n: 0 };
  exports.eachLine(st, name, function (l) {
    if (l.charAt(0) === "{") { if (!o.header) o.header = JSON.parse(l); return; }
    var s = exports.parseSample(l);
    if (s) { o.n++; o.ms = s.t; }
  });
  return o;
};

exports.CSV_HEADER = "t_ms,type,accel_x,accel_y,accel_z,hr_bpm,hr_conf,pressure_hpa,temp_c,heading_deg,steps,label";
var COLS = { a: [2, 3, 4], h: [5, 6], p: [7, 8], m: [9], s: [10] };
// One log line -> CSV row, or null for the header/trailer/unknown lines.
exports.toCSV = function (line, label) {
  var s = exports.parseSample(line);
  if (!s || !COLS[s.type]) return null;
  var row = [s.t, s.type, "", "", "", "", "", "", "", "", "", label || ""], c = COLS[s.type];
  for (var i = 0; i < c.length; i++) row[c[i]] = s.v[i];
  return row.join(",");
};

// UART export. opts: {storage, write(str), defer(fn)}. feed() takes raw
// input chunks; commands are LIST and GET <name>, answers end with END.
// Drops control characters: \r, Ctrl-C, \x10 (echo off) from IDE-style clients.
function clean(c) {
  var o = "";
  for (var i = 0; i < c.length; i++) if (c.charCodeAt(i) >= 32) o += c.charAt(i);
  return o.trim();
}
exports.createServer = function (opts) {
  var st = opts.storage, write = opts.write;
  var defer = opts.defer || function (fn) { fn(); };
  var partial = "", queue = [], busy = false;
  var S = { batch: opts.batch || 32 };
  function done() { write("END\n"); busy = false; next(); }
  function get(name) {
    if (!exports.has(exports.list(st), name)) { write('ERR {"msg":"no such file"}\n'); return done(); }
    var f = st.open(name, "r");
    (function step() {
      for (var i = 0; i < S.batch; i++) {
        var l = f.readLine();
        if (l === undefined || l.charAt(l.length - 1) !== "\n") return done();
        write(l);
      }
      defer(step);
    })();
  }
  function run(c) {
    busy = true;
    if (c === "LIST") {
      exports.list(st).forEach(function (n) {
        write("F " + JSON.stringify({ name: n, bytes: st.open(n, "r").getLength() }) + "\n");
      });
      return done();
    }
    if (c.substr(0, 4) === "GET ") return get(c.substr(4).trim());
    write('ERR {"msg":"unknown command"}\n');
    done();
  }
  function next() { if (!busy && queue.length) run(queue.shift()); }
  S.feed = function (data) {
    partial += data;
    var lines = partial.split("\n");
    partial = lines.pop();
    if (partial.length > 200) partial = "";
    lines.forEach(function (c) {
      c = clean(c);
      if (c.length) queue.push(c);
    });
    next();
  };
  S.busy = function () { return busy; };
  return S;
};
