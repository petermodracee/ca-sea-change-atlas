#!/usr/bin/env node
// The change gate: the cheap first step of an automated run. For each county it asks FEMA's NFHL for
// the county's study ids, FIRM panel effective dates and LOMRs (four small queries, no geometry) and
// compares them with what the last build of that county saw, so the expensive fetch and intersect only runs for
// a county whose flood-hazard source actually revised.
//
//   node scripts/county-profiles/pipeline/gate.js [all | fips[,fips...]] [--force [--force-since YYYY-MM-DD]] [--baseline]
//
// Prints one line per county and a JSON report on stdout's last line. When $GITHUB_OUTPUT is set it
// writes `changed=<comma-separated fips>` for the workflow. State is site/data/county-profiles/gate.json.
// A county the gate skips leaves its entry as it was, so a run that recomputes nothing leaves the file
// byte-identical. The date of each check goes in the workflow run's step summary instead.
//
// A county is recomputed when: it has no gate entry or no snapshot; its NFHL fingerprint (panels or
// LOMRs) differs; its
// last computation is older than MAX_AGE_DAYS (NFHL is not the only source: ACS, LODES, OpenFEMA claims
// and the ENOW series move on their own schedules, and would otherwise never be picked up); or --force.
// A recompute that finds no difference in the numbers still mints no dated snapshot (archive.js).
//
// --force-since limits --force to counties last computed before that date. The workflow passes the open
// data PR's opening date when it adds to that PR, so a retry of a forced run (or "Re-run failed jobs",
// which reuses the inputs) recomputes only the counties the PR does not have yet.
//
// --baseline records the live fingerprint for every county as the current state without recomputing,
// but only where it agrees with the vintage the county's published snapshot carries, and no Effective
// LOMR is dated after the snapshot was generated; a disagreement is a real revision and is reported,
// not baselined. Run it whenever the fingerprint gains a field, so existing counties record the field's
// current value instead of all reading as changed.

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
const key = (f) => JSON.stringify([f.dfirms, f.effStart, f.effEnd, f.panelCount, f.lomrCount, f.lomrLatest]);
const panelKey = (f) => JSON.stringify([f.dfirms, f.effStart, f.effEnd, f.panelCount]);
const lomrKey = (f) => JSON.stringify([f.lomrCount, f.lomrLatest]);
const ageDays = (date) => Math.floor((Date.parse(today()) - Date.parse(date)) / 864e5);
// The fields a gate entry records (plus `computed`), from a live fingerprint or a build's NFHL fetch.
const fingerprintOf = (n) => ({ dfirms: n.dfirms, effStart: n.effStart, effEnd: n.effEnd, panelCount: n.panelCount, lomrCount: n.lomrCount ?? null, lomrLatest: n.lomrLatest ?? null });

// Why a county's fingerprint differs from its last build, panels and LOMRs reported separately; null
// when it does not. A gate entry from before LOMRs were fingerprinted has no LOMR fields and reads as changed.
function revisionReason(prev, live) {
  const out = [];
  if (panelKey(prev) !== panelKey(live)) out.push("NFHL revised: " + prev.effStart + ".." + prev.effEnd + " (" + prev.panelCount + " panels) -> " + live.effStart + ".." + live.effEnd + " (" + live.panelCount + ")");
  if (lomrKey(prev) !== lomrKey(live)) out.push("NFHL LOMR: " + (prev.lomrCount ?? "not recorded") + " → " + live.lomrCount + ", latest " + live.lomrLatest);
  return out.length ? out.join("; ") : null;
}

// Called by run.js after a county is recomputed: what the build saw becomes the baseline.
function recordComputed(fips, nfhl) {
  const g = readGate();
  g[fips] = { ...fingerprintOf(nfhl), computed: today() };
  writeGate(g);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force"), baseline = args.includes("--baseline");
  const sinceAt = args.indexOf("--force-since"), since = sinceAt >= 0 ? args[sinceAt + 1] : null;
  if (sinceAt >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(since || "")) throw new Error("--force-since needs a YYYY-MM-DD date");
  const arg = args.find((a, i) => !a.startsWith("--") && (sinceAt < 0 || i !== sinceAt + 1)) || "all";
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
      if (live.lomrLatest && live.lomrLatest > snap.generated.slice(0, 10)) { console.log(fips + " " + name + ": LOMR effective " + live.lomrLatest + ", after the snapshot was generated, not baselined"); report.revised.push(fips); continue; }
      gate[fips] = { ...fingerprintOf(live), computed: snap.generated.slice(0, 10) };
      report.unchanged.push(fips);
      console.log(fips + " " + name + ": baselined at " + live.effStart + ".." + live.effEnd + ", " + live.panelCount + " panels, " + live.lomrCount + " LOMR" + (live.lomrCount === 1 ? "" : "s") + " (latest " + live.lomrLatest + ")");
      continue;
    }
    if (force && !(since && prev && prev.computed >= since)) reason = "forced";
    else if (!prev) reason = "no previous build recorded";
    else if (!fs.existsSync(snapFile)) reason = "no snapshot";
    else if (key(prev) !== key(live)) { reason = revisionReason(prev, live); report.revised.push(fips); }
    else if (ageDays(prev.computed) > MAX_AGE_DAYS) reason = "last computed " + prev.computed + ", older than " + MAX_AGE_DAYS + " days";
    if (reason) { report.changed.push(fips); report.reasons[fips] = reason; console.log(fips + " " + name + ": recompute (" + reason + ")"); }
    else { report.unchanged.push(fips); console.log(fips + " " + name + ": unchanged at " + live.effStart + ".." + live.effEnd + ", skipped"); }
  }
  writeGate(gate);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "changed=" + report.changed.join(",") + "\n");
  console.log(JSON.stringify(report));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { recordComputed, revisionReason, key, MAX_AGE_DAYS };
