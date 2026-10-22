// Fetch helpers for the County Profiles pipeline: retrying JSON requests, ArcGIS REST paging, a
// streaming line reader for big bulk files, and a disk cache (scripts/county-profiles/.cache/,
// gitignored) so a re-run does not re-download what it already has. A cache entry is a payload file
// plus a sidecar `<name>.meta.json` recording when it was fetched; that date becomes the source's
// `retrieved` stamp in the snapshot.
//
// Every request goes through undici's own fetch with one shared Agent, not Node's built-in fetch:
// the built-in one allows 10 s to connect, TLS handshake included, and chs.coast.noaa.gov took 17 to
// 24 s to finish its handshake from every location tested on 2026-10-22 (docs/DECISIONS.md). The
// Agent is used with the undici package's fetch rather than passed to the built-in fetch as a
// dispatcher, because the bundled and npm copies of undici are different versions and mixing them
// is not supported.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { fetch, Agent } = require("undici");

const CACHE_DIR = path.join(__dirname, "..", ".cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// connect.timeout covers the TCP connect and the TLS handshake. undici's headers and body timeouts
// (300 s each, the body one between chunks) stay at their defaults.
const agent = new Agent({ connect: { timeout: 90_000 } });
const UA = "seachangeatlas-county-profiles-pipeline (+https://seachangeatlas.org)";

// Six attempts, waiting about 7.5, 15, 30, 60 and 120 s between them (each scaled by a random 0.5
// to 1.5), so a source that is down for a few minutes does not fail the county. A 4xx other than 408
// and 429 is the server's answer, not an outage, and is thrown at once: the LODES and Nonemployer
// year probes rely on a 404 for a year not yet published coming back quickly.
const RETRY = { attempts: 6, baseMs: 7500 };
const backoff = (attempt) => Math.round(RETRY.baseMs * 2 ** (attempt - 1) * (0.5 + Math.random()));

class HttpError extends Error {
  constructor(status, url) { super("HTTP " + status + " for " + url); this.status = status; }
}
const retryable = (e) => !(e instanceof HttpError) || e.status >= 500 || e.status === 408 || e.status === 429;
const errorCode = (e) => (e instanceof HttpError ? "HTTP " + e.status : e.cause?.code || e.code || e.cause?.message || e.message);

// Runs `attempt()` up to RETRY.attempts times, logging each retry with the host and the error code.
async function withRetries(url, attempt) {
  const host = new URL(url).host;
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (e) {
      if (n >= RETRY.attempts || !retryable(e)) throw e;
      const wait = backoff(n);
      console.error("[http] " + host + ": " + errorCode(e) + " (attempt " + n + " of " + RETRY.attempts + "), retrying in " + Math.round(wait / 1000) + " s");
      await sleep(wait);
    }
  }
}

async function fetchOnce(url, opts) {
  const res = await fetch(url, { dispatcher: agent, ...opts, headers: { "user-agent": UA, ...opts.headers } });
  if (!res.ok) { await res.body?.cancel(); throw new HttpError(res.status, url); }
  return res;
}

// Resolves once the response headers are in; reading the body is the caller's job and is not retried.
async function request(url, opts = {}) {
  return withRetries(url, () => fetchOnce(url, opts));
}

// Downloads a large file to `dest`. It is written to `dest + ".part"` and renamed only once complete,
// so a broken transfer never leaves a truncated file for the next run to open; a transfer that fails
// mid-stream is retried from the start.
async function downloadFile(url, dest) {
  const part = dest + ".part";
  try {
    await withRetries(url, async () => {
      fs.rmSync(part, { force: true });
      const res = await fetchOnce(url, {});
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
    });
    fs.renameSync(part, dest);
  } finally {
    fs.rmSync(part, { force: true });
  }
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
  const res = await request(url, { method: "GET", headers: { range: "bytes=0-0" } });
  await res.body?.cancel();
  return today();
}

module.exports = { CACHE_DIR, today, request, downloadFile, getJson, cachePath, readMeta, writeMeta, cachedJson, arcgisQueryAll, streamLines, verifyEndpoint };
