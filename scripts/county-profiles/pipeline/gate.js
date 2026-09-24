#!/usr/bin/env node
// The change gate: the cheap first step of an automated run. For each county it asks FEMA's NFHL for
// the county's study ids and FIRM panel effective dates (three small queries, no geometry) and compares
// them with what the last build of that county saw, so the expensive fetch and intersect only runs for
// a county whose flood-hazard source actually revised.
//
//   node scripts/county-profiles/pipeline/gate.js [all | fips[,fips...]] [--force] [--baseline]
//
// Prints one line per county and a JSON report on stdout's last line. When $GITHUB_OUTPUT is set it
// writes `changed=<comma-separated fips>` for the workflow. State is site/data/county-profiles/gate.json.
//
// A county is recomputed when: it has no gate entry or no snapshot; its NFHL fingerprint differs; its
// last computation is older than MAX_AGE_DAYS (NFHL is not the only source: ACS, LODES, OpenFEMA claims
// and the ENOW series move on their own schedules, and would otherwise never be picked up); or --force.
// A recompute that finds no difference in the numbers still mints no dated snapshot (archive.js).
//
// --baseline records the live fingerprint for every county as the current state without recomputing,
// but only where it agrees with the vintage the county's published snapshot carries; a disagreement is
// a real revision and is reported, not baselined.

const fs = require("fs");
const path = require("path");
const S = require("./sources");
const { today } = require("./http");
const { DATA } = require("./archive");

const ROOT = path.join(__dirname, "..", "..", "..");
const spine = require(path.join(ROOT, "site/_data/countySpine.json"));
const GATE_FILE = path.join(DATA, "gate.json");
const MAX_AGE_DAYS = 200;

const readGate = () => (fs.existsSync(GATE_FILE) ? JSON.parse(fs.readFileSync(GATE_FILE, "utf8")) : {});
const writeGate = (g) => fs.writeFileSync(GATE_FILE, JSON.stringify(Object.fromEntries(Object.keys(g).sort().map((k) => [k, g[k]])), null, 2) + "\n");
const key = (f) => JSON.stringify([f.dfirms, f.effStart, f.effEnd, f.panelCount]);
const ageDays = (date) => Math.floor((Date.parse(today()) - Date.parse(date)) / 864e5);

// Called by run.js after a county is recomputed: what the build saw becomes the baseline.
function recordComputed(fips, nfhl) {
  const g = readGate();
  g[fips] = { dfirms: nfhl.dfirms, effStart: nfhl.effStart, effEnd: nfhl.effEnd, panelCount: nfhl.panelCount, computed: today(), checked: today() };
  writeGate(g);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force"), baseline = args.includes("--baseline");
  const arg = args.find((a) => !a.startsWith("--")) || "all";
  const all = spine.counties.map((c) => c.fips);
  const todo = arg === "all" ? all : arg.split(",");
  for (const f of todo) if (!all.includes(f)) throw new Error(f + " is not in countySpine.json");
  const gate = readGate();
  const report = { changed: [], revised: [], unchanged: [], reasons: {} };

  for (const fips of todo) {
    const name = spine.counties.find((c) => c.fips === fips).name;
    const live = await S.nfhlFingerprint(fips);
    const prev = gate[fips];
    const snapFile = path.join(DATA, "latest", fips + ".json");
    let reason = null;
    if (baseline) {
      const snap = JSON.parse(fs.readFileSync(snapFile, "utf8"));
      const v = snap.sources.nfhl && snap.sources.nfhl.vintage;
      const pub = v ? [v.start, v.end] : [null, null];
      if (pub[0] !== live.effStart || pub[1] !== live.effEnd) { console.log(fips + " " + name + ": live " + live.effStart + ".." + live.effEnd + " differs from the snapshot's " + pub.join("..") + ", not baselined"); report.revised.push(fips); continue; }
      gate[fips] = { ...live, computed: snap.generated.slice(0, 10), checked: today() };
      report.unchanged.push(fips);
      console.log(fips + " " + name + ": baselined at " + live.effStart + ".." + live.effEnd + ", " + live.panelCount + " panels");
      continue;
    }
    if (force) reason = "forced";
    else if (!prev) reason = "no previous build recorded";
    else if (!fs.existsSync(snapFile)) reason = "no snapshot";
    else if (key(prev) !== key(live)) { reason = "NFHL revised: " + prev.effStart + ".." + prev.effEnd + " (" + prev.panelCount + " panels) -> " + live.effStart + ".." + live.effEnd + " (" + live.panelCount + ")"; report.revised.push(fips); }
    else if (ageDays(prev.computed) > MAX_AGE_DAYS) reason = "last computed " + prev.computed + ", older than " + MAX_AGE_DAYS + " days";
    if (reason) { report.changed.push(fips); report.reasons[fips] = reason; console.log(fips + " " + name + ": recompute (" + reason + ")"); }
    else { report.unchanged.push(fips); gate[fips] = { ...prev, checked: today() }; console.log(fips + " " + name + ": unchanged at " + live.effStart + ".." + live.effEnd + ", skipped"); }
  }
  writeGate(gate);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "changed=" + report.changed.join(",") + "\n");
  console.log(JSON.stringify(report));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { recordComputed, MAX_AGE_DAYS };
