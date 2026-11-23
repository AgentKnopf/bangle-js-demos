// Hardware upload planning only. Deliberately independent of the emulator.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const js = JSON.stringify;

function appFiles(id, root = ROOT) {
  if (!/^[a-z0-9]{1,20}$/.test(id || "")) throw Error("Expected a local app id (lowercase letters/digits, <=20).");
  const dir = path.join(root, "apps", id);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8"));
  if (meta.id !== id || !meta.supports.includes("BANGLEJS2") || meta.type !== "app")
    throw Error("Only this repository's BANGLEJS2 app metadata is supported.");
  const files = [...meta.storage, ...(meta.data || []).filter(f => f.url || f.content !== undefined)
    .map(f => ({...f, noOverwrite: true, dataFile: true}))]
    .filter(f => !f.supports || f.supports.includes("BANGLEJS2")).map(f => {
      if (!f.name || Buffer.byteLength(f.name) > 28 || /[,\0;]/.test(f.name) || f.name === id + ".info")
        throw Error("Invalid or reserved Storage filename: " + f.name);
      if (f.storageFile) throw Error("Uploading StorageFile initial data is not supported.");
      let data;
      if (f.content !== undefined) data = Buffer.from(f.content, "utf8");
      else {
        const source = fs.realpathSync(path.resolve(dir, f.url));
        const apps = fs.realpathSync(path.join(root, "apps")) + path.sep;
        if (!source.startsWith(apps)) throw Error("Metadata URL must stay inside apps/: " + f.url);
        data = fs.readFileSync(source);
      }
      return {...f, data};
    });
  if (new Set(files.map(f => f.name)).size !== files.length) throw Error("Duplicate Storage filenames.");
  const info = {id, name: meta.shortName || meta.name};
  if (files.some(f => f.name === id + ".app.js")) info.src = id + ".app.js";
  if (files.some(f => f.name === id + ".img")) info.icon = id + ".img";
  for (const key of ["sortorder", "version", "tags"]) if (meta[key]) info[key] = meta[key];
  info.files = [id + ".info", ...files.filter(f => !f.dataFile).map(f => f.name)].join(",");
  const dataFiles = (meta.data || []).filter(f => !f.storageFile).map(f => f.name || f.wildcard);
  const storageFiles = (meta.data || []).filter(f => f.storageFile).map(f => f.name || f.wildcard);
  const data = dataFiles.join(",") + (storageFiles.length ? ";" + storageFiles.join(",") : "");
  if (data) info.data = data;
  files.push({name: id + ".info", data: Buffer.from(js(info)), info: true});
  return files;
}

function step(code, label, extra) { return {code, label, ...extra}; }
const contact = step('({version:process.env.VERSION,board:process.env.BOARD,battery:E.getBattery()})', "first-contact");
const board = step('process.env.BOARD==="BANGLEJS2"', "check BANGLEJS2", {expectTrue: true});
const list = step('require("Storage").list()', "Storage.list");

function installPlan(id, files) {
  const steps = [board,
    step('setTimeout(function(){load();},100);true', "stop current app (load clock)", {delay: 2}),
    step('require("Storage").erase(' + js(id + ".info") + ');true', "remove old launcher entry")];
  for (const file of files) {
    const name = js(file.name);
    // Defaults in metadata.data must never replace the user's existing settings.
    const guard = file.noOverwrite ? `if(s.read(${name})!==undefined)return true;` : "";
    if (file.evaluate) {
      const expr = file.data.toString("utf8").trim().replace(/;$/, "");
      steps.push(step(`(function(){var s=require("Storage");${guard}var v=E.toString((${expr}));s.write(${name},v);return s.read(${name})===v;})()`,
        "write + verify evaluated " + file.name, {expectTrue: true}));
    } else {
      // Small chunks bound REPL memory and allow per-chunk readback acknowledgement.
      const size = 192;
      for (let offset = 0; offset < Math.max(1, file.data.length); offset += size) {
        const chunk = file.data.subarray(offset, offset + size);
        const value = `atob(${js(chunk.toString("base64"))})`;
        // Determine noOverwrite once per file, not after the first chunk.
        if (!offset && file.noOverwrite)
          steps.push(step(`global.__watchSkip=require("Storage").read(${name})!==undefined;true`, "preserve existing " + file.name));
        steps.push(step(`(function(){var s=require("Storage");${file.noOverwrite ? "if(global.__watchSkip)return true;" : ""}var v=${value};s.write(${name},v,${offset}${offset === 0 ? "," + file.data.length : ""});return s.read(${name},${offset},${chunk.length})===v;})()`,
          `write + verify ${file.name} @${offset}`, {expectTrue: true}));
      }
      if (file.noOverwrite) steps.push(step("delete global.__watchSkip;true", "clear upload flag"));
    }
  }
  steps.push(list, step(`require("Storage").readJSON(${js(id + ".info")}).id===${js(id)}`, "verify launcher entry", {expectTrue: true}));
  return steps;
}

function uninstallPlan(id, files) {
  // Leave data intact and preserve shared modules owned by any other installed app.
  const names = files.filter(f => !f.dataFile).map(f => f.name);
  return [board, step('setTimeout(function(){load();},100);true', "stop current app (load clock)", {delay: 2}),
    step(`(function(){var s=require("Storage"),names=${js(names)},kept=[],erased=[];var owners=s.list(/\\.info$/).filter(function(n){return n!==${js(id + ".info")};}).map(function(n){return s.readJSON(n,1)||{};});names.forEach(function(n){if(owners.some(function(a){return (a.files||"").split(",").some(function(f){return f===n;});}))kept.push(n);else{s.erase(n);if(s.read(n)!==undefined)throw Error("erase failed: "+n);erased.push(n);}});return {erased:erased,sharedKept:kept,data:"preserved"};})()`, "uninstall app, keep data and shared files"), list];
}

module.exports = {ROOT, appFiles, installPlan, uninstallPlan, contact, list, step};
