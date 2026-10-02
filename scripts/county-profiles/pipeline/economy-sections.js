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
const { isWithheldByRule, withheldCell } = require("../estimated");

const round = (n) => Math.round(n);
const isSup = (v) => v === "SUP" || v === null || v === undefined || v === -9999 || v === "-9999";
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

// Withholding (estimated.js): a sector figure is withheld when the share of it imputed at the weak ladder steps
// (4 and 5) reaches the threshold. `vk` names the value ("emp" or "wages") and WEAK the part imputed weakly.
const WEAK = { emp: "empWeak", wages: "wagesWeak" };
// A sector flagged `noAnchor` (tourism and recreation in a county whose shoreline share could not be calibrated) is
// withheld outright, every measure, whatever its imputed share.
const withheld = (s, vk) => Boolean(s.noAnchor) || (s[vk] > 0 && isWithheldByRule(s[WEAK[vk]] / s[vk]));
const whyCell = (s) => withheldCell(s.noAnchor ? "no-calibration-anchor" : "weak-share");
const weakOf = (s, vk) => (s[vk] > 0 ? s[WEAK[vk]] / s[vk] : 0);
const secFig = (s, vk, ik) => (withheld(s, vk) ? whyCell(s) : E.fig(s[vk], s[vk] > 0 ? s[ik] / s[vk] : 0, s.step, { unresolved: s.unresolved, weakShare: weakOf(s, vk) }));
// A total over sectors: withheld sectors are left out and the total is marked partial (a floor); the total is
// itself withheld if the part of what is left that was imputed weakly reaches the threshold.
function totalFig(list, vk, ik) {
  const kept = list.filter((s) => !withheld(s, vk));
  const value = sum(kept, (s) => s[vk]);
  const imp = sum(kept, (s) => s[ik]);
  const weak = value > 0 ? sum(kept, (s) => s[WEAK[vk]]) / value : 0;
  if (value > 0 && isWithheldByRule(weak)) return withheldCell("weak-share");
  const dropped = list.length - kept.length;
  return E.fig(value, value > 0 ? imp / value : 0, Math.max(0, ...kept.map((s) => s.step)), { unresolved: sum(kept, (s) => s.unresolved) + dropped, weakShare: weak });
}
// Provenance of an average wage (wages / jobs): withheld if either part is, else the larger of the two shares.
function avgWageFig(s) {
  if (s.noAnchor) return whyCell(s);
  if (!(s.emp > 0)) return null;
  if (withheld(s, "emp") || withheld(s, "wages")) return whyCell(s);
  const share = Math.max(s.empImp / s.emp, s.wages > 0 ? s.wagesImp / s.wages : 0);
  return E.fig(s.wages / s.emp, share, s.step, { unresolved: s.unresolved, weakShare: Math.max(weakOf(s, "emp"), weakOf(s, "wages")) });
}
// GDP: the wages' provenance. `gdp` null means no ratio exists (Public administration): withheld.
const gdpSecFig = (s) => (s.gdp === null ? withheldCell("gdp-unreproducible") : withheld(s, "wages") ? whyCell(s) : E.fig(s.gdp, s.wages > 0 ? s.wagesImp / s.wages : 0, s.step, { unresolved: s.unresolved, weakShare: weakOf(s, "wages") }));
function gdpTotalFig(list) {
  const kept = list.filter((s) => s.gdp !== null && !withheld(s, "wages"));
  const value = sum(kept, (s) => s.gdp), w = sum(kept, (s) => s.wages);
  const weak = w > 0 ? sum(kept, (s) => s.wagesWeak) / w : 0;
  if (w > 0 && isWithheldByRule(weak)) return withheldCell("weak-share");
  return E.fig(value, w > 0 ? sum(kept, (s) => s.wagesImp) / w : 0, Math.max(0, ...kept.map((s) => s.step)), { unresolved: sum(kept, (s) => s.unresolved) + (list.length - kept.length), weakShare: weak });
}

// ---- marine economy --------------------------------------------------------------------------------------
// `in`: {ctx, est, shares, gdp (makeGdp), fips, openEnow: {ca, us}, self (ENOW self-employed rows, or null)}
function marineSections(input) {
  const { ctx, est, shares, g, fips, openEnow, calibration } = input;
  const Y = ctx.last;
  const lines = [...new Set(D.ALL_MARINE_CODES.map((c) => Object.values(D.MARINE_CODES).flat().find((d) => d.code === c).bea))];
  const gy = g.yearFor(lines, Y);
  const secY = E.marineSectors(ctx, est, fips, Y, shares, null);
  const secG = E.marineSectors(ctx, est, fips, gy, shares, { ratio: g.ratio, year: gy });
  // Tourism and recreation is withheld where its shoreline share has no calibration anchor (the original ENOW's 2021
  // county figure is withheld or zero, so only the ZIP rule is left). The county set comes from the calibration.
  const noAnchor = calibration.jobs.method === "zip-rule";
  const TOUR = "Tourism and Recreation";
  const list = E.MARINE_SECTOR_ORDER;
  if (noAnchor) { secY[TOUR].noAnchor = true; secG[TOUR].noAnchor = true; }
  const total = E.countyTotal(ctx, fips, Y);
  const all = list.map((k) => secY[k]);
  const allG = list.map((k) => secG[k]);
  const measuring = {
    establishments: E.fig(sum(all.filter((x) => !x.noAnchor), (x) => x.estabs), 0, 0, { unresolved: all.filter((x) => x.noAnchor).length }),
    jobs: totalFig(all, "emp", "empImp"),
    wages: totalFig(all, "wages", "wagesImp"),
    gdp: gdpTotalFig(allG),
    denominator: round(total.emp),
    year: Y, gdpYear: gy,
  };
  const labels = { "Living Resources": "Living resources", "Marine Construction": "Marine construction", "Marine Transportation": "Marine transportation", "Offshore Mineral Resources": "Offshore mineral resources", "Ship and Boat Building": "Ship and boat building", "Tourism and Recreation": "Tourism and recreation" };
  const diversity = {
    sectors: list.map((k) => ({
      label: labels[k],
      establishments: secY[k].noAnchor ? whyCell(secY[k]) : E.fig(secY[k].estabs, 0, 0),
      wages: secFig(secY[k], "wages", "wagesImp"),
      employment: secFig(secY[k], "emp", "empImp"),
      gdp: gdpSecFig(secG[k]),
    })),
    year: Y, gdpYear: gy,
  };

  // Wages: the county's average wage in the comparators' newest year, against Open ENOW California and
  // the coastal U.S. for that same year.
  const Yw = Math.min(Y, openEnow.ca.years[openEnow.ca.years.length - 1]);
  const secW = E.marineSectors(ctx, est, fips, Yw, shares, null);
  if (noAnchor) secW[TOUR].noAnchor = true;
  const items = [], noJobs = [];
  for (const k of list) {
    const s = secW[k];
    if (!(s.emp > 0) && !s.noAnchor) { noJobs.push(labels[k]); continue; }
    const rowOf = (series) => series.byYear[Yw].find((r) => r.sector === k);
    const avg = (r) => (r && r.employment > 0 ? round(r.wages / r.employment) : null);
    const st = avg(rowOf(openEnow.ca)), us = avg(rowOf(openEnow.us));
    if (st === null || us === null) throw new Error("Open ENOW has no jobs in " + k + " for " + Yw);
    items.push({ label: labels[k], county: avgWageFig(s), coastalState: st, coastalUS: us });
  }
  const wages = noJobs.length ? { items, noJobs, year: Yw } : { items, year: Yw };

  return { Y, gdpYear: gy, wagesYear: Yw, measuring, diversity, wages, employed: measuring.jobs, sectorLabels: labels, calibration };
}

// ---- total economy ---------------------------------------------------------------------------------------
// `in`: {ctx, fips, g, coastalRows: {county, state, nation, california} (NOAA Total Economy (Coastal) rows for the comparators), totalYear}
function totalSections(input) {
  const { ctx, fips, g, noaa } = input;
  const Y = ctx.last;
  const labels = Object.keys(D.TOTAL_SECTOR_CODES);
  const gdpLabels = labels.filter((l) => D.TOTAL_SECTORS_QCEW[l].bea);
  const gy = g.yearForSuper(gdpLabels, Y) || Y;
  const secY = E.totalSectors(ctx, fips, Y, null);
  const secG = E.totalSectors(ctx, fips, gy, { superRatio: g.superRatio, year: gy });
  const total = E.countyTotal(ctx, fips, Y);
  const ca = E.countyTotal(ctx, ctx.state, Y);
  const measuring = {
    establishments: total.estabs,
    jobs: total.emp,
    wages: total.wages,
    gdp: gdpTotalFig(labels.map((k) => secG[k])),
    denominator: round(ca.emp),
    year: Y, gdpYear: gy,
  };
  const diversity = {
    sectors: labels.map((k) => ({
      label: k,
      establishments: E.fig(secY[k].estabs, 0, 0),
      wages: secFig(secY[k], "wages", "wagesImp"),
      employment: secFig(secY[k], "emp", "empImp"),
      gdp: gdpSecFig(secG[k]),
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
    items.push({ label: k, county: avgWageFig(s), coastalState: st === null ? withheldCell("no-data") : st, coastalUS: us === null ? withheldCell("no-data") : us });
  }
  const wages = noJobs.length ? { items, noJobs, year: Yw } : { items, year: Yw };
  return { Y, gdpYear: gy, wagesYear: Yw, measuring, diversity, wages, employed: total.emp, sectorLabels: labels };
}

module.exports = { marineSections, totalSections };
