#!/usr/bin/env node
// Proves the flood-hazard and sea-level-rise figures did not move: compares those two topics (and the gauge
// block, geometry and identity fields) between a baseline directory of snapshots and the current ones.
//
//   node scripts/county-profiles/analysis/diff-hazard.js <baseline dir holding latest/ and dated dirs>
//
// Exits 1 on any difference. Used for the Phase 7 economy rebuild, which must leave hazard figures byte-identical.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const cur = path.join(ROOT, "site/data/county-profiles");
const base = process.argv[2];
if (!base) { console.error("usage: diff-hazard.js <baseline dir>"); process.exit(2); }
const KEEP = (s) => JSON.stringify({ fips: s.fips, slug: s.slug, county: s.county, tier: s.tier, snapshot: s.snapshot, method: s.method, gauge: s.gauge, geometry: s.geometry, flood: s.topics.flood, slr: s.topics.slr });
let bad = 0, n = 0;
for (const dir of ["latest", "2026-09-24"]) {
  for (const f of fs.readdirSync(path.join(cur, dir)).filter((x) => x.endsWith(".json"))) {
    const a = JSON.parse(fs.readFileSync(path.join(base, dir, f), "utf8")), b = JSON.parse(fs.readFileSync(path.join(cur, dir, f), "utf8"));
    n++;
    if (KEEP(a) !== KEEP(b)) { console.error("DIFFERENT: " + dir + "/" + f); bad++; }
    // the flood and sea-level-rise sources must be untouched too
    const cited = (s) => new Set(["flood", "slr"].flatMap((t) => Object.values(s.topics[t].sections).flatMap((x) => x.sources)));
    for (const k of cited(a)) if (JSON.stringify(a.sources[k]) !== JSON.stringify(b.sources[k])) { console.error("SOURCE DIFFERENT: " + dir + "/" + f + " " + k); bad++; }
  }
}
console.log(n + " snapshots compared (latest and 2026-09-24); flood hazard, sea level rise, gauge and identity fields " + (bad ? "DIFFER in " + bad : "are identical"));
process.exit(bad ? 1 : 0);
