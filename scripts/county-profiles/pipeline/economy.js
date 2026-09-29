// Marine and total economy figures from public QCEW (Phase 7): sector sums over the estimated cells,
// the shoreline weighting of tourism and recreation, sector GDP, and per-figure provenance.
//
// A figure that has any imputed component is written {value, est: {share, step}}: `share` is the fraction of
// the figure's value that came from imputed rows (0 to 1) and `step` is the weakest (highest-numbered)
// ladder step used. A figure with a component nothing could estimate is {value, partial: true} (the sum is
// a floor); one with nothing at all is {suppressed: true}. A published figure is a plain number.

const { MARINE_CODES, codesFor, BEA_LINES, GOVERNMENT_LINE, TOTAL_SECTOR_CODES } = require("./enow-def");
const { OWNS, buildCell, estimateRow, estimateCounty } = require("./impute");

const r4 = (x) => Math.round(x * 10000) / 10000; // share precision: 0.01%
const MARINE_SECTOR_ORDER = ["Living Resources", "Marine Construction", "Marine Transportation", "Offshore Mineral Resources", "Ship and Boat Building", "Tourism and Recreation"];

// --- GDP ratios ---------------------------------------------------------------------------------------
// California's ratio of BEA GDP (SAGDP2, current dollars) to QCEW wages for the same industry and year.
// BEA's private lines exclude government, so a private line's wage base is private (ownership 5) wages and
// government-owned rows use the government ratio (BEA "Government" GDP over all-industry government wages).
// `mode: "all"` uses total (all-ownership) wages for every row instead, which is what Open ENOW's text
// describes and fits its California GDP better; the marine sectors use it, the total economy the split
// (its sector 92 has no BEA line to divide by).

function stateWages(ctx, code, owns, Y) {
  let w = 0;
  for (const own of owns) {
    const r = ctx.row(Y, ctx.state, own, code);
    if (!r) continue;
    if (r[0] !== "N") { w += r[3]; continue; }
    const est = estimateRow(ctx, ctx.state, own, code, Y);
    if (!est) return null;
    w += est.w;
  }
  return w;
}

function makeGdp(ctx, gdp, mode = "ownership") {
  const cache = new Map();
  const line = (key, Y) => {
    const def = BEA_LINES[key];
    const g = def && gdp.value.lines[def.classification] ? gdp.value.lines[def.classification][Y] : null;
    return g === null || g === undefined ? null : g * 1e6;
  };
  const ratio = (key, own, Y) => {
    if (!BEA_LINES[key] && !(mode === "ownership" && own !== "5")) return null;
    const gov = own !== "5";
    const k = key + "|" + (mode === "all" ? "a" : gov ? "g" : "p") + "|" + Y;
    if (cache.has(k)) return cache.get(k);
    let out = null;
    if (mode === "ownership" && gov) {
      const g = gdp.value.lines[GOVERNMENT_LINE.classification] && gdp.value.lines[GOVERNMENT_LINE.classification][Y];
      const w = stateWages(ctx, "10", ["1", "2", "3"], Y);
      out = g && w ? (g * 1e6) / w : null;
    } else {
      const g = line(key, Y);
      const codes = BEA_LINES[key].codes;
      let w = 0, ok = true;
      for (const c of codes) { const x = stateWages(ctx, c, mode === "all" ? OWNS : ["5"], Y); if (x === null) { ok = false; break; } w += x; }
      out = g && ok && w > 0 ? g / w : null;
    }
    cache.set(k, out);
    return out;
  };
  // The newest year <= max for which every line in `keys` has a GDP value.
  const yearFor = (keys, max) => {
    for (let y = max; y >= ctx.first; y--) if (keys.every((k) => line(k, y) !== null)) return y;
    return null;
  };
  return { ratio, yearFor };
}

// --- sector aggregation -------------------------------------------------------------------------------

// One sector in one year from its cells. `weightOf(cell)` gives {est, emp}: the shoreline weights (1, 1
// for a code counted in full). Returns sums and provenance; `rows` carry the GDP split by ownership.
function sumSector(cells, weightOf, gdpFn, beaOf) {
  const s = { estabs: 0, emp: 0, wages: 0, empImp: 0, wagesImp: 0, step: 0, unresolved: 0, cells: cells.length, gdp: gdpFn ? 0 : null, gdpMissing: false };
  for (const c of cells) {
    const w = weightOf(c);
    s.estabs += c.e * w.est;
    s.emp += c.emp * w.emp; s.wages += c.w * w.emp;
    s.empImp += c.empImp * w.emp; s.wagesImp += c.wImp * w.emp;
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

function fig(value, share, step, { unresolved = 0, allMissing = false } = {}) {
  if (allMissing) return { suppressed: true };
  const v = Math.round(value);
  const o = { value: v };
  // A share under 0.005% rounds to nothing and is not recorded as an estimate.
  if (share >= 0.00005 && step > 0) o.est = { share: Math.max(0.0001, r4(Math.min(1, share))), step };
  if (unresolved > 0) o.partial = true;
  return Object.keys(o).length === 1 ? v : o;
}

// --- marine economy -----------------------------------------------------------------------------------

// Every marine sector for one county-year, as sums with provenance.
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
    const s = sumSector(cells, weightOf, gdpApi ? (k, own) => gdpApi.ratio(k, own, gdpApi.year) : null, beaOf);
    out[sector] = s;
  }
  return out;
}

// --- total economy ------------------------------------------------------------------------------------

function totalSectors(ctx, fips, Y, gdpApi) {
  const out = {};
  for (const [label, codes] of Object.entries(TOTAL_SECTOR_CODES)) {
    const cells = codes.map((code) => buildCell(ctx, fips, code, Y));
    out[label] = sumSector(cells, () => ({ est: 1, emp: 1 }), gdpApi ? (k, own) => gdpApi.ratio(k, own, gdpApi.year) : null, (code) => code);
  }
  return out;
}

// The county's all-industry total (QCEW ownership 0, industry 10): always published.
function countyTotal(ctx, fips, Y) {
  const r = ctx.row(Y, fips, "0", "10");
  return r ? { estabs: r[1], emp: r[2], wages: r[3] } : null;
}

module.exports = { MARINE_SECTOR_ORDER, makeGdp, marineSectors, totalSectors, countyTotal, sumSector, fig, estimateCounty, r4 };
