// The intersect: every hazard test is made at census-block level (15-digit GEOID) and only then
// rolled up to the county. `method` 1 tests each block's internal point (TIGER's INTPTLON/INTPTLAT,
// which sits inside the block) against the hazard polygons.
//
//  - LODES jobs are already published per block, so a block's jobs are in or out with its point.
//  - ACS is published per block GROUP, the finest ACS geography. Each block group's estimate is
//    apportioned to its blocks by their 2020 decennial population (housing units, then land area,
//    where a group's blocks hold no people), so a group that straddles a floodplain is split by where
//    people live, not counted whole and not smeared across dry land. Then blocks are tested as above.
//  - USGS facilities are points, tested directly.
//
// Areal weighting (a block's share of its polygon inside the hazard) is computed for the SFHA as a
// sensitivity check on the centroid method, never as the published figure.

const { PolygonSet, clipRingToBox, projector, multiArea, multiBbox, toMulti, polygonClipping } = require("./geo");

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
  const diag = { groupsWithNoBlocks: [], weightedBy: { pop: 0, hu: 0, land: 0 }, groupsWithNoWeight: [] };
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

// Areal share of each block covered by the SFHA. FEMA flood-zone polygons do not overlap (checked
// below: their areas sum to the area of their union), so a block's covered area is the sum of its
// intersections with each nearby feature. Each feature is first clipped to the block's bounding box
// so the intersection sees only nearby vertices (one county floodplain feature has 55,000).
function arealShares(blocks, sfhaGeoms, proj) {
  const feats = sfhaGeoms.map((g) => { const multi = toMulti(g); return { multi, bbox: multiBbox(multi) }; });
  let sumArea = 0;
  for (const f of feats) sumArea += multiArea(f.multi, proj);
  let unionArea = null;
  try { unionArea = multiArea(polygonClipping.union(...feats.map((f) => f.multi)), proj); } catch (_) { /* overlap reported as unknown */ }
  const frac = new Float64Array(blocks.length);
  const area = new Float64Array(blocks.length);
  let failures = 0;
  blocks.forEach((b, i) => {
    const bm = toMulti(b.geometry);
    const bb = multiBbox(bm);
    const cand = feats.filter((f) => f.bbox[0] <= bb[2] && f.bbox[2] >= bb[0] && f.bbox[1] <= bb[3] && f.bbox[3] >= bb[1]);
    if (!cand.length) return;
    const box = [bb[0] - 1e-6, bb[1] - 1e-6, bb[2] + 1e-6, bb[3] + 1e-6];
    let covered = 0;
    for (const f of cand) {
      const clipped = [];
      for (const poly of f.multi) {
        if (!clipRingToBox(poly[0], box).length) continue;
        clipped.push(poly.map((r) => clipRingToBox(r, box)).filter((r) => r.length));
      }
      if (!clipped.length) continue;
      try { covered += multiArea(polygonClipping.intersection(bm, clipped), proj); } catch (e) { failures++; }
    }
    const a = multiArea(bm, proj);
    area[i] = a;
    if (a > 0) frac[i] = Math.min(1, covered / a);
  });
  blocks.forEach((b, i) => { if (!area[i]) area[i] = multiArea(toMulti(b.geometry), proj); });
  return { frac, area, how: "per-feature intersection", sumAreaSqMi: sumArea / SQ_M_PER_SQ_MI, unionAreaSqMi: unionArea === null ? null : unionArea / SQ_M_PER_SQ_MI, failures };
}

function compute({ fips, blocks, nfhl, acs, lodes, usgs, slr, claims, facilityDefs, increments, periods, areal: doAreal = true }) {
  const diag = {};
  const N = blocks.length;

  const sfha = new PolygonSet(nfhl.sfha.map((f) => f.geometry));
  const panels = new PolygonSet(nfhl.panels);
  const slrSets = Object.fromEntries(increments.map((ft) => [ft, new PolygonSet(slr.increments[ft])]));
  const lowSets = Object.fromEntries(increments.map((ft) => [ft, new PolygonSet(slr.low[ft])]));

  const inSfha = new Uint8Array(N), covered = new Uint8Array(N);
  const inSlr = Object.fromEntries(increments.map((ft) => [ft, new Uint8Array(N)]));
  const inSlrLow = Object.fromEntries(increments.map((ft) => [ft, new Uint8Array(N)])); // connected OR unconnected low-lying
  blocks.forEach((b, i) => {
    inSfha[i] = sfha.contains(b.lon, b.lat) ? 1 : 0;
    covered[i] = panels.contains(b.lon, b.lat) ? 1 : 0;
    for (const ft of increments) {
      inSlr[ft][i] = slrSets[ft].contains(b.lon, b.lat) ? 1 : 0;
      inSlrLow[ft][i] = inSlr[ft][i] || lowSets[ft].contains(b.lon, b.lat) ? 1 : 0;
    }
  });

  // SLR extents should nest (a 4 ft area contains the 2 ft one). Count violations rather than assume.
  diag.slrNestingViolations = {};
  for (let k = 1; k < increments.length; k++) {
    let v = 0;
    for (let i = 0; i < N; i++) if (inSlr[increments[k - 1]][i] && !inSlr[increments[k]][i]) v++;
    diag.slrNestingViolations[increments[k - 1] + "->" + increments[k]] = v;
  }
  diag.blocks = { total: N, inSfha: inSfha.reduce((s, v) => s + v, 0), outsidePanels: N - covered.reduce((s, v) => s + v, 0) };
  diag.populatedBlocksOutsidePanels = blocks.filter((b, i) => !covered[i] && b.pop > 0).length;
  diag.populationOutsidePanels = blocks.reduce((s, b, i) => s + (covered[i] ? 0 : b.pop), 0);

  // --- population (ACS block groups apportioned to blocks) ---
  const { perBlock, diag: acsDiag } = apportionAcs(blocks, acs.bg);
  diag.acs = acsDiag;
  const sumOver = (arr, mask) => { let s = 0; for (let i = 0; i < N; i++) if (!mask || mask[i]) s += arr[i]; return s; };
  const people = {};
  for (const m of ["pop", "over65", "poverty"]) {
    people[m] = { total: sumOver(perBlock[m]), sfha: sumOver(perBlock[m], inSfha), slr: increments.map((ft) => sumOver(perBlock[m], inSlr[ft])), slrWithLow: increments.map((ft) => sumOver(perBlock[m], inSlrLow[ft])) };
  }

  // --- jobs (LODES, per block) ---
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
  const jobs = { total: lodesTotal, sfha: sumOver(jobsByBlock, inSfha), slr: increments.map((ft) => sumOver(jobsByBlock, inSlr[ft])), slrWithLow: increments.map((ft) => sumOver(jobsByBlock, inSlrLow[ft])) };

  // --- facilities (points), kept only where they fall inside a county block ---
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
      sfha: kept.filter((f) => sfha.contains(f.x, f.y)).length,
      slr: increments.map((ft) => kept.filter((f) => slrSets[ft].contains(f.x, f.y)).length),
      slrWithLow: increments.map((ft) => kept.filter((f) => slrSets[ft].contains(f.x, f.y) || lowSets[ft].contains(f.x, f.y)).length),
      loaded: kept.map((f) => f.loaded).filter(Boolean).map((ms) => new Date(ms).toISOString().slice(0, 10)),
    };
  }

  // --- areas, and areal-weighting sensitivity for the SFHA ---
  const proj = projector([-117.78, 33.68]);
  const areal = doAreal ? arealShares(blocks, nfhl.sfha.map((f) => f.geometry), proj) : { frac: new Float64Array(N), how: "skipped" };
  const landTotalSqMi = blocks.reduce((s, b) => s + b.landM2, 0) / SQ_M_PER_SQ_MI;
  const landInsideSqMi = blocks.reduce((s, b, i) => s + b.landM2 * areal.frac[i], 0) / SQ_M_PER_SQ_MI;
  const arealSens = {
    method: areal.how, sumAreaSqMi: areal.sumAreaSqMi, unionAreaSqMi: areal.unionAreaSqMi, failures: areal.failures,
    pop2020: blocks.reduce((s, b, i) => s + b.pop * areal.frac[i], 0),
    jobs: jobsByBlock.reduce((s, v, i) => s + v * areal.frac[i], 0),
    popAcs: sumOver(perBlock.pop.map((v, i) => v * areal.frac[i])),
    over65: sumOver(perBlock.over65.map((v, i) => v * areal.frac[i])),
    poverty: sumOver(perBlock.poverty.map((v, i) => v * areal.frac[i])),
  };
  const centroid2020 = blocks.reduce((s, b, i) => s + (inSfha[i] ? b.pop : 0), 0);
  // NOAA's original method analysed population at block-group level: a block group's share of
  // its area in the floodplain applied to the whole group. Reproduced here on current data.
  if (doAreal) {
    const g = new Map();
    blocks.forEach((b, i) => {
      const k = bgOf(b.geoid);
      const e = g.get(k) || { area: 0, covered: 0 };
      e.area += areal.area[i];
      e.covered += areal.area[i] * areal.frac[i];
      g.set(k, e);
    });
    const bgShare = (k) => { const e = g.get(k); return e && e.area ? e.covered / e.area : 0; };
    arealSens.blockGroupAreal = { popAcs: 0, over65: 0, poverty: 0 };
    for (const [k, v] of Object.entries(acs.bg)) {
      arealSens.blockGroupAreal.popAcs += v.pop * bgShare(k);
      arealSens.blockGroupAreal.over65 += v.over65 * bgShare(k);
      arealSens.blockGroupAreal.poverty += v.poverty * bgShare(k);
    }
  }
  arealSens.centroidPop2020 = centroid2020;
  arealSens.centroidJobs = jobs.sfha;

  // --- NFIP claims by five-year period (yearOfLoss) ---
  const paid = (c) => (c.amountPaidOnBuildingClaim || 0) + (c.amountPaidOnContentsClaim || 0) + (c.amountPaidOnIncreasedCostOfComplianceClaim || 0);
  const byPeriod = periods.map(({ start, end }) => {
    const rows = claims.filter((c) => c.yearOfLoss >= start && c.yearOfLoss <= end);
    return { period: start + "–" + end, start, end, amount: rows.reduce((s, c) => s + paid(c), 0), claimsAll: rows.length, claimsPaid: rows.filter((c) => paid(c) > 0).length };
  });

  return { people, jobs, facilities, landTotalSqMi, landInsideSqMi, arealSens, byPeriod, claimsAsOf: claims.map((c) => c.asOfDate).filter(Boolean).sort().pop(), diag, increments };
}

module.exports = { compute, SQ_M_PER_SQ_MI };
