const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const {spawnSync} = require("child_process");
const {parse, plan} = require("./watch");
const {ROOT, appFiles, installPlan, uninstallPlan} = require("./lib/watch-plan");

test("all repository metadata maps to launcher files, cross-app source and evaluated icons", () => {
  for (const id of fs.readdirSync(path.join(ROOT, "apps"))) {
    const files = appFiles(id);
    const info = JSON.parse(files.at(-1).data);
    assert.equal(info.id, id);
    assert.equal(info.src, id + ".app.js");
    assert.equal(info.icon, id + ".img");
    assert.equal(info.type, undefined);
    assert.equal(info.files, [id + ".info", ...files.slice(0, -1).map(f => f.name)].join(","));
    assert.equal(files.find(f => f.name === id + ".img").evaluate, true);
  }
  const gestures = appFiles("hapticpat").find(f => f.name === "gestures");
  assert.deepEqual(gestures.data, fs.readFileSync(path.join(ROOT, "apps/touchgest/gestures.lib.js")));
  assert.equal(JSON.parse(appFiles("tfgest").at(-1).data).data, ".tfmodel,gestmodel.json,tfgest.tw.json,gest.*");
});

test("loader .info data separator, defaults, supports and traversal rejection", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "watch-metadata-"));
  const dir = path.join(root, "apps/demo");
  fs.mkdirSync(dir, {recursive: true});
  const meta = {id: "demo", name: "Long", shortName: "Short", type: "app", version: "0.01",
    sortorder: -1, supports: ["BANGLEJS2"], storage: [{name: "demo.app.js", content: "hello"},
      {name: "other", content: "not for this board", supports: ["BANGLEJS"]}],
    data: [{name: "settings", content: "{}"}, {wildcard: "log.*", storageFile: true}]};
  const write = () => fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(meta));
  try {
    write();
    const files = appFiles("demo", root), info = JSON.parse(files.at(-1).data);
    assert.equal(info.name, "Short");
    assert.equal(info.files, "demo.info,demo.app.js");
    assert.equal(info.data, "settings;log.*");
    assert.equal(info.sortorder, -1);
    assert.equal(files[1].noOverwrite, true);
    meta.storage = [{name: "bad", url: "../../../package.json"}]; write();
    assert.throws(() => appFiles("demo", root));
    assert.throws(() => appFiles("../demo", root));
    meta.storage = [{name: "demo.info", content: "{}"}]; write();
    assert.throws(() => appFiles("demo", root), /reserved/);
  } finally { fs.rmSync(root, {recursive: true}); }
});

test("CLI rejects missing/extra args, missing device, unknown flags and invalid limits", () => {
  for (const args of [[], ["bogus"], ["install"], ["list", "extra"], ["list"], ["scan", "--oops"],
    ["scan", "--timeout"], ["scan", "--timeout", "NaN"], ["scan", "--timeout", "1"],
    ["scan", "--listen", "3601"], ["scan", "--device", "a", "--device", "b"]])
    assert.throws(() => parse(args), args.join(" "));
  assert.equal(parse(["list", "--device", "AA:BB"]).device, "AA:BB");
  assert.equal(parse(["scan", "--timeout", "30"]).timeout, 30);
  assert.throws(() => plan(parse(["run", "hello", "--dry-run", "--listen", "10"])), /disconnect/);
});

test("real CLI dry-run prints full install plan without Python or BLE", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "tools/watch.js"), "install", "hapticpat", "--dry-run", "--python", "/does/not/exist"], {encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
  const job = JSON.parse(result.stdout);
  assert.ok(job.files.some(f => f.name === "gestures"));
  assert.ok(job.steps.some(s => s.label === "verify launcher entry"));
});

test("upload plan readbacks, metadata-last, preservation and shared-file uninstall", () => {
  const storage = new Map([["settings", "user value"], ["log.1", "user recording"]]);
  const S = {
    write(n, value, offset, length) {
      if (offset === undefined) storage.set(n, value);
      else {
        const old = length === undefined ? storage.get(n) : "\xff".repeat(length);
        storage.set(n, old.slice(0, offset) + value + old.slice(offset + value.length));
      }
    },
    read: (n, offset, length) => {
      const value = storage.get(n);
      return value === undefined ? undefined : offset === undefined ? value : value.slice(offset, offset + length);
    },
    readJSON(n) { return storage.has(n) ? JSON.parse(storage.get(n)) : undefined; },
    erase: n => storage.delete(n), list: re => [...storage.keys()].filter(n => !re || re.test(n))
  };
  const ctx = vm.createContext({require: () => S, process: {env: {BOARD: "BANGLEJS2"}},
    setTimeout: () => {}, E: {toString: String}, atob: s => Buffer.from(s, "base64").toString("latin1")});
  ctx.global = ctx;
  const files = [{name: "demo.app.js", data: Buffer.from("abc".repeat(200))},
    {name: "shared", data: Buffer.from("abc")},
    {name: "demo.img", data: Buffer.from('"icon";\n'), evaluate: true},
    {name: "settings", data: Buffer.from("default".repeat(100)), noOverwrite: true, dataFile: true},
    {name: "demo.info", data: Buffer.from('{"id":"demo","files":"demo.info,demo.app.js,shared,demo.img"}')}];
  const steps = installPlan("demo", files);
  assert.match(steps.at(-3).label, /demo.info/);
  for (const s of steps) {
    const v = vm.runInContext(s.code, ctx);
    if (s.expectTrue) assert.equal(v, true, s.label);
  }
  assert.equal(storage.get("demo.app.js"), "abc".repeat(200));
  assert.equal(storage.get("demo.img"), "icon");
  assert.equal(storage.get("settings"), "user value");
  storage.set("other.info", '{"files":"other.info,shared"}');
  for (const s of uninstallPlan("demo", files)) vm.runInContext(s.code, ctx);
  assert.equal(storage.has("demo.info"), false);
  assert.equal(storage.has("demo.app.js"), false);
  assert.equal(storage.get("shared"), "abc");
  assert.equal(storage.get("settings"), "user value");
  assert.equal(storage.get("log.1"), "user recording");
});

test("upload expressions and icons run in real pinned firmware, not just Node", async () => {
  const {Emulator} = require("./lib/emulator");
  const e = await new Emulator().boot();
  for (const id of ["hello", "hapticpat"]) {
    for (const s of installPlan(id, appFiles(id))) {
      if (s.delay || s.label === "check BANGLEJS2") continue;
      const value = e.evaluate(`eval(${JSON.stringify(s.code)})`);
      if (s.expectTrue) assert.equal(value, true, s.label);
    }
    assert.equal(e.evaluate(`require("Storage").readJSON("${id}.info").id`), id);
    assert.ok(e.evaluate(`require("Storage").read("${id}.img").length`) > 0);
  }
  // The radio isn't emulated, but the launch handler must not run before disconnect.
  e.command('global.__loaded="";global.load=function(n){global.__loaded=n;};');
  const run = plan(parse(["run", "hello", "--dry-run"]));
  for (const s of run.steps) assert.equal(e.evaluate(`eval(${JSON.stringify(s.code)})`), true);
  e.runFor(2000);
  assert.equal(e.evaluate("global.__loaded"), "");
  e.command('NRF.emit("disconnect")');
  e.runFor(200);
  assert.equal(e.evaluate("global.__loaded"), "hello.app.js");
  e.command('global.__loaded="";NRF.emit("disconnect")');
  e.runFor(200);
  assert.equal(e.evaluate("global.__loaded"), "");
});
