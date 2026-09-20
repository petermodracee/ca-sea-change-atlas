// Distinct, sorted values of each tag field across all tools (same set js/sources.js
// builds for the filter checkboxes). Computed once at build time for the tag-table sections.
const { tools } = require("../data/tools.json");

const distinct = (key) => [...new Set(tools.flatMap((t) => t[key] || []))].sort();

module.exports = Object.fromEntries(
  ["processes", "exposure", "floodInfo"].map((key) => [key, distinct(key)])
);
