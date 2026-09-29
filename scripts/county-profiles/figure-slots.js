// The one definition of "a figure" for counting the economy topics' states (state-report.js and
// analysis/withholding-report.js both use it, so their counts reconcile).
//
//   figure      one county figure slot in the marine or total economy: the four headline stats (establishments, jobs,
//               wages, GDP), the four measures of each sector in the diversity chart, and the county's average wage
//               in each sector of the wages chart. Comparators (California, coastal U.S.), the denominator, years and
//               the Total Jobs counts are not figures here.
//   published   a plain number: no part of it imputed.
//   estimated   {value, est}: some part imputed, shown. "marked" when est.share >= ESTIMATED_SHARE_THRESHOLD (drawn
//               with the ≈ mark), otherwise "unmarked" (shown as a plain figure, provenance kept in the JSON).
//   withheld    {suppressed: true}: not shown. "by rule" (the withholding rule in estimated.js) or "structural"
//               (Public administration's GDP: no defensible BEA ratio, withheld in every county), or "no-data" (nothing to
//               impute from; none among the figures counted). The reason is stored next to `suppressed` in the snapshot.
// published + unmarked + marked + withheld by rule + withheld structural = figures. `partial` (a total that leaves a
// withheld figure out) is a flag on a figure, not a category.

const { ESTIMATED_SHARE_THRESHOLD } = require("./estimated");

const CATS = ["published", "unmarked", "marked", "withheld-rule", "withheld-structural", "withheld-nodata"];
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function category(cell, structural) {
  if (isObj(cell) && cell.suppressed === true) // Snapshots written before the reason field existed (the `structural` argument) are classified by position.
    return cell.reason === "gdp-unreproducible" || (!cell.reason && structural) ? "withheld-structural" : cell.reason === "no-data" ? "withheld-nodata" : "withheld-rule";
  if (isObj(cell) && cell.est) return cell.est.share >= ESTIMATED_SHARE_THRESHOLD ? "marked" : "unmarked";
  return "published";
}

// The figure slots of one economy topic: sections = {measuring, diversity, wages} data objects.
function slotsOf(topic, sections) {
  const out = [];
  const m = sections.measuring;
  for (const k of ["establishments", "jobs", "wages", "gdp"]) out.push({ topic, sector: "(county total)", key: k, cell: m[k], structural: false });
  for (const s of sections.diversity.sectors) for (const k of ["establishments", "wages", "employment", "gdp"]) out.push({ topic, sector: s.label, key: k, cell: s[k], structural: topic === "total" && s.label === "Public administration" && k === "gdp" });
  for (const i of sections.wages.items) out.push({ topic, sector: i.label, key: "avg wage", cell: i.county, structural: false });
  return out.map((s) => ({ ...s, cat: category(s.cell, s.structural), partial: isObj(s.cell) && s.cell.partial === true }));
}

module.exports = { CATS, category, slotsOf };
