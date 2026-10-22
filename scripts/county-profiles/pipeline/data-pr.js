#!/usr/bin/env node
// The data PR's title and body, for .github/workflows/county-profiles.yml. A run either opens a new
// data PR or adds a commit to the one already open (a retry), so the PR describes every attempt that
// went into it: counties recomputed and failed are merged across attempts, a county that has since
// succeeded comes off the failed list, and the Runs section gains one line per attempt. The merged
// state rides along in a hidden comment at the end of the body, so nothing is parsed out of the prose.
//
//   node scripts/county-profiles/pipeline/data-pr.js --body <out.md> [--comments <dir>] [--previous <old-body.md>] [--no-data] [--base <ref>]
//
// Prints the title on stdout. Reads gate.log (the gate's output) from the working directory and
// .cache/run-outcomes.json and .cache/run-failures.json from the recompute; the run's identity comes
// from the GITHUB_* environment. --no-data records an attempt that committed nothing (every county
// failed) in an open PR's Runs and failed lists, leaving everything else as it was.
//
// The Changes section compares each recomputed county's latest/ file in the working tree with the one on
// --base (origin/main), through snapshot-diff.js, the same comparison the site's data changelog uses. It is
// rebuilt from the branch on every attempt, never appended to. When the whole body would pass GitHub's
// 65,536-character limit, the per-county detail moves to PR comments: one file per comment is written to
// --comments (emptied first), and pr-comments.js replaces the PR's earlier detail comments with them.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { cachePath, today } = require("./http");
const { diffSnapshots, NOTABLE_CHANGE } = require("../snapshot-diff");
const spine = require("../../../site/_data/countySpine.json");

// GitHub refuses a PR body or comment over 65,536 characters; the margin covers counting differences.
const BODY_LIMIT = 65536 - 1536;
const TITLE_MAX = 80;
const COMMENT_MARK = "<!-- county-profiles-data-pr-changes -->";
const LATEST = "site/data/county-profiles/latest/";

const STATE = /<!-- county-profiles-data-pr (\{.*\}) -->/;
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const readJsonOr = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);

function previousState(file) {
  const m = file && fs.existsSync(file) ? fs.readFileSync(file, "utf8").match(STATE) : null;
  return m ? JSON.parse(m[1]) : { opened: today(), recomputed: {}, failed: {}, runs: [] };
}

// "06075 San Francisco: recompute (forced)" -> {"06075": "forced"}
function gateReasons(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^(\d{5}) .*?: recompute \((.*)\)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function merge(state, { outcomes, failures, reasons, run }) {
  const s = JSON.parse(JSON.stringify(state));
  for (const o of outcomes) {
    s.recomputed[o.fips] = { county: o.county, reason: reasons[o.fips] || "recomputed", action: o.action, snapshot: o.snapshot };
    delete s.failed[o.fips];
  }
  // A county already recomputed in this PR keeps that data; a later failure of it changes nothing.
  for (const f of failures) if (!s.recomputed[f.fips]) s.failed[f.fips] = { county: f.county, error: f.error };
  s.runs.push({ date: today(), ...run, recomputed: outcomes.map((o) => o.fips), failed: failures.map((f) => f.fips) });
  return s;
}

// Dated snapshot directories this branch adds, against main.
function addedSnapshots() {
  let names = "";
  try { names = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", "origin/main...HEAD", "--", "site/data/county-profiles"], { encoding: "utf8" }); } catch (_) { return []; }
  const counts = {};
  for (const f of names.split("\n")) { const m = f.match(/^site\/data\/county-profiles\/(\d{4}-\d{2}-\d{2})\//); if (m) counts[m[1]] = (counts[m[1]] || 0) + 1; }
  return Object.entries(counts).sort();
}

const list = (fipsList) => (fipsList.length ? fipsList.join(", ") : "none");

// Each recomputed county's latest/ snapshot on the branch against the one on `base`, by county name.
function countyChanges(fipsList, base = "origin/main") {
  const before = (fips) => { try { return JSON.parse(execFileSync("git", ["show", base + ":" + LATEST + fips + ".json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 })); } catch (_) { return null; } };
  return fipsList.map((fips) => diffSnapshots(before(fips), JSON.parse(fs.readFileSync(path.resolve(LATEST + fips + ".json"), "utf8")))).sort((a, b) => a.county.localeCompare(b.county));
}

// "all 27 counties", "3 counties: Alameda, Marin, Napa", "San Francisco"; the count alone when the names make it long.
function titleOf(s) {
  const fips = Object.keys(s.recomputed), failed = Object.keys(s.failed).length;
  const names = fips.map((f) => s.recomputed[f].county).sort();
  const tail = " (" + s.opened + ")" + (failed ? " (partial: " + failed + " failed)" : "");
  const of = (what) => "County Profiles data: " + what + tail;
  if (!fips.length) return of("refresh");
  if (fips.length === 1) return of(names[0]);
  if (fips.length === spine.counties.length) return of("all " + fips.length + " counties");
  const named = of(fips.length + " counties: " + names.join(", "));
  return named.length <= TITLE_MAX ? named : of(fips.length + " counties");
}

const cell = (t) => String(t).replace(/\|/g, "\\|");
const where = (f) => f.topicLabel + (f.sectionShort ? ", " + f.sectionShort : "");
const pctOf = (x) => (x === null || x === undefined ? "none" : (x * 100).toFixed(2) + "%");
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

// One county's detail: the figure table, then source vintages, periods, state changes, availability, estimates and
// anything else, each only when present.
function countyDetail(d) {
  const numbers = d.figures.filter((f) => f.type === "number"), states = d.figures.filter((f) => f.type === "state");
  const vintages = [...d.sources.vintage.map((v) => v.name + ": " + v.from + " to " + v.to), ...d.sources.added.map((v) => v.name + ": added (" + v.vintage + ")"), ...d.sources.removed.map((v) => v.name + ": removed (was " + v.vintage + ")")];
  const blocks = [];
  if (numbers.length) blocks.push(["| Section | Figure | Old | New | Change |", "|---|---|---|---|---:|", ...numbers.map((f) => "| " + [where(f), f.label, f.from.text, f.to.text, f.changeText].map(cell).join(" | ") + " |")].join("\n"));
  if (vintages.length) blocks.push("Source vintages:\n\n" + vintages.map((v) => "- " + v).join("\n"));
  if (d.periods.length) blocks.push("Periods:\n\n" + d.periods.map((p) => "- " + p.text + " (" + p.sections.join(", ") + ")").join("\n"));
  if (states.length) blocks.push("State changes:\n\n" + states.map((f) => "- " + where(f) + ": " + f.label + ": " + f.from.text + " to " + f.to.text).join("\n"));
  if (d.availability.length) blocks.push("Availability:\n\n" + d.availability.map((a) => "- " + where(a) + ": " + a.from + " to " + a.to).join("\n"));
  if (d.estimation.length) blocks.push("Estimates, provenance only (`est`; " + (d.estimation.some((e) => e.effect !== "none") ? "an effect is a state change listed above" : "no ≈ marker or withheld state changed") + "):\n\n" + d.estimation.map((e) => "- " + (e.topicId ? where(e) + ": " : "") + e.label + (e.fields.length ? ": " + e.fields.map((x) => (x.field === "step" ? "step " + x.from + " to " + x.to : x.field + " " + pctOf(x.from) + " to " + pctOf(x.to))).join(", ") : " changed") + (e.effect === "marker" ? " (flips the ≈ marker)" : e.effect === "withheld" ? " (changes the withheld state)" : "")).join("\n"));
  if (d.other.length) blocks.push("Other content:\n\n" + d.other.map((o) => "- " + o.text).join("\n"));
  return blocks.join("\n\n");
}

const countyHead = (d) => "#### " + d.county + " (" + d.fips + ")\n\n" + d.summary;
function countyBlock(d) {
  if (d.stampsOnly || d.first) return countyHead(d);
  const n = d.figures.length;
  return countyHead(d) + "\n\n<details><summary>Detail: " + [plural(n, "figure", "figures"), d.sources.vintage.length ? plural(d.sources.vintage.length, "source vintage", "source vintages") : null].filter(Boolean).join(", ") + "</summary>\n\n" + countyDetail(d) + "\n\n</details>";
}

// The Changes section. `inline` false leaves the per-county detail out (it goes to comments) and says so.
function changesSection(diffs, inline, comments) {
  const notable = diffs.flatMap((d) => d.figures.filter((f) => f.notable).map((f) => ({ d, f })));
  const unexplained = diffs.filter((d) => d.unexplained.length);
  const out = ["### Changes", "", "Each recomputed county's `latest/` file against `main`'s, by `scripts/county-profiles/snapshot-diff.js` (stamps ignored). The site's data changelog uses the same comparison.", ""];
  out.push("**Notable** (" + Math.round(NOTABLE_CHANGE * 100) + "% or more, or a change of state):", "");
  out.push(notable.length ? notable.map(({ d, f }) => "- " + d.county + ", " + where(f) + ": " + f.label + ": " + f.from.text + " to " + f.to.text + (f.changeText ? " (" + f.changeText + ")" : "")).join("\n") : "- none");
  out.push("", "**Changed without a source update** (no source the section cites changed vintage: an untracked source edit, or non-determinism in the pipeline):", "");
  out.push(unexplained.length ? unexplained.map((d) => {
    const by = new Map();
    for (const f of d.unexplained) {
      if (!by.has(f.topicLabel)) by.set(f.topicLabel, { sections: new Set(), n: 0 });
      const t = by.get(f.topicLabel);
      for (const x of f.type ? [f.sectionShort] : f.sections) t.sections.add(x); // a figure, or a period (several sections)
      t.n += 1;
    }
    return "- " + d.county + ": " + [...by.entries()].map(([k, t]) => k + " (" + [...t.sections].join(", ") + "): " + plural(t.n, "change", "changes")).join("; ");
  }).join("\n") : "- none");
  out.push("", "**By county**", "");
  out.push(inline ? diffs.map(countyBlock).join("\n\n") : diffs.map(countyHead).join("\n\n") + "\n\nThe detail for each county is in " + plural(comments, "comment", "comments") + " below; it would take this description past GitHub's 65,536-character limit.");
  return out.join("\n");
}

// Pack the per-county detail into as few comments as fit, in county order.
function detailComments(diffs) {
  const blocks = diffs.filter((d) => !d.stampsOnly && !d.first).map(countyBlock);
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && (last + "\n\n" + b).length < BODY_LIMIT - 200) out[out.length - 1] = last + "\n\n" + b;
    else out.push(b);
  }
  return out.map((b, i) => COMMENT_MARK + "\n### Changes in detail (" + (i + 1) + " of " + out.length + ")\n\n" + b + "\n");
}

function render(s, diffs = []) {
  const full = renderWith(s, diffs, true, 0);
  if (full.body.length <= BODY_LIMIT) return { ...full, comments: [] };
  const comments = detailComments(diffs);
  return { ...renderWith(s, diffs, false, comments.length), comments };
}

function renderWith(s, diffs, inline, commentCount) {
  const fips = Object.keys(s.recomputed).sort();
  const failed = Object.keys(s.failed).sort();
  const latest = s.runs.filter((r) => !r.noData).pop() || s.runs[s.runs.length - 1];
  const title = titleOf(s);
  const added = addedSnapshots();
  const body = [
    "### Counties recomputed", "",
    fips.length ? fips.map((f) => { const r = s.recomputed[f]; return "- " + f + " " + r.county + ": " + r.reason + " (" + r.action + ", snapshot " + r.snapshot + ")"; }).join("\n") : "- none",
    "",
    ...(diffs.length ? [changesSection(diffs, inline, commentCount), ""] : []),
    ...(failed.length ? [
      "### Failed counties", "",
      failed.map((f) => "- " + f + " " + s.failed[f].county + ": " + s.failed[f].error).join("\n"), "",
      "To retry, use \"Re-run failed jobs\" on the latest run below, or dispatch the workflow with counties `" + failed.join(",") + "` (and `force` on if the failed run was forced). Either adds a commit to this PR, recomputing only the counties it does not have yet, and reuses the downloads cached this month. Merge once the title no longer says \"partial\".", "",
    ] : []),
    "### Snapshots", "",
    added.length ? "New dated snapshot directories:\n\n" + added.map(([d, n]) => "- `" + d + "/` (" + n + " " + (n === 1 ? "county" : "counties") + ")").join("\n") : "No new dated snapshot: stamps in `latest/` refreshed only.",
    "",
    "### Checks", "",
    "`check-archive.js`, `state-report.js`, the Eleventy build and `check-links.js` passed in [the latest run](" + latest.url + ") that committed data.",
    "",
    "### Runs", "",
    s.runs.map((r) => "- " + r.date + ": [run #" + r.number + ", attempt " + r.attempt + "](" + r.url + "): recomputed " + list(r.recomputed) + "; failed " + list(r.failed) + (r.noData ? " (nothing committed)" : "")).join("\n"),
    "",
    "Only one data PR is open at a time; a new run adds to this one. Merge with Create a merge commit. `deploy.yml` publishes the site when this merges.",
    "",
    "<!-- county-profiles-data-pr " + JSON.stringify(s) + " -->",
    "",
  ].join("\n");
  return { title, body };
}

function main() {
  const out = arg("--body");
  if (!out) throw new Error("usage: data-pr.js --body <out.md> [--previous <old-body.md>] [--no-data]");
  const env = process.env;
  const url = env.GITHUB_SERVER_URL + "/" + env.GITHUB_REPOSITORY + "/actions/runs/" + env.GITHUB_RUN_ID + "/attempts/" + env.GITHUB_RUN_ATTEMPT;
  const run = { number: env.GITHUB_RUN_NUMBER, attempt: env.GITHUB_RUN_ATTEMPT, url };
  const noData = process.argv.includes("--no-data");
  const state = merge(previousState(arg("--previous")), {
    outcomes: noData ? [] : readJsonOr(cachePath("run-outcomes.json"), []),
    failures: readJsonOr(cachePath("run-failures.json"), []),
    reasons: gateReasons(path.resolve("gate.log")),
    run: noData ? { ...run, noData: true } : run,
  });
  const { title, body, comments } = render(state, countyChanges(Object.keys(state.recomputed), arg("--base") || "origin/main"));
  fs.writeFileSync(out, body);
  const dir = arg("--comments");
  if (dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    comments.forEach((c, i) => fs.writeFileSync(path.join(dir, "changes-" + String(i + 1).padStart(2, "0") + ".md"), c));
  }
  console.log(title);
}

if (require.main === module) main();
module.exports = { merge, render, renderWith, previousState, titleOf, countyChanges, COMMENT_MARK, BODY_LIMIT };
