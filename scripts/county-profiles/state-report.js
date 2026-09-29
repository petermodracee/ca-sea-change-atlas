#!/usr/bin/env node
// Reports every availability state that occurs across the published snapshots, and fails if one
// breaks the rules: every unavailable topic and section states a reason from the schema's closed set,
// a topic's state agrees with its tier, and a zero is never written as a gap. There are five states:
// available, zero, suppressed (withheld by the publisher), unavailable (a section or topic with a reason)
// and estimated (an economy figure partly built from imputed QCEW cells: {value, est: {share, step}}).
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
const { ESTIMATED_SHARE_THRESHOLD, WITHHOLD_WEAK_SHARE, WITHHOLD_REASONS } = require("./estimated");
const { CATS, slotsOf } = require("./figure-slots");
const values = { zeroCounts: 0, noJobsSectors: 0 };
const figs = { figures: 0, partial: 0, ...Object.fromEntries(CATS.map((c) => [c, 0])) };
const estShares = [], estSteps = {};
const problems = [];

const SUPPRESSIBLE = new Set(["total-economy", "marine-economy"]);
const walk = (v, f) => { f(v); if (v && typeof v === "object") for (const x of Object.values(v)) walk(x, f); };

for (const c of spine.counties) {
  const file = path.join(dir, c.fips + ".json");
  if (!fs.existsSync(file)) { problems.push(c.name + ": no snapshot"); continue; }
  const snap = JSON.parse(fs.readFileSync(file, "utf8"));
  if (snap.estimation && (snap.estimation.thresholds.marker !== ESTIMATED_SHARE_THRESHOLD || snap.estimation.thresholds.withholdWeakShare !== WITHHOLD_WEAK_SHARE)) problems.push(c.name + ": estimation.thresholds " + JSON.stringify(snap.estimation.thresholds) + " differ from the thresholds in force");
  for (const [id, name] of [["marine-economy", "marine"], ["total-economy", "total"]]) {
    const tp = snap.topics[id];
    if (!tp.available) continue;
    for (const f of slotsOf(name, { measuring: tp.sections.measuring.data, diversity: tp.sections.diversity.data, wages: tp.sections.wages.data })) {
      figs.figures++; figs[f.cat]++;
      if (f.partial) figs.partial++;
      if (f.cat === "marked" || f.cat === "unmarked") { estShares.push(f.cell.est.share); estSteps[f.cell.est.step] = (estSteps[f.cell.est.step] || 0) + 1; }
    }
  }
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
      // An estimate outside the economy topics is an error; the figure counts below use figure-slots.js.
      // Withheld figures carry a reason from the closed vocabulary, and an estimated figure that is shown must be
      // below the withholding threshold at the weak steps (so the rule can be reproduced from the file alone).
      walk(sec.data, (v) => {
        if (v && typeof v === "object" && v.suppressed === true && !WITHHOLD_REASONS.includes(v.reason)) problems.push(c.name + "/" + t.id + "/" + s.id + ": a withheld figure with reason " + JSON.stringify(v.reason));
        if (v && typeof v === "object" && v.est && v.est.weakShare >= WITHHOLD_WEAK_SHARE) problems.push(c.name + "/" + t.id + "/" + s.id + ": a shown figure is at least " + WITHHOLD_WEAK_SHARE + " imputed at the weak steps (weakShare " + v.est.weakShare + ") and should be withheld");
        if (v && typeof v === "object" && v.est && !SUPPRESSIBLE.has(t.id)) problems.push(c.name + "/" + t.id + "/" + s.id + ": an estimated figure outside the economy topics"); });
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
  let synthetic = 0;
  const check = (label, snap, shouldPass) => {
    synthetic++;
    let passed = true;
    try { validateSnapshot(snap, { schema, spine, file: base.fips + ".json", fixture: false }); } catch (e) { passed = false; }
    if (passed !== shouldPass) problems.push("synthetic check failed: " + label + (shouldPass ? " should validate" : " should be rejected"));
  };
  // The estimated state: a figure with provenance is accepted in an economy section; a malformed one, or one
  // outside the economy topics, is rejected.
  const withEst = (mutate) => { const snap = JSON.parse(JSON.stringify(real)); mutate(snap); return snap; };
  const eco = (snap) => snap.topics["marine-economy"].sections.measuring.data;
  check("an estimated figure {value, est}", withEst((sn) => { eco(sn).jobs = { value: 100, est: { share: 0.4, step: 2, weakShare: 0.1 } }; }), true);
  check("a partial estimated figure", withEst((sn) => { eco(sn).jobs = { value: 100, est: { share: 1, step: 5, weakShare: 0.2 }, partial: true }; }), true);
  check("an estimate with share 0", withEst((sn) => { eco(sn).jobs = { value: 100, est: { share: 0, step: 2, weakShare: 0 } }; }), false);
  check("an estimate with step 6", withEst((sn) => { eco(sn).jobs = { value: 100, est: { share: 0.5, step: 6, weakShare: 0 } }; }), false);
  check("an estimate without weakShare", withEst((sn) => { eco(sn).jobs = { value: 100, est: { share: 0.4, step: 2 } }; }), false);
  check("an estimate whose weakShare exceeds its share", withEst((sn) => { eco(sn).jobs = { value: 100, est: { share: 0.2, step: 5, weakShare: 0.5 } }; }), false);
  check("an object with neither est nor partial", withEst((sn) => { eco(sn).jobs = { value: 100 }; }), false);
  // No live figure is withheld any more (the ladder resolves every cell), so the suppressed state is exercised here.
  for (const reason of WITHHOLD_REASONS) check("a withheld economy figure with reason " + reason, withEst((sn) => { eco(sn).gdp = { suppressed: true, reason }; }), true);
  check("a withheld figure with no reason", withEst((sn) => { eco(sn).gdp = { suppressed: true }; }), false);
  check("a withheld figure with an unknown reason", withEst((sn) => { eco(sn).gdp = { suppressed: true, reason: "confidential" }; }), false);
  check("estimation.thresholds missing", withEst((sn) => { delete sn.estimation.thresholds; }), false);
  check("a withheld figure in flood hazard", withEst((sn) => { sn.topics.flood.sections["jobs-at-risk"].data.count = { suppressed: true, reason: "no-data" }; }), false);
  check("an estimated figure in flood hazard", withEst((sn) => { sn.topics.flood.sections["jobs-at-risk"].data.count = { value: 1, est: { share: 0.5, step: 1, weakShare: 0 } }; }), false);
  for (const [t, id, reason] of forced) check(base.name + " " + t + "/" + id + " as " + reason, withGap(t, id, reason), true);
  check("a section gap with an unknown reason", withGap("flood", "people-at-risk", "pending-phase-3"), false);
  const bad = JSON.parse(JSON.stringify(real));
  bad.topics.flood.sections["people-at-risk"].reason = "no-nfhl-coverage";
  check("a reason on an available section", bad, false);
  console.log("Synthetic checks run: " + (forced.length + 10 + 2 + WITHHOLD_REASONS.length + 1) + " (each section-level reason forced onto " + base.name + ", the malformed and out-of-place cases that must be rejected, the estimated state with its weakShare, and every withheld reason)");
}

console.log("Reason codes and where each is used:");
for (const r of reasons) console.log("  " + r + ": " + (where[r].length ? where[r].length + " (" + [...new Set(where[r].map((w) => w.replace(/^\S+( \S+)*? (?=\S+\/|\S+ \(topic\))/, "")))].slice(0, 4).join("; ") + ")" : "not used by any live county"));
console.log("Value-level states: " + JSON.stringify(values));
console.log("Economy figures (definition in scripts/county-profiles/figure-slots.js): " + figs.figures + " = " + figs.published + " published + " + figs.unmarked + " estimated, not marked + " + figs.marked + " estimated, marked ≈ + " + figs["withheld-rule"] + " withheld by the rule + " + figs["withheld-structural"] + " withheld (Public administration GDP). Partial totals (a flag, not a category): " + figs.partial + ".");
if (estShares.length) {
  const sorted = estShares.slice().sort((a, b) => a - b), q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  console.log("Estimated state: marker threshold " + ESTIMATED_SHARE_THRESHOLD + "; withholding threshold " + WITHHOLD_WEAK_SHARE + " of the value imputed at ladder steps 4 and 5 (scripts/county-profiles/estimated.js).");
  console.log("  imputed share of the " + estShares.length + " estimated figures, quantiles: 10% " + q(0.1) + ", 25% " + q(0.25) + ", median " + q(0.5) + ", 75% " + q(0.75) + ", 90% " + q(0.9) + "; weakest ladder step used: " + JSON.stringify(estSteps));
}
if (problems.length) { console.error("\nProblems:\n  " + problems.join("\n  ")); process.exit(1); }
console.log("\nOK: every gap states a closed-set reason and every tier agrees.");
