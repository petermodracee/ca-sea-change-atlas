// Distinct tag values per tag-table field across all resources, computed once at build time.
const { resources } = require("../data/resources.json");
const { tagMasters } = require("../js/resource-detail.js");

module.exports = tagMasters(resources, require("../data/resourceDetailSchema.json"));
