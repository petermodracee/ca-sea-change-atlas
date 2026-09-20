// Distinct tag values per tag-table field across all tools, computed once at build time.
const { tools } = require("../data/tools.json");
const { tagMasters } = require("../js/tool-detail.js");

module.exports = tagMasters(tools, require("../data/toolDetailSchema.json"));
