module.exports = function (eleventyConfig) {
  eleventyConfig.setTemplateFormats(["njk"]);

  eleventyConfig.addFilter("jsonify", (obj) => JSON.stringify(obj));
  eleventyConfig.addFilter("toolSections", require("./site/js/tool-detail.js").toolSections);

  eleventyConfig.addPassthroughCopy({ "site/css": "css" });
  eleventyConfig.addPassthroughCopy({ "site/js": "js" });
  eleventyConfig.addPassthroughCopy({ "site/data": "data" });
  eleventyConfig.addPassthroughCopy({ "site/img": "img" });
  eleventyConfig.addPassthroughCopy("LICENSE");
  eleventyConfig.addPassthroughCopy("LICENSE-CONTENT.md");
  eleventyConfig.addPassthroughCopy("robots.txt");

  return {
    pathPrefix: "/ca-sea-change-atlas/",
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
