// Turns the intersect results and the economy / land-cover inputs into a snapshot object matching
// site/data/countyProfileSchema.json.
//
// Availability is decided here from what each source actually returned, and every gap states a
// reason from the schema's closed set, on the section it affects:
//   no-nfhl-coverage   the county has no effective NFHL study (flood sections that intersect it)
//   no-slr-extent      NOAA's sea level rise data has no polygon in the county
//   source-geography   the source's footprint stops short of the county (C-CAP inland; nonemployer data)
// `outside-enow` and `not-shore-adjacent` are the tier rules for whole topics (schema `tiers`); this
// file asserts the API agrees with them rather than trusting them.
//
// Three value states stay apart: zero is a number, a withheld figure is {suppressed: true} (ENOW
// writes "SUP"), and an unavailable section carries a reason. A total that has a withheld component
// is {value, partial: true}.

const USE = { ui: true, pdf: true, present: true };
const METHOD = 2; // 1: Phase 2 (Orange County). 2: Phase 3 (all counties): see docs/COUNTY-PROFILES.md, methodology changelog.

const round = (n) => Math.round(n);
const round1 = (n) => Math.round(n * 10) / 10;

const SUPPRESSED = { suppressed: true };
const isSup = (v) => v === "SUP" || v === null || v === undefined || v === -9999 || v === "-9999";
// A published quantity, or a withheld marker; `rounder` is the rounding the figure is stored at.
const qty = (v, rounder = round) => (isSup(v) ? { ...SUPPRESSED } : rounder(Number(v)));
const isSuppressedCell = (v) => v !== null && typeof v === "object" && v.suppressed === true;

// The eleven sectors of the total economy: display label, the name in the data API (which cuts the
// longest one short), and the Nonemployer Statistics 2-digit NAICS codes that make it up. NES
// publishes no 55 (management) and no public administration: those have no nonemployers.
const TOTAL_SECTORS = [
  { label: "Construction", api: "Construction", naics: ["23"] },
  { label: "Financial activities", api: "Financial Activities", naics: ["52", "53"] },
  { label: "Education and health services", api: "Education and Health Services", naics: ["61", "62"] },
  { label: "Information", api: "Information", naics: ["51"] },
  { label: "Leisure and hospitality", api: "Leisure and Hospitality", naics: ["71", "72"] },
  { label: "Manufacturing", api: "Manufacturing", naics: ["31-33"] },
  { label: "Natural resources and mining", api: "Natural Resources and Mining", naics: ["11", "21"] },
  { label: "Other services", api: "Other Services", naics: ["81"] },
  { label: "Professional and business services", api: "Professional and Business Services", naics: ["54", "56"] },
  { label: "Public administration", api: "Public Administration", naics: [] },
  { label: "Trade, transportation, and utilities", api: "Trade, Transportation, and Utilitie", naics: ["22", "42", "44-45", "48-49"] },
];
const MARINE_SECTORS = [
  { label: "Living resources", api: "Living Resources" },
  { label: "Marine construction", api: "Marine Construction" },
  { label: "Marine transportation", api: "Marine Transportation" },
  { label: "Offshore mineral resources", api: "Offshore Mineral Resources" },
  { label: "Ship and boat building", api: "Ship and Boat Building" },
  { label: "Tourism and recreation", api: "Tourism and Recreation" },
];

const rowOf = (rows, api) => {
  const hit = rows.find((r) => r.sector.startsWith(api.slice(0, 20)));
  if (!hit) throw new Error("the economy data has no row for " + api);
  return hit;
};

// Average wage per job for one sector row: a figure, a withheld marker, or NO_JOBS when the sector
// has no jobs there (a real zero: there is nobody to average over, so no dot is drawn).
const NO_JOBS = Symbol("no jobs");
function avgWage(row) {
  if (isSup(row.wages) || isSup(row.employment)) return { ...SUPPRESSED };
  const jobs = Number(row.employment);
  return jobs > 0 ? round(Number(row.wages) / jobs) : NO_JOBS;
}

// Sector-wages section data: one row per sector with a dot each for the county, the coastal state
// and the coastal U.S. A sector the county has no jobs in is left out and named in `noJobs`.
function wagesData(sectors, county, state, nation) {
  const items = [], noJobs = [];
  for (const s of sectors) {
    const c = avgWage(rowOf(county, s.api));
    if (c === NO_JOBS) { noJobs.push(s.label); continue; }
    const st = avgWage(rowOf(state, s.api)), us = avgWage(rowOf(nation, s.api));
    if (st === NO_JOBS || us === NO_JOBS) throw new Error("the coastal state or U.S. series has no jobs in " + s.label);
    items.push({ label: s.label, county: c, coastalState: st, coastalUS: us });
  }
  return noJobs.length ? { items, noJobs } : { items };
}

// Total-jobs equation: employed + self-employed. The total is the sum of the components that are
// present, and is partial when either is withheld.
function jobsEquation(employed, selfEmployed, sectors) {
  const parts = [employed, selfEmployed];
  const value = parts.reduce((s, p) => s + (isSuppressedCell(p) ? 0 : p), 0);
  return { employed, selfEmployed, total: { value, partial: parts.some(isSuppressedCell) }, sectors };
}

function pruneSources(sources, topics) {
  const cited = new Set();
  for (const t of Object.values(topics)) for (const s of Object.values(t.sections)) for (const k of s.sources) cited.add(k);
  return Object.fromEntries(Object.entries(sources).filter(([k]) => cited.has(k)));
}

function buildSnapshot({ entry, schema, spine, results, meta, ccap, econ, nes, nfhlCovered, slrHasExtent, snapshotDate, generated, gaps }) {
  const inc = schema.increments;
  const r = results;
  const has = (topic) => schema.tiers[entry.tier].topics[topic].available;
  const people = (m) => ({ total: round(r.people[m].total), sfha: round(r.people[m].sfha), slr: r.people[m].slr.map(round), slrLow: r.people[m].slrWithLow.map(round) });
  const pop = people("pop"), old = people("over65"), poor = people("poverty");
  const facilityLabels = { schools: "Schools", police: "Police stations", fire: "Fire stations", medical: "Medical facilities" };
  const facKeys = Object.keys(facilityLabels);

  const gap = (reason) => ({ available: false, reason, use: { ...USE }, sources: [], data: null });
  const section = (sources, data) => ({ available: true, reason: null, use: { ...USE }, sources, data });
  const noteGap = (where, reason) => { gaps.push(where + ": " + reason); return gap(reason); };

  const S = econ ? econ.value : null;
  const vintageYear = (year) => ({ kind: "year", year });
  const sources = {
    nfhl: { label: "FEMA National Flood Hazard Layer", url: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer", vintage: meta.nfhl.effStart ? { kind: "period", start: meta.nfhl.effStart, end: meta.nfhl.effEnd } : null, retrieved: meta.nfhl.retrieved, verified: meta.verified.nfhl },
    acs: { label: "Census ACS 5-year estimates (2020–2024)", url: "https://www.census.gov/programs-surveys/acs/data.html", vintage: vintageYear(2024), retrieved: meta.acs.retrieved, verified: meta.verified.acs },
    tiger: { label: "Census 2020 tabulation blocks (TIGERweb)", url: "https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/Tracts_Blocks/MapServer", vintage: vintageYear(2020), retrieved: meta.tiger.retrieved, verified: meta.verified.tiger },
    usgs: { label: "USGS National Structures Dataset", url: "https://www.usgs.gov/core-science-systems/ngp/tnm-corps/structures", vintage: { kind: "date", date: meta.usgs.latestLoad }, retrieved: meta.usgs.retrieved, verified: meta.verified.usgs },
    openfema: { label: "OpenFEMA NFIP claims", url: "https://www.fema.gov/openfema-data-page/nfip-redacted-claims-v3", vintage: { kind: "date", date: meta.openfema.asOf }, retrieved: meta.openfema.retrieved, verified: meta.verified.openfema },
    slr: { label: "NOAA Sea Level Rise Viewer inundation extents", url: "https://coast.noaa.gov/slrdata/", vintage: null, retrieved: meta.slr.retrieved, verified: meta.verified.slr },
    lodes: { label: "LEHD LODES8 workplace area characteristics", url: "https://lehd.ces.census.gov/data/lodes/LODES8/ca/wac/", vintage: vintageYear(meta.lodes.year), retrieved: meta.lodes.retrieved, verified: meta.verified.lodes },
    ccap: { label: "NOAA C-CAP regional land cover", url: "https://coast.noaa.gov/digitalcoast/data/ccapregional.html", vintage: { kind: "period", start: "1996-01-01", end: "2016-12-31" }, retrieved: meta.ccap.retrieved, verified: meta.verified.ccap },
    opc: { label: "California OPC State Sea Level Rise Guidance, Appendix F", url: "https://www.oceansciencetrust.org/in-practice/2024slrguidance", vintage: vintageYear(2024), retrieved: snapshotDate, verified: snapshotDate },
  };
  if (S) {
    sources.enow = { label: "NOAA Economics: National Ocean Watch (ENOW)", url: "https://coast.noaa.gov/digitalcoast/data/enow.html", vintage: vintageYear(S.oceanYear), retrieved: meta.enow.retrieved, verified: meta.verified.enow };
    sources["enow-self"] = { label: "NOAA ENOW self-employed workers", url: "https://coast.noaa.gov/digitalcoast/data/enow-nes.html", vintage: vintageYear(S.selfYear), retrieved: meta.enow.retrieved, verified: meta.verified.enow };
    sources["coastal-economy"] = { label: "NOAA Total Economy (Coastal)", url: "https://coast.noaa.gov/digitalcoast/data/coastaleconomy.html", vintage: vintageYear(S.totalYear), retrieved: meta.enow.retrieved, verified: meta.verified.coastalEconomy };
    sources["coastal-economy-marine-base"] = { label: "NOAA Total Economy (Coastal), same year as ENOW", url: "https://coast.noaa.gov/digitalcoast/data/coastaleconomy.html", vintage: vintageYear(S.baseYear), retrieved: meta.enow.retrieved, verified: meta.verified.coastalEconomy };
  }
  if (nes) sources.nes = { label: "Census Nonemployer Statistics", url: "https://www.census.gov/programs-surveys/nonemployer-statistics.html", vintage: vintageYear(nes.value.year), retrieved: meta.nes.retrieved, verified: meta.verified.nes };

  // --- flood hazard ---------------------------------------------------------------------------------
  const noNfhl = () => noteGap("flood", "no-nfhl-coverage");
  const ccapUsable = ccap && ccap.value.uncoveredShare <= 0.5;
  const flood = {
    "people-at-risk": !nfhlCovered ? noNfhl() : section(["acs", "tiger", "nfhl"], {
      items: [
        { label: "Population", count: pop.sfha, total: pop.total, unit: "residents" },
        { label: "Aged 65 and over", count: old.sfha, total: old.total, unit: "residents aged 65 and over" },
        { label: "Below the poverty line", count: poor.sfha, total: poor.total, unit: "residents below the poverty line" },
      ],
      landInsideSqMi: round1(r.landInsideSqMi),
      landTotalSqMi: round1(r.landTotalSqMi),
    }),
    "critical-facilities": !nfhlCovered ? noNfhl() : section(["usgs", "nfhl"], {
      items: facKeys.map((k) => ({ label: facilityLabels[k], inside: r.facilities[k].sfha, outside: r.facilities[k].total - r.facilities[k].sfha })),
    }),
    "homes-at-risk": section(["openfema"], {
      items: r.byPeriod.filter((p) => p.start >= 1996).map((p) => ({ period: p.period, amount: round(p.amount) })),
      claims: r.byPeriod.filter((p) => p.start >= 1996).reduce((s, p) => s + p.claimsAll, 0),
    }),
    "jobs-at-risk": !nfhlCovered ? noNfhl() : section(["lodes", "tiger", "nfhl"], { count: round(r.jobs.sfha), total: round(r.jobs.total) }),
    "natural-features": !nfhlCovered ? noNfhl() : !ccapUsable ? noteGap("flood/natural-features", "source-geography") : (() => {
      const f = ccap.value.flood;
      return section(["ccap", "nfhl"], {
        items: [
          { label: "Inside the floodplain", count: round1(f.addedInsideSqMi), total: round1(f.developedInsideSqMi), unit: "square miles" },
          { label: "Outside the floodplain", count: round1(f.addedOutsideSqMi), total: round1(f.developedOutsideSqMi), unit: "square miles" },
        ],
        naturalSqMi: round1(f.naturalInsideSqMi),
        floodplainSqMi: round1(f.floodplainLandSqMi),
      });
    })(),
  };

  // --- sea level rise (full tier only) ---------------------------------------------------------------
  const noSlr = () => noteGap("slr", "no-slr-extent");
  const at6 = inc.indexOf(6);
  let slr = {};
  if (has("slr")) {
    slr = {
      "people-at-risk": !slrHasExtent ? noSlr() : section(["acs", "tiger", "slr"], {
        increments: inc,
        measures: [
          { label: "Population", unit: "residents", total: pop.total, counts: pop.slr, countsWithLow: pop.slrLow },
          { label: "Aged 65 and over", unit: "residents aged 65 and over", total: old.total, counts: old.slr, countsWithLow: old.slrLow },
          { label: "Below the poverty line", unit: "residents below the poverty line", total: poor.total, counts: poor.slr, countsWithLow: poor.slrLow },
        ],
      }),
      "critical-facilities": !slrHasExtent ? noSlr() : section(["usgs", "slr"], {
        increments: inc,
        measures: facKeys.map((k) => ({ label: facilityLabels[k], unit: "facilities", total: r.facilities[k].total, counts: r.facilities[k].slr, countsWithLow: r.facilities[k].slrWithLow })),
      }),
      "jobs-at-risk": !slrHasExtent ? noSlr() : section(["lodes", "tiger", "slr"], { increments: inc, total: round(r.jobs.total), counts: r.jobs.slr.map(round), countsWithLow: r.jobs.slrWithLow.map(round) }),
      "natural-landscapes": !slrHasExtent ? noSlr() : !ccapUsable ? noteGap("slr/natural-landscapes", "source-geography") : section(["ccap", "slr"], {
        increments: inc,
        classes: [
          { label: "Wetlands", values: ccap.value.slr.map((c) => round1(c.wetland)) },
          { label: "Upland", values: ccap.value.slr.map((c) => round1(c.upland)) },
          { label: "Other", values: ccap.value.slr.map((c) => round1(c.other)) },
        ],
      }),
      "when-to-act": section(["opc"], {}),
    };
  }

  // --- total economy (full tier only) ------------------------------------------------------------------
  let totalEconomy = {};
  if (has("total-economy")) {
    if (!S.coastal.length) throw new Error(entry.name + ": the tier says shore-adjacent, but the Total Economy (Coastal) data has no rows for it");
    const county = S.coastal, total = rowOf(county, "Total, all industries");
    const sectorRows = TOTAL_SECTORS.map((s) => ({ s, row: rowOf(county, s.api) }));
    const nesRow = nes ? nes.value.counties[entry.fips] : null;
    const nesCell = (code) => {
      const c = nesRow[code];
      return c === undefined ? 0 : c.suppressed ? { ...SUPPRESSED } : c.estab;
    };
    const nesSector = (s) => {
      const cells = s.naics.map(nesCell);
      return cells.some(isSuppressedCell) ? { ...SUPPRESSED } : cells.reduce((a, b) => a + b, 0);
    };
    totalEconomy = {
      measuring: section(["coastal-economy"], {
        establishments: qty(total.establishments), jobs: qty(total.employment), wages: qty(total.wages), gdp: qty(total.gdp),
        denominator: round(rowOf(S.californiaAll, "Total, all industries").employment),
      }),
      diversity: section(["coastal-economy"], {
        sectors: sectorRows.map(({ s, row }) => ({ label: s.label, establishments: qty(row.establishments), wages: qty(row.wages), employment: qty(row.employment), gdp: qty(row.gdp) })),
      }),
      "jobs-at-risk": section(["lodes", "tiger", "nfhl", "slr"], {
        sfha: { count: round(r.jobs.sfha), total: round(r.jobs.total) },
        // The combined (ocean-connected plus low-lying) count, the same series the sea level rise
        // sections draw, so the two topics cannot disagree.
        slr6: { count: round(r.jobs.slrWithLow[at6]), total: round(r.jobs.total) },
      }),
      wages: section(["coastal-economy"], wagesData(TOTAL_SECTORS, county, S.coastalState, S.coastalNation)),
      "total-jobs": !nesRow || !Object.keys(nesRow).length ? noteGap("total-economy/total-jobs", "source-geography") : section(["coastal-economy", "nes"], jobsEquation(
        qty(total.employment),
        nesRow["00"] ? nesCell("00") : { ...SUPPRESSED },
        TOTAL_SECTORS.map((s) => ({ label: s.label, selfEmployed: nesSector(s) })),
      )),
    };
    if (!nfhlCovered) totalEconomy["jobs-at-risk"] = noteGap("total-economy/jobs-at-risk", "no-nfhl-coverage");
    else if (!slrHasExtent) totalEconomy["jobs-at-risk"] = noteGap("total-economy/jobs-at-risk", "no-slr-extent");
  }

  // --- marine economy (full and delta tiers) ----------------------------------------------------------
  let marine = {};
  if (has("marine-economy")) {
    if (!S.ocean.length) throw new Error(entry.name + ": the tier says it is in ENOW, but ENOW has no rows for it");
    const county = S.ocean, all = rowOf(county, "Ocean Economy");
    const self = S.self, selfAll = rowOf(self, "Ocean Economy");
    const base = rowOf(S.base, "Total, all industries");
    marine = {
      measuring: section(["enow", "coastal-economy-marine-base"], {
        establishments: qty(all.establishments), jobs: qty(all.employment), wages: qty(all.wages), gdp: qty(all.gdp),
        denominator: round(base.employment),
      }),
      diversity: section(["enow"], {
        sectors: MARINE_SECTORS.map((s) => { const row = rowOf(county, s.api); return { label: s.label, establishments: qty(row.establishments), wages: qty(row.wages), employment: qty(row.employment), gdp: qty(row.gdp) }; }),
      }),
      wages: section(["enow"], wagesData(MARINE_SECTORS, county, S.oceanState, S.oceanNation)),
      "total-jobs": section(["enow", "enow-self"], jobsEquation(
        qty(all.employment),
        qty(selfAll.employment),
        MARINE_SECTORS.map((s) => ({ label: s.label, selfEmployed: qty(rowOf(self, s.api).employment) })),
      )),
    };
  }

  const topicSections = { flood, slr, "total-economy": totalEconomy, "marine-economy": marine };
  const topics = {};
  for (const t of schema.topics) {
    const state = schema.tiers[entry.tier].topics[t.id];
    topics[t.id] = { available: state.available, reason: state.reason, sections: state.available ? topicSections[t.id] : {} };
  }

  return {
    fips: entry.fips,
    slug: entry.slug,
    county: entry.name,
    tier: entry.tier,
    snapshot: snapshotDate,
    method: METHOD,
    generated,
    gauge: entry.gauge ? { id: entry.gauge, name: spine.gauges[entry.gauge].name, altGauge: entry.altGauge ? { id: entry.altGauge, name: spine.gauges[entry.altGauge].name } : null } : null,
    geometry: null,
    sources: pruneSources(sources, topics),
    topics,
  };
}

module.exports = { buildSnapshot, METHOD };
