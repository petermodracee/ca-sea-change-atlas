#!/usr/bin/env node
// Validation of the Phase 7 economy estimates, printed as Markdown tables (they are pasted into
// docs/DECISIONS.md). None of it gates the build: a bad result is reported, not blocked.
//
//   node scripts/county-profiles/analysis/economy-validation.js [backtest] [sum] [enow2021] [total] [tolerance] [distribution]
//
// backtest      hide published QCEW rows, run the ladder, compare with the truth, by ladder step and by sector
// sum           our county estimates summed over the ENOW California counties against Open ENOW's California, by sector and year
// enow2021      our 2021 county-by-sector figures against the original ENOW's 2021 county values
// total         our total economy against NOAA's Total Economy (Coastal) series and against what Phase 3 shipped
// tolerance     the shoreline-ZIP distance rule against Open ENOW California and original ENOW 2021 (how it was chosen)
// distribution  the distribution of estimated shares across the snapshot figures
//
// It needs the pipeline's cache (QCEW, ZBP, BEA, Open ENOW, ENOW 2021); missing pieces are fetched.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const spine = require(path.join(ROOT, "site/_data/countySpine.json"));
const P = path.join(ROOT, "scripts/county-profiles/pipeline/");
const { fetchQcew } = require(P + "qcew");
const imp = require(P + "impute");
const E = require(P + "economy");
const D = require(P + "enow-def");
const { fetchShoreShares, computeShares } = require(P + "zbp");
const { fetchGdp } = require(P + "bea");
const { fetchOpenEnow } = require(P + "open-enow");
const { cachePath } = require(P + "http");

const args = process.argv.slice(2);
const want = (n) => !args.filter((a) => !a.startsWith("--")).length || args.includes(n);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pctl = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/a");
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "n/a");
const table = (head, rows) => "| " + head.join(" | ") + " |\n|" + head.map(() => "---").join("|") + "|\n" + rows.map((r) => "| " + r.join(" | ") + " |").join("\n") + "\n";

async function load() {
  const fips = spine.counties.map((c) => c.fips);
  const q = (await fetchQcew(fips)).value;
  const ctx = imp.makeContext(q);
  const shoreRes = (await fetchShoreShares({}, spine)).value;
  const gdp = await fetchGdp({});
  const caOpen = (await fetchOpenEnow("06000", {})).value;
  const usOpen = (await fetchOpenEnow("00000", {})).value;
  const marineCounties = spine.counties.filter((c) => c.tier !== "flood-only");
  const ests = Object.fromEntries(marineCounties.map((c) => [c.fips, imp.estimateCounty(ctx, c.fips)]));
  return { q, ctx, shoreRes, gdp, caOpen, usOpen, marineCounties, ests };
}

// The original ENOW's 2021 tourism and recreation figures for a county (what the shoreline share is calibrated to).
function orig2021(fips) {
  const file = cachePath("econ-" + fips + ".json");
  if (!fs.existsSync(file)) return null;
  const t = JSON.parse(fs.readFileSync(file, "utf8")).ocean.find((r) => r.sector === "Tourism and Recreation");
  const num = (v) => (v === "SUP" || v === undefined || v === null ? null : Number(v));
  return t ? { employment: num(t.employment), establishments: num(t.establishments) } : null;
}
// Sector sums for a county-year. By default the county's tourism share is the calibrated one (as shipped);
// `opts.shares` overrides it (the ZIP rule alone: pass computeShares(...)), and `opts.zipRule` uses the ZIP rule.
function figures(L, fips, Y, opts = {}) {
  let shares;
  if (opts.shares !== undefined) shares = opts.shares;
  else if (opts.zipRule) shares = L.shoreRes.shares;
  else shares = E.calibrateTourism(L.ests[fips], fips, L.shoreRes.shares, orig2021(fips)).shares;
  const g = E.makeGdp(L.ctx, L.gdp);
  const lines = [...new Set(Object.values(D.MARINE_CODES).flat().filter((c) => c.from <= Y && Y <= c.to).map((c) => c.bea))];
  const gy = g.yearFor(lines, Y);
  return E.marineSectors(L.ctx, L.ests[fips], fips, Y, shares, gy === Y ? { ratio: g.ratio, year: Y } : null, opts);
}

// --- 1. backtest ----------------------------------------------------------------------------------------
function backtest(L) {
  const steps = { 1: [], 2: [], 3: [], 4: [], 5: [], asRun: [] };
  const bySector = {};
  for (const c of L.marineCounties) {
    for (let Y = L.ctx.first; Y <= L.ctx.last; Y++) {
      for (const sector of Object.keys(D.MARINE_CODES)) {
        for (const def of D.codesFor(sector, Y)) {
          for (const own of imp.OWNS) {
            const r = L.ctx.row(Y, c.fips, own, def.code);
            if (!r || r[0] === "N" || r[1] <= 0 || r[2] <= 0 || r[3] <= 0) continue;
            // The hidden row and any ancestor that is identical to it (a parent with a single child equals that
            // child; QCEW would withhold it too, and leaving it visible would hand the answer to steps 4 and 5).
            const same = (code) => { const a = L.ctx.row(Y, c.fips, own, code); return a && a[1] === r[1] && a[2] === r[2] && a[3] === r[3]; };
            const hidden = (f, o, code, y) => f === c.fips && o === own && y === Y && (code === def.code || (def.code.startsWith(code) && same(code)));
            const ctx2 = imp.makeContext(L.q, { hidden });
            const truth = { emp: r[2], w: r[3] };
            const rec = (bucket, est, step) => {
              const e = { sector, county: c.name, code: def.code, own, year: Y, truth: truth.emp, est: est.emp, ape: Math.abs(est.emp - truth.emp) / truth.emp, signed: (est.emp - truth.emp) / truth.emp, apeW: Math.abs(est.w - truth.w) / truth.w, step };
              bucket.push(e);
            };
            let first = null;
            for (const s of [1, 2, 3, 4, 5]) {
              const est = imp.estimateRow(ctx2, c.fips, own, def.code, Y, s);
              if (est) { rec(steps[s], est, s); if (!first) first = { est, s }; }
            }
            if (first) { rec(steps.asRun, first.est, first.s); (bySector[sector] = bySector[sector] || []).push(steps.asRun[steps.asRun.length - 1]); }
          }
        }
      }
    }
  }
  const stat = (a) => {
    const w = a.reduce((s, x) => s + Math.abs(x.est - x.truth), 0) / a.reduce((s, x) => s + x.truth, 0);
    return [a.length.toString(), f1(median(a.map((x) => x.ape))), f1(mean(a.map((x) => x.ape))), f1(pctl(a.map((x) => x.ape), 0.9)), f1(w), f1(median(a.map((x) => x.apeW))), f1(median(a.map((x) => x.signed)))];
  };
  const head = ["", "n", "median abs % error (employment)", "mean", "90th percentile", "employment-weighted", "median abs % error (wages)", "median signed error (employment)"];
  let out = "";
  out += "By ladder step (each step run alone on every row it can estimate; \"as run\" is the first step that applies):\n\n";
  out += table(head, [1, 2, 3, 4, 5].map((s) => ["step " + s + " (" + imp.STEP_NAMES[s] + ")", ...stat(steps[s])]).concat([["as run (ladder order)", ...stat(steps.asRun)]]));
  out += "\nBy sector (as run):\n\n" + table(head, D.MARINE_CODES && Object.keys(D.MARINE_CODES).filter((s) => bySector[s]).map((s) => [s, ...stat(bySector[s])]));
  const worst = steps.asRun.slice().sort((a, b) => b.ape - a.ape).filter((x) => x.truth >= 20).slice(0, 8);
  out += "\nWorst cases with at least 20 true jobs (as run):\n\n" + table(["county", "code", "ownership", "year", "true jobs", "estimated", "step", "error"], worst.map((x) => [x.county, x.code, x.own, x.year, f0(x.truth), f0(x.est), x.step, f1(x.ape)]));
  const byStepN = [1, 2, 3, 4, 5].map((s) => steps[s].length);
  out += "\nRows tested: " + steps.asRun.length + " published county-code-ownership-year rows with positive employment (" + L.marineCounties.length + " counties, " + L.ctx.first + " to " + L.ctx.last + ").\n";
  return out;
}

// --- 2. sum check ---------------------------------------------------------------------------------------
function sumCheck(L, opts = {}) {
  const rows = [];
  const years = [];
  for (let Y = 2015; Y <= L.ctx.last; Y++) if (L.caOpen.byYear[Y]) years.push(Y);
  const agg = {};
  for (const Y of years) {
    const pub = Object.fromEntries(L.caOpen.byYear[Y].map((r) => [r.sector, r]));
    const sums = {};
    for (const c of L.marineCounties) {
      const s = figures(L, c.fips, Y, opts);
      for (const [sec, v] of Object.entries(s)) { const a = (sums[sec] = sums[sec] || { estabs: 0, emp: 0, wages: 0, gdp: 0 }); a.estabs += v.estabs; a.emp += v.emp; a.wages += v.wages; a.gdp += v.gdp || 0; }
    }
    for (const sec of E.MARINE_SECTOR_ORDER) {
      const a = sums[sec], p = pub[sec];
      (agg[sec] = agg[sec] || {})[Y] = { emp: a.emp / p.employment - 1, wages: a.wages / p.wages - 1, estabs: a.estabs / p.establishments - 1, gdp: p.gdp ? a.gdp / p.gdp - 1 : null };
    }
  }
  return { agg, years };
}
function sumCheckTables(res) {
  let out = "";
  for (const [m, label] of [["emp", "Employment"], ["wages", "Wages"], ["estabs", "Establishments"], ["gdp", "GDP"]]) {
    out += "\n" + label + " (ours minus Open ENOW, as % of Open ENOW; California):\n\n";
    out += table(["sector", ...res.years.map(String)], E.MARINE_SECTOR_ORDER.map((s) => [s, ...res.years.map((y) => { const v = res.agg[s][y][m]; return v === null || v === undefined ? "–" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"; })]));
  }
  return out;
}

// --- 3. original ENOW 2021 ------------------------------------------------------------------------------
function enow2021(L, opts = {}) {
  const Y = 2021;
  const keys = [["employment", "emp"], ["wages", "wages"], ["establishments", "estabs"], ["gdp", "gdp"]];
  const errs = {}; // sector -> measure -> [signed diff]
  const perCounty = [];
  for (const c of L.marineCounties) {
    const file = cachePath("econ-" + c.fips + ".json");
    if (!fs.existsSync(file)) continue;
    const orig = JSON.parse(fs.readFileSync(file, "utf8")).ocean;
    if (!orig.length) continue;
    const mine = figures(L, c.fips, Y, opts);
    let tourism = null;
    for (const sec of E.MARINE_SECTOR_ORDER) {
      const o = orig.find((r) => r.sector === sec);
      if (!o) continue;
      for (const [ok, mk] of keys) {
        const ov = o[ok]; if (ov === "SUP" || ov === null || ov === undefined || Number(ov) === 0) continue;
        const mv = mk === "estabs" ? mine[sec].estabs : mk === "gdp" ? mine[sec].gdp : mine[sec][mk];
        if (mv === null || mv === undefined) continue;
        ((errs[sec] = errs[sec] || {})[mk] = errs[sec][mk] || []).push({ county: c.name, diff: mv / Number(ov) - 1, orig: Number(ov), mine: mv });
      }
    }
    const o = orig.find((r) => r.sector === "Ocean Economy");
    if (o && o.employment !== "SUP") { const tot = Object.values(mine).reduce((s, v) => s + v.emp, 0), imp = Object.values(mine).reduce((s, v) => s + v.empImp, 0); perCounty.push({ county: c.name, orig: Number(o.employment), mine: tot, imputed: tot > 0 ? imp / tot : 0 }); }
  }
  // Attribution to imputation: the same comparison split by how much of our county figure was imputed.
  const byImp = [];
  for (const sec of ["Living Resources", "Marine Transportation", "Offshore Mineral Resources", "Tourism and Recreation"]) {
    const lo = [], hi = [];
    for (const c of L.marineCounties) {
      const file = cachePath("econ-" + c.fips + ".json");
      if (!fs.existsSync(file)) continue;
      const o = JSON.parse(fs.readFileSync(file, "utf8")).ocean.find((r) => r.sector === sec);
      if (!o || o.employment === "SUP" || !Number(o.employment)) continue;
      const m = figures(L, c.fips, Y, opts)[sec];
      (m.emp > 0 && m.empImp / m.emp >= 0.1 ? hi : lo).push(m.emp / Number(o.employment) - 1);
    }
    byImp.push({ sec, lo, hi });
  }
  // Definition-adjusted: remove Open ENOW's extra codes and see how much of the gap that is.
  const adjusted = [];
  const extra = ["713110", "721199", "721214", "722410"];
  const adj = { "Tourism and Recreation": { employment: [], establishments: [] }, "Marine Transportation": { employment: [], establishments: [] } };
  for (const c of L.marineCounties) {
    const file = cachePath("econ-" + c.fips + ".json");
    if (!fs.existsSync(file)) continue;
    const orig = JSON.parse(fs.readFileSync(file, "utf8")).ocean;
    if (!orig.length) continue;
    const mine = figures(L, c.fips, Y, { ...opts, exclude: extra });
    const base = figures(L, c.fips, Y, opts);
    let e493 = 0, n493 = 0;
    for (const own of imp.OWNS) { const r = L.ctx.row(Y, c.fips, own, "493190"); if (r) { n493 += r[1]; if (r[0] !== "N") e493 += r[2]; } }
    for (const [sec, mv] of [["Tourism and Recreation", mine["Tourism and Recreation"]], ["Marine Transportation", { emp: base["Marine Transportation"].emp - e493, estabs: base["Marine Transportation"].estabs - n493 }]]) {
      const o = orig.find((r) => r.sector === sec);
      if (!o) continue;
      if (o.employment !== "SUP" && Number(o.employment)) adj[sec].employment.push({ county: c.name, diff: mv.emp / Number(o.employment) - 1 });
      if (o.establishments !== "SUP" && Number(o.establishments)) adj[sec].establishments.push({ county: c.name, diff: mv.estabs / Number(o.establishments) - 1 });
    }
  }
  for (const [sector, m] of Object.entries(adj)) for (const [measure, errs] of Object.entries(m)) adjusted.push({ sector, measure, errs });
  return { errs, perCounty, adjusted, byImp };
}
function enow2021Tables(res) {
  const row = (a) => [String(a.length), f1(median(a.map((x) => x.diff))), f1(median(a.map((x) => Math.abs(x.diff)))), f1(mean(a.map((x) => Math.abs(x.diff)))), f1(pctl(a.map((x) => Math.abs(x.diff)), 0.9))];
  let out = "";
  for (const [m, label] of [["emp", "Employment"], ["wages", "Wages"], ["estabs", "Establishments"], ["gdp", "GDP"]]) {
    out += "\n" + label + ", county by sector, 2021 (ours against the original ENOW; cells the original withholds or reports as zero are skipped):\n\n";
    out += table(["sector", "counties", "median difference (signed)", "median abs", "mean abs", "90th percentile abs"], E.MARINE_SECTOR_ORDER.filter((s) => res.errs[s] && res.errs[s][m]).map((s) => [s, ...row(res.errs[s][m])]));
  }
  if (res.adjusted) {
    out += "\nDefinition-adjusted (our figures with Open ENOW's extra NAICS codes removed: 713110, 721199, 721214 and 722410 dropped from tourism and recreation, and the published 493190 subtracted from marine transportation; withheld 493190 rows cannot be subtracted):\n\n";
    out += table(["sector", "measure", "counties", "median difference", "median abs", "mean abs"], res.adjusted.map((a) => [a.sector, a.measure, String(a.errs.length), f1(median(a.errs.map((x) => x.diff))), f1(median(a.errs.map((x) => Math.abs(x.diff)))), f1(mean(a.errs.map((x) => Math.abs(x.diff))))]));
  }
  if (res.byImp) {
    out += "\nThe same employment comparison split by how much of our county figure was imputed (below or at least 10%):\n\n";
    out += table(["sector", "counties, imputed < 10%", "median difference", "counties, imputed >= 10%", "median difference"], res.byImp.map((x) => [x.sec, String(x.lo.length), f1(median(x.lo)), String(x.hi.length), f1(median(x.hi))]));
  }
  const diffs = res.perCounty.map((x) => x.mine / x.orig - 1);
  const within = diffs.filter((d) => Math.abs(d) <= 0.1).length, above = diffs.filter((d) => d > 0).length, below = diffs.filter((d) => d < 0).length;
  out += "\nBy county, ocean-economy employment (the six sectors summed), 2021, after every change. Tourism and recreation is calibrated to the original's 2021 county figure, so this comparison is in-sample for that sector (where the original has one) and out of sample for the other five:\n\n";
  out += table(["county", "original ENOW", "ours", "difference", "share of ours imputed"], res.perCounty.map((x) => [x.county, f0(x.orig), f0(x.mine), (x.mine / x.orig - 1 >= 0 ? "+" : "") + ((x.mine / x.orig - 1) * 100).toFixed(1) + "%", f1(x.imputed)]));
  out += "\n" + res.perCounty.length + " counties: " + within + " within 10% of the original, " + (res.perCounty.length - within) + " outside 10%; " + above + " above the original and " + below + " below (median difference " + (median(diffs) >= 0 ? "+" : "") + (median(diffs) * 100).toFixed(1) + "%, median absolute difference " + (median(diffs.map(Math.abs)) * 100).toFixed(1) + "%).\n";
  return out;
}

// Marine transportation against the original ENOW 2021, split into definition and imputation: per county, our
// jobs, the same with the published 493190 rows removed from our pull, and how much of ours is imputed.
function marineTransportation(L) {
  const rows = [];
  for (const c of L.marineCounties) {
    const file = cachePath("econ-" + c.fips + ".json");
    if (!fs.existsSync(file)) continue;
    const o = JSON.parse(fs.readFileSync(file, "utf8")).ocean.find((r) => r.sector === "Marine Transportation");
    if (!o || o.employment === "SUP" || !Number(o.employment)) continue;
    const m = figures(L, c.fips, 2021)["Marine Transportation"];
    let e493 = 0, n493 = 0, wd = 0;
    for (const own of imp.OWNS) { const r = L.ctx.row(2021, c.fips, own, "493190"); if (!r) continue; n493 += r[1]; if (r[0] === "N") wd += r[1]; else e493 += r[2]; }
    const orig = Number(o.employment);
    rows.push({ county: c.name, orig, ours: m.emp, ex: m.emp - e493, imputed: m.emp > 0 ? m.empImp / m.emp : 0, e493, wd, estabsOrig: Number(o.establishments), estabsEx: m.estabs - n493 });
  }
  return rows;
}
function marineTransportationTables(rows) {
  const d = (a, b) => a / b - 1;
  const grp = (f) => rows.filter(f);
  const line = (label, g) => [label, String(g.length), f1(median(g.map((r) => d(r.ours, r.orig)))), f1(median(g.map((r) => d(r.ex, r.orig)))), f1(median(g.map((r) => Math.abs(d(r.ex, r.orig)))))];
  let out = "Marine transportation employment, 2021, ours against the original ENOW (22 counties where the original has a figure). \"Ours, minus 493190\" removes the published 493190 rows (Open ENOW's extra code) from our pull; a withheld 493190 row cannot be removed.\n\n";
  out += table(["group", "counties", "median difference, ours", "median difference, ours minus 493190", "median abs difference, ours minus 493190"], [
    line("all counties", rows),
    line("none of our figure imputed (share < 1%)", grp((r) => r.imputed < 0.01)),
    line("less than 10% imputed", grp((r) => r.imputed < 0.1)),
    line("10% or more imputed", grp((r) => r.imputed >= 0.1)),
    line("25% or more imputed", grp((r) => r.imputed >= 0.25)),
  ]);
  out += "\nBy county:\n\n" + table(["county", "original", "ours", "ours minus published 493190", "493190 removed (jobs)", "our imputed share", "establishments: original / ours minus 493190"], rows.map((r) => [r.county, f0(r.orig), f0(r.ours), f0(r.ex), f0(r.e493), f1(r.imputed), r.estabsOrig + " / " + Math.round(r.estabsEx)]));
  return out;
}

// --- 4. total economy -----------------------------------------------------------------------------------
// Our all-industry QCEW totals and eleven sectors for 2023 against NOAA's Total Economy (Coastal) series for
// 2023 (the series' newest year), and against what Phase 3 shipped (which was that NOAA series). `shipped` is
// a directory holding the Phase 3 snapshots (latest/<fips>.json).
function totalEconomy(L, shippedDir) {
  const API = { "Construction": "Construction", "Financial activities": "Financial Activities", "Education and health services": "Education and Health Services", "Information": "Information", "Leisure and hospitality": "Leisure and Hospitality", "Manufacturing": "Manufacturing", "Natural resources and mining": "Natural Resources and Mining", "Other services": "Other Services", "Professional and business services": "Professional and Business Services", "Public administration": "Public Administration", "Trade, transportation, and utilities": "Trade, Transportation, and Utilitie" };
  const g = E.makeGdp(L.ctx, L.gdp);
  const rows = { measure: { estabs: [], emp: [], wages: [], gdp: [], gdpExPA: [] }, sector: {} };
  const vsShipped = { jobs: [], wages: [], establishments: [], gdp: [] }, change = [];
  for (const c of spine.counties.filter((x) => x.tier === "full")) {
    const file = cachePath("econ-" + c.fips + ".json");
    if (!fs.existsSync(file)) continue;
    const noaa = JSON.parse(fs.readFileSync(file, "utf8")).coastal;
    if (!noaa.length) continue;
    const tot = noaa.find((r) => r.sector.startsWith("Total, all"));
    const mine = E.countyTotal(L.ctx, c.fips, 2023);
    const secs = E.totalSectors(L.ctx, c.fips, 2023, { superRatio: g.superRatio, year: 2023 });
    const gdpMine = Object.values(secs).reduce((s2, v) => s2 + (v.gdp || 0), 0);
    const d = (a, b) => (Number(b) ? a / Number(b) - 1 : null);
    rows.measure.estabs.push({ c: c.name, diff: d(mine.estabs, tot.establishments) });
    rows.measure.emp.push({ c: c.name, diff: d(mine.emp, tot.employment) });
    rows.measure.wages.push({ c: c.name, diff: d(mine.wages, tot.wages) });
    rows.measure.gdp.push({ c: c.name, diff: d(gdpMine, tot.gdp) });
    const pa = noaa.find((x) => x.sector.startsWith("Public Admin"));
    const noaaSectorSum = noaa.filter((x) => !/^Total|^Public Admin/.test(x.sector) && x.gdp !== "SUP").reduce((a, x) => a + Number(x.gdp), 0);
    rows.measure.gdpExPA.push({ c: c.name, diff: noaaSectorSum ? d(gdpMine, noaaSectorSum) : null });
    for (const [label, api] of Object.entries(API)) {
      const r = noaa.find((x) => x.sector.startsWith(api.slice(0, 20)));
      if (!r || r.employment === "SUP" || !Number(r.employment)) continue;
      const o = (rows.sector[label] = rows.sector[label] || { emp: [], wages: [], gdp: [] });
      o.emp.push({ c: c.name, diff: d(secs[label].emp, r.employment) });
      if (r.wages !== "SUP") o.wages.push({ c: c.name, diff: d(secs[label].wages, r.wages) });
      if (r.gdp !== "SUP" && Number(r.gdp)) o.gdp.push({ c: c.name, diff: d(secs[label].gdp, r.gdp) });
    }
    if (shippedDir) {
      const sf = path.join(shippedDir, "latest", c.fips + ".json");
      if (fs.existsSync(sf)) {
        const m = JSON.parse(fs.readFileSync(sf, "utf8")).topics["total-economy"].sections.measuring.data;
        vsShipped.jobs.push({ c: c.name, diff: d(mine.emp, m.jobs) }); vsShipped.wages.push({ c: c.name, diff: d(mine.wages, m.wages) });
        vsShipped.establishments.push({ c: c.name, diff: d(mine.estabs, m.establishments) }); vsShipped.gdp.push({ c: c.name, diff: d(gdpMine, m.gdp) });
        const m25 = E.countyTotal(L.ctx, c.fips, L.ctx.last);
        change.push({ c: c.name, jobs: d(m25.emp, m.jobs), wages: d(m25.wages, m.wages) });
      }
    }
  }
  return { rows, vsShipped, change };
}
function totalTables(t) {
  const st = (a) => { const v = a.filter((x) => x.diff !== null); return [String(v.length), f1(median(v.map((x) => x.diff))), f1(median(v.map((x) => Math.abs(x.diff)))), f1(pctl(v.map((x) => Math.abs(x.diff)), 0.9)), f1(Math.max(...v.map((x) => Math.abs(x.diff))))]; };
  const head = ["", "counties", "median difference", "median abs", "90th percentile abs", "max abs"];
  let out = "Ours (QCEW, 2023) against NOAA Total Economy (Coastal), 2023, county totals, 20 full-tier counties:\n\n";
  out += table(head, [["Establishments", ...st(t.rows.measure.estabs)], ["Jobs", ...st(t.rows.measure.emp)], ["Wages", ...st(t.rows.measure.wages)], ["GDP (ours has no Public administration)", ...st(t.rows.measure.gdp)], ["GDP, against the sum of NOAA's sectors without Public administration", ...st(t.rows.measure.gdpExPA)]]);
  out += "\nBy sector, employment, and wages, and GDP (median abs difference across counties; NOAA cells withheld or zero are skipped):\n\n";
  out += table(["sector", "counties", "employment: median difference", "median abs", "wages: median abs", "GDP: median abs"], Object.entries(t.rows.sector).map(([k, v]) => [k, String(v.emp.length), f1(median(v.emp.map((x) => x.diff))), f1(median(v.emp.map((x) => Math.abs(x.diff)))), f1(median(v.wages.map((x) => Math.abs(x.diff)))), f1(median(v.gdp.map((x) => Math.abs(x.diff))))]));
  if (t.vsShipped.jobs.length) {
    out += "\nOurs (QCEW, 2023) against what Phase 3 shipped (NOAA's 2023 series):\n\n";
    out += table(head, [["Establishments", ...st(t.vsShipped.establishments)], ["Jobs", ...st(t.vsShipped.jobs)], ["Wages", ...st(t.vsShipped.wages)], ["GDP", ...st(t.vsShipped.gdp)]]);
    out += "\nChange from what Phase 3 shipped (2023) to the new headline year:\n\n";
    out += table(["", "median change in jobs", "median change in wages"], [["all 20 counties", f1(median(t.change.map((x) => x.jobs))), f1(median(t.change.map((x) => x.wages)))]]);
  }
  return out;
}

async function main() {
  const L = await load();
  if (want("tolerance")) {
    console.log("## Shoreline-ZIP distance rule\n");
    const dist = L.shoreRes.dist;
    const rows = [];
    for (const tol of [0, 250, 500, 1000, 2000, 3000, 5000, 8000]) {
      const shares = computeShares(L.shoreRes.zbp, { dist }, tol);
      const s = sumCheck(L, { shares });
      const t = ["2019", "2023"].map((y) => f1(s.agg["Tourism and Recreation"][y].emp));
      const e = enow2021(L, { shares });
      const cty = e.errs["Tourism and Recreation"].emp;
      rows.push([tol + " m", Object.values(dist).filter((d) => d <= tol).length.toString(), ...t, f1(median(cty.map((x) => x.diff))), f1(median(cty.map((x) => Math.abs(x.diff)))), f1(mean(cty.map((x) => Math.abs(x.diff))))]);
    }
    console.log(table(["distance to coast", "ZIPs", "CA jobs 2019 vs Open ENOW", "CA jobs 2023 vs Open ENOW", "2021 county median diff vs original ENOW", "median abs", "mean abs"], rows));
  }
  if (want("backtest")) console.log("## Imputation backtest\n\n" + backtest(L));
  if (want("sum")) { const r = sumCheck(L); console.log("## Sum check against Open ENOW California\n" + sumCheckTables(r)); }
  if (want("total")) { const dirArg = args.find((a) => a.startsWith("--shipped=")); console.log("## Total economy\n\n" + totalTables(totalEconomy(L, dirArg ? dirArg.slice(10) : null))); }
  if (want("mt")) console.log("## Marine transportation\n\n" + marineTransportationTables(marineTransportation(L)));
  if (want("enow2021")) { console.log("## 2021 against original ENOW\n" + enow2021Tables(enow2021(L))); }
}

module.exports = { orig2021, totalEconomy, totalTables, load, figures, sumCheck, sumCheckTables, enow2021, enow2021Tables, backtest, median, mean, pctl, f1, f0, table };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
