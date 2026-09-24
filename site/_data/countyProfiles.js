const fs = require("fs");
const path = require("path");
const schema = require("../data/countyProfileSchema.json");
const spine = require("./countySpine.json");
const reference = require("./opcGaugeProjections.json");
const { validateSnapshot } = require("../../scripts/county-profiles/validate.js");
const { buildSectionModel } = require("../../scripts/county-profiles/section-models.js");
const { timingTable, compareGauges } = require("../../scripts/county-profiles/timing.js");
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
for (const g of new Set(spine.counties.flatMap((c) => [c.gauge, c.altGauge]).filter(Boolean))) {
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

// A real snapshot marks a section it cannot compute yet (its source, ENOW or C-CAP, is not in the
// pipeline) unavailable with the `pending-phase-3` reason. The pages keep showing that slot from
// the county's fixture until the pipeline ships it, so a county flips from fixture to real one
// section's source at a time with no template change. Each filled section carries `placeholder:
// true` and is labelled as placeholder on the page (see buildTopicSections). The snapshot file itself
// is untouched: the JSON download still says "unavailable, ships in Phase 3".
const PENDING = "pending-phase-3";
function withPlaceholders(real, fixture) {
  if (!fixture) return real;
  const profile = JSON.parse(JSON.stringify(real));
  for (const topic of schema.topics) {
    const sections = profile.topics[topic.id].sections;
    for (const def of topic.sections) {
      const sec = sections[def.id];
      const stand = fixture.topics[topic.id].sections[def.id];
      if (!sec || sec.available || sec.reason !== PENDING || !stand || !stand.available) continue;
      sections[def.id] = { ...JSON.parse(JSON.stringify(stand)), placeholder: true };
      for (const key of stand.sources) if (!profile.sources[key]) profile.sources[key] = fixture.sources[key];
    }
  }
  return profile;
}

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
      if (model && sec.placeholder) {
        const note = "Placeholder figures, not measurements of " + profile.county + " County: this section's data source is not in the pipeline yet and ships in Phase 3.";
        model.footnote = model.footnote ? note + " " + model.footnote : note;
      }
      return { def, sec, model };
    })
    .filter(Boolean);
}

// The headline figure for a topic (its first available section with a callout), used on the
// county landing page.
function headlineOf(sections) {
  const first = sections.find((s) => s.sec.available && !s.sec.placeholder && s.model && s.model.callout);
  return first ? first.model.callout : null;
}

// Which section titles in a topic are invented fixture data: every available section of a fixture
// (except the timing table, which is real, computed from the OPC file) and any section a real
// snapshot has filled from a fixture.
function placeholderTitlesOf(sections, wholeFixture) {
  return sections.filter((s) => s.sec.available && (s.sec.placeholder || (wholeFixture && s.def.kind !== "timing"))).map((s) => s.def.title);
}

function straddleOf(c) {
  if (!c.altGauge) return null;
  const diff = compareGauges(reference, c.gauge, c.altGauge, increments);
  if (!diff) return null;
  const a = spine.gauges[c.gauge].name, b = spine.gauges[c.altGauge].name;
  const bits = [];
  if (diff.maxDiff >= 5) bits.push("the years an increment is reached differ by up to " + diff.maxDiff + " years");
  if (diff.unreached) bits.push(diff.unreached + " of " + increments.length * 3 + " increment-and-scenario pairs are reached at one gauge by 2150 and not at the other");
  return {
    altGauge: c.altGauge,
    altName: b,
    text: c.name + " County straddles two sea level regimes. Its assigned gauge is " + a + "; at the " + b + " gauge " + bits.join(", and ") + ". Both timing tables are shown.",
  };
}

const counties = spine.counties
  .map((c) => {
    const real = latest[c.fips] || null;
    const profile = real ? withPlaceholders(real, fixtures[c.fips] || null) : fixtures[c.fips] || null;
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
    const straddle = straddleOf(c);
    const timing = hasSlr
      ? [
          { gauge: c.gauge, name: spine.gauges[c.gauge].name, rows: timingTable(reference, c.gauge, increments) },
          ...(straddle ? [{ gauge: c.altGauge, name: spine.gauges[c.altGauge].name, alt: true, rows: timingTable(reference, c.altGauge, increments) }] : []),
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
      })),
      gaugeName: c.gauge ? spine.gauges[c.gauge].name : null,
      straddle,
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

// The straddle rule is computed, never authored; San Mateo is the one county expected to trip it.
const straddling = counties.filter((c) => c.straddle).map((c) => c.slug);
if (JSON.stringify(straddling) !== JSON.stringify(["san-mateo"])) {
  throw new Error("straddle rule: expected only san-mateo to straddle, got " + JSON.stringify(straddling));
}

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
  incrementLabels: increments.map((f) => f + " ft"),
  reasons: Object.entries(schema.reasons).map(([id, r]) => ({ id, ...r })),
  // Counties in NOAA's ENOW list are exactly those with a marine-economy topic (full and delta tiers).
  enowCount: counties.filter((c) => c.coverage.find((t) => t.id === "marine-economy").available).length,
  gaugeGroups: Object.entries(spine.gauges)
    .map(([id, g]) => ({ id, name: g.name, counties: counties.filter((c) => c.gauge === id).map((c) => c.name) }))
    .filter((g) => g.counties.length),
};
