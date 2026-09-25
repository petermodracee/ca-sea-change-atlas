// The snapshot archive: what counts as a change, and where a snapshot is written.
//
//   site/data/county-profiles/latest/<fips>.json   the current snapshot, rewritten by every recompute
//   site/data/county-profiles/<date>/<fips>.json   a dated snapshot, minted only when a county's content differs
//
// A dated snapshot is never edited or overwritten (docs/COUNTY-PROFILES.md, "Archive rules").

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "..", "..", "site", "data", "county-profiles");
const DATED = /^\d{4}-\d{2}-\d{2}$/;

// `snapshot`, `generated` and each source's `retrieved` / `verified` say when a build ran, not what
// it found. Everything else (figures, vintages, method) is content.
function contentOf(snap) {
  const c = JSON.parse(JSON.stringify(snap));
  delete c.snapshot;
  delete c.generated;
  for (const s of Object.values(c.sources || {})) { delete s.retrieved; delete s.verified; }
  return c;
}

const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
const sameContent = (a, b) => stable(contentOf(a)) === stable(contentOf(b));

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const write = (f, snap) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(snap, null, 2) + "\n"); };

function datedDirs(dataDir = DATA) {
  return fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((d) => DATED.test(d) && fs.statSync(path.join(dataDir, d)).isDirectory()).sort() : [];
}

// Decide what a fresh build of one county does to the archive, and write it.
//   created    no previous snapshot: mint one
//   minted     content differs from the previous one: mint a new dated snapshot, update latest/
//   refreshed  content is the same: update latest/ (new retrieved/verified/generated stamps) and keep the
//              previous snapshot date, so no dated snapshot is added
function commitCounty(fresh, { dataDir = DATA, today }) {
  const fips = fresh.fips;
  const latestFile = path.join(dataDir, "latest", fips + ".json");
  const prev = fs.existsSync(latestFile) ? readJson(latestFile) : null;
  if (prev && sameContent(prev, fresh)) {
    write(latestFile, { ...fresh, snapshot: prev.snapshot });
    return { action: "refreshed", snapshot: prev.snapshot };
  }
  const next = { ...fresh, snapshot: today };
  const datedFile = path.join(dataDir, today, fips + ".json");
  if (fs.existsSync(datedFile)) {
    // A published snapshot is never overwritten: a fix minted the same day cannot replace it.
    throw new Error(fips + ": " + today + "/" + fips + ".json already exists with different content. A dated snapshot is never edited; re-run on a later date to mint the correction, and add a correction notice (site/_data/countyProfileCorrections.json).");
  }
  write(datedFile, next);
  write(latestFile, next);
  return { action: prev ? "minted" : "created", snapshot: today, previous: prev ? prev.snapshot : null };
}

module.exports = { DATA, DATED, contentOf, sameContent, datedDirs, commitCounty, readJson };
