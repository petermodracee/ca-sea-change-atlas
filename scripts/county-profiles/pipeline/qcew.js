// BLS Quarterly Census of Employment and Wages, annual averages, by county and NAICS code.
//
// Source: the public "annual by area" files, data.bls.gov/cew/data/files/<year>/csv/<year>_annual_by_area.zip
// (one CSV per area inside). The per-area API (data.bls.gov/cew/data/api/<year>/a/area/<fips>.csv) has full
// industry detail only from 2014, so the bulk files are used for every year, one route throughout. A year's
// zip is about 120 MB; the pipeline extracts only the counties it needs (and California, for the state
// series), keeps the raw CSVs in the gitignored cache and the rows it uses as compact JSON, and deletes the
// zip. QCEW is public (no key), so this needs nothing but the network. The runner's own access to
// data.bls.gov is unverified until the workflow runs there (docs/COUNTY-PROFILES.md).
//
// A row is [disclosure, establishments, employment, wages] for one (area, ownership, NAICS code). QCEW
// publishes NAICS rows by ownership (1 federal, 2 state, 3 local, 5 private); ownership 0 exists only for
// the all-industry total (industry code 10). A suppressed row has disclosure code "N": its establishment
// count is still published, its employment and wages read 0 and mean "withheld". A code with no row in a
// county has no establishments there (a true zero).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { CACHE_DIR, cachePath, readMeta, writeMeta, today } = require("./http");
const { FIRST_YEAR, codeFilter } = require("./enow-def");

const BASE = "https://data.bls.gov/cew/data/files/";
const STATE = "06000";
// A descriptive User-Agent with contact information, as BLS asks of automated users.
const UA = "CASCA-county-profiles/1.0 (California Sea Change Atlas; https://seachangeatlas.org; https://github.com/petermodracee/ca-sea-change-atlas)";
const zipUrl = (year) => `${BASE}${year}/csv/${year}_annual_by_area.zip`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function head(url) {
  const res = await fetch(url, { method: "HEAD", headers: { "user-agent": UA } });
  return res.ok;
}

// The newest year with an annual by-area file. QCEW annual data appear about nine months after year end.
async function latestYear() {
  for (let y = new Date().getUTCFullYear(); y >= FIRST_YEAR; y--) if (await head(zipUrl(y))) return y;
  throw new Error("no QCEW annual by-area file found");
}

async function download(url, dest) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
      return;
    } catch (e) { lastErr = e; await sleep(3000 * attempt); }
  }
  throw lastErr;
}

// One CSV line into fields. QCEW quotes text fields; a title can contain a comma ("Orange County, California").
function splitCsv(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseArea(file, need) {
  const lines = fs.readFileSync(file, "latin1").split(/\r?\n/);
  const head = splitCsv(lines[0]);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } throw new Error("QCEW column missing: " + names.join("/") + " in " + file); };
  const iOwn = col("own_code"), iInd = col("industry_code"), iDisc = col("disclosure_code");
  const iEst = col("annual_avg_estabs_count", "annual_avg_estabs"), iEmp = col("annual_avg_emplvl"), iWag = col("total_annual_wages");
  const rows = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = splitCsv(lines[i]);
    const ind = c[iInd];
    if (!need.has(ind)) continue;
    rows[c[iOwn] + "|" + ind] = [c[iDisc] === "N" ? "N" : "", Number(c[iEst]), Number(c[iEmp]), Number(c[iWag])];
  }
  return rows;
}

// {year -> {fips -> {"own|code" -> [disc, estabs, emp, wages]}}} for the counties (and California) asked for,
// FIRST_YEAR to the newest published year.
async function fetchQcew(fipsList, opts = {}) {
  const need = { has: codeFilter() };
  const areas = [...new Set([STATE, ...fipsList])];
  const last = opts.lastYear || (await latestYear());
  const years = {};
  let retrieved = null;
  for (let year = FIRST_YEAR; year <= last; year++) {
    const name = "qcew-" + year + ".json";
    const meta = readMeta(name);
    if (!opts.refresh && meta && fs.existsSync(cachePath(name))) {
      const cached = JSON.parse(fs.readFileSync(cachePath(name), "utf8"));
      if (areas.every((a) => cached[a])) { years[year] = cached; retrieved = retrieved && retrieved < meta.fetched ? retrieved : meta.fetched; continue; }
    }
    // A year's cached JSON may hold other counties from an earlier run: keep them, add what is missing.
    const have = !opts.refresh && fs.existsSync(cachePath(name)) ? JSON.parse(fs.readFileSync(cachePath(name), "utf8")) : {};
    const dir = cachePath("qcew/" + year);
    fs.mkdirSync(dir, { recursive: true });
    const zip = cachePath("qcew/" + year + "_annual_by_area.zip");
    const files = {};
    const missing = areas.filter((a) => !have[a]);
    const pending = missing.filter((a) => { const f = fs.readdirSync(dir).find((n) => new RegExp("annual " + a + " ").test(n)); if (f) files[a] = path.join(dir, f); return !f; });
    if (pending.length) {
      console.error("[QCEW " + year + "] downloading " + zipUrl(year));
      await download(zipUrl(year), zip);
      const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
      const pick = pending.map((a) => {
        const n = names.find((x) => new RegExp("annual " + a + " ").test(x));
        if (!n) throw new Error("QCEW " + year + ": no file for area " + a);
        return n;
      });
      execFileSync("unzip", ["-o", "-q", "-j", zip, ...pick, "-d", dir], { maxBuffer: 64 * 1024 * 1024 });
      for (const a of pending) files[a] = path.join(dir, fs.readdirSync(dir).find((n) => new RegExp("annual " + a + " ").test(n)));
      fs.unlinkSync(zip);
    }
    const out = { ...have };
    for (const a of missing) out[a] = parseArea(files[a], need);
    fs.writeFileSync(cachePath(name), JSON.stringify(out));
    writeMeta(name);
    years[year] = out;
    retrieved = retrieved && retrieved < today() ? retrieved : today();
  }
  return { value: { years, first: FIRST_YEAR, last, state: STATE }, fetched: retrieved || today(), sourceUrl: BASE };
}

module.exports = { fetchQcew, latestYear, STATE, UA, zipUrl, splitCsv };
