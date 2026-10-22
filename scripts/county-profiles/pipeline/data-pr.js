#!/usr/bin/env node
// The data PR's title and body, for .github/workflows/county-profiles.yml. A run either opens a new
// data PR or adds a commit to the one already open (a retry), so the PR describes every attempt that
// went into it: counties recomputed and failed are merged across attempts, a county that has since
// succeeded comes off the failed list, and the Runs section gains one line per attempt. The merged
// state rides along in a hidden comment at the end of the body, so nothing is parsed out of the prose.
//
//   node scripts/county-profiles/pipeline/data-pr.js --body <out.md> [--previous <old-body.md>] [--no-data]
//
// Prints the title on stdout. Reads gate.log (the gate's output) from the working directory and
// .cache/run-outcomes.json and .cache/run-failures.json from the recompute; the run's identity comes
// from the GITHUB_* environment. --no-data records an attempt that committed nothing (every county
// failed) in an open PR's Runs and failed lists, leaving everything else as it was.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { cachePath, today } = require("./http");

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

function render(s) {
  const fips = Object.keys(s.recomputed).sort();
  const failed = Object.keys(s.failed).sort();
  const latest = s.runs.filter((r) => !r.noData).pop() || s.runs[s.runs.length - 1];
  const title = "County Profiles data: " + (fips.length ? fips.join(", ") : "refresh") + " (" + s.opened + ")" + (failed.length ? " (partial: " + failed.length + " failed)" : "");
  const added = addedSnapshots();
  const body = [
    "### Counties recomputed", "",
    fips.length ? fips.map((f) => { const r = s.recomputed[f]; return "- " + f + " " + r.county + ": " + r.reason + " (" + r.action + ", snapshot " + r.snapshot + ")"; }).join("\n") : "- none",
    "",
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
  const { title, body } = render(state);
  fs.writeFileSync(out, body);
  console.log(title);
}

if (require.main === module) main();
module.exports = { merge, render, previousState };
