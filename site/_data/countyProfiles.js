const fs = require("fs");
const path = require("path");
const schema = require("../data/countyProfileSchema.json");
const spine = require("./countySpine.json");
const reference = require("./opcGaugeProjections.json");
const { validateSnapshot } = require("../../scripts/county-profiles/validate.js");
const { buildSectionModel } = require("../../scripts/county-profiles/section-models.js");
const { timingTable, envelope, SCENARIOS, SCENARIO_LABELS, MAP_MIN_FT, MAP_MAX_FT } = require("../../scripts/county-profiles/timing.js");
const { vintageText } = require("../../scripts/county-profiles/format.js");

// Everything the County Profiles pages need, derived from the spine, the schema, the OPC reference
// table and the snapshot files. Validation and the assertions below run here, so a malformed
// snapshot or a broken timing method fails the build.

const increments = schema.increments;

// --- build-time assertions on the timing method ---------------------------------------------------

const EXPECTED_SF = [
  ["2083", "2067", "2060"],
  ["2113", "2092", "2079"],
  ["2150", "2115", "2096"],
  [">2150", "2148", "2112"],
  [">2150", ">2150", "2131"],
];
const sfTable = timingTable(reference, "san-francisco", [2, 4, 6, 8, 10]).map((r) => r.cells.map((c) => c.text));
if (JSON.stringify(sfTable) !== JSON.stringify(EXPECTED_SF)) {
  throw new Error("timing method: the San Francisco table is " + JSON.stringify(sfTable) + ", expected " + JSON.stringify(EXPECTED_SF));
}
for (const g of new Set(spine.counties.map((c) => c.gauge).filter(Boolean))) {
  if (!reference.gauges[g]) throw new Error("spine names gauge " + g + ", which is not in opcGaugeProjections.json");
  if (!spine.gauges[g]) throw new Error("spine names gauge " + g + " but has no entry for it in gauges");
}

// --- snapshots: a real one in data/county-profiles/latest/ wins; a fixture is the fallback --------

function load(dir, fixture) {
  const found = {};
  if (!fs.existsSync(dir)) return found;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const snap = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    validateSnapshot(snap, { schema, spine, file, fixture });
    found[snap.fips] = snap;
  }
  return found;
}
const latest = load(path.join(__dirname, "..", "data", "county-profiles", "latest"), false);
const fixtures = load(path.join(__dirname, "countyProfileFixtures"), true);

// A county with no snapshot in latest/ falls back to a hand-written fixture if one exists (none ships
// since Phase 3: all 27 counties have a real snapshot). A section the pipeline could not compute is
// unavailable in the snapshot itself, with a reason from the schema's closed set, and renders as a
// dashed block stating it in position.

// --- per-county derivations ------------------------------------------------------------------------

function sourceViews(profile) {
  const out = {};
  for (const [key, s] of Object.entries(profile.sources)) {
    out[key] = {
      key,
      label: s.label,
      url: s.url,
      inline: vintageText(s.vintage, "short"),
      full: vintageText(s.vintage, "full"),
      retrieved: s.retrieved,
      verified: s.verified,
    };
  }
  return out;
}

// One topic's rendered sections: {def, sec, model}, filtered to sections shown in the web UI.
function buildTopicSections(profile, topicDef) {
  const topic = profile.topics[topicDef.id];
  return topicDef.sections
    .map((def) => {
      const sec = topic.sections[def.id];
      if (!sec.use.ui) return null;
      const model = sec.available ? buildSectionModel({ county: profile.county, topicId: topicDef.id, def, data: sec.data, increments }) : null;
      return { def, sec, model };
    })
    .filter(Boolean);
}

// The headline figure for a topic (its first available section with a callout), used on the
// county landing page.
function headlineOf(sections) {
  const first = sections.find((s) => s.sec.available && s.model && s.model.callout);
  return first ? first.model.callout : null;
}

// Which section titles in a topic are invented fixture data: every available section of a fixture
// (except the timing table, which is real, computed from the OPC file).
function placeholderTitlesOf(sections, wholeFixture) {
  return sections.filter((s) => s.sec.available && wholeFixture && s.def.kind !== "timing").map((s) => s.def.title);
}

const counties = spine.counties
  .map((c) => {
    const real = latest[c.fips] || null;
    const profile = real || fixtures[c.fips] || null;
    const coverage = schema.topics.map((t) => {
      // A snapshot's topic states are validated to equal its tier's rule, so either source gives the same answer.
      const state = profile ? profile.topics[t.id] : schema.tiers[c.tier].topics[t.id];
      return {
        id: t.id,
        slug: t.slug,
        label: t.label,
        available: state.available,
        reason: state.reason,
        reasonLabel: state.reason ? schema.reasons[state.reason].label : null,
      };
    });
    const hasSlr = coverage.find((t) => t.id === "slr").available && c.gauge;
    const timing = hasSlr
      ? [
          { gauge: c.gauge, name: spine.gauges[c.gauge].name, rows: timingTable(reference, c.gauge, increments) },
        ]
      : null;

    // A topic gets sections/a headline/a page only when the county has a profile and the topic is
    // available for it — "a topic the county has no data for at all gets no page."
    const topicSections = profile
      ? Object.fromEntries(coverage.filter((t) => t.available).map((t) => [t.id, buildTopicSections(profile, schema.topics.find((s) => s.id === t.id))]))
      : {};

    return {
      ...c,
      tierLabel: schema.tiers[c.tier].label,
      coverage: coverage.map((t) => ({
        ...t,
        headline: topicSections[t.id] ? headlineOf(topicSections[t.id]) : null,
        hasPage: Boolean(topicSections[t.id]),
        // Sections of an available topic that have no data: each states its reason where it sits on
        // the topic's own page, and is listed on the landing page too, so a gap inside a topic is
        // as visible as a whole unavailable topic.
        sectionGaps: (topicSections[t.id] || []).filter((x) => !x.sec.available).map((x) => ({ title: x.def.title, reason: x.sec.reason, reasonLabel: schema.reasons[x.sec.reason].label })),
      })),
      gaugeName: c.gauge ? spine.gauges[c.gauge].name : null,
      timing,
      profile,
      isFixture: Boolean(profile && profile.fixture),
      topicSections,
      sources: profile ? sourceViews(profile) : null,
      // Fixtures currently carry exactly one dated snapshot; Phase 5 appends older ones here.
      snapshots: profile ? [{ date: profile.snapshot, isCurrent: true }] : [],
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));


const tiers = Object.entries(schema.tiers).map(([id, t]) => {
  const members = counties.filter((c) => c.tier === id);
  return { id, label: t.label, summary: t.summary, counties: members, names: members.map((c) => c.name) };
});

// The "Sources used on this page" table for a topic's About slide: one row per source cited by any
// of its sections, with which sections cited it.
function sourcesUsedBy(profile, sections) {
  const usedFor = new Map();
  for (const s of sections) {
    if (!s.sec.available) continue;
    for (const key of s.sec.sources) {
      if (!usedFor.has(key)) usedFor.set(key, []);
      usedFor.get(key).push(s.def.title);
    }
  }
  return Array.from(usedFor.entries()).map(([key, titles]) => {
    const s = profile.sources[key];
    return { key, label: s.label, url: s.url, usedFor: titles.join(", "), vintage: vintageText(s.vintage, "full"), retrieved: s.retrieved };
  });
}

// One entry per (county, topic) that gets its own deck page — pagination data for
// site/county-profiles/topic.njk and topic-snapshot.njk.
const topicPages = [];
for (const county of counties) {
  if (!county.profile) continue;
  for (const topicDef of schema.topics) {
    const sections = county.topicSections[topicDef.id];
    if (!sections) continue;
    topicPages.push({
      county,
      topic: topicDef,
      sections,
      placeholders: placeholderTitlesOf(sections, county.isFixture),
      sourcesUsed: sourcesUsedBy(county.profile, sections),
    });
  }
}

module.exports = {
  reasonsById: schema.reasons,
  counties,
  // One landing page per county that has a snapshot, at its current snapshot's date.
  landingSnapshotPages: counties.filter((c) => c.profile),
  topicPages,
  tiers,
  floodOnly: tiers.find((t) => t.id === "flood-only"),
  topics: schema.topics,
  increments,
  mapMinFt: MAP_MIN_FT,
  mapMaxFt: MAP_MAX_FT,
  // Appendix F for every gauge the spine uses, three recommended scenarios, every decade, each cell
  // flagged when it sits outside the heights the map shows. For /county-profiles/about/.
  gaugeTables: Object.entries(spine.gauges).map(([id, g]) => ({
    id,
    name: g.name,
    table: reference.gauges[id].table,
    counties: counties.filter((c) => c.gauge === id).map((c) => c.name),
    decades: reference.decades,
    byIncrement: timingTable(reference, id, increments),
    rows: SCENARIOS.map((sc) => ({
      scenario: sc,
      label: SCENARIO_LABELS[sc],
      cells: reference.decades.map((d, i) => { const feet = reference.gauges[id][sc][i]; return { year: d, feet, text: feet.toFixed(1), flag: envelope(feet) }; }),
    })),
  })),
  incrementLabels: increments.map((f) => f + " ft"),
  reasons: Object.entries(schema.reasons).map(([id, r]) => ({ id, ...r })),
  // Counties in NOAA's ENOW list are exactly those with a marine-economy topic (full and delta tiers).
  enowCount: counties.filter((c) => c.coverage.find((t) => t.id === "marine-economy").available).length,
  gaugeGroups: Object.entries(spine.gauges)
    .map(([id, g]) => ({ id, name: g.name, counties: counties.filter((c) => c.gauge === id).map((c) => c.name) }))
    .filter((g) => g.counties.length),
};
