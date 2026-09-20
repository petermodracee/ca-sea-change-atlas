module.exports = function (eleventyConfig) {
  eleventyConfig.setTemplateFormats(["njk"]);

  eleventyConfig.addFilter("jsonify", (obj) => JSON.stringify(obj));
  eleventyConfig.addFilter("toolSections", require("./js/tool-detail.js").toolSections);

  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("data");
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("reference");
  eleventyConfig.addPassthroughCopy("LICENSE");
  eleventyConfig.addPassthroughCopy("LICENSE-CONTENT.md");
  eleventyConfig.addPassthroughCopy("robots.txt");

  return {
    pathPrefix: "/ca-sea-change-atlas/",
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
