// Imputation of withheld QCEW cells, following Open ENOW's ladder (NOAA, "Introducing the Open ENOW
// Dataset", 2026, "How does Open ENOW impute missing values?").
//
// The unit is one QCEW row: (county, ownership, NAICS code, year). QCEW publishes NAICS rows by ownership
// (federal, state, local, private), and suppresses them one at a time, so a county-industry-year cell is the
// sum of its ownership rows and only the withheld rows are estimated (a published private row is kept even
// when the local-government row beside it is withheld). A withheld row still carries its establishment
// count; a code with no row in a county-year has no establishments, a published zero.
//
// Ladder, in order of preference (`step` in the output):
//   1  interpolate between the last and next known value of the same county, ownership and code
//   2  extrapolate from the nearest known year, scaled by the change in California's value for the code
//   3  extrapolate from the nearest known year, scaled by the change in the county's establishment count
//   4  average employment per establishment (and wages per job) of the parent code (one digit shorter) in
//      the same county-year, times this code's establishments
//   5  the same for the parent two digits shorter, in the nearest earlier year where it is published
// A row nothing can estimate stays withheld. Steps 4 and 5 are the ladder's 5-digit and 4-digit levels
// generalised to codes of any length (Open ENOW uses 4- and 5-digit codes itself): a code's "parent" is the
// code with its last digit dropped, and a 3-digit code's is its 2-digit NAICS sector.
//
// Two additions, both recorded in docs/DECISIONS.md: ownership is handled per row (above), and a parent
// that is itself withheld for the row's ownership falls back to the parent summed over all ownerships when
// every one of those rows is published.

const { codesFor, MARINE_CODES, parentOf: naicsParent, NAICS_SECTORS, SUPERSECTOR_CODES } = require("./enow-def");
// A 2-digit sector's parent is the all-industry total (industry 10).
const parentOf = (code) => naicsParent(code) || (NAICS_SECTORS.includes(code) || SUPERSECTOR_CODES.includes(code) ? "10" : null);

const OWNS = ["1", "2", "3", "5"];
// Steps 4 and 5 (the parent averages) are the weak steps: the withholding rule looks at the part of a figure
// imputed by them (estimated.js).
const WEAK_STEP = 4;
const STEP_NAMES = { 0: "published", 1: "interpolated", 2: "state-scaled", 3: "establishment-scaled", 4: "parent average, same year", 5: "parent average, earlier year" };

// Wraps the compact QCEW data. `validYears(code)` limits a marine code to the years it is in force.
function makeContext(qcew, { validYears, hidden } = {}) {
  const { years, first, last, state } = qcew;
  const validity = {};
  for (const list of Object.values(MARINE_CODES)) for (const c of list) { const v = validity[c.code] || [Infinity, -Infinity]; validity[c.code] = [Math.min(v[0], c.from), Math.max(v[1], c.to)]; }
  // 211111 and 211120 are both "Crude Petroleum" in different vintages: a code's own window is its validity;
  // a single code that appears twice takes the union, which the table never needs.
  const valid = validYears || ((code) => validity[code] || [-Infinity, Infinity]);
  const row = (y, fips, own, code) => { const a = years[y] && years[y][fips]; return a ? a[own + "|" + code] : undefined; };
  return { years, first, last, state, valid, hidden: hidden || (() => false), row };
}

// The published value of a row in year y: {e, emp, w}, or null if withheld, hidden, or the code is not in force.
function knownAt(ctx, fips, own, code, y) {
  if (y < ctx.first || y > ctx.last) return null;
  const [a, b] = ctx.valid(code);
  if (y < a || y > b) return null;
  if (ctx.hidden(fips, own, code, y)) return null;
  const r = ctx.row(y, fips, own, code);
  if (!r) return { e: 0, emp: 0, w: 0 };
  if (r[0] === "N") return null;
  return { e: r[1], emp: r[2], w: r[3] };
}

// California's value for the code across ownerships in year y, or null if any ownership row is withheld.
function stateAt(ctx, code, y) {
  let emp = 0, w = 0, any = false;
  for (const own of OWNS) {
    const r = ctx.row(y, ctx.state, own, code);
    if (!r) continue;
    if (r[0] === "N") return null;
    any = true; emp += r[2]; w += r[3];
  }
  return any ? { emp, w } : null;
}

// A parent's published value in year y for an ownership, else summed over ownerships if all are published.
function parentAt(ctx, fips, own, pcode, y) {
  const r = ctx.hidden(fips, own, pcode, y) ? undefined : ctx.row(y, fips, own, pcode);
  if (r && r[0] !== "N" && r[1] > 0 && r[2] > 0) return { e: r[1], emp: r[2], w: r[3] };
  let e = 0, emp = 0, w = 0, any = false;
  for (const o of OWNS) {
    const x = ctx.hidden(fips, o, pcode, y) ? null : ctx.row(y, fips, o, pcode);
    if (ctx.hidden(fips, o, pcode, y)) return null;
    if (!x) continue;
    if (x[0] === "N") return null;
    any = true; e += x[1]; emp += x[2]; w += x[3];
  }
  return any && e > 0 && emp > 0 ? { e, emp, w } : null;
}

// Estimate one withheld row. `only` restricts the ladder to one step (the backtest measures each step on its
// own). Returns {emp, w, step} or null.
function estimateRow(ctx, fips, own, code, Y, only) {
  const target = ctx.row(Y, fips, own, code);
  const e = target ? target[1] : 0;
  const want = (n) => only === undefined || only === n;
  const yearsRange = [];
  for (let y = ctx.first; y <= ctx.last; y++) if (y !== Y) yearsRange.push(y);
  const known = yearsRange.map((y) => ({ y, v: knownAt(ctx, fips, own, code, y) })).filter((k) => k.v);

  // 1 interpolate
  if (want(1)) {
    const prev = known.filter((k) => k.y < Y).pop(), next = known.find((k) => k.y > Y);
    if (prev && next) {
      const t = (Y - prev.y) / (next.y - prev.y);
      return { emp: prev.v.emp + t * (next.v.emp - prev.v.emp), w: prev.v.w + t * (next.v.w - prev.v.w), step: 1 };
    }
  }
  // nearest known year (ties go to the earlier one)
  const nearest = known.slice().sort((a, b) => Math.abs(a.y - Y) - Math.abs(b.y - Y) || a.y - b.y)[0];
  // 2 state-scaled
  if (want(2) && nearest) {
    const sY = stateAt(ctx, code, Y), sK = stateAt(ctx, code, nearest.y);
    if (sY && sK && sK.emp > 0 && sK.w > 0) return { emp: nearest.v.emp * (sY.emp / sK.emp), w: nearest.v.w * (sY.w / sK.w), step: 2 };
  }
  // 3 establishment-scaled
  if (want(3) && nearest && nearest.v.e > 0) {
    const f = e / nearest.v.e;
    return { emp: nearest.v.emp * f, w: nearest.v.w * f, step: 3 };
  }
  // 4 parent average, same year
  const p1 = parentOf(code);
  if (want(4) && p1) {
    const p = parentAt(ctx, fips, own, p1, Y);
    if (p && e > 0) { const emp = (p.emp / p.e) * e; return { emp, w: (p.w / p.emp) * emp, step: 4 }; }
  }
  // 5 grandparent average, nearest earlier year where it is published. Widened beyond Open ENOW's text
  // (docs/DECISIONS.md): if that finds nothing, later years are tried, then the next parent up, stopping
  // before the all-industry total. Everything found here is step 5, the weakest.
  if (want(5) && e > 0) {
    const order = [];
    for (let y = Y - 1; y >= ctx.first; y--) order.push(y);
    for (let y = Y + 1; y <= ctx.last; y++) order.push(y);
    for (let p = p1 && parentOf(p1); p && p !== "10"; p = parentOf(p)) {
      for (const y of order) {
        const par = parentAt(ctx, fips, own, p, y);
        if (par) { const emp = (par.emp / par.e) * e; return { emp, w: (par.w / par.emp) * emp, step: 5 }; }
      }
    }
  }
  return null;
}

// One county-industry-year cell, from its ownership rows. Returns
//   {e, emp, w, empImp, wImp, step, rows: [...], unresolved: n}
// `emp`/`w` sum the rows that are published or estimated; `unresolved` counts withheld rows nothing could
// estimate (the cell is then partial).
function buildCell(ctx, fips, code, Y) {
  const cell = { code, year: Y, e: 0, emp: 0, w: 0, empImp: 0, wImp: 0, empWeak: 0, wWeak: 0, step: 0, unresolved: 0, rows: [] };
  for (const own of OWNS) {
    const r = ctx.row(Y, fips, own, code);
    if (!r) continue;
    cell.e += r[1];
    if (r[0] !== "N") { cell.emp += r[2]; cell.w += r[3]; cell.rows.push({ own, step: 0, e: r[1], emp: r[2], w: r[3] }); continue; }
    const est = estimateRow(ctx, fips, own, code, Y);
    if (!est) { cell.unresolved++; cell.rows.push({ own, step: null, e: r[1], emp: null, w: null }); continue; }
    cell.emp += est.emp; cell.w += est.w; cell.empImp += est.emp; cell.wImp += est.w;
    if (est.step >= WEAK_STEP) { cell.empWeak += est.emp; cell.wWeak += est.w; }
    cell.step = Math.max(cell.step, est.step);
    cell.rows.push({ own, step: est.step, e: r[1], emp: est.emp, w: est.w });
  }
  return cell;
}

// Plausibility: the children of a published parent must not sum above it. For every estimated row, the
// published parent (same county, ownership, year) bounds the estimated rows under it: published siblings plus
// estimated rows may not exceed the parent's employment or wages. Estimated rows are scaled down together to
// fit; the change is logged. `cells` are one county-year's cells; children not among them count as published
// siblings straight from the data. Returns the violations.
function capToParents(ctx, fips, Y, cells, log) {
  const byParent = new Map();
  for (const cell of cells) for (const row of cell.rows) {
    if (!row.step) continue;
    const p = parentOf(cell.code);
    if (!p) continue;
    const key = row.own + "|" + p;
    (byParent.get(key) || byParent.set(key, []).get(key)).push({ cell, row });
  }
  for (const [key, items] of byParent) {
    const [own, p] = key.split("|");
    const par = ctx.row(Y, fips, own, p);
    if (!par || par[0] === "N") continue;
    // published sibling mass: every child of p with this ownership that is published
    let pubEmp = 0, pubW = 0;
    const a = ctx.years[Y][fips];
    for (const k of Object.keys(a)) {
      const [o, code] = k.split("|");
      if (o !== own || code === p || parentOf(code) !== p) continue;
      if (a[k][0] !== "N") { pubEmp += a[k][2]; pubW += a[k][3]; }
    }
    for (const [field, pub, cap] of [["emp", pubEmp, par[2]], ["w", pubW, par[3]]]) {
      const est = items.reduce((s, i) => s + i.row[field], 0);
      if (pub + est > cap + 1e-6) {
        const room = Math.max(0, cap - pub), f = est > 0 ? room / est : 0;
        log.push({ fips, year: Y, parent: p, own, field, parentValue: cap, publishedSiblings: pub, estimated: Math.round(est), cappedTo: Math.round(room), codes: items.map((i) => i.cell.code) });
        for (const { cell, row } of items) {
          const before = row[field];
          row[field] = before * f;
          const d = before - row[field], weak = row.step >= WEAK_STEP;
          if (field === "emp") { cell.emp -= d; cell.empImp -= d; if (weak) cell.empWeak -= d; } else { cell.w -= d; cell.wImp -= d; if (weak) cell.wWeak -= d; }
          row.capped = true; cell.capped = true;
        }
      }
    }
  }
}

// Every marine cell for a county, all years: {year: {sector: [cell...]}}, plus the plausibility log.
function estimateCounty(ctx, fips) {
  const out = {}, log = [];
  for (let Y = ctx.first; Y <= ctx.last; Y++) {
    const cells = [];
    out[Y] = {};
    for (const sector of Object.keys(MARINE_CODES)) {
      out[Y][sector] = codesFor(sector, Y).map((c) => { const cell = buildCell(ctx, fips, c.code, Y); cell.sector = sector; cells.push(cell); return cell; });
    }
    capToParents(ctx, fips, Y, cells, log);
  }
  return { cells: out, violations: log };
}

module.exports = { WEAK_STEP, OWNS, STEP_NAMES, makeContext, knownAt, stateAt, parentAt, estimateRow, buildCell, capToParents, estimateCounty };
