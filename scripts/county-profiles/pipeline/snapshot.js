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
// is {value, partial: true}. A fourth value state (Phase 7) is `estimated`: an economy figure with imputed
// components carries {value, est: {share, step}} (see scripts/county-profiles/estimated.js).

const { projectionsFor } = require("../timing");
const reference = require("../../../site/_data/opcGaugeProjections.json");
const { buildEconomyTopics } = require("./economy-topics");

const USE = { ui: true, pdf: true, present: true };
const METHOD = 1; // Still in development: stays 1 until the tool is fully published (see docs/COUNTY-PROFILES.md).

const round = (n) => Math.round(n);
const round1 = (n) => Math.round(n * 10) / 10;

function pruneSources(sources, topics) {
  const cited = new Set();
  for (const t of Object.values(topics)) for (const s of Object.values(t.sections)) for (const k of s.sources) cited.add(k);
  return Object.fromEntries(Object.entries(sources).filter(([k]) => cited.has(k)));
}

function buildSnapshot({ entry, schema, spine, results, meta, ccap, econ, eco, nes, nfhlCovered, slrHasExtent, snapshotDate, generated, gaps }) {
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
      "natural-landscapes": !slrHasExtent || (ccap && ccap.value.slr[inc.length - 1].land <= 0) ? noSlr() : !ccapUsable ? noteGap("slr/natural-landscapes", "source-geography") : section(["ccap", "slr"], {
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

  // --- total and marine economy: public QCEW, see economy-topics.js -------------------------------------
  const jobsAtRiskTotal = has("total-economy")
    ? !nfhlCovered ? noteGap("total-economy/jobs-at-risk", "no-nfhl-coverage") : !slrHasExtent ? noteGap("total-economy/jobs-at-risk", "no-slr-extent")
    : section(["lodes", "tiger", "nfhl", "slr"], {
      sfha: { count: round(r.jobs.sfha), total: round(r.jobs.total) },
      // The combined (ocean-connected plus low-lying) count, the same series the sea level rise
      // sections draw, so the two topics cannot disagree.
      slr6: { count: round(r.jobs.slrWithLow[at6]), total: round(r.jobs.total) },
    }) : null;
  const economy = buildEconomyTopics({ entry, has, S, eco, nes, meta, jobsAtRiskTotal, gaps, use: USE });
  const { totalEconomy, marine } = economy;
  const estimation = economy.estimation;
  Object.assign(sources, economy.sources);

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
    gauge: gaugeBlock(entry, spine),
    geometry: null,
    sources: pruneSources(sources, topics),
    topics,
    ...(estimation ? { estimation } : {}),
  };
}

// The reference tide gauge and the OPC 2024 Appendix F projections behind it (the three recommended
// scenarios, all thirteen decades, feet above 2000). One gauge per county.
function gaugeBlock(entry, spine) {
  if (!entry.gauge) return null;
  return { id: entry.gauge, name: spine.gauges[entry.gauge].name, projections: projectionsFor(reference, entry.gauge) };
}

module.exports = { buildSnapshot, gaugeBlock, pruneSources, METHOD, USE };
