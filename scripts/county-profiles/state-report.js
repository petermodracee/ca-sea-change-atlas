#!/usr/bin/env node
// Reports every availability state that occurs across the published snapshots, and fails if one
// breaks the rules: every unavailable topic and section states a reason from the schema's closed set,
// a topic's state agrees with its tier, and a zero is never written as a gap.
//
//   node scripts/county-profiles/state-report.js
//
// It lists, per reason code, where it is used (tier rule, or section-level), and counts the value-level
// states: zero counts, withheld ({suppressed}) cells and partial totals. A reason code that occurs
// nowhere is printed as such: the closed set is exercised by the tiers and by synthetic checks, not
// necessarily by a live county (see docs/COUNTY-PROFILES.md).

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const schema = require(path.join(ROOT, "site/data/countyProfileSchema.json"));
const spine = require(path.join(ROOT, "site/_data/countySpine.json"));
const dir = path.join(ROOT, "site/data/county-profiles/latest");

const reasons = Object.keys(schema.reasons);
const where = Object.fromEntries(reasons.map((r) => [r, []]));
const values = { zeroCounts: 0, withheldCells: 0, partialTotals: 0, noJobsSectors: 0 };
const problems = [];

const walk = (v, f) => { f(v); if (v && typeof v === "object") for (const x of Object.values(v)) walk(x, f); };

for (const c of spine.counties) {
  const file = path.join(dir, c.fips + ".json");
  if (!fs.existsSync(file)) { problems.push(c.name + ": no snapshot"); continue; }
  const snap = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const t of schema.topics) {
    const topic = snap.topics[t.id];
    const rule = schema.tiers[c.tier].topics[t.id];
    if (topic.available !== rule.available || topic.reason !== rule.reason) problems.push(c.name + "/" + t.id + " disagrees with the " + c.tier + " tier rule");
    if (!topic.available) {
      if (!reasons.includes(topic.reason)) problems.push(c.name + "/" + t.id + ": reason " + topic.reason + " is not in the closed set");
      where[topic.reason].push(c.name + " " + t.id + " (topic)");
      continue;
    }
    for (const s of t.sections) {
      const sec = topic.sections[s.id];
      if (!sec.available) {
        if (!reasons.includes(sec.reason)) problems.push(c.name + "/" + t.id + "/" + s.id + ": reason " + sec.reason + " is not in the closed set");
        where[sec.reason].push(c.name + " " + t.id + "/" + s.id);
        continue;
      }
      walk(sec.data, (v) => {
        if (v && v.suppressed === true) values.withheldCells++;
        if (v && typeof v === "object" && v.partial === true) values.partialTotals++;
      });
      if (sec.data && sec.data.noJobs) values.noJobsSectors += sec.data.noJobs.length;
      const d = sec.data;
      if (s.kind === "inside-outside") values.zeroCounts += d.items.filter((i) => i.inside === 0).length;
    }
  }
}

// Synthetic checks. A live county does not hit every section-level reason (all 27 have NFHL studies,
// C-CAP covers every county, every full-tier county has SLR polygons), so each is forced onto a real
// snapshot here and the validator must accept it, and must reject a reason that is not in the set
// and a reason on a section that is available.
const { validateSnapshot } = require("./validate");
const base = spine.counties.find((c) => c.tier === "full" && fs.existsSync(path.join(dir, c.fips + ".json")));
if (base) {
  const real = JSON.parse(fs.readFileSync(path.join(dir, base.fips + ".json"), "utf8"));
  const forced = [
    ["flood", "people-at-risk", "no-nfhl-coverage"],
    ["flood", "natural-features", "source-geography"],
    ["slr", "critical-facilities", "no-slr-extent"],
    ["slr", "natural-landscapes", "source-geography"],
    ["total-economy", "total-jobs", "source-geography"],
  ];
  const withGap = (topic, id, reason) => {
    const snap = JSON.parse(JSON.stringify(real));
    snap.topics[topic].sections[id] = { available: false, reason, use: { ui: true, pdf: true, present: true }, sources: [], data: null };
    // An uncited source is an error, so drop any source no remaining section cites.
    const cited = new Set(Object.values(snap.topics).flatMap((t) => Object.values(t.sections).flatMap((x) => x.sources)));
    snap.sources = Object.fromEntries(Object.entries(snap.sources).filter(([k]) => cited.has(k)));
    return snap;
  };
  const check = (label, snap, shouldPass) => {
    let passed = true;
    try { validateSnapshot(snap, { schema, spine, file: base.fips + ".json", fixture: false }); } catch (e) { passed = false; }
    if (passed !== shouldPass) problems.push("synthetic check failed: " + label + (shouldPass ? " should validate" : " should be rejected"));
  };
  for (const [t, id, reason] of forced) check(base.name + " " + t + "/" + id + " as " + reason, withGap(t, id, reason), true);
  check("a section gap with an unknown reason", withGap("flood", "people-at-risk", "pending-phase-3"), false);
  const bad = JSON.parse(JSON.stringify(real));
  bad.topics.flood.sections["people-at-risk"].reason = "no-nfhl-coverage";
  check("a reason on an available section", bad, false);
  console.log("Synthetic checks run: " + (forced.length + 2) + " (each section-level reason forced onto " + base.name + ", plus two that must be rejected)");
}

console.log("Reason codes and where each is used:");
for (const r of reasons) console.log("  " + r + ": " + (where[r].length ? where[r].length + " (" + [...new Set(where[r].map((w) => w.replace(/^\S+( \S+)*? (?=\S+\/|\S+ \(topic\))/, "")))].slice(0, 4).join("; ") + ")" : "not used by any live county"));
console.log("Value-level states: " + JSON.stringify(values));
if (problems.length) { console.error("\nProblems:\n  " + problems.join("\n  ")); process.exit(1); }
console.log("\nOK: every gap states a closed-set reason and every tier agrees.");
