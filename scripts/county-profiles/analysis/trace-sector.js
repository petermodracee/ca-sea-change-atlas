#!/usr/bin/env node
// Traces one county's marine sector in one year cell by cell: every NAICS code and ownership row (published or
// imputed, at which ladder step, with the raw QCEW row), the published parents, what the plausibility check did,
// and the history of the largest imputed row with its parent and California's value.
//
//   node scripts/county-profiles/analysis/trace-sector.js <fips> <year> "<Sector name>"
//   node scripts/county-profiles/analysis/trace-sector.js 06083 2021 "Marine Transportation"

const { load, f0 } = require("./economy-validation.js");
const imp = require("../pipeline/impute.js");
const { parentOf } = require("../pipeline/enow-def.js");
const OWN = { 1: "federal", 2: "state", 3: "local", 5: "private" };

(async () => {
  const [fips, yearArg, sector] = process.argv.slice(2);
  const Y = Number(yearArg);
  if (!fips || !Y || !sector) { console.error('usage: trace-sector.js <fips> <year> "<Sector name>"'); process.exit(2); }
  const L = await load();
  const est = L.ests[fips];
  const cells = est.cells[Y][sector];
  const raw = (o, code, y = Y, f = fips) => L.ctx.row(y, f, o, code);
  const show = (r) => (r ? (r[0] === "N" ? "withheld, " + r[1] + " estab" : r[1] + " estab, " + r[2] + " jobs, $" + f0(r[3])) : "no row");
  let total = 0, imputed = 0;
  console.log("## " + sector + ", " + fips + ", " + Y + "\n");
  console.log("| code | ownership | raw QCEW row | result | ladder step | jobs |\n|---|---|---|---|---|---|");
  let biggest = null;
  for (const c of cells) {
    for (const r of c.rows) {
      total += r.emp || 0;
      if (r.step) imputed += r.emp || 0;
      if (r.step && (!biggest || r.emp > biggest.r.emp)) biggest = { c, r };
      console.log("| " + c.code + " | " + OWN[r.own] + " | " + show(raw(r.own, c.code)) + " | " + (r.step === 0 ? "published" : r.step === null ? "unresolved" : "imputed" + (r.capped ? ", capped by the parent-sum check" : "")) + " | " + (r.step || "") + " | " + f0(r.emp || 0) + " |");
    }
  }
  console.log("\nSector total " + f0(total) + " jobs, of which imputed " + f0(imputed) + " (" + Math.round((imputed / total) * 100) + "%).\n");
  console.log("Plausibility events in " + Y + " for this county: " + (est.violations.filter((v) => v.year === Y).map((v) => "parent " + v.parent + " (" + OWN[v.own] + ", " + v.field + "): parent " + f0(v.parentValue) + ", published siblings " + f0(v.publishedSiblings) + ", estimated " + f0(v.estimated) + " capped to " + f0(v.cappedTo) + " for " + v.codes.join(", ")).join("; ") || "none") + ".\n");
  if (biggest) {
    const { c, r } = biggest, p = parentOf(c.code);
    console.log("Largest imputed row: " + c.code + " (" + OWN[r.own] + "), " + f0(r.emp) + " jobs at step " + r.step + ". Its history, parent " + p + " and California:\n");
    console.log("| year | " + c.code + " | parent " + p + " | California " + c.code + " |\n|---|---|---|---|");
    for (let y = L.ctx.first; y <= L.ctx.last; y++) console.log("| " + y + " | " + show(raw(r.own, c.code, y)) + " | " + show(raw(r.own, p, y)) + " | " + show(L.ctx.row(y, "06000", r.own, c.code)) + " |");
  }
})();
