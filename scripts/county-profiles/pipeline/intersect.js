// The intersect: every hazard test is made at census-block level (15-digit GEOID) and only then
// rolled up to the county. `method` 1 apportions each block's people and jobs by AREAL SHARE: the
// fraction of the block's own polygon that lies inside the hazard mask. That is the correction to
// testing only a block's internal point, which counts a block that straddles a hazard boundary as
// wholly in or wholly out. The block-point figures are still computed and recorded (`point`) so the
// comparison stays on record; they are never published.
//
//  - LODES jobs are published per block, so a block's jobs are weighted by its areal share.
//  - ACS is published per block GROUP, the finest ACS geography. Each block group's estimate is
//    apportioned to its blocks by their 2020 decennial population (housing units, then land area,
//    where a group's blocks hold no people), and each block's share is then weighted by areal share.
//  - USGS facilities are points, tested directly by point-in-polygon ("23% of a school" is not a
//    count). They stay point-based for every hazard.
//
// Masks (11): the SFHA; NOAA's ocean-connected SLR inundation at 2/4/6/8/10 ft; and connected plus
// unconnected low-lying areas at the same five levels. NOAA's connected and low-lying polygons are
// disjoint by construction (low-lying = unconnected), so connected-plus-low is the sum of the two
// fractions; the code checks that instead of assuming it.

const { PolygonSet, projector } = require("./geo");
const { ArealMasker } = require("./areal");

const SQ_M_PER_SQ_MI = 2589988.110336;
const bgOf = (geoid) => geoid.slice(0, 12);

// Splits each block group's ACS values over its blocks. Returns per-block arrays plus diagnostics.
function apportionAcs(blocks, acsBg) {
  const groups = new Map();
  blocks.forEach((b, i) => {
    const g = bgOf(b.geoid);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  });
  const out = { pop: new Float64Array(blocks.length), over65: new Float64Array(blocks.length), poverty: new Float64Array(blocks.length) };
  const diag = { groupsWithNoBlocks: [], weightedBy: { pop: 0, hu: 0, land: 0 } };
  for (const [g, vals] of Object.entries(acsBg)) {
    const idxs = groups.get(g);
    if (!idxs) { diag.groupsWithNoBlocks.push(g); continue; }
    for (const [basis, key] of [["pop", "pop"], ["hu", "hu"], ["land", "landM2"]]) {
      const w = idxs.map((i) => blocks[i][key]);
      const sum = w.reduce((s, v) => s + v, 0);
      if (sum <= 0) continue;
      diag.weightedBy[basis]++;
      idxs.forEach((i, k) => {
        for (const m of ["pop", "over65", "poverty"]) out[m][i] += (vals[m] * w[k]) / sum;
      });
      break;
    }
  }
  return { perBlock: out, diag };
}

function compute({ fips, blocks, nfhl, acs, lodes, usgs, slr, claims, facilityDefs, increments, periods }) {
  const diag = {};
  const timings = {};
  const clock = (name, t0) => { timings[name] = +((Date.now() - t0) / 1000).toFixed(1); };
  const N = blocks.length;

  // --- block-point tests (kept as the recorded comparison, and the basis for facilities) ---
  let t = Date.now();
  const sfhaSet = new PolygonSet(nfhl.sfha.map((f) => f.geometry));
  const panels = new PolygonSet(nfhl.panels);
  const slrSets = Object.fromEntries(increments.map((ft) => [ft, new PolygonSet(slr.increments[ft])]));
  const lowSets = Object.fromEntries(increments.map((ft) => [ft, new PolygonSet(slr.low[ft])]));
  const ptSfha = new Uint8Array(N), covered = new Uint8Array(N);
  const ptConn = Object.fromEntries(increments.map((ft) => [ft, new Uint8Array(N)]));
  const ptWithLow = Object.fromEntries(increments.map((ft) => [ft, new Uint8Array(N)]));
  let pointInBoth = 0; // block points inside a connected AND a low-lying polygon at the same level
  blocks.forEach((b, i) => {
    ptSfha[i] = sfhaSet.contains(b.lon, b.lat) ? 1 : 0;
    covered[i] = panels.contains(b.lon, b.lat) ? 1 : 0;
    for (const ft of increments) {
      const c = slrSets[ft].contains(b.lon, b.lat), l = lowSets[ft].contains(b.lon, b.lat);
      ptConn[ft][i] = c ? 1 : 0;
      ptWithLow[ft][i] = c || l ? 1 : 0;
      if (c && l) pointInBoth++;
    }
  });
  clock("pointTests", t);
  diag.blocks = { total: N, pointInSfha: ptSfha.reduce((s, v) => s + v, 0), outsidePanels: N - covered.reduce((s, v) => s + v, 0) };
  diag.populatedBlocksOutsidePanels = blocks.filter((b, i) => !covered[i] && b.pop > 0).length;
  diag.blockPointsInConnectedAndLow = pointInBoth;

  // --- areal fractions for every mask ---
  t = Date.now();
  const masker = new ArealMasker(blocks, projector([-117.78, 33.68]));
  const frac = {};
  const fdiag = {};
  const run = (name, geoms) => {
    const t0 = Date.now();
    const r = masker.fractions(geoms, { sample: 300 });
    if (r.failures) throw new Error("areal fractions for " + name + ": " + r.failures + " intersections failed; refusing to publish a figure that silently treats them as uncovered");
    frac[name] = r.frac;
    fdiag[name] = { seconds: +((Date.now() - t0) / 1000).toFixed(1), blocksTouched: r.frac.filter((v) => v > 0).length, overlapSample: { blocks: r.overlap.sampled, individualOverCombined: r.overlap.combined ? +(r.overlap.individual / r.overlap.combined).toFixed(6) : null } };
  };
  run("sfha", nfhl.sfha.map((f) => f.geometry));
  for (const ft of increments) { run("conn" + ft, slr.increments[ft]); run("low" + ft, slr.low[ft]); }
  let clamped = 0;
  for (const ft of increments) {
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) { const s = frac["conn" + ft][i] + frac["low" + ft][i]; if (s > 1 + 1e-9) clamped++; w[i] = Math.min(1, s); }
    frac["withLow" + ft] = w;
  }
  diag.areal = { masks: fdiag, blocksWhereConnectedPlusLowExceedsOne: clamped };
  // Nesting: a block cannot be less covered at a higher level.
  diag.arealNestingViolations = {};
  for (const kind of ["conn", "withLow"]) {
    for (let k = 1; k < increments.length; k++) {
      let v = 0;
      const a = frac[kind + increments[k - 1]], b = frac[kind + increments[k]];
      for (let i = 0; i < N; i++) if (a[i] > b[i] + 1e-6) v++;
      diag.arealNestingViolations[kind + increments[k - 1] + "->" + increments[k]] = v;
    }
  }
  clock("arealFractions", t);

  // --- people (ACS block groups apportioned to blocks) and jobs (LODES per block) ---
  t = Date.now();
  const { perBlock, diag: acsDiag } = apportionAcs(blocks, acs.bg);
  diag.acs = acsDiag;
  const idxByGeoid = new Map(blocks.map((b, i) => [b.geoid, i]));
  const jobsByBlock = new Float64Array(N);
  diag.lodesBlocksNotInTiger = 0;
  let lodesTotal = 0;
  for (const [g, n] of Object.entries(lodes.jobs)) {
    const i = idxByGeoid.get(g);
    lodesTotal += n;
    if (i === undefined) { diag.lodesBlocksNotInTiger++; continue; }
    jobsByBlock[i] = n;
  }
  const weighted = (arr, w) => { let s = 0; for (let i = 0; i < N; i++) s += arr[i] * (w ? w[i] : 1); return s; };
  const asMask = (u8) => Float64Array.from(u8);
  const summarize = (arr) => ({
    total: weighted(arr),
    sfha: weighted(arr, frac.sfha),
    slr: increments.map((ft) => weighted(arr, frac["conn" + ft])),
    slrWithLow: increments.map((ft) => weighted(arr, frac["withLow" + ft])),
    // The block-point figures: the same apportioned values, whole blocks in or out by internal point.
    point: {
      sfha: weighted(arr, asMask(ptSfha)),
      slr: increments.map((ft) => weighted(arr, asMask(ptConn[ft]))),
      slrWithLow: increments.map((ft) => weighted(arr, asMask(ptWithLow[ft]))),
    },
  });
  const people = { pop: summarize(perBlock.pop), over65: summarize(perBlock.over65), poverty: summarize(perBlock.poverty) };
  const jobs = summarize(jobsByBlock);
  clock("apportion", t);

  // --- facilities (points): stay point-based for every hazard ---
  const blockSet = new PolygonSet(blocks.map((b) => b.geometry));
  const facilities = {};
  diag.facilities = {};
  for (const def of facilityDefs) {
    const seen = new Set();
    let raw = 0, dup = 0, outside = 0;
    const kept = [];
    for (const f of usgs[def.key]) {
      raw++;
      const key = f.id || f.x + "," + f.y + "," + f.name;
      if (seen.has(key)) { dup++; continue; }
      seen.add(key);
      if (!blockSet.contains(f.x, f.y)) { outside++; continue; }
      kept.push(f);
    }
    diag.facilities[def.key] = { raw, duplicates: dup, outsideCounty: outside, kept: kept.length };
    facilities[def.key] = {
      total: kept.length,
      sfha: kept.filter((f) => sfhaSet.contains(f.x, f.y)).length,
      slr: increments.map((ft) => kept.filter((f) => slrSets[ft].contains(f.x, f.y)).length),
      slrWithLow: increments.map((ft) => kept.filter((f) => slrSets[ft].contains(f.x, f.y) || lowSets[ft].contains(f.x, f.y)).length),
      loaded: kept.map((f) => f.loaded).filter(Boolean).map((ms) => new Date(ms).toISOString().slice(0, 10)),
    };
  }

  // --- land area in the floodplain: land area times areal share (unchanged) ---
  const landTotalSqMi = blocks.reduce((s, b) => s + b.landM2, 0) / SQ_M_PER_SQ_MI;
  const landInsideSqMi = blocks.reduce((s, b, i) => s + b.landM2 * frac.sfha[i], 0) / SQ_M_PER_SQ_MI;

  // --- sensitivity and cross-checks kept on record ---
  const bgShare = new Map();
  blocks.forEach((b, i) => {
    const k = bgOf(b.geoid);
    const e = bgShare.get(k) || { area: 0, covered: 0 };
    e.area += masker.area[i];
    e.covered += masker.area[i] * frac.sfha[i];
    bgShare.set(k, e);
  });
  const share = (k) => { const e = bgShare.get(k); return e && e.area ? e.covered / e.area : 0; };
  const blockGroupAreal = { pop: 0, over65: 0, poverty: 0 };
  for (const [k, v] of Object.entries(acs.bg)) for (const m of ["pop", "over65", "poverty"]) blockGroupAreal[m] += v[m] * share(k);
  const arealSens = {
    // NOAA's stated method (block-group share of area applied to the whole group), on current data.
    blockGroupAreal,
    // The share of the areal SFHA population that sits in blocks containing water. A polygon-area share
    // counts that water as if people lived on it, which is why areal weighting leans high near coasts.
    arealPopInBlocksWithWater: perBlock.pop.reduce((s, v, i) => s + (blocks[i].waterM2 > 0 ? v * frac.sfha[i] : 0), 0),
    pop2020Areal: blocks.reduce((s, b, i) => s + b.pop * frac.sfha[i], 0),
    pop2020Point: blocks.reduce((s, b, i) => s + (ptSfha[i] ? b.pop : 0), 0),
  };

  // --- NFIP claims by five-year period (yearOfLoss) ---
  const paid = (c) => (c.amountPaidOnBuildingClaim || 0) + (c.amountPaidOnContentsClaim || 0) + (c.amountPaidOnIncreasedCostOfComplianceClaim || 0);
  const byPeriod = periods.map(({ start, end }) => {
    const rows = claims.filter((c) => c.yearOfLoss >= start && c.yearOfLoss <= end);
    return { period: start + "–" + end, start, end, amount: rows.reduce((s, c) => s + paid(c), 0), claimsAll: rows.length, claimsPaid: rows.filter((c) => paid(c) > 0).length };
  });

  return { people, jobs: { ...jobs, total: lodesTotal }, facilities, landTotalSqMi, landInsideSqMi, arealSens, byPeriod, claimsAsOf: claims.map((c) => c.asOfDate).filter(Boolean).sort().pop(), diag, timings, increments };
}

module.exports = { compute, SQ_M_PER_SQ_MI };
