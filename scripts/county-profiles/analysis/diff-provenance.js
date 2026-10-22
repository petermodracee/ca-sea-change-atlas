#!/usr/bin/env node
// Proves a provenance-only change moved no figure: compares every snapshot at a git ref with the working copy after
// removing the provenance fields added since (`est.weakShare`, the `reason` next to `suppressed`, and
// `estimation.thresholds`). Exits 1 if anything else differs. Also counts the fields added.
//
//   node scripts/county-profiles/analysis/diff-provenance.js [git ref]     (default HEAD)

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const ref = process.argv[2] || "HEAD";
const DATA = path.join(ROOT, "site/data/county-profiles");
const added = { weakShare: 0, reason: 0, thresholds: 0 };

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "reason" && v.suppressed === true) continue;
      if (k === "weakShare" && v.step !== undefined && v.share !== undefined) continue;
      o[k] = strip(x);
    }
    return o;
  }
  return v;
};
const count = (v, top) => {
  if (Array.isArray(v)) v.forEach((x) => count(x));
  else if (v && typeof v === "object") {
    if (v.suppressed === true && "reason" in v) added.reason++;
    if ("weakShare" in v && "share" in v && "step" in v) added.weakShare++;
    for (const x of Object.values(v)) count(x);
  }
};

let bad = 0, n = 0;
for (const dir of ["latest", "2026-09-24"]) {
  for (const f of fs.readdirSync(path.join(DATA, dir)).filter((x) => x.endsWith(".json"))) {
    const rel = "site/data/county-profiles/" + dir + "/" + f;
    const old = JSON.parse(execFileSync("git", ["show", ref + ":" + rel], { cwd: ROOT, maxBuffer: 1 << 28 }).toString());
    const cur = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    n++;
    count(cur.topics);
    if (cur.estimation && cur.estimation.thresholds) added.thresholds++;
    const c2 = { ...cur };
    if (c2.estimation) { c2.estimation = { ...c2.estimation }; delete c2.estimation.thresholds; }
    // generated/retrieved/verified stamps are not figures
    const norm = (s) => { const x = JSON.parse(JSON.stringify(strip(s))); delete x.generated; for (const src of Object.values(x.sources || {})) { delete src.retrieved; delete src.verified; } return JSON.stringify(x); };
    if (norm(old) !== norm(c2)) { console.error("DIFFERENT beyond the provenance fields: " + rel); bad++; }
  }
}
console.log(n + " snapshot files compared with " + ref + ". Fields added: " + added.weakShare + " est.weakShare, " + added.reason + " withheld reasons, " + added.thresholds + " estimation.thresholds blocks (counted over both directories). " + (bad ? bad + " file(s) differ in something else." : "Nothing else differs: no figure, source, vintage or availability moved."));
process.exit(bad ? 1 : 0);
