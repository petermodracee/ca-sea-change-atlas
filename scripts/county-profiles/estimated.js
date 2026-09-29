// The fifth availability state: estimated (Phase 7).
//
// A snapshot figure built partly from imputed QCEW cells is written {value, est: {share, step}}: `share` is
// the fraction (0 to 1] of the figure's value that came from imputed rows, `step` the weakest rung of the
// imputation ladder used (1 interpolated ... 5 parent average; scripts/county-profiles/pipeline/impute.js).
// The snapshot keeps the provenance for every such figure; whether the page calls it "estimated" is decided
// here, in one place, by ESTIMATED_SHARE_THRESHOLD. Lower it to mark more figures, raise it to mark fewer.
// The distribution the starting value was chosen from is in docs/DECISIONS.md.

const ESTIMATED_SHARE_THRESHOLD = 0.25;

// The withholding rule (applied by the pipeline, so a withheld figure is stored as {suppressed: true}): an
// economy figure is withheld when its weakest ladder step is WITHHOLD_WEAKEST_STEP or higher (4 and 5 are the
// two parent-average steps, backtest median error 18% and 27% against 5 to 8% for steps 1 to 3) and at least
// WITHHOLD_MIN_SHARE of its value was imputed. Totals it feeds are marked partial.
const WITHHOLD_WEAKEST_STEP = 4;
const WITHHOLD_MIN_SHARE = 0.75;
const isWithheldByRule = (share, step) => step >= WITHHOLD_WEAKEST_STEP && share >= WITHHOLD_MIN_SHARE;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// A figure's number, whether published (a plain number) or carrying provenance.
const cellValue = (v) => (isObj(v) && "value" in v ? v.value : v);
const cellEst = (v) => (isObj(v) && v.est ? v.est : null);
const isEstimatedCell = (v) => { const e = cellEst(v); return Boolean(e && e.share >= ESTIMATED_SHARE_THRESHOLD); };
const isPartialCell = (v) => isObj(v) && v.partial === true;

module.exports = { WITHHOLD_WEAKEST_STEP, WITHHOLD_MIN_SHARE, isWithheldByRule, ESTIMATED_SHARE_THRESHOLD, cellValue, cellEst, isEstimatedCell, isPartialCell };
