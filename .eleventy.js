const fs = require("fs");

module.exports = async function (eleventyConfig) {
  eleventyConfig.setTemplateFormats(["njk"]);

  eleventyConfig.addFilter("jsonify", (obj) => JSON.stringify(obj));
  eleventyConfig.addFilter("toolSections", require("./site/js/tool-detail.js").toolSections);

  // County Profiles chart maths (d3-scale/d3-array are ESM-only, hence the dynamic import).
  const helpers = await import("./scripts/county-profiles/template-helpers.mjs");
  for (const name of ["ring", "num", "apaDate", "barChart", "stackedBars", "stackedByIncrement", "stacked100Bars", "groupedColumns", "dotPlot", "slrCurves"]) eleventyConfig.addFilter(name, helpers[name]);
  eleventyConfig.addWatchTarget("site/data/county-profiles/");
  eleventyConfig.addWatchTarget("site/data/countyProfileSchema.json");

  // Fails the build if the old GitHub Pages host or path prefix leaked into the output — see the
  // comment on checkNoStaleHost.
  const { checkNoStaleHost } = require("./scripts/county-profiles/validate.js");
  eleventyConfig.on("eleventy.after", ({ dir }) => checkNoStaleHost(dir.output));

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
