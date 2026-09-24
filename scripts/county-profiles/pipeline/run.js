#!/usr/bin/env node
// County Profiles pipeline: fetch every source for one county, run the block-level intersect, and
// write site/data/county-profiles/latest/<fips>.json after validating it.
//
//   node scripts/county-profiles/pipeline/run.js 06059 [--refresh]
//
// --refresh   ignore the download cache and re-fetch every source
//
// Raw downloads live in scripts/county-profiles/.cache/ (gitignored). A full diagnostics report,
// including the sensitivity figures and everything the reconciliation in docs/DECISIONS.md cites,
// is written next to them as report-<fips>.json.

const fs = require("fs");
const path = require("path");
const S = require("./sources");
const { compute } = require("./intersect");
const { buildSnapshot } = require("./snapshot");
const { validateSnapshot } = require("../validate");
const { today, cachePath } = require("./http");

const ROOT = path.join(__dirname, "..", "..", "..");
const schema = require(path.join(ROOT, "site/data/countyProfileSchema.json"));
const spine = require(path.join(ROOT, "site/_data/countySpine.json"));

// The five-year periods NFIP payouts are grouped into: the six most recent complete ones.
function nfipPeriods(asOfYear) {
  const last = Math.floor((asOfYear - 1 - 1996 + 1) / 5) * 5 + 1996 - 1; // last complete period's end year
  const periods = [];
  for (let end = last; periods.length < 7; end -= 5) periods.unshift({ start: end - 4, end });
  return periods;
}

async function main() {
  const fips = process.argv[2];
  const opts = { refresh: process.argv.includes("--refresh") };
  const entry = spine.counties.find((c) => c.fips === fips);
  if (!entry) throw new Error("usage: run.js <county fips in countySpine.json> [--refresh]");
  const increments = schema.increments;

  const log = (m) => console.error("[" + fips + "] " + m);
  log("blocks");
  const blocks = await S.fetchBlocks(fips, opts);
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of blocks.value) {
    for (const poly of b.geometry.type === "Polygon" ? [b.geometry.coordinates] : b.geometry.coordinates) {
      for (const [x, y] of poly[0]) { bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y); bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y); }
    }
  }
  log("NFHL"); const nfhl = await S.fetchNfhl(fips, opts);
  log("ACS"); const acs = await S.fetchAcs(fips, opts);
  log("LODES"); const lodes = await S.fetchLodes(fips, opts);
  log("USGS structures"); const usgs = await S.fetchUsgs(bbox, fips, opts);
  log("OpenFEMA claims"); const claims = await S.fetchClaims(fips, opts);
  log("NOAA SLR"); const slr = await S.fetchSlr(bbox, increments, fips, opts);

  log("verifying endpoints");
  const verified = {};
  for (const [k, url] of Object.entries(S.SOURCE_ENDPOINTS)) verified[k] = await S.verifyEndpoint(url);

  const asOf = claims.value.map((c) => c.asOfDate).filter(Boolean).sort().pop();
  const periods = nfipPeriods(new Date(asOf).getUTCFullYear());
  log("intersecting");
  const tCompute = Date.now();
  const results = compute({
    fips, blocks: blocks.value, nfhl: nfhl.value, acs: acs.value, lodes: lodes.value, usgs: usgs.value, slr: slr.value, claims: claims.value,
    facilityDefs: S.FACILITY_LAYERS, increments, periods,
  });

  const computeSeconds = +((Date.now() - tCompute) / 1000).toFixed(1);
  log("intersect took " + computeSeconds + "s " + JSON.stringify(results.timings));
  const loads = Object.values(results.facilities).flatMap((f) => f.loaded).sort();
  const meta = {
    verified,
    nfhl: { effStart: nfhl.value.effStart, effEnd: nfhl.value.effEnd, retrieved: nfhl.fetched },
    acs: { retrieved: acs.fetched },
    tiger: { retrieved: blocks.fetched },
    usgs: { latestLoad: loads[loads.length - 1], retrieved: usgs.fetched },
    openfema: { asOf: asOf.slice(0, 10), retrieved: claims.fetched },
    slr: { retrieved: slr.fetched },
    lodes: { year: lodes.value.year, retrieved: lodes.fetched },
  };

  // The OPC reference table is a committed file, not fetched: keep its source entry from the fixture.
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "site/_data/countyProfileFixtures", fips + ".json"), "utf8"));
  const snap = buildSnapshot({ entry, schema, spine, results, meta, snapshotDate: today(), generated: new Date().toISOString().replace(/\.\d+Z$/, "Z"), opcSource: fixture.sources.opc });

  validateSnapshot(snap, { schema, spine, file: fips + ".json", fixture: false });
  const outDir = path.join(ROOT, "site/data/county-profiles/latest");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, fips + ".json"), JSON.stringify(snap, null, 2) + "\n");
  fs.writeFileSync(cachePath("report-" + fips + ".json"), JSON.stringify({ meta, results, acsCountyPublished: acs.value.county, acsNulls: acs.value.nulls, nfhl: { dfirm: nfhl.value.dfirm, panels: nfhl.value.panelCount } }, null, 2));
  log("wrote site/data/county-profiles/latest/" + fips + ".json");
}

main().catch((e) => { console.error(e); process.exit(1); });
