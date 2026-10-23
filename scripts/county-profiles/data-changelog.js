// The data changelog on /county-profiles/about/changelog/, built from the snapshot archive at build time, so a merged
// data PR updates the page with no hand edits. One entry per dated snapshot directory, newest first: the first is
// the initial release; each later one compares every county it holds with that county's own previous dated
// snapshot (which may be older than the previous directory) through snapshot-diff.js, the comparison the data PR's
// Changes section uses. Wording and notes are in site/_data/countyProfileChangelog.json.
//
// The build fails when an entry cannot be built: a dated snapshot with no earlier one that is not in the initial
// release, a dated snapshot whose content equals its previous one, or a note naming a date or county the archive
// does not have. A refresh that changed no figures mints no dated snapshot, so it has no entry.

const { diffSnapshots, sharedVintages } = require("./snapshot-diff");
const { sameContent } = require("./pipeline/archive");

// Every kind of changelog entry and the label it shows. The methodology changelog (site/_data/changelog/) uses the
// first three; the generated data changelog adds "data". There is no default: an unknown kind fails the build, so
// a data or correction entry can never read "No figure moved".
function changelogKind(type, wording) {
  const label = wording.kinds[type];
  if (!label) throw new Error("changelog entry type \"" + type + "\" is not one of " + Object.keys(wording.kinds).join(", ") + " (site/_data/countyProfileChangelog.json, kinds)");
  return label;
}

// What a county's collapsed detail shows: the figures that moved, state and period changes, availability, its own
// source vintages, and estimate provenance as one line.
function detailOf(d) {
  return {
    numbers: d.figures.filter((f) => f.type === "number").map((f) => ({ section: f.topicLabel + ", " + f.sectionShort, label: f.label, from: f.from.text, to: f.to.text, change: f.changeText })),
    states: d.figures.filter((f) => f.type === "state").map((f) => f.topicLabel + ", " + f.sectionShort + ": " + f.label + ": " + f.from.text + " to " + f.to.text),
    periods: d.periods.map((p) => p.text),
    availability: d.availability.map((a) => a.topicLabel + (a.sectionShort ? ", " + a.sectionShort : "") + ": " + a.from + " to " + a.to),
    vintages: [...d.sources.vintage.map((v) => v.name + ": " + v.from + " to " + v.to), ...d.sources.added.map((v) => v.name + ": added"), ...d.sources.removed.map((v) => v.name + ": no longer used")],
    estimation: d.estimation.length ? "The imputed share changed for " + d.estimation.length + (d.estimation.length === 1 ? " figure" : " figures") + (d.estimation.some((e) => e.effect !== "none") ? ", changing its ≈ marker or withheld state as listed above." : ", with no change to any ≈ marker or withheld state.") : null,
    other: d.other.map((o) => o.text),
  };
}

function buildDataChangelog({ archive, spine, corrections, wording }) {
  const dates = Object.keys(archive).sort();
  const byFips = new Map(spine.counties.map((c) => [c.fips, c]));
  const notes = wording.notes || {};
  for (const [date, n] of Object.entries(notes)) {
    if (!archive[date]) throw new Error("countyProfileChangelog.json: a note names " + date + ", which has no dated snapshot directory");
    for (const fips of Object.keys(n.counties || {})) if (!archive[date][fips]) throw new Error("countyProfileChangelog.json: a note for " + date + " names county " + fips + ", which has no snapshot that date");
  }
  for (const k of ["data", "correction", "method", "tooling"]) changelogKind(k, wording);

  const entries = dates.map((date, i) => {
    const fipsList = Object.keys(archive[date]).sort((a, b) => byFips.get(a).name.localeCompare(byFips.get(b).name));
    const note = notes[date] || {};
    const base = { date, countyCount: fipsList.length, note: note.note || null };
    if (i === 0) return { ...base, initial: true, label: wording.initialRelease, counties: [], vintages: [] };
    const counties = fipsList.map((fips) => {
      const c = byFips.get(fips);
      const prevDate = dates.slice(0, i).reverse().find((d) => archive[d][fips]);
      if (!prevDate) throw new Error("data changelog: " + date + "/" + fips + ".json has no earlier dated snapshot and " + date + " is not the initial release (" + dates[0] + ")");
      const before = archive[prevDate][fips], after = archive[date][fips];
      if (sameContent(before, after)) throw new Error("data changelog: " + date + "/" + fips + ".json has the same content as " + prevDate + "/" + fips + ".json; a dated snapshot is minted only when its content changes");
      const diff = diffSnapshots(before, after);
      const correction = corrections.find((x) => x.fips === fips && x.supersededBy === date) || null;
      const kind = diff.method ? "method" : correction ? "correction" : "data";
      return { fips, name: c.name, slug: c.slug, previous: prevDate, kind, kindLabel: changelogKind(kind, wording), summary: diff.summary, note: (note.counties || {})[fips] || null, correction, diff, detail: detailOf(diff) };
    });
    const kinds = [...new Set(counties.map((c) => c.kind))].sort((a, b) => ["data", "correction", "method"].indexOf(a) - ["data", "correction", "method"].indexOf(b));
    return { ...base, initial: false, label: kinds.map((k) => changelogKind(k, wording)).join(", "), counties, vintages: sharedVintages(counties.map((c) => c.diff)).map((v) => v.text) };
  });
  return entries.reverse();
}

module.exports = { buildDataChangelog, changelogKind };
