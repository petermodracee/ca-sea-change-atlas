#!/usr/bin/env node
// Packages one dated County Profiles snapshot for upload to Zenodo. Run by hand; it mints nothing.
//
//   node scripts/county-profiles/zenodo-package.js <YYYY-MM-DD>
//
// Writes zenodo-upload/<date>/ (gitignored) holding:
//   - <fips>-<slug>.json   a copy of each county JSON in that date's directory, under a readable name
//   - README.md            each county, its methodology version and its dated page URL
//   - zenodo-metadata.json the deposit metadata (title, creator, description, license, version,
//                          related identifiers linking the dated pages)
// The archive itself is not touched. One Zenodo version per snapshot date: a dated directory holds only
// the counties whose content changed that day, and so does the package. After the upload, add the DOI
// to site/data/county-profiles/dois.json (see docs/COUNTY-PROFILES.md, "DOIs").

const fs = require("fs");
const path = require("path");
const { DATA, DATED, readJson } = require("./pipeline/archive");

const ROOT = path.join(__dirname, "..", "..");
const SITE_URL = require(path.join(ROOT, "site/_data/site.js")).url;
const spine = require(path.join(ROOT, "site/_data/countySpine.json"));

const date = process.argv[2];
if (!date || !DATED.test(date)) { console.error("usage: node scripts/county-profiles/zenodo-package.js <YYYY-MM-DD>"); process.exit(2); }
const srcDir = path.join(DATA, date);
if (!fs.existsSync(srcDir)) { console.error("no dated snapshot " + date + " under " + path.relative(ROOT, DATA)); process.exit(1); }

const outDir = path.join(ROOT, "zenodo-upload", date);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const rows = [];
for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".json")).sort()) {
  const snap = readJson(path.join(srcDir, file));
  const county = spine.counties.find((c) => c.fips === snap.fips);
  if (!county) throw new Error(file + ": fips " + snap.fips + " is not in the county spine");
  const name = snap.fips + "-" + county.slug + ".json";
  fs.copyFileSync(path.join(srcDir, file), path.join(outDir, name));
  rows.push({ file: name, name: county.name, method: snap.method, url: SITE_URL + "/county-profiles/county/" + county.slug + "/" + date + "/" });
}
if (!rows.length) throw new Error(date + " holds no county JSON");

const lines = [
  "# CASCA County Profiles, snapshot " + date,
  "",
  "County-level flood hazard, sea level rise and economy exposure for California, from the California Sea Change Atlas (" + SITE_URL + "/county-profiles/).",
  "",
  "This is the snapshot of " + date + ". It holds " + (rows.length === spine.counties.length ? "all " + rows.length + " counties." : "the " + rows.length + " count" + (rows.length === 1 ? "y" : "ies") + " whose figures changed on that date; the other counties' figures are in the earlier versions of this record.") + " Each file is one county's snapshot JSON, exactly as published at " + SITE_URL + "/data/county-profiles/" + date + "/<fips>.json.",
  "",
  "| County | File | Methodology version | Dated page |",
  "|---|---|---|---|",
  ...rows.map((r) => "| " + r.name + " | " + r.file + " | " + r.method + " | " + r.url + " |"),
  "",
  "How the figures are computed: " + SITE_URL + "/county-profiles/about/methodology/. What changed between methodology versions: " + SITE_URL + "/county-profiles/about/changelog/.",
  "",
  "Licensed CC BY 4.0. Third-party source data keeps its own terms; see " + SITE_URL + "/about/licenses/.",
  "",
];
fs.writeFileSync(path.join(outDir, "README.md"), lines.join("\n"));

const metadata = {
  metadata: {
    title: "CASCA County Profiles",
    upload_type: "dataset",
    creators: [{ name: "Modracee, Peter" }],
    description: "County-level flood hazard, sea level rise, total economy and marine economy exposure for California counties, computed from public data for the California Sea Change Atlas. Snapshot of " + date + " (" + rows.length + " count" + (rows.length === 1 ? "y" : "ies") + "). Each file carries its own sources, vintages and methodology version.",
    access_right: "open",
    license: "cc-by-4.0",
    version: date,
    publication_date: date,
    related_identifiers: [
      { identifier: SITE_URL + "/county-profiles/", relation: "isDescribedBy", scheme: "url" },
      ...rows.map((r) => ({ identifier: r.url, relation: "isSourceOf", scheme: "url" })),
    ],
  },
};
fs.writeFileSync(path.join(outDir, "zenodo-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");

console.log("wrote " + path.relative(ROOT, outDir) + ": " + rows.length + " data file(s), README.md, zenodo-metadata.json");
