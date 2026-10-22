// Tests for snapshot-diff.js: node --test scripts/county-profiles/
//
// Two pairs. The fixture pair is a committed snapshot (San Francisco, 2026-09-24) and a copy with one change of each
// kind made below. The real pair is PR #45: San Francisco's latest/ on main when #45 was open (eeaf63a, its merge
// base) against #45's head. #45 is closed, so its head is fetched with `git fetch origin pull/45/head` when it is not
// already in the clone; with no network the test is skipped, and the same content is checked through the archive
// pair below (#46 minted an identical 2026-10-22 snapshot).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFileSync } = require("child_process");
const { diffSnapshots, sharedVintages } = require("./snapshot-diff");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "site", "data", "county-profiles");
const clone = (x) => JSON.parse(JSON.stringify(x));
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const PR45_BASE = "eeaf63aec733cd0f12f84b97848abefadf67dc62";
const PR45_HEAD = "784bd4841efcc9cb99cf987801cf44e5039aa5bc";
const SF = "site/data/county-profiles/latest/06075.json";

function pr45() {
  const have = () => { try { git("cat-file", "-e", PR45_HEAD + "^{commit}"); return true; } catch (_) { return false; } };
  if (!have()) { try { git("fetch", "-q", "origin", "pull/45/head"); } catch (_) { /* offline */ } }
  if (!have()) return null;
  return { before: JSON.parse(git("show", PR45_BASE + ":" + SF)), after: JSON.parse(git("show", PR45_HEAD + ":" + SF)) };
}

// What PR #45 changed, from its raw diff: GDP only.
function checkPr45(d) {
  assert.equal(d.summary, "GDP figures changed in Total economy (Measuring, Diversity) and Marine economy (Measuring, Diversity).");
  assert.deepEqual(d.sources.vintage.map((v) => [v.key, v.from, v.to]), [["bea-marine", "2024", "2025"]]);
  assert.deepEqual([d.sources.added, d.sources.removed, d.availability, d.other], [[], [], [], []]);
  assert.deepEqual(d.periods.map((p) => p.text), ["Marine economy GDP: 2024 to 2025"]);
  assert.deepEqual(d.periods[0].sections, ["Measuring", "Diversity"]);
  // The three source entries that only moved position (enow-self, coastal-economy, nes) are not changes.
  assert.ok(!JSON.stringify(d).match(/enow-self|coastal-economy|"nes"/));
  assert.equal(d.method, null);
  assert.ok(d.figures.every((f) => f.type === "number" && f.noun === "GDP"));

  const fig = (topic, section, label) => d.figures.find((f) => f.topicId === topic && f.sectionId === section && f.label === label);
  assert.equal(fig("total-economy", "measuring", "GDP").changeText, "+2.2%");
  const sectors = d.figures.filter((f) => f.topicId === "total-economy" && f.sectionId === "diversity");
  assert.equal(sectors.length, 10, "every total economy sector's GDP but Public administration's (withheld both times)");
  assert.equal(Math.min(...sectors.map((f) => f.change)).toFixed(3), "-0.064");
  assert.equal(Math.max(...sectors.map((f) => f.change)).toFixed(3), "0.058");
  assert.equal(fig("marine-economy", "measuring", "GDP").changeText, "+3.4%");
  assert.deepEqual(d.figures.filter((f) => f.notable).map((f) => [f.label, f.changeText]), [["Living resources, GDP", "+11.5%"], ["Marine construction, GDP", "+22.8%"]]);
  assert.equal(fig("marine-economy", "diversity", "Tourism and recreation, GDP").changeText, "+3.0%");
  assert.equal(d.figures.length, 15);

  // The estimated share of marine GDP, 1.98% to 0.92%: provenance only, so not a figure change.
  const est = d.estimation.find((e) => e.topicId === "marine-economy" && e.sectionId === "measuring");
  assert.deepEqual(est.fields.find((f) => f.field === "share"), { field: "share", from: 0.0198, to: 0.0092 });
  assert.equal(est.effect, "none");
  assert.ok(d.estimation.every((e) => e.effect === "none"));

  // Total economy GDP moved with no change of source year (BEA revised 2025): unexplained. Marine GDP is explained.
  assert.ok(d.unexplained.length === 11 && d.unexplained.every((f) => f.topicId === "total-economy"));
}

test("PR #45: San Francisco, main against the PR's head", (t) => {
  const pair = pr45();
  if (!pair) return t.skip("PR #45's head is not in the clone and could not be fetched");
  checkPr45(diffSnapshots(pair.before, pair.after));
});

test("the same change through the archive: 2026-09-24 against 2026-10-22", () => {
  const before = require(path.join(DATA, "2026-09-24", "06075.json"));
  const after = require(path.join(DATA, "2026-10-22", "06075.json"));
  checkPr45(diffSnapshots(before, after));
});

test("stamps, key order and source order are not changes", () => {
  const before = require(path.join(DATA, "2026-09-24", "06075.json"));
  const after = clone(before);
  after.snapshot = "2027-01-05";
  after.generated = "2027-01-05T09:00:00Z";
  after.attribution = "something else";
  for (const s of Object.values(after.sources)) { s.retrieved = "2027-01-05"; s.verified = "2027-01-05"; }
  after.sources = Object.fromEntries(Object.entries(after.sources).reverse());
  after.topics.flood.sections["people-at-risk"].data = Object.fromEntries(Object.entries(after.topics.flood.sections["people-at-risk"].data).reverse());
  const d = diffSnapshots(before, after);
  assert.equal(d.stampsOnly, true);
  assert.equal(d.summary, "No figures changed; sources re-verified.");
});

test("fixture pair: one change of each kind", () => {
  const before = require(path.join(DATA, "2026-09-24", "06075.json"));
  const after = clone(before);
  const sec = (t, s) => after.topics[t].sections[s];
  // A number.
  sec("flood", "people-at-risk").data.items[0].count += 100;
  // Published to zero, and to withheld with a reason.
  sec("flood", "critical-facilities").data.items[0].outside = 0;
  sec("total-economy", "diversity").data.sectors[0].wages = { suppressed: true, reason: "weak-share" };
  // Estimated, provenance only: no figure change.
  sec("marine-economy", "diversity").data.sectors[0].employment.est.share = 0.2;
  // Provenance that flips the ≈ marker.
  sec("marine-economy", "diversity").data.sectors[5].employment.est.share = 0.3;
  // A year.
  sec("total-economy", "wages").data.year = 2024;
  // A section becomes unavailable, with its reason code.
  Object.assign(sec("flood", "natural-features"), { available: false, reason: "source-geography", sources: [], data: null });
  // A source vintage, an added source and a removed one.
  after.sources.acs.vintage = { kind: "year", year: 2025 };
  after.sources.extra = { label: "Extra", url: "https://example.org/", vintage: { kind: "year", year: 2026 }, retrieved: "x", verified: "x" };
  delete after.sources.opc;
  const d = diffSnapshots(before, after);

  const by = (label) => d.figures.find((f) => f.label === label);
  assert.equal(by("Population, in the floodplain").type, "number");
  assert.equal(by("Population, in the floodplain").explained, true, "ACS changed vintage");
  const zero = d.figures.find((f) => f.sectionId === "critical-facilities" && f.measure === "outside the floodplain");
  assert.equal(zero.type, "state");
  assert.equal(zero.to.state, "zero");
  assert.equal(zero.change, null, "a state change is never a percentage");
  const withheld = by("Construction, Wages");
  assert.deepEqual([withheld.type, withheld.to.state, withheld.change], ["state", "withheld (weak-share)", null]);
  assert.equal(withheld.explained, false, "QCEW did not change vintage");
  assert.ok(!by("Living resources, Employment"), "an estimation-only change is not a figure change");
  assert.equal(d.estimation.find((e) => e.label === "Living resources, Employment").effect, "none");
  const flip = by("Tourism and recreation, Employment");
  assert.deepEqual([flip.from.state, flip.to.state], ["published", "estimated (≈)"]);
  assert.equal(d.estimation.find((e) => e.label === "Tourism and recreation, Employment").effect, "marker");
  assert.deepEqual(d.periods.map((p) => p.text), ["Total economy wage comparison: 2023 to 2024"]);
  assert.deepEqual(d.availability.map((a) => [a.sectionShort, a.from, a.to]), [["Greener Future", "available", "unavailable (source-geography)"]]);
  assert.deepEqual(d.sources.vintage.map((v) => [v.key, v.from, v.to]), [["acs", "2024", "2025"]]);
  assert.deepEqual(d.sources.added.map((v) => v.key), ["extra"]);
  assert.deepEqual(d.sources.removed.map((v) => v.key), ["opc"]);
  assert.equal(d.summary, "Population and facility figures changed in Flood hazard (People at Risk, Flooded Facilities); wage figures changed in Total economy (Diversity); job figures changed in Marine economy (Diversity). 3 figures changed state. Flood hazard, Greener Future: available to unavailable (source-geography).");
});

test("shared vintages group across counties, and a per-county date is one line", () => {
  const base = require(path.join(DATA, "2026-09-24", "06075.json"));
  const mk = (usgs) => { const a = clone(base); a.sources["bea-marine"].vintage = { kind: "year", year: 2026 }; a.sources.usgs.vintage = { kind: "date", date: usgs }; return a; };
  const lines = sharedVintages([diffSnapshots(base, mk("2027-01-01")), diffSnapshots(base, mk("2027-02-01"))]).map((v) => v.text);
  assert.deepEqual(lines, ["BEA GDP by industry (marine detail): 2024 to 2026, 2 counties", "USGS National Structures Dataset: new vintage in 2 counties, dates vary by county"]);
});
