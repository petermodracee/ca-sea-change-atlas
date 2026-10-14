#!/usr/bin/env node
// Imputed marine cells far above what their published parent implies (Santa Barbara marine transportation was
// the case that prompted this): for each imputed county-code-ownership-year row, compare the row's jobs per
// establishment with the same county-year-ownership parent's published jobs per establishment, and the
// row's jobs with the room the parent leaves after its published siblings. Prints the rows whose jobs per
// establishment are at least 2 times the parent's and whose jobs are at least 50.
//
//   node scripts/county-profiles/analysis/imputed-overshoot.js [year ...]   (default 2021 2025)

const { load, f0, f1, table } = require("./economy-validation.js");
const { parentOf } = require("../pipeline/enow-def.js");
const OWN = { 1: "federal", 2: "state", 3: "local", 5: "private" };

(async () => {
  const L = await load();
  const years = process.argv.slice(2).map(Number);
  if (!years.length) years.push(2021, 2025);
  const rows = [];
  let checked = 0;
  for (const c of L.marineCounties) {
    for (const Y of years) {
      for (const [sector, cells] of Object.entries(L.ests[c.fips].cells[Y])) {
        for (const cell of cells) {
          for (const r of cell.rows) {
            if (!r.step || r.emp === null) continue;
            checked++;
            const p = parentOf(cell.code);
            const par = p ? L.ctx.row(Y, c.fips, r.own, p) : null;
            if (!par || par[0] === "N" || !(par[1] > 0) || !(par[2] > 0) || !(r.e > 0)) continue;
            const perEst = r.emp / r.e, parentPerEst = par[2] / par[1];
            // room left under the parent after its published children
            let pub = 0;
            const a = L.q.years[Y][c.fips];
            for (const k of Object.keys(a)) { const [o, code] = k.split("|"); if (o === r.own && code !== p && parentOf(code) === p && a[k][0] !== "N") pub += a[k][2]; }
            if (perEst >= 2 * parentPerEst && r.emp >= 50) rows.push({ county: c.name, sector, year: Y, code: cell.code, own: OWN[r.own], step: r.step, e: r.e, emp: r.emp, perEst, parent: p, parentEmp: par[2], parentE: par[1], parentPerEst, room: Math.max(0, par[2] - pub), capped: !!r.capped });
          }
        }
      }
    }
  }
  rows.sort((a, b) => b.emp - a.emp);
  console.log("Imputed rows checked (" + years.join(", ") + "): " + checked + ". Rows imputed at 2 times or more the parent's jobs per establishment, with at least 50 jobs: " + rows.length + ".\n");
  console.log(table(["county", "sector", "year", "code", "ownership", "step", "estabs", "jobs imputed", "jobs per estab", "parent", "parent jobs / estabs", "parent per estab", "room under parent after published siblings"], rows.map((r) => [r.county, r.sector, r.year, r.code, r.own, r.step, r.e, f0(r.emp), r.perEst.toFixed(0), r.parent, f0(r.parentEmp) + " / " + r.parentE, r.parentPerEst.toFixed(0), f0(r.room)])));
})();
