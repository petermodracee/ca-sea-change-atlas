#!/usr/bin/env node
// Guards the snapshot archive's one rule: a published dated snapshot is never edited.
//
//   node scripts/county-profiles/check-archive.js [--base <git ref>]
//
// Fails if, compared with the base (default HEAD, so uncommitted changes count; the workflow runs it
// before committing, and a PR can pass --base origin/<target>):
//   - a file under a dated directory (site/data/county-profiles/<YYYY-MM-DD>/) was modified, deleted
//     or renamed (adding one is how the archive grows);
// and, independent of git, if
//   - a dated file's `snapshot` disagrees with its directory, or its fips with its name;
//   - latest/'s snapshot has no dated copy, or the copy's content differs (latest/ may differ only in
//     `generated` and the per-source retrieved/verified stamps).
// It prints each county's method versions so an unintended bump is visible.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { DATA, DATED, datedDirs, sameContent, readJson } = require("./pipeline/archive");

const ROOT = path.join(__dirname, "..", "..");
const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "HEAD";
const problems = [];

const rel = path.relative(ROOT, DATA).split(path.sep).join("/");
let out = "";
try { out = execFileSync("git", ["diff", "--name-status", "-M", base, "--", rel], { cwd: ROOT, encoding: "utf8" }); }
catch (e) { problems.push("git diff against " + base + " failed: " + e.message); }
for (const line of out.split("\n").filter(Boolean)) {
  const [status, ...files] = line.split("\t");
  if (status === "A") continue;
  for (const f of files) if (DATED.test(f.slice(rel.length + 1).split("/")[0])) problems.push("published snapshot changed (" + status + "): " + f);
}

const methods = new Set();
for (const d of datedDirs()) {
  for (const file of fs.readdirSync(path.join(DATA, d)).filter((f) => f.endsWith(".json"))) {
    const snap = readJson(path.join(DATA, d, file));
    if (snap.snapshot !== d) problems.push(d + "/" + file + ": snapshot field says " + snap.snapshot);
    if (snap.fips + ".json" !== file) problems.push(d + "/" + file + ": fips field says " + snap.fips);
    methods.add(snap.method);
  }
}
const latestDir = path.join(DATA, "latest");
for (const file of fs.readdirSync(latestDir).filter((f) => f.endsWith(".json"))) {
  const snap = readJson(path.join(latestDir, file));
  methods.add(snap.method);
  const dated = path.join(DATA, snap.snapshot, file);
  if (!fs.existsSync(dated)) problems.push("latest/" + file + " is snapshot " + snap.snapshot + ", which has no dated copy");
  else if (!sameContent(snap, readJson(dated))) problems.push("latest/" + file + " differs in content from its dated copy " + snap.snapshot + ": a content change must mint a new dated snapshot");
}

console.log("archive: " + datedDirs().length + " dated director" + (datedDirs().length === 1 ? "y" : "ies") + " (" + datedDirs().join(", ") + "); method version(s) in use: " + [...methods].sort().join(", "));
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("archive ok");
