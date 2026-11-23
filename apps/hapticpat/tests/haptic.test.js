// The haptic module: patterns, limits and the player, with a fake motor in virtual time.
// A test that throws inside a timer can be reported as passed when another
// callback in the same tick swallows the exception (firmware quirk), so fail
// any test that ended without reaching done() or the end of its body.
(function () {
  var test = T.test, ended = true;
  T.test = function (name, fn, o) {
    test(name, fn.length ? function (done) {
      ended = false;
      fn(function (e) { ended = true; done(e); });
    } : function () { ended = false; fn(); ended = true; }, o);
  };
  T.afterEach(function () { if (!ended) throw new Error("test ended without reaching done()"); });
})();
var H = require("haptic");

function find(name) { return H.BUILTINS.filter(function (p) { return p.name === name; })[0]; }

// A player whose motor records calls and resolves its Promise after `ms`, like the real one.
function rig() {
  var r = { log: [], on: [], off: 0, done: [] };
  r.player = H.createPlayer({
    motor: {
      on: function (ms, s) {
        r.on.push({ t: Date.now(), ms: ms, s: s });
        return new Promise(function (res) { setTimeout(res, ms); });
      },
      off: function () { r.off++; }
    },
    now: function () { return Date.now(); },
    log: function (o) { r.log.push(o); },
    onDone: function (reason) { r.done.push(reason); }
  });
  r.of = function (evt) { return r.log.filter(function (e) { return e.evt === evt; }); };
  return r;
}

T.test("1: ramp up logs its 9 steps exactly, then done:end", function (done) {
  var r = rig();
  T.eq(r.player.play(find("ramp up"), { cap: 1, battery: 80 }), null);
  setTimeout(function () {
    var b = r.of("buzz");
    T.eq(b.map(function (e) { return [e.ms, e.s]; }),
      [[150, 0.2], [50, 0], [150, 0.4], [50, 0], [150, 0.6], [50, 0], [150, 0.8], [50, 0], [300, 1]]);
    T.eq(b.map(function (e) { return e.t; }), [0, 150, 200, 350, 400, 550, 600, 750, 800], "start times");
    var last = r.log[r.log.length - 1];
    T.eq(last.evt, "done"); T.eq(last.reason, "end"); T.eq(last.t, 1100);
    T.eq(r.on.length, 5, "motor only for the 5 on steps");
    done();
  }, 3000);
});

T.test("2: with cap 50 % every sEff is <= 0.5 (all built-ins)", function (done) {
  var r = rig(), i = 0;
  function next() {
    if (i >= H.BUILTINS.length) {
      var b = r.of("buzz");
      T.ok(b.length > 50, "steps logged: " + b.length);
      b.forEach(function (e) { T.ok(e.sEff <= 0.5, e.i + " sEff " + e.sEff); T.near(e.sEff, e.s * 0.5, 0.001); });
      r.on.forEach(function (c) { T.ok(c.s <= 0.5, "motor strength " + c.s); });
      done();
      return;
    }
    r.player.play(H.BUILTINS[i++], { cap: 0.5, battery: 80, seed: 3 });
    setTimeout(next, 20000);
  }
  next();
}, { timeout: 200000 });

T.test("3: a 3000 ms step is clamped to 1000 ms", function (done) {
  var r = rig();
  r.player.play({ name: "long", steps: [[3000, 1], [200, 0], [100, 0.5]] }, { battery: 80 });
  setTimeout(function () {
    var b = r.of("buzz");
    T.eq(b[0].ms, 1000); T.eq(b[0].clamped, 3000);
    T.eq(r.on[0].ms, 1000, "motor got 1000 ms");
    T.eq(b[1].t, 1000, "next step starts after the clamped step");
    T.eq(r.of("done")[0].t, 1300);
    done();
  }, 3000);
});

// Max on-time in any rolling 10 s window, from buzz log lines (t, ms, sEff).
function maxDuty(b) {
  var iv = b.filter(function (e) { return e.sEff > 0; }).map(function (e) { return [e.t, e.t + e.ms]; });
  var worst = 0;
  iv.forEach(function (w) {
    [w[0] + 10000, w[1]].forEach(function (end) {
      var a = end - 10000, sum = 0;
      iv.forEach(function (x) { sum += Math.max(0, Math.min(x[1], end) - Math.max(x[0], a)); });
      if (sum > worst) worst = sum;
    });
  });
  return worst;
}

T.test("4: 20 s of 100 % on gets pauses so no 10 s window is over 60 % on", function (done) {
  var r = rig();
  r.player.play({ name: "flat out", repeat: 20, steps: [[1000, 1]] }, { battery: 80 });
  setTimeout(function () {
    var b = r.of("buzz");
    T.eq(b.length, 20, "all 20 steps still play");
    T.ok(r.of("pause").length > 0, "pauses inserted");
    var w = maxDuty(b);
    T.ok(w <= 6000 + 1, "worst window on-time " + w + " ms");
    T.ok(w >= 5900, "and the limit is used, not wasted: " + w);
    T.eq(r.of("done")[0].reason, "end");
    done();
  }, 60000);
}, { timeout: 120000 });

T.test("limit: exactly 60 s of steps ends normally, longer hits the limit", function () {
  T.eq(H.plan({ repeat: 75, steps: [[400, 0.5], [400, 0]] }).limited, false);
  T.eq(H.plan({ repeat: 75, steps: [[400, 0.5], [400, 0]] }).end, 60000);
  var long = H.plan({ repeat: 76, steps: [[400, 0.5], [400, 0]] });
  T.eq(long.limited, true); T.eq(long.end, 60000);
  var cross = H.plan({ steps: [[59900, 0], [500, 1]] });
  T.eq(cross.steps[1].ms, 100, "step crossing 60 s is cut"); T.eq(cross.limited, true);
});

T.test("4b: duty rule holds for 1 s steps with tiny gaps too", function () {
  var pl = H.plan({ name: "x", repeat: 30, steps: [[900, 1], [10, 0]] }, {});
  var b = pl.steps.filter(function (s) { return s.pause === undefined; }).map(function (s) { return { t: s.at, ms: s.ms, sEff: s.sEff }; });
  T.ok(maxDuty(b) <= 6001, "worst " + maxDuty(b));
});

T.test("5: playback stops at 60 s with done:limit", function (done) {
  var r = rig();
  r.player.play({ name: "endless", repeat: 1000, steps: H.BUILTINS[4].steps }, { battery: 80 });
  setTimeout(function () {
    var d = r.of("done");
    T.ok(d.length, "done logged");
    T.eq(d.length, 1); T.eq(d[0].reason, "limit");
    T.near(d[0].t, 60000, 100, "stop time");
    T.ok(r.off >= 1, "motor off");
    var last = r.of("buzz").pop();
    T.ok(last.t < 60000, "no step after 60 s");
    done();
  }, 70000);
}, { timeout: 120000 });

T.test("timing: a 59 s pattern ends within +/-100 ms of plan (no drift)", function (done) {
  var d = null, n = 0;
  var p = H.createPlayer({
    motor: { on: function () { n++; }, off: function () {} },
    log: function (o) { if (o.evt === "done") d = o; }
  });
  // 590 x 100 ms, alternating on/off, 50 % duty
  p.play({ name: "long", repeat: 295, steps: [[100, 0.5], [100, 0]] }, { battery: 80 });
  setTimeout(function () {
    T.ok(d, "done logged");
    T.eq(d.reason, "end");
    T.near(d.t, 59000, 100, "end");
    T.eq(n, 295, "motor calls");
    done();
  }, 65000);
}, { timeout: 120000 });

T.test("7: drifting rhythm is repeatable per seed and differs between seeds", function (done) {
  function run(seed, cb) {
    var r = rig();
    r.player.play(find("drifting rhythm"), { seed: seed, battery: 80 });
    setTimeout(function () { cb(r.log); }, 15000);
  }
  run(42, function (a) {
    run(42, function (b) {
      run(7, function (c) {
        T.ok(a.length > 40, "steps: " + a.length);
        T.eq(JSON.stringify(a), JSON.stringify(b), "same seed, same log");
        function pauses(log) { return log.filter(function (e) { return e.evt === "buzz" && e.s === 0 && e.ms > 300; }).map(function (e) { return e.ms; }); }
        T.ok(JSON.stringify(pauses(a)) !== JSON.stringify(pauses(c)), "different pauses");
        pauses(a).forEach(function (ms) { T.ok(ms >= 459 && ms <= 621, "pause within 540 +/- 15 %: " + ms); });
        done();
      });
    });
  });
}, { timeout: 120000 });

T.test("7b: drifting rhythm skips or doubles every 4th beat", function () {
  var st = H.driftingRhythm(42);
  var beats = 0;
  st.forEach(function (s) { if (s[0] === 80 && s[1] > 0) beats++; });
  T.ok(beats !== H.DRIFT_CYCLES, "not a plain 12-beat rhythm: " + beats);
  var a = H.random(5), b = H.random(5);
  for (var i = 0; i < 5; i++) T.eq(a(), b());
});

T.test("8: invalid patterns are rejected and play nothing", function () {
  var r = rig();
  var bad = ['{"name":"neg","steps":[[-100,1]]}', '{"name":"strong","steps":[[100,2]]}', '{"name":"short","steps":[[100]]}',
    '{"steps":"no"}', 'not json', '{"steps":[[100,1]],"repeat":0}'];
  bad.forEach(function (txt) {
    var p = H.parse(txt);
    T.ok(p.error, "rejected: " + txt);
  });
  T.ok(H.validate({ steps: [[NaN, 1]] }), "NaN duration");
  T.ok(H.validate({ steps: [[100, NaN]] }), "NaN strength");
  T.ok(r.player.play({ steps: [[100, -0.5]] }), "play returns the error");
  T.eq(r.of("buzz").length, 0); T.eq(r.of("error").length, 1);
  T.eq(r.on.length, 0);
  T.eq(H.parse('{"name":"ok","steps":[[100,1]]}').pattern.name, "ok");
});

T.test("edge: empty and all-zero patterns play nothing and report done", function () {
  var r = rig();
  r.player.play({ name: "empty", steps: [] });
  r.player.play({ name: "zeros", steps: [[100, 0], [200, 0]] });
  T.eq(r.of("done").map(function (e) { return e.reason; }), ["end", "end"]);
  T.eq(r.of("buzz").length, 0); T.eq(r.on.length, 0);
});

T.test("edge: starting a new pattern stops the old one first", function (done) {
  var r = rig();
  r.player.play(find("rhythm"), { battery: 80 });
  setTimeout(function () {
    r.player.play(find("pulse"), { battery: 80 });
    setTimeout(function () {
      T.eq(r.of("done").map(function (e) { return e.reason; }), ["stop", "end"]);
      done();
    }, 1000);
  }, 1000);
});

T.test("edge: motor calls never overlap", function (done) {
  var r = rig();
  r.player.play({ name: "back to back", steps: [[300, 1], [300, 0.5], [300, 1]] }, { battery: 80 });
  setTimeout(function () {
    for (var i = 1; i < r.on.length; i++) T.ok(r.on[i].t >= r.on[i - 1].t + r.on[i - 1].ms, "call " + i + " after previous ended");
    T.eq(r.on.length, 3);
    done();
  }, 2000);
});

T.test("edge: a slow motor Promise delays the next on step instead of overlapping", function (done) {
  var calls = [];
  var p = H.createPlayer({
    motor: { on: function (ms) { calls.push(Date.now()); return new Promise(function (res) { setTimeout(res, ms + 200); }); }, off: function () {} },
    now: function () { return Date.now(); }
  });
  p.play({ steps: [[100, 1], [100, 1]] });
  setTimeout(function () { T.eq(calls.length, 2); T.ok(calls[1] - calls[0] >= 300, "gap " + (calls[1] - calls[0])); done(); }, 2000);
});

T.test("low battery caps strength at 0.5; unknown battery does not", function () {
  var lo = H.plan(find("pulse"), { cap: 1, battery: 10 });
  T.eq(lo.steps[0].sEff, 0.5); T.eq(lo.lowBattery, true);
  T.eq(H.plan(find("pulse"), { cap: 0.25, battery: 10 }).steps[0].sEff, 0.25);
  T.eq(H.plan(find("pulse"), { cap: 1, battery: 15 }).steps[0].sEff, 1);
  T.eq(H.plan(find("pulse"), {}).steps[0].sEff, 1);
});

T.test("built-ins are valid and match the spec", function () {
  H.BUILTINS.forEach(function (p) { T.eq(H.validate(p), null, p.name); });
  T.eq(H.BUILTINS.map(function (p) { return p.name; }), ["pulse", "double", "ramp up", "swell", "rhythm", "drifting rhythm", "SOS"]);
  var sw = find("swell").steps.filter(function (s) { return s[1] > 0; }).map(function (s) { return s[1]; });
  T.eq(sw, [0.17, 0.33, 0.5, 0.67, 0.83, 1, 1, 1, 0.83, 0.67, 0.5, 0.33, 0.17]);
  var sos = find("SOS").steps.filter(function (s) { return s[1] > 0; }).map(function (s) { return s[0] === 100 ? "." : "-"; }).join("");
  T.eq(sos, "...---...");
  var beat = find("rhythm");
  T.eq(beat.repeat, 10);
  T.eq(beat.steps.reduce(function (a, s) { return a + s[0]; }, 0), 800, "800 ms per beat = 75 per minute");
});
