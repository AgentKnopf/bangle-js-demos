// In-watch test API, uploaded to Storage and eval'd before each test file.
// Plain ES5 so it runs on any Espruino firmware.
var T = {
  tests: [], events: [], timeout: 60000, _before: [], _after: [], _finish: null,
  _out: function (o) { print("@@T " + JSON.stringify(o)); },
  test: function (name, fn, opts) {
    T.tests.push({ name: name, fn: fn, timeout: (opts && opts.timeout) || T.timeout });
  },
  beforeEach: function (fn) { T._before.push(fn); },
  afterEach: function (fn) { T._after.push(fn); },

  // ---- assertions (throw; async failures also end the running test) ----
  fail: function (msg) {
    var e = new Error("assert: " + msg);
    if (T._finish) T._finish(e);
    throw e;
  },
  _str: function (v) {
    if (v === undefined || typeof v === "function") return String(v);
    return JSON.stringify(v);
  },
  ok: function (v, msg) { if (!v) T.fail((msg || "expected truthy") + ", got " + T._str(v)); },
  eq: function (actual, expected, msg) {
    var same = (typeof expected === "object" && expected !== null) ?
      JSON.stringify(actual) === JSON.stringify(expected) : actual === expected;
    if (!same) T.fail((msg ? msg + ": " : "") + "expected " + T._str(expected) + ", got " + T._str(actual));
  },
  near: function (actual, expected, tol, msg) {
    if (typeof actual !== "number" || isNaN(actual) || Math.abs(actual - expected) > tol)
      T.fail((msg ? msg + ": " : "") + "expected " + expected + " +/- " + tol + ", got " + T._str(actual));
  },
  throws: function (fn, msg) {
    var threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) T.fail(msg || "expected an exception");
  },

  // ---- spies and stubs ----
  // T.spy(obj, "name") records calls and calls through; T.spy(obj, "name", impl) replaces it.
  // All spies are restored after each test.
  _spies: [],
  spy: function (obj, name, impl) {
    var orig = obj[name];
    // Built-in methods are not own properties. Assigning the native function back
    // breaks some of them (e.g. StorageFile.prototype.write), so delete the
    // shadowing property instead.
    var own = Object.prototype.hasOwnProperty.call(obj, name); // global has no own hasOwnProperty
    var s = function () {
      var args = [];
      for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
      s.calls.push(args);
      var f = impl !== undefined ? impl : orig;
      return (typeof f === "function") ? f.apply(this, args) : f;
    };
    s.calls = [];
    s.restore = function () {
      if (own) obj[name] = orig;
      else delete obj[name];
    };
    obj[name] = s;
    T._spies.push(s);
    return s;
  },

  // ---- loading modules ----
  // Code run from Storage executes straight from (emulated) flash and is about
  // 10x slower than a RAM copy. Use this for tests that replay many samples.
  requireRAM: function (name) {
    var src = require("Storage").read(name);
    if (src === undefined) throw new Error("No Storage file " + name);
    var exports = {}, module = { exports: exports };
    eval(src + "");
    return module.exports;
  },

  // ---- capturing the app's DEBUG JSON lines ----
  // Every console.log whose only argument is a JSON object string (or an object)
  // is parsed into T.events. Lines still reach the console.
  capture: function () {
    T.events = [];
    if (T._log) return;
    var orig = console.log;
    T._log = orig;
    console.log = function () {
      if (arguments.length === 1) {
        var a = arguments[0];
        if (typeof a === "string" && a.charAt(0) === "{") {
          try { T.events.push(JSON.parse(a)); } catch (e) {}
        } else if (typeof a === "object" && a !== null) T.events.push(a);
      }
      orig.apply(console, arguments);
    };
  },
  // Espruino runs emit() handlers after the current task, not inside emit().
  // T.emit fires the event and calls cb once the handlers have run.
  emit: function (obj, evt, arg, cb) {
    obj.emit(evt, arg);
    setTimeout(cb, 0);
  },
  eventsOf: function (evt) { return T.events.filter(function (e) { return e.evt === evt; }); },

  // ---- host actions (run by the harness after the current JS task returns) ----
  host: function (cmd) { print("@@H " + JSON.stringify(cmd)); },
  tap: function (x, y, ms) { T.host({ cmd: "tap", x: x, y: y, ms: ms }); },
  touch: function (x, y, pressed, gesture) { T.host({ cmd: "touch", x: x, y: y, b: pressed ? 1 : 0, gesture: gesture || 0 }); },
  swipe: function (x0, y0, x1, y1, ms, steps) { T.host({ cmd: "swipe", x0: x0, y0: y0, x1: x1, y1: y1, ms: ms, steps: steps }); },
  press: function (ms) { T.host({ cmd: "press", ms: ms }); },
  button: function (pressed) { T.host({ cmd: "button", pressed: !!pressed }); },
  screenshot: function (name) { T.host({ cmd: "screenshot", name: name }); },

  run: function () {
    var i = 0, pass = 0, fail = 0;
    T._out({ evt: "begin", count: T.tests.length });
    function next() {
      if (i >= T.tests.length) { T._finish = null; T._out({ evt: "end", pass: pass, fail: fail }); return; }
      var t = T.tests[i++];
      var finished = false, timer;
      T._finish = function (err) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        try { T._after.forEach(function (f) { f(); }); } catch (e) { if (!err) err = e; }
        T._spies.forEach(function (s) { s.restore(); });
        T._spies = [];
        if (err) { fail++; T._out({ evt: "fail", name: t.name, msg: String(err.message || err) }); }
        else { pass++; T._out({ evt: "pass", name: t.name }); }
        setTimeout(next, 0);
      };
      var finish = T._finish;
      timer = setTimeout(function () { timer = undefined; finish(new Error("timed out after " + t.timeout + " ms")); }, t.timeout);
      try {
        T._before.forEach(function (f) { f(); });
        if (t.fn.length > 0) t.fn(function (e) { finish(e); });
        else {
          var r = t.fn();
          if (r && typeof r.then === "function") r.then(function () { finish(); }, function (e) { finish(e || new Error("promise rejected")); });
          else finish();
        }
      } catch (e) { finish(e); }
    }
    next();
  }
};
process.on("uncaughtException", function (e) {
  // A try/catch in another callback in the same idle step can clear the
  // pending exception, so e may arrive falsy. It is still a failure.
  if (!e) e = new Error("uncaught exception (error lost)");
  if (T._finish) T._finish(e);
  else T._out({ evt: "error", msg: String(e.message || e) });
});
