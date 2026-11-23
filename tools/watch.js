#!/usr/bin/env node
// Shell entry point; no npm packages or emulator downloads needed.
const {spawn} = require("child_process");
const fs = require("fs");
const path = require("path");
const P = require("./lib/watch-plan");
const USAGE = `Usage: npm run watch -- <command> [arguments] [options]
  scan                     List advertising Bangle watches (does not connect)
  first-contact            Print firmware, board and battery, then disconnect
  install <id>             Upload metadata storage + launcher info; verify
  uninstall <id>           Remove app; preserve data and other apps' shared files
  list                     Print Storage.list()
  run <id>                 Launch installed app after disconnect
  console '<JavaScript>'   Evaluate code, print reply and capture output
  exec <file.js>           Evaluate a local script (e.g. TF model upload)
Options:
  --device <address/UUID>   Exact address returned by scan (required except scan)
  --python <executable>    Python with Bleak installed (default WATCH_PYTHON/python3)
  --timeout <seconds>      Scan/connect/per-command timeout, 2..300 (default 20)
  --listen <seconds>       Capture console after reply, 0..3600 (default 0)
  --dry-run                Print JSON plan, never load BLE or connect
  --help                   Show this help
All non-scan commands disconnect on completion. Hardware path is unverified.`;

function parse(args) {
  const opts = {timeout: 20, listen: 0, python: process.env.WATCH_PYTHON || (process.platform === "win32" ? "python" : "python3")};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "--dry-run") opts[a.slice(2)] = true;
    else if (["--device", "--python", "--timeout", "--listen"].includes(a)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw Error("Missing value for " + a);
      const key = a.slice(2);
      if (Object.hasOwn(opts, "_"+key)) throw Error("Repeated option " + a);
      opts["_"+key] = true;
      opts[key] = args[++i];
    } else if (a.startsWith("--")) throw Error("Unknown option " + a);
    else positional.push(a);
  }
  if (opts.help) return opts;
  const counts = {scan: 0, "first-contact": 0, install: 1, uninstall: 1, list: 0, run: 1, console: 1, exec: 1};
  const [command, ...rest] = positional;
  if (!(command in counts) || rest.length !== counts[command]) throw Error("Invalid command or argument count. Use --help.");
  for (const [key, min, max] of [["timeout", 2, 300], ["listen", 0, 3600]]) {
    opts[key] = Number(opts[key]);
    if (!Number.isFinite(opts[key]) || opts[key] < min || opts[key] > max) throw Error(`--${key} must be ${min}..${max} seconds.`);
  }
  if (command !== "scan" && !opts.device && !opts["dry-run"]) throw Error("--device is required. Run scan and ask the human to identify their watch.");
  return {...opts, command, arg: rest[0]};
}

function plan(opts) {
  let steps = [];
  let files;
  if (["install", "uninstall", "run"].includes(opts.command)) files = P.appFiles(opts.arg);
  if (opts.command === "first-contact") steps = [P.contact];
  if (opts.command === "list") steps = [P.list];
  if (opts.command === "install") steps = P.installPlan(opts.arg, files);
  if (opts.command === "uninstall") steps = P.uninstallPlan(opts.arg, files);
  if (opts.command === "run") steps = [
    P.step(`require("Storage").readJSON(${JSON.stringify(opts.arg + ".info")},1)!==undefined`, "check installed", {expectTrue: true}),
    P.step(`NRF.on("disconnect",function launchDemo(){NRF.removeListener("disconnect",launchDemo);setTimeout(function(){load(${JSON.stringify(opts.arg + ".app.js")});},100);});true`, "schedule launch after disconnect")];
  if (opts.command === "console") steps = [P.step(opts.arg, "console")];
  if (opts.command === "exec") steps = [P.step(fs.readFileSync(path.resolve(opts.arg), "utf8"), "execute " + opts.arg)];
  if (opts.command === "run" && opts.listen) throw Error("run must disconnect before launch; use console --listen after the app starts.");
  return {command: opts.command, device: opts.device, timeout: opts.timeout, listen: opts.listen,
    files: files && files.map(f => ({name: f.name, bytes: f.data.length, evaluate: !!f.evaluate, noOverwrite: !!f.noOverwrite})), steps};
}

function main(args) {
  const opts = parse(args);
  if (opts.help) { console.log(USAGE); return; }
  const job = plan(opts);
  if (opts["dry-run"]) { console.log(JSON.stringify(job, null, 2)); return; }
  const child = spawn(opts.python, [path.join(__dirname, "watch-ble.py")], {stdio: ["pipe", "inherit", "inherit"]});
  child.on("error", e => { console.error("Cannot start Python: " + e.message + ". See hw-tests/AI-GUIDE.md setup; use --python <venv executable>."); process.exitCode = 1; });
  child.stdin.on("error", () => {}); // child startup/import failures are reported by the child
  child.stdin.end(JSON.stringify(job));
  child.on("exit", (code, signal) => { process.exitCode = code || (signal ? 1 : 0); });
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error("watch: " + e.message); process.exitCode = 1; }
}
module.exports = {parse, plan};
