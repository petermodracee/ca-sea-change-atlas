module.exports = function (eleventyConfig) {
  eleventyConfig.setTemplateFormats(["njk"]);

  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("data");
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("reference");
  eleventyConfig.addPassthroughCopy("README.md");
  eleventyConfig.addPassthroughCopy("BRIEF.md");
  eleventyConfig.addPassthroughCopy("LICENSE");

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
