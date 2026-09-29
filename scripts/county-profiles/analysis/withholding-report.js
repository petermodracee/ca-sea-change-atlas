#!/usr/bin/env node
// What the withholding rule (estimated.js: weakest ladder step 4 or 5 and at least 75% imputed) does to the
// economy figures: builds every county's marine and total economy twice, with the rule off and on, and prints
// how many figures carry an estimate, how many the rule withholds, and by county and sector.
//
//   node scripts/county-profiles/analysis/withholding-report.js
//
// Public administration's GDP is withheld in every county for a different reason (no defensible BEA ratio) and
// is counted separately.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const P = path.join(ROOT, "scripts/county-profiles/");

function child(mode, outFile) {
  const est = require(P + "estimated.js");
  if (mode === "off") est.isWithheldByRule = () => false; // patched before economy.js destructures it
  const spine = require(path.join(ROOT, "site/_data/countySpine.json"));
  const schema = require(path.join(ROOT, "site/data/countyProfileSchema.json"));
  const S = require(P + "pipeline/sources.js");
  const { loadEconomyInputs, economyFor } = require(P + "pipeline/economy-run.js");
  (async () => {
    const inputs = await loadEconomyInputs(spine.counties.map((c) => c.fips), spine, {});
    const out = {};
    for (const c of spine.counties) {
      const tt = schema.tiers[c.tier].topics;
      if (!tt["marine-economy"].available) continue;
      const econ = await S.fetchEconomy(c.fips, {});
      const eco = economyFor(inputs, c, tt, { year: econ.value.totalYear, state: econ.value.coastalState, nation: econ.value.coastalNation }, econ);
      const figs = [];
      const walk = (v, p) => {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          if ("value" in v && v.est) figs.push({ p, sup: false, share: v.est.share, step: v.est.step });
          else if (v.suppressed === true) figs.push({ p, sup: true });
          else for (const [k, x] of Object.entries(v)) walk(x, p + "/" + k);
        } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + "[" + (x && x.label ? x.label : i) + "]"));
      };
      for (const [topic, e] of [["marine", eco.marine], ["total", eco.total]]) if (e) for (const sec of ["measuring", "diversity", "wages"]) walk(e[sec], topic + "|" + sec);
      out[c.name] = figs;
    }
    fs.writeFileSync(outFile, JSON.stringify(out));
  })();
}

if (process.argv[2] === "--child") { child(process.argv[3], process.argv[4]); return; }

const tmp = (m) => path.join(require("os").tmpdir(), "cp-withhold-" + m + ".json");
for (const m of ["off", "on"]) {
  const r = spawnSync(process.execPath, [__filename, "--child", m, tmp(m)], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
}
const off = JSON.parse(fs.readFileSync(tmp("off"), "utf8")), on = JSON.parse(fs.readFileSync(tmp("on"), "utf8"));
const isPA = (p) => /Public administration/.test(p) && /gdp|\/gdp/.test(p);
let withEst = 0, byRule = 0, pa = 0, marksOff = 0, marksOn = 0;
const byCounty = {}, bySector = {};
for (const c of Object.keys(off)) {
  const a = off[c], b = on[c];
  withEst += a.filter((x) => !x.sup).length;
  marksOff += a.filter((x) => !x.sup && x.share >= 0.25).length;
  marksOn += b.filter((x) => !x.sup && x.share >= 0.25).length;
  const offSup = new Set(a.filter((x) => x.sup).map((x) => x.p));
  for (const x of b.filter((y) => y.sup && !offSup.has(y.p))) {
    byRule++;
    byCounty[c] = (byCounty[c] || 0) + 1;
    const m = x.p.match(/\[(.*?)\]/);
    const k = x.p.split("|")[0] + " " + (m ? m[1] : "total");
    bySector[k] = (bySector[k] || 0) + 1;
  }
  pa += b.filter((x) => x.sup && offSup.has(x.p)).length;
}
const rows = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n);
console.log("Figures with estimate provenance with the rule off: " + withEst + ". Withheld by the rule: " + byRule + " (" + Math.round((byRule / withEst) * 100) + "%). Withheld regardless (Public administration GDP, no ratio): " + pa + ". Marked estimated (share >= 0.25): " + marksOff + " without the rule, " + marksOn + " with it.\n");
console.log("By county (all " + Object.keys(byCounty).length + " counties with any):\n\n| county | figures withheld by the rule |\n|---|---|\n" + rows(byCounty, 99).map(([k, v]) => "| " + k + " | " + v + " |").join("\n"));
console.log("\nBy sector:\n\n| sector | figures withheld by the rule |\n|---|---|\n" + rows(bySector, 99).map(([k, v]) => "| " + k + " | " + v + " |").join("\n"));
