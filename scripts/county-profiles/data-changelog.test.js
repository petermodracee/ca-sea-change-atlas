// Tests for data-changelog.js: node --test "scripts/**/*.test.js"

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { buildDataChangelog, changelogKind } = require("./data-changelog");

const DATA = path.join(__dirname, "..", "..", "site", "data", "county-profiles");
const spine = require("../../site/_data/countySpine.json");
const wording = require("../../site/_data/countyProfileChangelog.json");
const snap = (date, fips) => require(path.join(DATA, date, fips + ".json"));
const SF = "06075", NAPA = "06055";

test("an initial release, then a comparison with each county's own previous snapshot", () => {
  // Napa's 2026-10-22 snapshot is compared with 2026-09-24 even with a directory in between that lacks it.
  const archive = {
    "2026-09-24": { [SF]: snap("2026-09-24", SF), [NAPA]: snap("2026-09-24", NAPA) },
    "2026-10-01": { [SF]: snap("2026-10-22", SF) },
    "2026-10-22": { [NAPA]: snap("2026-10-22", NAPA) },
  };
  // The archive's dates do not match the files' own `snapshot`; the changelog keys on the directory.
  const entries = buildDataChangelog({ archive, spine, corrections: [], wording: { ...wording, notes: {} } });
  assert.deepEqual(entries.map((e) => [e.date, e.initial, e.countyCount]), [["2026-10-22", false, 1], ["2026-10-01", false, 1], ["2026-09-24", true, 2]]);
  assert.equal(entries[0].counties[0].previous, "2026-09-24");
  assert.equal(entries[1].counties[0].summary, "GDP figures changed in Total economy (Measuring, Diversity) and Marine economy (Measuring, Diversity).");
  assert.deepEqual(entries[1].vintages, ["BEA GDP by industry (marine detail): 2024 to 2025, 1 county"]);
  assert.equal(entries[1].label, "New source data");
});

test("a correction is labelled as one, never as no figure moved", () => {
  const archive = { "2026-09-24": { [SF]: snap("2026-09-24", SF) }, "2026-10-22": { [SF]: snap("2026-10-22", SF) } };
  const corrections = [{ fips: SF, snapshot: "2026-09-24", supersededBy: "2026-10-22", date: "2026-10-22", note: "x" }];
  const [e] = buildDataChangelog({ archive, spine, corrections, wording: { ...wording, notes: {} } });
  assert.equal(e.label, "Correction");
  assert.equal(e.counties[0].correction.note, "x");
  assert.equal(changelogKind("correction", wording), "Correction");
  assert.equal(changelogKind("tooling", wording), "No figure moved");
  assert.throws(() => changelogKind("update", wording), /not one of/);
});

test("the build fails rather than skipping an entry it cannot build", () => {
  const base = { spine, corrections: [], wording: { ...wording, notes: {} } };
  // A county first seen after the initial release has nothing to compare with.
  assert.throws(() => buildDataChangelog({ ...base, archive: { "2026-09-24": { [SF]: snap("2026-09-24", SF) }, "2026-10-22": { [NAPA]: snap("2026-10-22", NAPA) } } }), /no earlier dated snapshot/);
  // A dated snapshot identical in content to its previous one should never have been minted.
  assert.throws(() => buildDataChangelog({ ...base, archive: { "2026-09-24": { [SF]: snap("2026-09-24", SF) }, "2026-10-22": { [SF]: snap("2026-09-24", SF) } } }), /same content/);
  // A note for a date or county the archive does not have.
  const archive = { "2026-09-24": { [SF]: snap("2026-09-24", SF) } };
  assert.throws(() => buildDataChangelog({ ...base, archive, wording: { ...wording, notes: { "2027-01-01": { note: "x" } } } }), /no dated snapshot directory/);
  assert.throws(() => buildDataChangelog({ ...base, archive, wording: { ...wording, notes: { "2026-09-24": { counties: { [NAPA]: "x" } } } } }), /no snapshot that date/);
});
