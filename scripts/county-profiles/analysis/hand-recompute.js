#!/usr/bin/env node
// Recomputes cells of the imputation ladder by hand from the raw QCEW CSVs (not from the pipeline's compact
// JSON), so the arithmetic can be checked independently: one published cell and one filled at each of steps 1 to
// 4. Rows are picked from the per-county cell records the pipeline wrote (.cache/enow-cells-<fips>.json).
//
//   node scripts/county-profiles/analysis/hand-recompute.js

const fs = require("fs");
const path = require("path");
const CACHE = path.join(__dirname, "..", ".cache");
const { splitCsv } = require("../pipeline/qcew.js");
const OWN_NAME = { 1: "federal", 2: "state", 3: "local government", 5: "private" };

const files = {};
function raw(year, fips, own, code) {
  const key = year + fips;
  if (!files[key]) {
    const dir = path.join(CACHE, "qcew", String(year));
    const f = fs.readdirSync(dir).find((n) => n.includes("annual " + fips + " "));
    const lines = fs.readFileSync(path.join(dir, f), "latin1").split(/\r?\n/);
    const head = splitCsv(lines[0]);
    const col = (...n) => n.map((x) => head.indexOf(x)).find((i) => i >= 0);
    files[key] = { lines, file: f, iOwn: col("own_code"), iInd: col("industry_code"), iDisc: col("disclosure_code"), iE: col("annual_avg_estabs_count", "annual_avg_estabs"), iEmp: col("annual_avg_emplvl"), iW: col("total_annual_wages") };
  }
  const F = files[key];
  for (const l of F.lines) {
    if (!l.startsWith('"' + fips + '","' + own + '","' + code + '"')) continue;
    const c = splitCsv(l);
    return { disc: c[F.iDisc], e: Number(c[F.iE]), emp: Number(c[F.iEmp]), w: Number(c[F.iW]) };
  }
  return null;
}
const fmt = (r) => (r ? (r.disc === "N" ? "withheld (N), " + r.e + " establishments" : r.e + " establishments, " + r.emp + " jobs, $" + r.w.toLocaleString("en-US") + " wages") : "no row (no establishments)");

function cellsOf(fips) { return JSON.parse(fs.readFileSync(path.join(CACHE, "enow-cells-" + fips + ".json"), "utf8")); }
function pick(fips, year, step, ok = () => true) {
  const cells = cellsOf(fips);
  for (const list of Object.values(cells[year])) for (const c of list) for (const r of c.rows) if (r.step === step && r.emp > 15 && r.emp < 500 && ok(c, r)) return { code: c.code, own: r.own, year, fips, pipeline: r };
  return null;
}

const out = [];
const log = (s) => out.push(s);

// 0. a published cell
{
  const fips = "06001", year = 2025, code = "722511", own = "5";
  const r = raw(year, fips, own, code);
  log("**Published (Alameda 2025, NAICS 722511, private).** Raw row: " + fmt(r) + ". The pipeline uses it as it stands.");
}
// 1. step 1
{
  let hit = null;
  for (const fips of ["06001", "06073", "06087", "06037"]) { for (const y of [2019, 2018, 2020, 2017]) { hit = pick(fips, y, 1); if (hit) break; } if (hit) break; }
  if (hit) {
    const { fips, code, own, year } = hit;
    const known = (y) => { const r = raw(y, fips, own, code); return r && r.disc !== "N" ? r : null; };
    let p = year - 1; while (p >= 2012 && !known(p)) p--;
    let n = year + 1; while (n <= 2025 && !known(n)) n++;
    const a = known(p), b = known(n), t = (year - p) / (n - p);
    log("**Step 1, interpolation (county " + fips + " " + year + ", NAICS " + code + ", " + OWN_NAME[own] + ").** Raw " + year + ": " + fmt(raw(year, fips, own, code)) + ". Last published year " + p + ": " + fmt(a) + "; next published year " + n + ": " + fmt(b) + ". Weight t = (" + year + " - " + p + ") / (" + n + " - " + p + ") = " + t.toFixed(4) + ". Jobs = " + a.emp + " + t x (" + b.emp + " - " + a.emp + ") = " + (a.emp + t * (b.emp - a.emp)).toFixed(2) + "; pipeline: " + hit.pipeline.emp.toFixed(2) + ". Wages = " + (a.w + t * (b.w - a.w)).toFixed(0) + "; pipeline: " + hit.pipeline.w.toFixed(0) + ".");
  }
}
// 2. step 2
{
  const hit = pick("06001", 2025, 2);
  const { fips, code, own, year } = hit;
  const known = (y) => { const r = raw(y, fips, own, code); return r && r.disc !== "N" ? r : null; };
  let k = null;
  for (let d = 1; d <= 13 && !k; d++) { for (const y of [year - d, year + d]) if (y >= 2012 && y <= 2025 && known(y)) { k = y; break; } }
  const st = (y) => ["1", "2", "3", "5"].reduce((s, o) => { const r = raw(y, "06000", o, code); return r ? { emp: s.emp + r.emp, w: s.w + r.w, n: s.n + 1 } : s; }, { emp: 0, w: 0, n: 0 });
  const sY = st(year), sK = st(k), r0 = known(k);
  log("**Step 2, California-scaled (county " + fips + " " + year + ", NAICS " + code + ", " + OWN_NAME[own] + ").** Raw " + year + ": " + fmt(raw(year, fips, own, code)) + ". Nearest published year " + k + ": " + fmt(r0) + ". California, all ownerships, NAICS " + code + ": " + sY.emp.toLocaleString("en-US") + " jobs in " + year + ", " + sK.emp.toLocaleString("en-US") + " in " + k + " (ratio " + (sY.emp / sK.emp).toFixed(4) + "). Jobs = " + r0.emp + " x " + (sY.emp / sK.emp).toFixed(4) + " = " + (r0.emp * sY.emp / sK.emp).toFixed(2) + "; pipeline: " + hit.pipeline.emp.toFixed(2) + ".");
}
// 3. step 3
{
  const hit = pick("06001", 2025, 3);
  const { fips, code, own, year } = hit;
  const known = (y) => { const r = raw(y, fips, own, code); return r && r.disc !== "N" ? r : null; };
  let k = null;
  for (let d = 1; d <= 13 && !k; d++) { for (const y of [year - d, year + d]) if (y >= 2012 && y <= 2025 && known(y) && known(y).e > 0) { k = y; break; } }
  const r0 = known(k), e = raw(year, fips, own, code).e;
  log("**Step 3, establishment-scaled (county " + fips + " " + year + ", NAICS " + code + ", " + OWN_NAME[own] + ").** Raw " + year + ": " + fmt(raw(year, fips, own, code)) + ". Nearest published year " + k + ": " + fmt(r0) + ". California's value for the code, all ownerships: " + ["1", "2", "3", "5"].map((o) => [year, k].map((y) => { const r = raw(y, "06000", o, code); return r ? (r.disc === "N" ? "withheld" : r.emp) : "none"; }).join("/")).join(" ; ") + " (ownerships 1, 2, 3, 5; " + year + "/" + k + "): one is withheld, so step 2 cannot be used. Jobs = " + r0.emp + " x " + e + " / " + r0.e + " = " + (r0.emp * e / r0.e).toFixed(2) + "; pipeline: " + hit.pipeline.emp.toFixed(2) + ".");
}
// 4. step 4
{
  const hit = pick("06087", 2025, 4);
  const { fips, code, own, year } = hit;
  const parent = code.slice(0, -1);
  const p = raw(year, fips, own, parent), r = raw(year, fips, own, code);
  const emp = (p.emp / p.e) * r.e;
  log("**Step 4, parent average (county " + fips + " " + year + ", NAICS " + code + ", " + OWN_NAME[own] + ").** Raw " + year + ": " + fmt(r) + ". No published history to interpolate or scale from. Parent NAICS " + parent + ", same county, year and ownership: " + fmt(p) + ", so " + p.emp + " / " + p.e + " = " + (p.emp / p.e).toFixed(3) + " jobs per establishment. Jobs = " + (p.emp / p.e).toFixed(3) + " x " + r.e + " = " + emp.toFixed(2) + "; pipeline: " + hit.pipeline.emp.toFixed(2) + ". Wages = " + p.w + " / " + p.emp + " x " + emp.toFixed(2) + " = " + ((p.w / p.emp) * emp).toFixed(0) + "; pipeline: " + hit.pipeline.w.toFixed(0) + ".");
}
// 5. step 5
{
  const hit = pick("06001", 2025, 5, (c) => c.code === "311710") || pick("06001", 2025, 5);
  const { fips, code, own, year } = hit;
  const r = raw(year, fips, own, code);
  const known = [];
  for (let y = 2012; y <= 2025; y++) { const x = raw(y, fips, own, code); if (x && x.disc !== "N") known.push(y); }
  const p1 = code.slice(0, -1), p2 = code.slice(0, -2);
  const parentRaw = (y, pcode) => {
    const x = raw(y, fips, own, pcode);
    if (x && x.disc !== "N" && x.e > 0 && x.emp > 0) return { ...x, basis: OWN_NAME[own] + " row" };
    let e = 0, emp = 0, w = 0, any = false;
    for (const o of ["1", "2", "3", "5"]) { const z = raw(y, fips, o, pcode); if (!z) continue; if (z.disc === "N") return null; any = true; e += z.e; emp += z.emp; w += z.w; }
    return any && e > 0 && emp > 0 ? { e, emp, w, basis: "summed over ownerships" } : null;
  };
  const steps = [];
  steps.push("published years of this row: " + (known.length ? known.join(", ") : "none") + (known.length ? "" : ", so steps 1 to 3 have nothing to interpolate or scale from"));
  const same = parentRaw(year, p1);
  steps.push("step 4, parent " + p1 + " in " + year + ": " + (same ? fmt(same) : "withheld or no usable row") + (same ? "" : ", so step 4 fails"));
  let found = null;
  const order = [];
  for (let y = year - 1; y >= 2012; y--) order.push(y);
  for (let y = year + 1; y <= 2025; y++) order.push(y);
  for (let p = p2; p && p.length >= 2 && !found; p = p.length === 3 ? null : p.slice(0, -1)) {
    for (const y of order) { const x = parentRaw(y, p); if (x) { found = { y, p, x }; break; } }
  }
  const { y: fy, p: fp, x } = found;
  const emp = (x.emp / x.e) * r.e;
  log("**Step 5, broader parent in another year (county " + fips + " " + year + ", NAICS " + code + ", " + OWN_NAME[own] + ").** Raw " + year + ": " + fmt(r) + ". " + steps.join("; ") + ". Step 5 tries the parent two digits shorter (" + p2 + ") in the nearest earlier year first: " + fp + " in " + fy + " (" + x.basis + "): " + fmt(x) + ", so " + x.emp + " / " + x.e + " = " + (x.emp / x.e).toFixed(3) + " jobs per establishment. Jobs = " + (x.emp / x.e).toFixed(3) + " x " + r.e + " = " + emp.toFixed(2) + "; pipeline: " + hit.pipeline.emp.toFixed(2) + ". Wages = " + x.w + " / " + x.emp + " x " + emp.toFixed(2) + " = " + ((x.w / x.emp) * emp).toFixed(0) + "; pipeline: " + hit.pipeline.w.toFixed(0) + ".");
}
console.log(out.join("\n\n"));
