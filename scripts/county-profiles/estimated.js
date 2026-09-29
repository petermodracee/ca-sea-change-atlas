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
// economy figure is withheld when at least WITHHOLD_WEAK_SHARE of its value was imputed at the weak steps of the
// ladder, 4 and 5 (the parent averages; backtest median error 18% and 27% against 5 to 8% for steps 1 to 3).
// `weakShare` is that share, 0 to 1. Totals a withheld figure feeds are marked partial. It is the same value as
// the marker threshold on purpose: a figure is marked "estimated" at a quarter imputed and withheld at a quarter
// imputed by the weak steps.
const WITHHOLD_WEAK_SHARE = 0.25;
const isWithheldByRule = (weakShare) => weakShare >= WITHHOLD_WEAK_SHARE;

// Why a figure is withheld ({suppressed: true, reason}): the closed vocabulary. weak-share: withheld by the rule above;
// no-data: the source withholds it and there is nothing to estimate it from; gdp-unreproducible: Public
// administration's GDP (BEA's government GDP includes schools and hospitals that QCEW counts elsewhere, so no
// defensible ratio exists).
const WITHHOLD_REASONS = ["weak-share", "no-data", "gdp-unreproducible"];
const withheldCell = (reason) => ({ suppressed: true, reason });

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// A figure's number, whether published (a plain number) or carrying provenance.
const cellValue = (v) => (isObj(v) && "value" in v ? v.value : v);
const cellEst = (v) => (isObj(v) && v.est ? v.est : null);
const isEstimatedCell = (v) => { const e = cellEst(v); return Boolean(e && e.share >= ESTIMATED_SHARE_THRESHOLD); };
const isPartialCell = (v) => isObj(v) && v.partial === true;

module.exports = { WITHHOLD_REASONS, withheldCell, WITHHOLD_WEAK_SHARE, isWithheldByRule, ESTIMATED_SHARE_THRESHOLD, cellValue, cellEst, isEstimatedCell, isPartialCell };
