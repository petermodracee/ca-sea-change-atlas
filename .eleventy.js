const fs = require("fs");

module.exports = async function (eleventyConfig) {
  eleventyConfig.setTemplateFormats(["njk", "md"]);
  eleventyConfig.ignores.add("site/data/**/*.md"); // READMEs next to the data, not pages

  // A tool's About subpages: every page with `aboutSection` and `aboutKind` front matter, in the fixed
  // order of _data/aboutSections.json "kinds" (overview, methodology, data, changelog). The layout
  // _includes/about-section.njk filters this by tool, so a new subpage is one new file.
  const aboutKinds = require("./site/_data/aboutSections.json").kinds;
  eleventyConfig.addCollection("aboutPages", (api) => {
    const pages = api.getAll().filter((p) => p.data.aboutSection && p.data.aboutKind);
    for (const p of pages) if (!aboutKinds.includes(p.data.aboutKind)) throw new Error(p.inputPath + ": aboutKind '" + p.data.aboutKind + "' is not one of " + aboutKinds.join(", "));
    return pages.sort((a, b) => aboutKinds.indexOf(a.data.aboutKind) - aboutKinds.indexOf(b.data.aboutKind));
  });

  eleventyConfig.addFilter("jsonify", (obj) => JSON.stringify(obj));
  // A hero subtitle that still starts with "PETER:" is a placeholder for the author to replace. It renders,
  // and this warns (once per page) rather than failing the build, so it cannot be published silently.
  const warnedPlaceholders = new Set();
  eleventyConfig.addFilter("placeholderWarn", (text, inputPath) => {
    if (/^\s*PETER:/.test(text) && !warnedPlaceholders.has(inputPath)) {
      warnedPlaceholders.add(inputPath);
      console.warn("[placeholder] " + inputPath + ": the hero subtitle still starts with PETER: and needs real text");
    }
    return text;
  });
  eleventyConfig.addFilter("toolSections", require("./site/js/tool-detail.js").toolSections);

  // County Profiles chart maths (d3-scale/d3-array are ESM-only, hence the dynamic import).
  const helpers = await import("./scripts/county-profiles/template-helpers.mjs");
  for (const name of ["ring", "num", "apaDate", "longDate", "barChart", "stackedBars", "stackedByIncrement", "stacked100Bars", "groupedColumns", "dotPlot", "slrCurves", "horizonColumns"]) eleventyConfig.addFilter(name, helpers[name]);
  eleventyConfig.addWatchTarget("site/data/county-profiles/");
  eleventyConfig.addWatchTarget("site/data/countyProfileSchema.json");

  // Fails the build if the old GitHub Pages host or path prefix leaked into the output — see the
  // comment on checkNoStaleHost.
  const { checkNoStaleHost } = require("./scripts/county-profiles/validate.js");
  eleventyConfig.on("eleventy.after", ({ dir }) => checkNoStaleHost(dir.output));
  // Every archived page must canonicalise to its current, undated equivalent.
  const { checkArchiveCanonicals } = require("./scripts/county-profiles/validate.js");
  eleventyConfig.on("eleventy.after", ({ dir }) => checkArchiveCanonicals(dir.output));

  // "View on map" links: generated from one table, then checked against the map's real controls after the build.
  const { mapLink, checkMapLinks } = require("./scripts/county-profiles/map-links.js");
  eleventyConfig.addFilter("mapLink", mapLink);
  eleventyConfig.addFilter("reportUrl", require("./scripts/county-profiles/report-link.js").reportUrl);
  eleventyConfig.addFilter("topicMapLink", require("./scripts/county-profiles/map-links.js").topicMapLink);
  eleventyConfig.addFilter("compareLink", require("./scripts/county-profiles/tool-links.js").compareLink);
  const { VALUE_CONTROL_IDS } = await import(require("url").pathToFileURL(require("path").resolve("site/js/map/permalink.js")).href);
  const spineFips = require("./site/_data/countySpine.json").counties.map((c) => c.fips);
  eleventyConfig.on("eleventy.after", ({ results }) => checkMapLinks({
    results, mapSource: fs.readFileSync("site/map/index.njk", "utf8"), valueControlIds: VALUE_CONTROL_IDS, spineFips,
  }));

  eleventyConfig.addPassthroughCopy({ "site/css": "css" });
  eleventyConfig.addPassthroughCopy({ "site/js": "js" });
  eleventyConfig.addPassthroughCopy({ "site/data/*.json": "data" });
  // Serve each placeholder fixture at the path a real snapshot uses, so "Download this snapshot
  // (JSON)" resolves for a county with no real snapshot yet. A county that has a real file in
  // site/data/county-profiles/latest/ (copied whole, below) is left out, so the
  // real file is never overwritten by its fixture.
  const latestDir = "site/data/county-profiles/latest";
  // A glob passthrough flattens its output, so the snapshot directory is copied as a directory.
  if (fs.existsSync(latestDir)) eleventyConfig.addPassthroughCopy({ [latestDir]: "data/county-profiles/latest" });
  // Each dated snapshot directory is copied the same way, to the same path.
  const dataRoot = "site/data/county-profiles";
  for (const d of fs.existsSync(dataRoot) ? fs.readdirSync(dataRoot).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) : []) {
    eleventyConfig.addPassthroughCopy({ [dataRoot + "/" + d]: "data/county-profiles/" + d });
  }
  const realSnapshots = new Set(fs.existsSync(latestDir) ? fs.readdirSync(latestDir) : []);
  const fixtureDir = "site/_data/countyProfileFixtures"; // none ship since Phase 3; the directory is for prototyping a county
  for (const file of fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir) : []) {
    if (!realSnapshots.has(file)) eleventyConfig.addPassthroughCopy({ ["site/_data/countyProfileFixtures/" + file]: "data/county-profiles/latest/" + file });
  }
  eleventyConfig.addPassthroughCopy({ "site/img": "img" });
  eleventyConfig.addPassthroughCopy("LICENSE");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy({ "site/CNAME": "CNAME" });

  return {
    pathPrefix: "/",
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
