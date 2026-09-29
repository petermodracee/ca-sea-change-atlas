// The fifth availability state: estimated (Phase 7).
//
// A snapshot figure built partly from imputed QCEW cells is written {value, est: {share, step}}: `share` is
// the fraction (0 to 1] of the figure's value that came from imputed rows, `step` the weakest rung of the
// imputation ladder used (1 interpolated ... 5 parent average; scripts/county-profiles/pipeline/impute.js).
// The snapshot keeps the provenance for every such figure; whether the page calls it "estimated" is decided
// here, in one place, by ESTIMATED_SHARE_THRESHOLD. Lower it to mark more figures, raise it to mark fewer.
// The distribution the starting value was chosen from is in docs/DECISIONS.md.

const ESTIMATED_SHARE_THRESHOLD = 0.25;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// A figure's number, whether published (a plain number) or carrying provenance.
const cellValue = (v) => (isObj(v) && "value" in v ? v.value : v);
const cellEst = (v) => (isObj(v) && v.est ? v.est : null);
const isEstimatedCell = (v) => { const e = cellEst(v); return Boolean(e && e.share >= ESTIMATED_SHARE_THRESHOLD); };
const isPartialCell = (v) => isObj(v) && v.partial === true;

module.exports = { ESTIMATED_SHARE_THRESHOLD, cellValue, cellEst, isEstimatedCell, isPartialCell };
