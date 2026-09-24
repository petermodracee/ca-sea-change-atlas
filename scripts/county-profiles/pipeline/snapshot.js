// Turns the intersect results into a snapshot object matching site/data/countyProfileSchema.json.
// Sections whose sources are not in the pipeline yet (ENOW, C-CAP) are written as unavailable with
// the `pending-phase-3` reason, never as zeros or placeholders.

const PENDING = "pending-phase-3";
const USE = { ui: true, pdf: true, present: true };

const round = (n) => Math.round(n);
const round1 = (n) => Math.round(n * 10) / 10;

function pendingSection() {
  return { available: false, reason: PENDING, use: { ...USE }, sources: [], data: null };
}
function section(sources, data) {
  return { available: true, reason: null, use: { ...USE }, sources, data };
}

function buildSnapshot({ entry, schema, spine, results, meta, snapshotDate, generated, opcSource }) {
  const inc = schema.increments;
  const r = results;
  const people = (m) => ({ total: round(r.people[m].total), sfha: round(r.people[m].sfha), slr: r.people[m].slr.map(round), slrLow: r.people[m].slrWithLow.map(round) });

  const pop = people("pop"), old = people("over65"), poor = people("poverty");
  const facilityLabels = { schools: "Schools", police: "Police stations", fire: "Fire stations", medical: "Medical facilities" };
  const facKeys = Object.keys(facilityLabels);

  const sources = {
    nfhl: { label: "FEMA National Flood Hazard Layer", url: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer", vintage: { kind: "period", start: meta.nfhl.effStart, end: meta.nfhl.effEnd }, retrieved: meta.nfhl.retrieved, verified: meta.verified.nfhl },
    acs: { label: "Census ACS 5-year estimates (2020–2024)", url: "https://www.census.gov/programs-surveys/acs/data.html", vintage: { kind: "year", year: 2024 }, retrieved: meta.acs.retrieved, verified: meta.verified.acs },
    tiger: { label: "Census 2020 tabulation blocks (TIGERweb)", url: "https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/Tracts_Blocks/MapServer", vintage: { kind: "year", year: 2020 }, retrieved: meta.tiger.retrieved, verified: meta.verified.tiger },
    usgs: { label: "USGS National Structures Dataset", url: "https://www.usgs.gov/core-science-systems/ngp/tnm-corps/structures", vintage: { kind: "date", date: meta.usgs.latestLoad }, retrieved: meta.usgs.retrieved, verified: meta.verified.usgs },
    openfema: { label: "OpenFEMA NFIP claims", url: "https://www.fema.gov/openfema-data-page/nfip-redacted-claims-v3", vintage: { kind: "date", date: meta.openfema.asOf }, retrieved: meta.openfema.retrieved, verified: meta.verified.openfema },
    slr: { label: "NOAA Sea Level Rise Viewer inundation extents", url: "https://coast.noaa.gov/slrdata/", vintage: null, retrieved: meta.slr.retrieved, verified: meta.verified.slr },
    lodes: { label: "LEHD LODES8 workplace area characteristics", url: "https://lehd.ces.census.gov/data/lodes/LODES8/ca/wac/", vintage: { kind: "year", year: meta.lodes.year }, retrieved: meta.lodes.retrieved, verified: meta.verified.lodes },
    opc: opcSource,
  };

  const flood = {
    "people-at-risk": section(["acs", "tiger", "nfhl"], {
      items: [
        { label: "Population", count: pop.sfha, total: pop.total, unit: "residents" },
        { label: "Aged 65 and over", count: old.sfha, total: old.total, unit: "residents aged 65 and over" },
        { label: "Below the poverty line", count: poor.sfha, total: poor.total, unit: "residents below the poverty line" },
      ],
      landInsideSqMi: round1(r.landInsideSqMi),
      landTotalSqMi: round1(r.landTotalSqMi),
    }),
    "critical-facilities": section(["usgs", "nfhl"], {
      items: facKeys.map((k) => ({ label: facilityLabels[k], inside: r.facilities[k].sfha, outside: r.facilities[k].total - r.facilities[k].sfha })),
    }),
    "homes-at-risk": section(["openfema"], {
      items: r.byPeriod.filter((p) => p.start >= 1996).map((p) => ({ period: p.period, amount: round(p.amount) })),
      claims: r.byPeriod.filter((p) => p.start >= 1996).reduce((s, p) => s + p.claimsAll, 0),
    }),
    "jobs-at-risk": section(["lodes", "tiger", "nfhl"], { count: round(r.jobs.sfha), total: round(r.jobs.total) }),
    "natural-features": pendingSection(),
  };

  const slr = {
    "people-at-risk": section(["acs", "tiger", "slr"], {
      increments: inc,
      measures: [
        { label: "Population", unit: "residents", total: pop.total, counts: pop.slr, countsWithLow: pop.slrLow },
        { label: "Aged 65 and over", unit: "residents aged 65 and over", total: old.total, counts: old.slr, countsWithLow: old.slrLow },
        { label: "Below the poverty line", unit: "residents below the poverty line", total: poor.total, counts: poor.slr, countsWithLow: poor.slrLow },
      ],
    }),
    "critical-facilities": section(["usgs", "slr"], {
      increments: inc,
      measures: facKeys.map((k) => ({ label: facilityLabels[k], unit: "facilities", total: r.facilities[k].total, counts: r.facilities[k].slr, countsWithLow: r.facilities[k].slrWithLow })),
    }),
    "jobs-at-risk": section(["lodes", "tiger", "slr"], { increments: inc, total: round(r.jobs.total), counts: r.jobs.slr.map(round), countsWithLow: r.jobs.slrWithLow.map(round) }),
    "natural-landscapes": pendingSection(),
    "when-to-act": section(["opc"], {}),
  };

  const at6 = inc.indexOf(6);
  const totalEconomy = {
    measuring: pendingSection(),
    diversity: pendingSection(),
    "jobs-at-risk": section(["lodes", "tiger", "nfhl", "slr"], {
      sfha: { count: round(r.jobs.sfha), total: round(r.jobs.total) },
      // The combined (ocean-connected plus low-lying) count, the same series the sea level rise
      // sections draw, so the two topics cannot disagree.
      slr6: { count: round(r.jobs.slrWithLow[at6]), total: round(r.jobs.total) },
    }),
    wages: pendingSection(),
    "total-jobs": pendingSection(),
  };

  const topicSections = { flood, slr, "total-economy": totalEconomy, "marine-economy": Object.fromEntries(schema.topics.find((t) => t.id === "marine-economy").sections.map((s) => [s.id, pendingSection()])) };
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
    method: 1,
    generated,
    gauge: entry.gauge ? { id: entry.gauge, name: spine.gauges[entry.gauge].name, altGauge: entry.altGauge ? { id: entry.altGauge, name: spine.gauges[entry.altGauge].name } : null } : null,
    geometry: null,
    sources,
    topics,
  };
}

module.exports = { buildSnapshot, PENDING };
