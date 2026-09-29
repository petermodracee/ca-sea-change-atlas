// The marine-economy and total-economy section data for one county (Phase 7), built from public QCEW.
// snapshot.js adds the sections that do not come from here (LODES-based jobs at risk) and the source list.
//
// Vintages, one per source, never blended silently:
//   QCEW (jobs, wages, establishments)   the newest published year (`Y`): the headline year
//   BEA GDP                              the newest year BEA has every needed industry line for; the detailed
//                                        marine lines run one year behind QCEW, the sector lines do not
//   Open ENOW comparators (marine wages) its newest year; the wages chart then uses that year for the
//                                        county too, so its three dots are the same year
//   NOAA Total Economy (Coastal) (total-economy wages comparators)  its newest year, likewise
//   Census Nonemployer Statistics        its newest year; ENOW self-employed (marine) is 2021

const D = require("./enow-def");
const E = require("./economy");
const { OWNS } = require("./impute");

const round = (n) => Math.round(n);
const SUPPRESSED = { suppressed: true };
const isSup = (v) => v === "SUP" || v === null || v === undefined || v === -9999 || v === "-9999";
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

// A figure from summed parts: number, {value, est}, {value, partial}, or {suppressed}.
function figOf(parts, valueKey, impKey) {
  const value = sum(parts, (p) => p[valueKey]);
  const imp = sum(parts, (p) => p[impKey]);
  const step = Math.max(0, ...parts.map((p) => p.step));
  const unresolved = sum(parts, (p) => p.unresolved);
  return E.fig(value, value > 0 ? imp / value : 0, step, { unresolved });
}
// Provenance of an average wage (wages / jobs): the larger of the two shares.
function avgWageFig(s) {
  if (!(s.emp > 0)) return null;
  const share = Math.max(s.empImp / s.emp, s.wages > 0 ? s.wagesImp / s.wages : 0);
  return E.fig(s.wages / s.emp, share, s.step, { unresolved: s.unresolved });
}

// ---- marine economy --------------------------------------------------------------------------------------
// `in`: {ctx, est, shares, gdp (makeGdp), fips, openEnow: {ca, us}, self (ENOW self-employed rows, or null)}
function marineSections(input) {
  const { ctx, est, shares, g, fips, openEnow } = input;
  const Y = ctx.last;
  const lines = [...new Set(D.ALL_MARINE_CODES.map((c) => Object.values(D.MARINE_CODES).flat().find((d) => d.code === c).bea))];
  const gy = g.yearFor(lines, Y);
  const secY = E.marineSectors(ctx, est, fips, Y, shares, null);
  const secG = E.marineSectors(ctx, est, fips, gy, shares, { ratio: g.ratio, year: gy });
  const list = E.MARINE_SECTOR_ORDER;
  const total = E.countyTotal(ctx, fips, Y);
  const gdpFig = (s) => E.fig(s.gdp, s.wages > 0 ? s.wagesImp / s.wages : 0, s.step, { unresolved: s.unresolved });

  const all = list.map((k) => secY[k]);
  const allG = list.map((k) => secG[k]);
  const measuring = {
    establishments: E.fig(sum(all, (s) => s.estabs), 0, 0),
    jobs: figOf(all, "emp", "empImp"),
    wages: figOf(all, "wages", "wagesImp"),
    gdp: E.fig(sum(allG, (s) => s.gdp), sum(allG, (s) => s.wages) > 0 ? sum(allG, (s) => s.wagesImp) / sum(allG, (s) => s.wages) : 0, Math.max(0, ...allG.map((s) => s.step)), { unresolved: sum(allG, (s) => s.unresolved) }),
    denominator: round(total.emp),
    year: Y, gdpYear: gy,
  };
  const labels = { "Living Resources": "Living resources", "Marine Construction": "Marine construction", "Marine Transportation": "Marine transportation", "Offshore Mineral Resources": "Offshore mineral resources", "Ship and Boat Building": "Ship and boat building", "Tourism and Recreation": "Tourism and recreation" };
  const diversity = {
    sectors: list.map((k) => ({
      label: labels[k],
      establishments: E.fig(secY[k].estabs, 0, 0),
      wages: figOf([secY[k]], "wages", "wagesImp"),
      employment: figOf([secY[k]], "emp", "empImp"),
      gdp: E.fig(secG[k].gdp, secG[k].wages > 0 ? secG[k].wagesImp / secG[k].wages : 0, secG[k].step, { unresolved: secG[k].unresolved }),
    })),
    year: Y, gdpYear: gy,
  };

  // Wages: the county's average wage in the comparators' newest year, against Open ENOW California and
  // the coastal U.S. for that same year.
  const Yw = Math.min(Y, openEnow.ca.years[openEnow.ca.years.length - 1]);
  const secW = E.marineSectors(ctx, est, fips, Yw, shares, null);
  const items = [], noJobs = [];
  for (const k of list) {
    const s = secW[k];
    if (!(s.emp > 0)) { noJobs.push(labels[k]); continue; }
    const rowOf = (series) => series.byYear[Yw].find((r) => r.sector === k);
    const avg = (r) => (r && r.employment > 0 ? round(r.wages / r.employment) : null);
    const st = avg(rowOf(openEnow.ca)), us = avg(rowOf(openEnow.us));
    if (st === null || us === null) throw new Error("Open ENOW has no jobs in " + k + " for " + Yw);
    items.push({ label: labels[k], county: avgWageFig(s), coastalState: st, coastalUS: us });
  }
  const wages = noJobs.length ? { items, noJobs, year: Yw } : { items, year: Yw };

  return { Y, gdpYear: gy, wagesYear: Yw, measuring, diversity, wages, employed: measuring.jobs, sectorLabels: labels };
}

// ---- total economy ---------------------------------------------------------------------------------------
// `in`: {ctx, fips, g, coastalRows: {county, state, nation, california} (NOAA Total Economy (Coastal) rows for the comparators), totalYear}
function totalSections(input) {
  const { ctx, fips, g, noaa } = input;
  const Y = ctx.last;
  const gy = g.yearFor(D.NAICS_SECTORS.filter((s) => s !== "92").concat([]), Y) || Y;
  const secY = E.totalSectors(ctx, fips, Y, null);
  const secG = E.totalSectors(ctx, fips, gy, { ratio: g.ratio, year: gy });
  const labels = Object.keys(D.TOTAL_SECTOR_CODES);
  const total = E.countyTotal(ctx, fips, Y);
  const ca = E.countyTotal(ctx, ctx.state, Y);
  const gdpFig = (s) => E.fig(s.gdp, s.wages > 0 ? s.wagesImp / s.wages : 0, s.step, { unresolved: s.unresolved });
  const allG = labels.map((k) => secG[k]);
  const measuring = {
    establishments: total.estabs,
    jobs: total.emp,
    wages: total.wages,
    gdp: E.fig(sum(allG, (s) => s.gdp), sum(allG, (s) => s.wages) > 0 ? sum(allG, (s) => s.wagesImp) / sum(allG, (s) => s.wages) : 0, Math.max(0, ...allG.map((s) => s.step)), { unresolved: sum(allG, (s) => s.unresolved) }),
    denominator: round(ca.emp),
    year: Y, gdpYear: gy,
  };
  const diversity = {
    sectors: labels.map((k) => ({
      label: k,
      establishments: E.fig(secY[k].estabs, 0, 0),
      wages: figOf([secY[k]], "wages", "wagesImp"),
      employment: figOf([secY[k]], "emp", "empImp"),
      gdp: gdpFig(secG[k]),
    })),
    year: Y, gdpYear: gy,
  };
  // Wages: the county's average wage in NOAA's newest Total Economy year, against NOAA's coastal California
  // and coastal U.S. rows for that year.
  const Yw = noaa.year;
  const secW = E.totalSectors(ctx, fips, Yw, null);
  const apiName = { "Financial activities": "Financial Activities", "Education and health services": "Education and Health Services", "Leisure and hospitality": "Leisure and Hospitality", "Natural resources and mining": "Natural Resources and Mining", "Professional and business services": "Professional and Business Services", "Public administration": "Public Administration", "Trade, transportation, and utilities": "Trade, Transportation, and Utilitie", "Other services": "Other Services" };
  const noaaRow = (rows, label) => { const a = apiName[label] || label; const hit = rows.find((r) => r.sector.startsWith(a.slice(0, 20))); if (!hit) throw new Error("NOAA Total Economy has no row for " + label); return hit; };
  const noaaAvg = (r) => (isSup(r.wages) || isSup(r.employment) ? null : Number(r.employment) > 0 ? round(Number(r.wages) / Number(r.employment)) : undefined);
  const items = [], noJobs = [];
  for (const k of labels) {
    const s = secW[k];
    if (!(s.emp > 0)) { noJobs.push(k); continue; }
    const st = noaaAvg(noaaRow(noaa.state, k)), us = noaaAvg(noaaRow(noaa.nation, k));
    if (st === undefined || us === undefined) throw new Error("the coastal state or U.S. series has no jobs in " + k);
    items.push({ label: k, county: avgWageFig(s), coastalState: st === null ? { ...SUPPRESSED } : st, coastalUS: us === null ? { ...SUPPRESSED } : us });
  }
  const wages = noJobs.length ? { items, noJobs, year: Yw } : { items, year: Yw };
  return { Y, gdpYear: gy, wagesYear: Yw, measuring, diversity, wages, employed: total.emp, sectorLabels: labels };
}

module.exports = { marineSections, totalSections };
