// Economy sources for the two ENOW-backed topics: NOAA's ENOW ocean economy (marine economy), NOAA's
// Total Economy (Coastal) series (total economy), ENOW's self-employed workers series, and Census
// Nonemployer Statistics (self-employed workers for the total economy).
//
// The first three are served by the Digital Coast data API behind NOAA's Quick Report tool
// (coast.noaa.gov/enow/api/v1/...), which is what the tool's own "Download data" runs on. What the
// API returns, checked against every county: a suppressed value is the string "SUP" (a true zero is
// 0); a county outside a dataset's footprint returns an empty list. The pipeline never guesses at
// that footprint. It asks: an empty ENOW answer means the county is outside ENOW, an empty
// shoreline-county answer for an ENOW county means it is not shore-adjacent.
//
// ENOW's county-level data ends in 2021 (the original dataset is paused; its successor, Open ENOW,
// reports states and the nation only, not counties). Total Economy (Coastal) runs to 2023.

const fs = require("fs");
const { execFileSync } = require("child_process");
const { cachePath, cachedJson, getJson, request, readMeta, writeMeta, today } = require("./http");

const API = "https://coast.noaa.gov/enow/api/v1/";
const NES_BASE = "https://www2.census.gov/programs-surveys/nonemployer-statistics/datasets/";
const ENDPOINTS = { enow: API + "oceanEconomy/years", coastalEconomy: API + "coastalEconomy/years", nes: NES_BASE + "2023/historical-datasets/nonemp23co.zip" };

const CALIFORNIA = "06000";
const COASTAL_US = "00000";

const q = (kind, geotype, geoid, year) => getJson(`${API}${kind}?geotype=${geotype}&geoid=${geoid}&year=${year}`);

// The newest year for which the reference county (Orange, in every dataset) has rows.
async function newestYear(kind, geotype, geoid) {
  const { years } = await getJson(API + kind + "/years");
  for (const y of [...years].sort((a, b) => b - a)) if ((await q(kind, geotype, geoid, y)).length) return y;
  throw new Error("no " + kind + " year has data for " + geoid);
}

// State and national series are the same for every county: fetched once.
async function shared(opts) {
  const r = await cachedJson("econ-shared.json", async () => {
    const oceanYear = await newestYear("oceanEconomy", "ENOW", "06059");
    const selfYear = await newestYear("selfEmployment", "ENOW", "06059");
    const totalYear = await newestYear("coastalEconomy", "ShorelineCounties", "06059");
    const baseYear = oceanYear; // the year a marine share's denominator must match
    return {
      oceanYear, selfYear, totalYear, baseYear,
      oceanState: await q("oceanEconomy", "ENOW", CALIFORNIA, oceanYear),
      oceanNation: await q("oceanEconomy", "ENOW", COASTAL_US, oceanYear),
      // "Coastal California" in the total economy is the shoreline portion of the state.
      coastalState: await q("coastaleconomy", "StateCoastal", CALIFORNIA, totalYear),
      coastalNation: await q("coastaleconomy", "ShorelineCounties", COASTAL_US, totalYear),
      // All of California (every county), the denominator of "share of California's employment".
      californiaAll: await q("coastaleconomy", "CoastalStates", CALIFORNIA, totalYear),
    };
  }, opts);
  return r;
}

// One county's rows from each dataset, keyed as the snapshot builder reads them. An empty array
// means the county is outside that dataset's footprint (see the header).
async function fetchEconomy(fips, opts) {
  const sh = await shared(opts);
  const s = sh.value;
  const r = await cachedJson("econ-" + fips + ".json", async () => {
    const ocean = await q("oceanEconomy", "ENOW", fips, s.oceanYear);
    const self = await q("selfEmployment", "ENOW", fips, s.selfYear);
    const coastal = await q("coastaleconomy", "ShorelineCounties", fips, s.totalYear);
    // A marine share is of all jobs in the county that year. Shore-adjacent counties have that in the
    // shoreline series; an ENOW county that is not shore-adjacent (the delta counties) has it in the
    // watershed series.
    let base = await q("coastaleconomy", "ShorelineCounties", fips, s.baseYear);
    let baseSeries = "ShorelineCounties";
    if (!base.length) { base = await q("coastaleconomy", "WatershedCounties", fips, s.baseYear); baseSeries = "WatershedCounties"; }
    return { ocean, self, coastal, base, baseSeries };
  }, opts);
  return { value: { ...s, ...r.value }, fetched: r.fetched < sh.fetched ? r.fetched : sh.fetched };
}

// --- Census Nonemployer Statistics: self-employed workers by sector (total economy) ---------------------
// A nonemployer establishment is a business with no paid employees, run by its owner: ENOW's own
// self-employed series is built from the same data. County x 2-digit NAICS; ESTAB_F "S" means
// withheld, and a sector with no row in a county has none.

async function fetchNonemployer(fipsList, opts) {
  const name = "nes-all.json";
  const cached = readMeta(name);
  if (!opts?.refresh && cached && fs.existsSync(cachePath(name))) {
    const value = JSON.parse(fs.readFileSync(cachePath(name), "utf8"));
    if (fipsList.every((f) => value.counties[f])) return { value, fetched: cached.fetched };
  }
  let year = null;
  for (let y = new Date().getFullYear(); y >= 2019 && !year; y--) {
    try { await request(`${NES_BASE}${y}/historical-datasets/nonemp${String(y).slice(2)}co.zip`, { method: "HEAD" }); year = y; } catch (_) { /* not published */ }
  }
  if (!year) throw new Error("no Nonemployer Statistics county file found");
  const yy = String(year).slice(2);
  const zip = cachePath("nonemp" + yy + "co.zip");
  if (!fs.existsSync(zip)) fs.writeFileSync(zip, Buffer.from(await (await request(`${NES_BASE}${year}/historical-datasets/nonemp${yy}co.zip`)).arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zip, "-d", cachePath("nes")]);
  const set = new Set(fipsList);
  const counties = Object.fromEntries(fipsList.map((f) => [f, {}]));
  const lines = fs.readFileSync(cachePath("nes/nonemp" + yy + "co.txt"), "utf8").split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const c = line.split(",").map((x) => x.replace(/^"|"$/g, ""));
    if (c[0] !== "06") continue;
    const fips = c[0] + c[1];
    if (!set.has(fips)) continue;
    const naics = c[2];
    if (!/^(00|\d\d|\d\d-\d\d)$/.test(naics)) continue; // 2-digit sectors and the county total
    counties[fips][naics] = c[3] === "S" || c[4] === "" ? { suppressed: true } : { estab: Number(c[4]) };
  }
  const value = { year, counties };
  fs.writeFileSync(cachePath(name), JSON.stringify(value));
  writeMeta(name);
  return { value, fetched: today() };
}

module.exports = { ENDPOINTS, fetchEconomy, fetchNonemployer };
