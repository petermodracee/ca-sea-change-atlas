// Fetch helpers for the County Profiles pipeline: retrying JSON requests, ArcGIS REST paging, a
// streaming line reader for big bulk files, and a disk cache (scripts/county-profiles/.cache/,
// gitignored) so a re-run does not re-download what it already has. A cache entry is a payload file
// plus a sidecar `<name>.meta.json` recording when it was fetched; that date becomes the source's
// `retrieved` stamp in the snapshot.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { Readable } = require("stream");

const CACHE_DIR = path.join(__dirname, "..", ".cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, opts = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "seachangeatlas-county-profiles-pipeline (+https://seachangeatlas.org)" }, ...opts });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

// ArcGIS REST reports failures as HTTP 200 with an `error` body.
async function getJson(url) {
  const res = await request(url);
  const json = await res.json();
  if (json && json.error) throw new Error("ArcGIS error for " + url + ": " + JSON.stringify(json.error));
  return json;
}

function cachePath(name) {
  return path.join(CACHE_DIR, name);
}

function readMeta(name) {
  const p = cachePath(name + ".meta.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

function writeMeta(name, extra = {}) {
  fs.writeFileSync(cachePath(name + ".meta.json"), JSON.stringify({ fetched: today(), ...extra }, null, 2));
}

// Runs `produce()` (which returns a JSON-serialisable value) unless a cached copy exists. Returns
// {value, fetched} where `fetched` is the date the data was actually retrieved. Delete the cache
// file (or run with --refresh) to force a re-fetch.
async function cachedJson(name, produce, { refresh = false } = {}) {
  const p = cachePath(name);
  const meta = readMeta(name);
  if (!refresh && meta && fs.existsSync(p)) return { value: JSON.parse(fs.readFileSync(p, "utf8")), fetched: meta.fetched, meta };
  const value = await produce();
  fs.writeFileSync(p, JSON.stringify(value));
  writeMeta(name);
  return { value, fetched: today(), meta: { fetched: today() } };
}

// Pages an ArcGIS `query` endpoint with resultOffset until the server stops saying it exceeded its
// transfer limit. `params` is a plain object of query-string params; `f=json` is added.
async function arcgisQueryAll(layerUrl, params, { pageSize } = {}) {
  const out = [];
  let offset = 0;
  const size = pageSize || 1000;
  for (;;) {
    const qs = new URLSearchParams({ ...params, f: "json", resultOffset: String(offset), resultRecordCount: String(size) });
    const j = await getJson(layerUrl + "/query?" + qs);
    for (const f of j.features || []) out.push(f);
    if (!j.exceededTransferLimit || !(j.features || []).length) break;
    offset += j.features.length;
  }
  return out;
}

// Streams a (possibly large) remote text file line by line, calling `onLine` for each. `gunzip`
// decompresses a .gz body. Nothing is written to disk, so a 200 MB national table costs bandwidth
// and no space.
async function streamLines(url, onLine, { gunzip = false } = {}) {
  const res = await request(url);
  let stream = Readable.fromWeb(res.body);
  if (gunzip) stream = stream.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) onLine(line);
}

// Confirms an endpoint still answers; returns today's date for the source's `verified` stamp.
async function verifyEndpoint(url) {
  const res = await request(url, { method: "GET", headers: { range: "bytes=0-0", "user-agent": "seachangeatlas-county-profiles-pipeline" } });
  await res.body?.cancel();
  return today();
}

module.exports = { CACHE_DIR, today, request, getJson, cachePath, readMeta, writeMeta, cachedJson, arcgisQueryAll, streamLines, verifyEndpoint };
