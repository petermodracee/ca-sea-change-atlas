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
const { attributionFor } = require("../citation");

const USE = { ui: true, pdf: true, present: true };
const METHOD = 1; // Still in development: stays 1 until the tool is fully published (see docs/COUNTY-PROFILES.md).

const round = (n) => Math.round(n);
const round1 = (n) => Math.round(n * 10) / 10;

function pruneSources(sources, topics) {
  const cited = new Set();
  for (const t of Object.values(topics)) for (const s of Object.values(t.sections)) for (const k of s.sources) cited.add(k);
  return Object.fromEntries(Object.entries(sources).filter(([k]) => cited.has(k)));
}

const gapOf = (reason) => ({ available: false, reason, use: { ...USE }, sources: [], data: null });
const sectionOf = (sources, data) => ({ available: true, reason: null, use: { ...USE }, sources, data });

// C-CAP: the source entry and the two sections that read it. buildSnapshot and the pipeline's
// --ccap-only mode both go through these, so a land-cover recompute cannot drift from a full run.
const CCAP_USABLE_SHARE = 0.5; // a county is usable if C-CAP left at most this share of its land as background

function ccapSource(meta) {
  return { label: "NOAA C-CAP regional land cover", url: "https://coast.noaa.gov/digitalcoast/data/ccapregional.html", vintage: { kind: "period", start: "1996-01-01", end: "2021-12-31" }, retrieved: meta.ccap.retrieved, verified: meta.verified.ccap };
}

// `noteGap(where, reason)` records the gap and returns the unavailable section, as in buildSnapshot.
function naturalFeaturesSection({ ccap, nfhlCovered, noteGap }) {
  if (!nfhlCovered) return noteGap("flood", "no-nfhl-coverage");
  if (!(ccap && ccap.value.uncoveredShare <= CCAP_USABLE_SHARE)) return noteGap("flood/natural-features", "source-geography");
  const f = ccap.value.flood;
  return sectionOf(["ccap", "nfhl"], {
    items: [
      { label: "Inside the floodplain", count: round1(f.addedInsideSqMi), total: round1(f.developedInsideSqMi), unit: "square miles" },
      { label: "Outside the floodplain", count: round1(f.addedOutsideSqMi), total: round1(f.developedOutsideSqMi), unit: "square miles" },
    ],
    naturalSqMi: round1(f.naturalInsideSqMi),
    floodplainSqMi: round1(f.floodplainLandSqMi),
  });
}

function naturalLandscapesSection({ ccap, slrHasExtent, increments, noteGap }) {
  if (!slrHasExtent || (ccap && ccap.value.slr[increments.length - 1].land <= 0)) return noteGap("slr", "no-slr-extent");
  if (!(ccap && ccap.value.uncoveredShare <= CCAP_USABLE_SHARE)) return noteGap("slr/natural-landscapes", "source-geography");
  return sectionOf(["ccap", "slr"], {
    increments,
    classes: [
      { label: "Wetlands", values: ccap.value.slr.map((c) => round1(c.wetland)) },
      { label: "Upland", values: ccap.value.slr.map((c) => round1(c.upland)) },
      { label: "Other", values: ccap.value.slr.map((c) => round1(c.other)) },
    ],
  });
}

function buildSnapshot({ entry, schema, spine, results, meta, ccap, econ, eco, nes, nfhlCovered, slrHasExtent, snapshotDate, generated, gaps }) {
  const inc = schema.increments;
  const r = results;
  const has = (topic) => schema.tiers[entry.tier].topics[topic].available;
  const people = (m) => ({ total: round(r.people[m].total), sfha: round(r.people[m].sfha), slr: r.people[m].slr.map(round), slrLow: r.people[m].slrWithLow.map(round) });
  const pop = people("pop"), old = people("over65"), poor = people("poverty");
  const facilityLabels = { schools: "Schools", police: "Police stations", fire: "Fire stations", medical: "Medical facilities" };
  const facKeys = Object.keys(facilityLabels);

  const section = sectionOf;
  const noteGap = (where, reason) => { gaps.push(where + ": " + reason); return gapOf(reason); };

  const S = econ ? econ.value : null;
  const vintageYear = (year) => ({ kind: "year", year });
  const sources = {
    nfhl: { label: "FEMA National Flood Hazard Layer", url: "https://www.fema.gov/flood-maps/national-flood-hazard-layer", vintage: meta.nfhl.effStart ? { kind: "period", start: meta.nfhl.effStart, end: meta.nfhl.effEnd } : null, retrieved: meta.nfhl.retrieved, verified: meta.verified.nfhl },
    acs: { label: "Census ACS 5-year estimates (2020–2024)", url: "https://www.census.gov/programs-surveys/acs/data.html", vintage: vintageYear(2024), retrieved: meta.acs.retrieved, verified: meta.verified.acs },
    tiger: { label: "Census 2020 tabulation blocks (TIGERweb)", url: "https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/Tracts_Blocks/MapServer", vintage: vintageYear(2020), retrieved: meta.tiger.retrieved, verified: meta.verified.tiger },
    usgs: { label: "USGS National Structures Dataset", url: "https://data.usgs.gov/datacatalog/data/USGS:db4fb1b6-1282-4e5b-9866-87a68912c5d1", vintage: { kind: "date", date: meta.usgs.latestLoad }, retrieved: meta.usgs.retrieved, verified: meta.verified.usgs },
    openfema: { label: "OpenFEMA NFIP claims", url: "https://www.fema.gov/openfema-data-page/nfip-redacted-claims-v3", vintage: { kind: "date", date: meta.openfema.asOf }, retrieved: meta.openfema.retrieved, verified: meta.verified.openfema },
    slr: { label: "NOAA Sea Level Rise Viewer inundation extents", url: "https://coast.noaa.gov/slrdata/", vintage: { kind: "year", year: 2026 }, retrieved: meta.slr.retrieved, verified: meta.verified.slr },
    lodes: { label: "LEHD LODES8 workplace area characteristics", url: "https://lehd.ces.census.gov/data/lodes/LODES8/ca/wac/", vintage: vintageYear(meta.lodes.year), retrieved: meta.lodes.retrieved, verified: meta.verified.lodes },
    ccap: ccapSource(meta),
    opc: { label: "California Ocean Protection Council, State of California Sea Level Rise Guidance: 2024 Science & Policy Update, Appendix 2", url: "https://opc.ca.gov/wp-content/uploads/2024/05/California-Sea-Level-Rise-Guidance-2024-508.pdf", vintage: vintageYear(2024), retrieved: snapshotDate, verified: snapshotDate },
  };

  // --- flood hazard ---------------------------------------------------------------------------------
  const noNfhl = () => noteGap("flood", "no-nfhl-coverage");
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
    "natural-features": naturalFeaturesSection({ ccap, nfhlCovered, noteGap }),
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
      "natural-landscapes": naturalLandscapesSection({ ccap, slrHasExtent, increments: inc, noteGap }),
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
    // The compiled figures' license, and the citation for this date (archive.js rewrites it with `snapshot`).
    license: { ...schema.snapshotLicense },
    attribution: attributionFor({ county: entry.name, slug: entry.slug, snapshot: snapshotDate }),
    gauge: gaugeBlock(entry, spine),
    geometry: null,
    sources: pruneSources(sources, topics),
    topics,
    ...(estimation ? { estimation } : {}),
  };
}

// The reference tide gauge and the OPC 2024 Appendix 2 projections behind it (the three recommended
// scenarios, all thirteen decades, feet above 2000). One gauge per county.
function gaugeBlock(entry, spine) {
  if (!entry.gauge) return null;
  return { id: entry.gauge, name: spine.gauges[entry.gauge].name, projections: projectionsFor(reference, entry.gauge) };
}

module.exports = { buildSnapshot, gapOf, ccapSource, naturalFeaturesSection, naturalLandscapesSection, gaugeBlock, pruneSources, METHOD, USE };
