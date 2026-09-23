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
  eleventyConfig.addPassthroughCopy({ "site/data/**/*.json": "data" });
  // Phase 1 only: serve the placeholder fixtures at the same path Phase 2's real snapshots will
  // use, so "Download this snapshot (JSON)" resolves now. Remove once site/data/county-profiles/
  // has real pipeline output — a real file there would need to win over a fixture of the same name.
  eleventyConfig.addPassthroughCopy({ "site/_data/countyProfileFixtures": "data/county-profiles/latest" });
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
