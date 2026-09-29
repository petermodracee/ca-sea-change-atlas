// Marine and total economy figures from public QCEW (Phase 7): sector sums over the estimated cells,
// the shoreline weighting of tourism and recreation (calibrated per county), sector GDP, and per-figure
// provenance.
//
// A figure that has any imputed component is written {value, est: {share, step}}: `share` is the fraction of
// the figure's value that came from imputed rows (0 to 1) and `step` is the weakest (highest-numbered)
// ladder step used. A figure with at least WITHHOLD_WEAK_SHARE of its value imputed at steps 4 and 5 is withheld
// ({suppressed: true}, see estimated.js), and a total it feeds is {value, partial: true}, a floor. A
// published figure is a plain number.

const { MARINE_CODES, codesFor, BEA_LINES, TOTAL_SECTORS_QCEW } = require("./enow-def");
const { OWNS, buildCell, estimateRow, estimateCounty } = require("./impute");
const { withheldCell } = require("../estimated");

const r4 = (x) => Math.round(x * 10000) / 10000; // share precision: 0.01%
const MARINE_SECTOR_ORDER = ["Living Resources", "Marine Construction", "Marine Transportation", "Offshore Mineral Resources", "Ship and Boat Building", "Tourism and Recreation"];

// --- GDP ratios ---------------------------------------------------------------------------------------
// California's ratio of BEA GDP (SAGDP2, current dollars) to QCEW wages for the same industry and year, with
// all ownerships' wages in the denominator. That is what Open ENOW's text describes and it is what NOAA's own
// Total Economy series does: its Education and health services ratio is 0.99 in every county, BEA's private
// 61+62 GDP over all-ownership 61+62 wages is 0.98, while a private-wage base gives 1.55 (docs/DECISIONS.md).

function stateWages(ctx, code, Y) {
  let w = 0;
  for (const own of OWNS) {
    const r = ctx.row(Y, ctx.state, own, code);
    if (!r) continue;
    if (r[0] !== "N") { w += r[3]; continue; }
    const est = estimateRow(ctx, ctx.state, own, code, Y);
    if (!est) return null;
    w += est.w;
  }
  return w;
}

function makeGdp(ctx, gdp) {
  const cache = new Map();
  const cls = (classification, Y) => {
    const g = gdp.value.lines[classification] ? gdp.value.lines[classification][Y] : null;
    return g === null || g === undefined ? null : g * 1e6;
  };
  const line = (key, Y) => (BEA_LINES[key] ? cls(BEA_LINES[key].classification, Y) : null);
  // Marine: a BEA line key from enow-def's BEA_LINES; `own` is accepted for the row-level call and ignored.
  const ratio = (key, own, Y) => {
    const k = key + "|" + Y;
    if (cache.has(k)) return cache.get(k);
    let out = null;
    if (BEA_LINES[key]) {
      const g = line(key, Y);
      let w = 0, ok = true;
      for (const c of BEA_LINES[key].codes) { const x = stateWages(ctx, c, Y); if (x === null) { ok = false; break; } w += x; }
      out = g && ok && w > 0 ? g / w : null;
    }
    cache.set(k, out);
    return out;
  };
  // Total economy: a supersector's BEA lines over its California wages.
  const superLines = (label) => TOTAL_SECTORS_QCEW[label].bea;
  const superRatio = (label, Y) => {
    const def = TOTAL_SECTORS_QCEW[label];
    if (!def.bea) return null;
    const k = "S" + label + "|" + Y;
    if (cache.has(k)) return cache.get(k);
    let g = 0, ok = true;
    for (const l of def.bea) { const x = cls(l, Y); if (x === null) { ok = false; break; } g += x; }
    const w = stateWages(ctx, def.code, Y);
    const out = ok && w > 0 ? g / w : null;
    cache.set(k, out);
    return out;
  };
  // The newest year <= max for which every line in `keys` has a GDP value.
  const yearFor = (keys, max) => {
    for (let y = max; y >= ctx.first; y--) if (keys.every((k) => line(k, y) !== null)) return y;
    return null;
  };
  const yearForSuper = (labels, max) => {
    for (let y = max; y >= ctx.first; y--) if (labels.every((l) => superLines(l).every((c) => cls(c, y) !== null))) return y;
    return null;
  };
  return { ratio, superRatio, yearFor, yearForSuper };
}

// --- sector aggregation -------------------------------------------------------------------------------

// One sector in one year from its cells. `weightOf(cell)` gives {est, emp}: the shoreline weights (1, 1
// for a code counted in full). Returns sums and provenance; `gdpFn(code, own)` is the GDP-to-wages ratio for a
// row (marine only).
function sumSector(cells, weightOf, gdpFn, beaOf) {
  const s = { estabs: 0, emp: 0, wages: 0, empImp: 0, wagesImp: 0, empWeak: 0, wagesWeak: 0, step: 0, unresolved: 0, cells: cells.length, gdp: gdpFn ? 0 : null, gdpMissing: false };
  for (const c of cells) {
    const w = weightOf(c);
    s.estabs += c.e * w.est;
    s.emp += c.emp * w.emp; s.wages += c.w * w.emp;
    s.empImp += c.empImp * w.emp; s.wagesImp += c.wImp * w.emp;
    s.empWeak += c.empWeak * w.emp; s.wagesWeak += c.wWeak * w.emp;
    s.step = Math.max(s.step, c.step);
    s.unresolved += c.unresolved;
    if (gdpFn) {
      for (const row of c.rows) {
        if (!row.w) continue;
        const r = gdpFn(beaOf(c.code), row.own);
        if (r === null) { s.gdpMissing = true; continue; }
        s.gdp += row.w * w.emp * r;
      }
    }
  }
  return s;
}

// A figure from a value and its provenance. Withholding (estimated.js) is decided by the callers, which know
// the part imputed at the weak steps.
// `weakShare` is the part of the value imputed at ladder steps 4 and 5, recorded in `est` so the withholding rule can
// be reproduced from the snapshot alone.
function fig(value, share, step, { unresolved = 0, allMissing = false, weakShare = 0 } = {}) {
  if (allMissing) return withheldCell("no-data");
  const v = Math.round(value);
  const o = { value: v };
  // A share under 0.005% rounds to nothing and is not recorded as an estimate.
  if (share >= 0.00005 && step > 0) o.est = { share: Math.max(0.0001, r4(Math.min(1, share))), step, weakShare: r4(Math.min(1, weakShare)) };
  if (unresolved > 0) o.partial = true;
  return Object.keys(o).length === 1 ? v : o;
}

// --- marine economy -----------------------------------------------------------------------------------

// Every marine sector for one county-year, as sums with provenance. `shares` is {counties: {fips: {codes}}}.
function marineSectors(ctx, est, fips, Y, shares, gdpApi, { shoreAll = false, exclude = null } = {}) {
  const cellsBy = est.cells[Y];
  const cnty = shares && shares.counties[fips];
  const out = {};
  for (const sector of MARINE_SECTOR_ORDER) {
    const defs = codesFor(sector, Y);
    const cells = exclude ? cellsBy[sector].filter((c) => !exclude.includes(c.code)) : cellsBy[sector];
    const weightOf = (cell) => {
      const def = defs.find((d) => d.code === cell.code);
      if (!(def.shore || shoreAll) || !cnty) return { est: 1, emp: 1 };
      const sh = cnty.codes[cell.code];
      return { est: sh ? sh.est : 0, emp: sh ? sh.emp : 0 };
    };
    const beaOf = (code) => defs.find((d) => d.code === code).bea;
    out[sector] = sumSector(cells, weightOf, gdpApi ? (k, own) => gdpApi.ratio(k, own, gdpApi.year) : null, beaOf);
  }
  return out;
}

// --- per-county calibration of the tourism and recreation shoreline share --------------------------------
// The ZIP-derived share (zbp.js) fits California in total but not each county. Each county's share is instead
// calibrated so that its 2021 tourism and recreation jobs equal the original ENOW's 2021 county figure, and
// that county share is then held for every year. Establishments are calibrated the same way against the
// original's establishment count. Where the original's figure is withheld or zero, or no share in [0, 1] can
// reach it, the ZIP rule's share is kept. `orig` is {employment, establishments} (numbers, or null).
function calibrateTourism(est, fips, base, orig, year = 2021) {
  const defs = codesFor("Tourism and Recreation", year);
  const cells = est.cells[year]["Tourism and Recreation"];
  const shoreCodes = defs.filter((d) => d.shore).map((d) => d.code);
  let fixedEmp = 0, fixedEst = 0, shoreEmp = 0, shoreEst = 0;
  for (const c of cells) {
    if (shoreCodes.includes(c.code)) { shoreEmp += c.emp; shoreEst += c.e; } else { fixedEmp += c.emp; fixedEst += c.e; }
  }
  const zbp = base && base.counties[fips];
  const fallback = (code) => (zbp && zbp.codes[code] ? { emp: zbp.codes[code].emp, est: zbp.codes[code].est } : { emp: 0, est: 0 });
  const solve = (target, fixed, shore) => {
    if (!(target > 0) || !(shore > 0)) return null;
    const raw = (target - fixed) / shore;
    return { raw, share: Math.min(1, Math.max(0, raw)) };
  };
  const emp = solve(orig && orig.employment, fixedEmp, shoreEmp), estab = solve(orig && orig.establishments, fixedEst, shoreEst);
  const codes = {};
  for (const d of Object.values(MARINE_CODES).flat().filter((x) => x.shore)) {
    const f = fallback(d.code);
    codes[d.code] = { emp: emp ? emp.share : f.emp, est: estab ? estab.share : f.est };
  }
  const pooled = zbp && zbp.pooled;
  const method = (x) => (x ? (x.raw < 0 || x.raw > 1 ? "calibrated-clamped" : "calibrated") : "zip-rule");
  return {
    shares: { counties: { [fips]: { codes } } },
    calibration: {
      jobs: { method: method(emp), share: r4(emp ? emp.share : pooled ? pooled.emp : 0), target2021: orig && orig.employment > 0 ? Math.round(orig.employment) : null },
      establishments: { method: method(estab), share: r4(estab ? estab.share : pooled ? pooled.est : 0), target2021: orig && orig.establishments > 0 ? Math.round(orig.establishments) : null },
      zipRuleJobsShare: pooled ? r4(pooled.emp) : null,
    },
  };
}

// --- total economy ------------------------------------------------------------------------------------

// The eleven sectors are QCEW supersectors; each is one cell. GDP is the sector's wages (all ownerships) times
// California's ratio of the BEA line(s) to that supersector's wages; Public administration has none (null).
function totalSectors(ctx, fips, Y, gdpApi) {
  const out = {};
  for (const [label, def] of Object.entries(TOTAL_SECTORS_QCEW)) {
    const cell = buildCell(ctx, fips, def.code, Y);
    const s = sumSector([cell], () => ({ est: 1, emp: 1 }), null, null);
    if (gdpApi) {
      const r = gdpApi.superRatio(label, gdpApi.year);
      s.gdp = r === null ? null : s.wages * r;
    }
    out[label] = s;
  }
  return out;
}

// The county's all-industry total (QCEW ownership 0, industry 10): always published.
function countyTotal(ctx, fips, Y) {
  const r = ctx.row(Y, fips, "0", "10");
  return r ? { estabs: r[1], emp: r[2], wages: r[3] } : null;
}

module.exports = { MARINE_SECTOR_ORDER, makeGdp, marineSectors, calibrateTourism, totalSectors, countyTotal, sumSector, fig, estimateCounty, r4 };
