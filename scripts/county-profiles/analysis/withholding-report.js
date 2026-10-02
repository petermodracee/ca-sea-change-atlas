#!/usr/bin/env node
// What the withholding rule does to the economy figures, with one defined baseline so the counts add up.
//
//   node scripts/county-profiles/analysis/withholding-report.js [--before-ref <git ref>]
//
// Definitions of figure, published, estimated (marked / unmarked) and withheld (by rule / structural) are in
// scripts/county-profiles/figure-slots.js; the categories add up to the figures.
//
// The threshold sweep rebuilds every county's economy with the rule at each threshold (or off); "before" reads the
// snapshots at a git ref (default HEAD, the commit before this rule) with the old rule.

const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const P = path.join(ROOT, "scripts/county-profiles/");

const { CATS, slotsOf } = require(P + "figure-slots.js");

function child(mode, outFile) {
  const est = require(P + "estimated.js");
  const T = mode === "off" ? Infinity : Number(mode);
  est.isWithheldByRule = (w) => w >= T; // patched before economy-sections.js destructures it
  const spine = require(path.join(ROOT, "site/_data/countySpine.json"));
  const schema = require(path.join(ROOT, "site/data/countyProfileSchema.json"));
  const S = require(P + "pipeline/sources.js");
  const { loadEconomyInputs, economyFor } = require(P + "pipeline/economy-run.js");
  (async () => {
    const inputs = await loadEconomyInputs(spine.counties.map((c) => c.fips), spine, {});
    const out = [];
    for (const c of spine.counties) {
      const tt = schema.tiers[c.tier].topics;
      if (!tt["marine-economy"].available) continue;
      const econ = await S.fetchEconomy(c.fips, {});
      const eco = economyFor(inputs, c, tt, { year: econ.value.totalYear, state: econ.value.coastalState, nation: econ.value.coastalNation }, econ);
      for (const [topic, e] of [["marine", eco.marine], ["total", eco.total]]) {
        if (!e) continue;
        for (const s of slotsOf(topic, e)) out.push({ county: c.name, topic, sector: s.sector, key: s.key, cat: s.cat, partial: s.partial });
      }
    }
    fs.writeFileSync(outFile, JSON.stringify(out));
  })();
}

if (process.argv[2] === "--child") { child(process.argv[3], process.argv[4]); return; }

const refIdx = process.argv.indexOf("--before-ref");
const ref = refIdx > 0 ? process.argv[refIdx + 1] : "HEAD";
const tmp = (m) => path.join(os.tmpdir(), "cp-withhold-" + m + ".json");
const modes = ["off", "0.1", "0.25", "0.5", "0.75"];
for (const m of modes) {
  const r = spawnSync(process.execPath, [__filename, "--child", m, tmp(m)], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
}
const runs = Object.fromEntries(modes.map((m) => [m, JSON.parse(fs.readFileSync(tmp(m), "utf8"))]));

// before: the snapshots at `ref`, with the old rule
const spine = require(path.join(ROOT, "site/_data/countySpine.json"));
const before = [];
for (const c of spine.counties) {
  let snap;
  try { snap = JSON.parse(execFileSync("git", ["show", ref + ":site/data/county-profiles/latest/" + c.fips + ".json"], { cwd: ROOT, maxBuffer: 1 << 28 }).toString()); } catch (e) { continue; }
  for (const [t, name] of [["marine-economy", "marine"], ["total-economy", "total"]]) {
    if (!snap.topics[t].available) continue;
    const sec = snap.topics[t].sections;
    for (const s of slotsOf(name, { measuring: sec.measuring.data, diversity: sec.diversity.data, wages: sec.wages.data })) before.push({ county: c.name, topic: name, sector: s.sector, key: s.key, cat: s.cat, partial: s.partial });
  }
}

const count = (list) => Object.fromEntries(CATS.map((c) => [c, list.filter((x) => x.cat === c).length]));
const cols = [["before (old rule, " + ref + ")", before], ["rule off", runs["off"]], ["0.10", runs["0.1"]], ["**0.25 (shipped)**", runs["0.25"]], ["0.50", runs["0.5"]], ["0.75", runs["0.75"]]];
const label = { published: "published (plain number)", unmarked: "estimated, not marked (< 0.25 imputed)", marked: "estimated, marked ≈ (>= 0.25 imputed)", "withheld-rule": "withheld by the rule", "withheld-structural": "withheld, Public administration GDP", "withheld-nodata": "withheld, no data", "withheld-noanchor": "withheld, tourism with no calibration anchor" };
const counts = cols.map(([, l]) => count(l));
let out = "| | " + cols.map((c) => c[0]).join(" | ") + " |\n|---|" + cols.map(() => "---").join("|") + "|\n";
for (const c of CATS) out += "| " + label[c] + " | " + counts.map((n) => n[c]).join(" | ") + " |\n";
out += "| **figures** | " + cols.map(([, l]) => l.length).join(" | ") + " |\n";
out += "| with any estimate (unmarked + marked) | " + counts.map((n) => n.unmarked + n.marked).join(" | ") + " |\n";
out += "| partial totals (flag, not a category) | " + cols.map(([, l]) => l.filter((x) => x.partial).length).join(" | ") + " |\n";
out += "| withheld by the rule as a share of figures that have any estimate or are withheld by the rule | " + counts.map((n) => { const d = n.unmarked + n.marked + n["withheld-rule"]; return d ? Math.round((n["withheld-rule"] / d) * 100) + "%" : "n/a"; }).join(" | ") + " |\n";
console.log(out);

const breakdown = (list, keyf) => { const o = {}; for (const x of list.filter((y) => y.cat === "withheld-rule")) { const k = keyf(x); o[k] = (o[k] || 0) + 1; } return o; };
for (const [title, keyf] of [["county", (x) => x.county], ["sector", (x) => (x.topic === "total" ? "total: " : "marine: ") + x.sector]]) {
  const bs = ["0.1", "0.25", "0.5", "0.75"].map((m) => breakdown(runs[m], keyf));
  const keys = [...new Set(bs.flatMap((b) => Object.keys(b)))].sort((a, b) => (bs[1][b] || 0) - (bs[1][a] || 0) || (bs[0][b] || 0) - (bs[0][a] || 0));
  console.log("Figures withheld by the rule, by " + title + " (thresholds 0.10 / 0.25 / 0.50 / 0.75):\n\n| " + title + " | 0.10 | **0.25** | 0.50 | 0.75 |\n|---|---|---|---|---|\n" + keys.map((k) => "| " + k + " | " + bs.map((b) => b[k] || 0).join(" | ") + " |").join("\n") + "\n");
}
// still marked, by county, at each threshold
console.log("Figures still marked ≈ at each threshold: " + ["0.1", "0.25", "0.5", "0.75"].map((m) => m + ": " + count(runs[m]).marked).join(", ") + " (rule off: " + count(runs["off"]).marked + ").");
