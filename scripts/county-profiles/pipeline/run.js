#!/usr/bin/env node
// County Profiles pipeline: fetch every source for a county, run the block-level intersect, and
// write site/data/county-profiles/latest/<fips>.json after validating it. A dated copy under
// site/data/county-profiles/<date>/ is minted only when the county's content differs from latest/'s.
//
//   node scripts/county-profiles/pipeline/run.js 06059 [--refresh]
//   node scripts/county-profiles/pipeline/run.js all [--refresh]
//   node scripts/county-profiles/pipeline/run.js 06059,06037
//
// all         every county in the spine, in spine order. The national ACS files, the LODES state file and
//             the Census nonemployer file are read once for the whole list.
// --refresh   ignore the download cache and re-fetch every source
//
// Raw downloads live in scripts/county-profiles/.cache/ (gitignored). A full diagnostics report,
// including the sensitivity figures and everything the reconciliation in docs/DECISIONS.md cites,
// is written next to them as report-<fips>.json. A big county needs a bigger heap:
//   node --max-old-space-size=12288 scripts/county-profiles/pipeline/run.js all

const fs = require("fs");
const path = require("path");
const S = require("./sources");
const { compute } = require("./intersect");
const { buildSnapshot } = require("./snapshot");
const { validateSnapshot } = require("../validate");
const { today, cachePath } = require("./http");
const { commitCounty } = require("./archive");
const { recordComputed } = require("./gate");

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

const bboxOf = (blocks) => {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of blocks) {
    for (const poly of b.geometry.type === "Polygon" ? [b.geometry.coordinates] : b.geometry.coordinates) {
      for (const [x, y] of poly[0]) { bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y); bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y); }
    }
  }
  return bbox;
};

let verifiedCache = null;
async function verifyAll(log) {
  if (verifiedCache) return verifiedCache;
  log("verifying endpoints");
  const verified = {};
  for (const [k, url] of Object.entries(S.SOURCE_ENDPOINTS)) verified[k] = await S.verifyEndpoint(url);
  return (verifiedCache = verified);
}

const outcomes = [];

async function runCounty(entry, fipsList, opts) {
  const fips = entry.fips;
  const tierTopics = schema.tiers[entry.tier].topics;
  const wantsSlr = tierTopics.slr.available, wantsTotal = tierTopics["total-economy"].available, wantsMarine = tierTopics["marine-economy"].available;
  const increments = schema.increments;
  const log = (m) => console.error("[" + fips + " " + entry.name + "] " + m);

  log("blocks");
  const blocks = await S.fetchBlocks(fips, opts);
  const bbox = bboxOf(blocks.value);
  const center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  log("NFHL"); const nfhl = await S.fetchNfhl(fips, opts);
  log("ACS"); const acs = await S.fetchAcs(fips, opts, fipsList);
  log("LODES"); const lodes = await S.fetchLodes(fips, opts, fipsList);
  log("USGS structures"); const usgs = await S.fetchUsgs(bbox, fips, opts);
  log("OpenFEMA claims"); const claims = await S.fetchClaims(fips, opts);
  let slr = null;
  if (wantsSlr) { log("NOAA SLR"); slr = await S.fetchSlr(bbox, increments, fips, opts, log); }

  // Economy: ask the sources, then assert the answer agrees with the tier rule.
  log("economy (ENOW, Total Economy, self-employed)");
  const econ = await S.fetchEconomy(fips, opts);
  const inEnow = econ.value.ocean.length > 0, shore = econ.value.coastal.length > 0;
  const expect = { full: [true, true], delta: [true, false], "flood-only": [false, false] }[entry.tier];
  if (inEnow !== expect[0] || shore !== expect[1]) {
    throw new Error(entry.name + ": tier " + entry.tier + " expects ENOW=" + expect[0] + ", shore-adjacent=" + expect[1] + ", but the data says ENOW=" + inEnow + ", shore-adjacent=" + shore);
  }
  const nes = wantsTotal ? await S.fetchNonemployer(fipsList, opts) : null;

  const asOf = claims.value.map((c) => c.asOfDate).filter(Boolean).sort().pop();
  const periods = nfipPeriods(new Date(asOf).getUTCFullYear());
  log("intersecting");
  const tCompute = Date.now();
  // --reuse-intersect skips the slow block-level pass and reads the last one's results, for
  // iterating on snapshot assembly only. Never use it after an input or the intersect code changed.
  const reuse = process.argv.includes("--reuse-intersect") && require("fs").existsSync(cachePath("intersect-" + fips + ".json"));
  const results = reuse ? JSON.parse(fs.readFileSync(cachePath("intersect-" + fips + ".json"), "utf8")) : compute({
    fips, blocks: blocks.value, nfhl: nfhl.value, acs: acs.value, lodes: lodes.value, usgs: usgs.value, slr: slr ? slr.value : null, claims: claims.value,
    facilityDefs: S.FACILITY_LAYERS, increments, periods, center,
  });
  if (!reuse) fs.writeFileSync(cachePath("intersect-" + fips + ".json"), JSON.stringify(results));
  const computeSeconds = +((Date.now() - tCompute) / 1000).toFixed(1);
  log("intersect took " + computeSeconds + "s " + JSON.stringify(results.timings));

  log("C-CAP land cover");
  const ccap = await S.fetchCcap(fips, {
    blocks: blocks.value, sfha: nfhl.value.sfha.map((f) => f.geometry), slr: slr ? slr.value.increments : {}, low: slr ? slr.value.low : {}, increments, log,
  }, opts);

  const verified = await verifyAll(log);
  const loads = Object.values(results.facilities).flatMap((f) => f.loaded).sort();
  const meta = {
    verified,
    nfhl: { effStart: nfhl.value.effStart, effEnd: nfhl.value.effEnd, retrieved: nfhl.fetched },
    acs: { retrieved: acs.fetched },
    tiger: { retrieved: blocks.fetched },
    usgs: { latestLoad: loads[loads.length - 1], retrieved: usgs.fetched },
    openfema: { asOf: asOf.slice(0, 10), retrieved: claims.fetched },
    slr: { retrieved: slr ? slr.fetched : null },
    lodes: { year: lodes.value.year, retrieved: lodes.fetched },
    ccap: { retrieved: ccap.fetched },
    enow: { retrieved: econ.fetched },
    nes: { retrieved: nes ? nes.fetched : null },
  };

  const gaps = [];
  const snap = buildSnapshot({
    entry, schema, spine, results, meta, ccap, econ: wantsMarine || wantsTotal ? econ : null, nes,
    nfhlCovered: nfhl.value.dfirms.length > 0, slrHasExtent: slr ? slr.value.regions.length > 0 : false,
    snapshotDate: today(), generated: new Date().toISOString().replace(/\.\d+Z$/, "Z"), gaps,
  });

  validateSnapshot(snap, { schema, spine, file: fips + ".json", fixture: false });
  // Snapshot-on-change: latest/ always updates; a dated snapshot is minted only if the content differs.
  const outcome = commitCounty(snap, { today: today() });
  recordComputed(fips, nfhl.value);
  outcomes.push({ fips, county: entry.name, ...outcome });
  const { diag, ...rest } = results;
  fs.writeFileSync(cachePath("report-" + fips + ".json"), JSON.stringify({
    meta, results: { ...rest, diag }, gaps, computeSeconds,
    acsCountyPublished: acs.value.county, acsNulls: acs.value.nulls,
    nfhl: { dfirms: nfhl.value.dfirms, panels: nfhl.value.panelCount, sfhaFeatures: nfhl.value.sfha.length, nullGeometry: nfhl.value.nullGeometry },
    slrRegions: slr ? slr.value.regions : null,
    ccap: ccap.value,
    econ: { baseSeries: econ.value.baseSeries, oceanYear: econ.value.oceanYear, totalYear: econ.value.totalYear },
  }, null, 2));
  log("latest/" + fips + ".json written, snapshot " + outcome.snapshot + " (" + outcome.action + (outcome.previous ? ", previous " + outcome.previous : "") + ")" + (gaps.length ? " (gaps: " + gaps.join("; ") + ")" : ""));
}

async function main() {
  const arg = process.argv[2];
  const opts = { refresh: process.argv.includes("--refresh") };
  if (!arg) throw new Error("usage: run.js <all | fips[,fips...]> [--refresh]");
  const all = spine.counties.map((c) => c.fips);
  const todo = arg === "all" ? all : arg.split(",");
  for (const f of todo) if (!all.includes(f)) throw new Error(f + " is not in countySpine.json");
  const failures = [];
  for (const fips of todo) {
    const entry = spine.counties.find((c) => c.fips === fips);
    try { await runCounty(entry, all, opts); } catch (e) { console.error("[" + fips + " " + entry.name + "] FAILED: " + (e.stack || e)); failures.push(fips); if (todo.length === 1) throw e; }
  }
  // A per-run summary for the workflow: which counties minted a dated snapshot and which only refreshed.
  fs.writeFileSync(cachePath("run-outcomes.json"), JSON.stringify(outcomes, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY && outcomes.length) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "\n### Recomputed counties\n\n| County | Result | Snapshot |\n|---|---|---|\n" + outcomes.map((o) => "| " + o.county + " | " + o.action + " | " + o.snapshot + " |").join("\n") + "\n");
  }
  if (failures.length) { console.error("failed: " + failures.join(", ")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
