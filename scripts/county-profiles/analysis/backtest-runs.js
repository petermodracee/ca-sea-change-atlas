#!/usr/bin/env node
// A harsher backtest of the imputation ladder, and signed-error reporting for both backtests. On demand only: it is
// not part of the build or the workflow.
//
//   node scripts/county-profiles/analysis/backtest-runs.js [--stride N]
//
// The existing backtest (economy-validation.js backtest; reproduced here as "single cell" so both are reported in one
// place, with the same n and step errors) hides one published county-code-ownership-year row at a time
// and leaves every other year visible, so steps 1 and 2 always have a neighbouring year to anchor on. Real suppression
// runs across years. This script hides RUNS of consecutive years of the same county-code-ownership series, so the
// ladder has no anchor inside the run (steps 1 and 2 must reach outside it, steps 4 and 5 use the parent), exactly as
// for a persistently withheld cell:
//   interior runs of 2, 3 and 5 years (every window of published rows), and
//   tail runs: the last 2, 3 and 5 years of the series (2024-2025, 2023-2025, 2021-2025), where nothing later exists.
// Any ancestor row identical to the hidden row is hidden with it (a parent with a single child equals it and QCEW would
// withhold it too). Each hidden row-year is estimated by each ladder step alone and by the ladder as run.
//
// Error is (estimate - truth) / truth: positive means the estimate is too high. Both signed and absolute errors are
// reported, in percent and in jobs, by ladder step, sector, run length and number of establishments. Samples are
// row-years; rows under 30 samples are flagged (†). The published rows tested are 2012 to 2025 for the 23 marine counties.

const { load, median, mean, pctl, f0, table } = require("./economy-validation.js");
const imp = require("../pipeline/impute.js");
const D = require("../pipeline/enow-def.js");

const strideArg = process.argv.indexOf("--stride");
const STRIDE = strideArg > 0 ? Number(process.argv[strideArg + 1]) : 1;
const pct1 = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%" : "n/a");
const abs1 = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/a");

function metrics(a) {
  const n = a.length;
  const sig = a.map((x) => x.signed), ab = a.map((x) => Math.abs(x.signed)), jobs = a.map((x) => Math.abs(x.est - x.truth));
  const truthSum = a.reduce((s, x) => s + x.truth, 0);
  return [String(n) + (n < 30 ? " †" : ""), pct1(median(sig)), pct1(mean(sig)), abs1(median(ab)), abs1(mean(ab)), abs1(pctl(ab, 0.9)), f0(median(jobs)), f0(mean(jobs)), pct1(a.reduce((s, x) => s + (x.est - x.truth), 0) / truthSum)];
}
const HEAD = ["n", "median signed", "mean signed", "median abs", "mean abs", "p90 abs", "median abs error (jobs)", "mean abs error (jobs)", "total bias (sum of errors / sum of truth)"];
const STRATA = [["1-4 establishments", (e) => e <= 4], ["5-9", (e) => e >= 5 && e <= 9], ["10-24", (e) => e >= 10 && e <= 24], ["25 or more", (e) => e >= 25]];

(async () => {
  const t0 = Date.now();
  const L = await load();
  const samples = []; // one per hidden row-year and estimator
  const OWNS = imp.OWNS;
  for (const c of L.marineCounties) {
    for (const own of OWNS) {
      const codes = new Set();
      for (const list of Object.values(D.MARINE_CODES)) for (const d of list) codes.add(d.code);
      for (const code of codes) {
        const def = Object.entries(D.MARINE_CODES).flatMap(([sec, list]) => list.map((d) => ({ ...d, sec }))).find((d) => d.code === code);
        const pub = (y) => { const r = L.ctx.row(y, c.fips, own, code); return r && r[0] !== "N" && r[1] > 0 && r[2] > 0 && r[3] > 0 ? r : null; };
        const runsOf = (len, tail) => {
          const out = [];
          if (tail) { const s = L.ctx.last - len + 1; if (s >= L.ctx.first) out.push(s); return out; }
          for (let s = L.ctx.first; s + len - 1 <= L.ctx.last; s += STRIDE) out.push(s);
          return out;
        };
        for (const [len, tail] of [[1, false], [2, false], [3, false], [5, false], [2, true], [3, true], [5, true]]) {
          for (const start of runsOf(len, tail)) {
            const years = [];
            for (let y = start; y < start + len; y++) years.push(y);
            if (!years.every((y) => pub(y) && y >= def.from && y <= def.to)) continue;
            // a hidden run needs the code in force throughout; ancestors identical to the row, per year
            const ident = {};
            for (const y of years) {
              const r = L.ctx.row(y, c.fips, own, code);
              ident[y] = new Set();
              for (let p = code.slice(0, -1); p.length >= 2; p = p.slice(0, -1)) { const a = L.ctx.row(y, c.fips, own, p); if (a && a[1] === r[1] && a[2] === r[2] && a[3] === r[3]) ident[y].add(p); }
            }
            const hidden = (f, o, cd, y) => f === c.fips && o === own && years.includes(y) && (cd === code || ident[y].has(cd));
            const ctx2 = imp.makeContext(L.q, { hidden });
            for (const y of years) {
              const r = L.ctx.row(y, c.fips, own, code);
              let first = null;
              const rec = (step, est, kind) => samples.push({ kind, step, len, tail, sector: def.sec, e: r[1], truth: r[2], est: est.emp, signed: (est.emp - r[2]) / r[2], estW: est.w, truthW: r[3], county: c.name });
              for (const s of [1, 2, 3, 4, 5]) {
                const est = imp.estimateRow(ctx2, c.fips, own, code, y, s);
                if (est) { rec(s, est, "step"); if (!first) first = { est, s }; }
              }
              if (first) rec(first.s, first.est, "asrun");
            }
          }
        }
      }
    }
  }
  const secs = (t) => samples.filter((s) => s.kind === t);
  const out = [];
  const runLabel = (s) => (s.tail ? "last " : "") + s.len + " years" + (s.tail ? "" : ", interior");
  const runKeys = [["single cell (the existing backtest)", (s) => !s.tail && s.len === 1], ["interior, 2 years", (s) => !s.tail && s.len === 2], ["interior, 3 years", (s) => !s.tail && s.len === 3], ["interior, 5 years", (s) => !s.tail && s.len === 5], ["tail, last 2 years", (s) => s.tail && s.len === 2], ["tail, last 3 years", (s) => s.tail && s.len === 3], ["tail, last 5 years", (s) => s.tail && s.len === 5]];

  out.push("## Run-masked backtest\n");
  out.push("Row-years hidden as runs (interior windows of 2, 3 and 5 years, and the last 2, 3 and 5 years), stride " + STRIDE + "; " + secs("asrun").length + " row-years estimated by the ladder as run. † marks rows under 30 samples. Positive error means the estimate is too high.\n");
  out.push("**By run length, ladder as run:**\n\n" + table(["run", ...HEAD], runKeys.map(([l, f]) => [l, ...metrics(secs("asrun").filter(f))])));
  out.push("**By ladder step (each step alone on every row-year it can estimate), all runs:**\n\n" + table(["step", ...HEAD], [1, 2, 3, 4, 5].map((k) => ["step " + k + " (" + imp.STEP_NAMES[k] + ")", ...metrics(secs("step").filter((s) => s.step === k))]).concat([["as run", ...metrics(secs("asrun"))]])));
  out.push("**By ladder step and run length (median signed % error / median abs % error, n):**\n\n" + table(["step", ...runKeys.map((r) => r[0])], [1, 2, 3, 4, 5].map((k) => ["step " + k, ...runKeys.map(([, f]) => { const a = secs("step").filter((s) => s.step === k && f(s)); return a.length ? pct1(median(a.map((x) => x.signed))) + " / " + abs1(median(a.map((x) => Math.abs(x.signed)))) + ", n=" + a.length + (a.length < 30 ? " †" : "") : "n/a"; })])));
  out.push("**By sector, ladder as run:**\n\n" + table(["sector", ...HEAD], Object.keys(D.MARINE_CODES).map((k) => [k, ...metrics(secs("asrun").filter((s) => s.sector === k))])));
  out.push("**By number of establishments in the cell, ladder as run:**\n\n" + table(["establishments", ...HEAD], STRATA.map(([l, f]) => [l, ...metrics(secs("asrun").filter((s) => f(s.e)))])));
  out.push("**By establishments, steps 4 and 5 only (each alone):**\n\n" + table(["establishments", ...HEAD], STRATA.map(([l, f]) => [l, ...metrics(secs("step").filter((s) => s.step >= 4 && f(s.e)))])));
  out.push("**Runtime of this backtest:** " + Math.round((Date.now() - t0) / 1000) + " s.\n");
  console.log(out.join("\n"));
})();
