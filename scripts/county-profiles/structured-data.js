#!/usr/bin/env node
// schema.org Dataset markup for County Profiles, and the check that guards it.
//
// countyDataset(county, doi) is the JSON-LD object for one county's current page
// (/county-profiles/county/<slug>/), built from its latest snapshot; site/county-profiles/county.njk renders
// it with `jsonify`. Dated pages carry none: they canonicalise to the current page, so search engines
// ignore them, and a dated snapshot's DOI (site/data/county-profiles/dois.json) will describe it instead.
// collectionDataset(counties) is the parent Dataset on /county-profiles/, listing every county in `hasPart`.
// The words are in site/_data/countyProfileSeo.json.
//
// checkStructuredData(outputDir) runs after every build (.eleventy.js) and on its own:
//   SITE_DIR=<dir> node scripts/county-profiles/structured-data.js

const fs = require("fs");
const path = require("path");
const site = require("../../site/_data/site.js");
const seo = require("../../site/_data/countyProfileSeo.json").dataset;

// The same license every snapshot carries in its own `license` field.
const LICENSE_URL = require("../../site/data/countyProfileSchema.json").snapshotLicense.url;
const DESCRIPTION_MIN = 50, DESCRIPTION_MAX = 5000;

const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const listJoin = (xs) => (xs.length <= 2 ? xs.join(" and ") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const organization = () => ({ "@type": "Organization", name: site.name, url: site.url });
const countyUrl = (county) => site.url + "/county-profiles/county/" + county.slug + "/";

// The years a snapshot's sources cover, from their vintages: the earliest year any vintage starts and the
// latest it ends, as an ISO 8601 interval ("1996/2026"), or the one year when they agree. A `year` vintage
// counts as that year alone (ACS 5-year estimates are keyed by their final year, so the span starts no
// earlier than another source's start). Null when no source has a vintage.
function temporalCoverage(sourceBlocks) {
  const years = [];
  for (const sources of sourceBlocks) {
    for (const s of Object.values(sources)) {
      const v = s.vintage;
      if (!v) continue;
      if (v.kind === "year") years.push(v.year);
      else if (v.kind === "date") years.push(Number(v.date.slice(0, 4)));
      else if (v.kind === "period") years.push(Number(v.start.slice(0, 4)), Number(v.end.slice(0, 4)));
    }
  }
  if (!years.length) return null;
  const lo = Math.min(...years), hi = Math.max(...years);
  return lo === hi ? String(lo) : lo + "/" + hi;
}

// The county's available topics, as one generated sentence: a flood-only county names flood hazard alone.
function countyDescription(county) {
  const phrases = county.coverage.filter((t) => t.hasPage).map((t) => {
    if (!seo.topicPhrases[t.id]) throw new Error("countyProfileSeo.json: dataset.topicPhrases has no entry for topic " + t.id);
    return seo.topicPhrases[t.id];
  });
  return fill(seo.countyDescription, { county: county.name, topics: capitalise(listJoin(phrases)) });
}

function countyDataset(county, doi) {
  const profile = county.profile;
  if (!profile) throw new Error("countyDataset: " + county.name + " has no snapshot");
  const coverage = temporalCoverage([profile.sources]);
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: fill(seo.countyName, { county: county.name }),
    description: countyDescription(county),
    url: countyUrl(county),
    ...(doi ? { identifier: "https://doi.org/" + doi } : {}),
    version: profile.snapshot,
    dateModified: profile.snapshot,
    license: LICENSE_URL,
    isAccessibleForFree: true,
    creator: organization(),
    publisher: organization(),
    spatialCoverage: { "@type": "Place", name: county.name + " County, California" },
    ...(coverage ? { temporalCoverage: coverage } : {}),
    isBasedOn: [...new Set(Object.values(profile.sources).map((s) => s.url))],
    distribution: [{
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: site.url + "/data/county-profiles/latest/" + county.fips + ".json",
    }],
    isPartOf: { "@type": "Dataset", name: seo.collectionName, url: site.url + "/county-profiles/" },
  };
}

function collectionDataset(counties) {
  const withData = counties.filter((c) => c.profile);
  const coverage = temporalCoverage(withData.map((c) => c.profile.sources));
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: seo.collectionName,
    description: fill(seo.collectionDescription, { count: withData.length }),
    url: site.url + "/county-profiles/",
    dateModified: withData.map((c) => c.profile.snapshot).sort().pop(),
    license: LICENSE_URL,
    isAccessibleForFree: true,
    creator: organization(),
    publisher: organization(),
    spatialCoverage: { "@type": "Place", name: seo.collectionPlace },
    ...(coverage ? { temporalCoverage: coverage } : {}),
    hasPart: withData.map((c) => ({
      "@type": "Dataset",
      name: fill(seo.countyName, { county: c.name }),
      description: countyDescription(c),
      url: countyUrl(c),
      license: LICENSE_URL,
      creator: organization(),
    })),
  };
}

// --- the check, over the built site ----------------------------------------------------------------------

const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
function datasetsIn(file) {
  const html = fs.readFileSync(file, "utf8");
  const found = [];
  for (const m of html.matchAll(LD_RE)) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch (e) { found.push({ error: "JSON-LD does not parse: " + e.message }); continue; }
    if (obj["@type"] === "Dataset") found.push({ obj });
  }
  return found;
}

function datasetProblems(d) {
  const p = [];
  for (const k of ["name", "url", "license"]) if (typeof d[k] !== "string" || !d[k]) p.push("missing " + k);
  if (typeof d.description !== "string" || d.description.length < DESCRIPTION_MIN || d.description.length > DESCRIPTION_MAX) p.push("description must be " + DESCRIPTION_MIN + " to " + DESCRIPTION_MAX + " characters (is " + (d.description || "").length + ")");
  if (/—/.test(JSON.stringify(d))) p.push("contains an em dash");
  return p;
}

// Every current county page has exactly one Dataset, with the required fields and a JSON download; no dated
// page has one; /county-profiles/ has the collection, listing every county page. Returns the pages checked.
function checkStructuredData(outputDir) {
  const root = path.join(outputDir, "county-profiles", "county");
  if (!fs.existsSync(root)) return 0;
  const bad = [];
  let checked = 0;
  const countyUrls = [];
  for (const slug of fs.readdirSync(root)) {
    const dir = path.join(root, slug);
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(path.join(dir, "index.html"))) continue;
    const rel = "county-profiles/county/" + slug + "/index.html";
    const sets = datasetsIn(path.join(dir, "index.html"));
    checked++;
    if (sets.length !== 1) { bad.push(rel + ": expected exactly one Dataset, found " + sets.length); continue; }
    if (sets[0].error) { bad.push(rel + ": " + sets[0].error); continue; }
    const d = sets[0].obj;
    const problems = datasetProblems(d);
    const download = Array.isArray(d.distribution) ? d.distribution[0] : d.distribution;
    if (!download || typeof download.contentUrl !== "string" || !/^https:\/\/.+\.json$/.test(download.contentUrl)) problems.push("distribution.contentUrl must be the absolute URL of the JSON download");
    if (d.url !== site.url + "/county-profiles/county/" + slug + "/") problems.push("url is " + d.url + ", not this page's canonical address");
    if (problems.length) bad.push(rel + ": " + problems.join("; "));
    countyUrls.push(d.url);
    // Dated landing and topic pages: none.
    for (const date of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
      const pages = [path.join(dir, date, "index.html"), ...fs.readdirSync(path.join(dir, date)).map((t) => path.join(dir, date, t, "index.html"))];
      for (const f of pages.filter((x) => fs.existsSync(x))) {
        checked++;
        if (datasetsIn(f).length) bad.push(path.relative(outputDir, f) + ": a dated page carries no Dataset (it canonicalises to the current page)");
      }
    }
  }
  const indexFile = path.join(outputDir, "county-profiles", "index.html");
  const coll = fs.existsSync(indexFile) ? datasetsIn(indexFile) : [];
  checked++;
  if (coll.length !== 1 || coll[0].error) bad.push("county-profiles/index.html: expected exactly one collection Dataset" + (coll[0] && coll[0].error ? " (" + coll[0].error + ")" : ", found " + coll.length));
  else {
    const c = coll[0].obj;
    const problems = datasetProblems(c);
    const parts = (c.hasPart || []).map((x) => x.url).sort();
    if (JSON.stringify(parts) !== JSON.stringify(countyUrls.slice().sort())) problems.push("hasPart lists " + parts.length + " counties, the site has " + countyUrls.length + " county pages");
    if (problems.length) bad.push("county-profiles/index.html: " + problems.join("; "));
  }
  if (bad.length) throw new Error("County Profiles structured data:\n  " + bad.join("\n  "));
  return checked;
}

module.exports = { countyDataset, collectionDataset, temporalCoverage, checkStructuredData };

if (require.main === module) {
  const dir = process.env.SITE_DIR || path.join(__dirname, "..", "..", "_site");
  const n = checkStructuredData(dir);
  console.log("structured data ok: " + n + " County Profiles pages checked in " + dir);
}
