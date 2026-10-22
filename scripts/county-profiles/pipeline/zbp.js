// Shoreline share of tourism and recreation, from Census ZIP Code Business Patterns (ZBP).
//
// Open ENOW counts a hotel, restaurant or similar "partly ocean-related" industry only where the
// establishment is in a shoreline-adjacent ZIP code, and uses ZBP to estimate that share of a county's
// jobs (NOAA, "Introducing the Open ENOW Dataset", 2026). NOAA does not publish the ZIP list (checked:
// the Open ENOW document, the ENOW FAQ and crosswalk, the Digital Coast data page). So it is derived here:
//
//   A California ZIP Code Tabulation Area (2020, TIGERweb) is shoreline-adjacent when it lies within
//   SHORE_TOLERANCE_M of the Census coastline (TIGER/Line COASTLINE: the open coast) or of the boundary of a
//   Census tidal water area (areal hydrography, bays, estuaries and ocean). The coastline file alone misses the
//   interior shores of San Francisco Bay and other estuaries (Oakland reads 11 km from it), so the water
//   boundaries are added. The distance is calibrated against Open ENOW's California total (enow-def.js).
//
// ZBP publishes establishments by ZIP, 6-digit NAICS and employment-size class; employment itself is
// withheld or given as a range. A code's employment in a ZIP is estimated from the size classes (class
// midpoints; establishments in a class withheld with "N" are given the code's statewide average size).
// A ZIP is assigned wholly to the county ZBP names for it. The share is computed once, from the newest
// ZBP vintage, and applied to every QCEW year (the shoreline does not move; the mix of businesses does,
// slowly). Both simplifications are recorded in docs/DECISIONS.md.

const fs = require("fs");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { getJson, cachePath, readMeta, writeMeta, cachedJson, today } = require("./http");
const { UA, splitCsv } = require("./qcew");
const { MARINE_CODES, SHORE_TOLERANCE_M } = require("./enow-def");


const CBP = "https://www2.census.gov/programs-surveys/cbp/datasets/";
const COAST = (y) => `https://www2.census.gov/geo/tiger/TIGER${y}/COASTLINE/tl_${y}_us_coastline.zip`;
const WATER_LAYER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer/1";
const ZCTA_LAYER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1";
// Size-class midpoints for n<5, 5-9, 10-19, 20-49, 50-99, 100-249, 250-499, 500-999, 1000+.
const MID = [2, 7, 14.5, 34.5, 74.5, 174.5, 374.5, 749.5, 1500];
const SHORE_CODES = [...new Set(Object.values(MARINE_CODES).flat().filter((c) => c.shore).map((c) => c.code))];

async function head(url) { return (await fetch(url, { method: "HEAD", headers: { "user-agent": UA } })).ok; }
async function download(url, dest) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}
const csvLine = splitCsv;

async function zbpYear() {
  for (let y = new Date().getUTCFullYear(); y >= 2019; y--) if (await head(`${CBP}${y}/zbp${String(y).slice(2)}detail.zip`)) return y;
  throw new Error("no ZIP Code Business Patterns detail file found");
}

// {year, zips: {zip: {county, codes: {naics: {est, emp}}}}, codeAvg: {naics: average establishment size}}
async function fetchZbpDetail(opts, spine) {
  return cachedJson("zbp-ca.json", async () => {
    const year = await zbpYear();
    const yy = String(year).slice(2);
    for (const kind of ["detail", "totals"]) {
      const zip = cachePath(`zbp${yy}${kind}.zip`);
      if (!fs.existsSync(zip)) await download(`${CBP}${year}/zbp${yy}${kind}.zip`, zip);
      execFileSync("unzip", ["-o", "-q", zip, "-d", cachePath("zbp")]);
    }
    const byName = Object.fromEntries(spine.counties.map((c) => [c.name.toUpperCase(), c.fips]));
    const wanted = new Set(SHORE_CODES);
    const zips = {};
    const lines = fs.readFileSync(cachePath(`zbp/zbp${yy}detail.txt`), "utf8").split(/\r?\n/);
    for (const line of lines.slice(1)) {
      const c = csvLine(line);
      if (c[14] !== "CA" || !wanted.has(c[2])) continue;
      const bins = c.slice(4, 13).map((v) => (v === "N" ? null : Number(v)));
      const known = bins.reduce((s, v) => s + (v || 0), 0), est = Number(c[3]);
      const z = (zips[c[0]] = zips[c[0]] || { county: byName[c[15]] || null, codes: {} });
      z.codes[c[2]] = { est, bins };
      z.known = known;
    }
    // Average establishment size per code, from the class counts that are disclosed.
    const codeAvg = {};
    for (const code of SHORE_CODES) {
      let n = 0, e = 0;
      for (const z of Object.values(zips)) { const r = z.codes[code]; if (!r) continue; r.bins.forEach((v, i) => { if (v) { n += v; e += v * MID[i]; } }); }
      codeAvg[code] = n ? e / n : 5;
    }
    for (const z of Object.values(zips)) for (const [code, r] of Object.entries(z.codes)) {
      const disclosed = r.bins.reduce((s, v) => s + (v || 0), 0);
      const emp = r.bins.reduce((s, v, i) => s + (v || 0) * MID[i], 0) + Math.max(0, r.est - disclosed) * codeAvg[code];
      z.codes[code] = { est: r.est, emp: Math.round(emp * 10) / 10 };
    }
    return { year, zips, codeAvg };
  }, opts);
}

// --- Shoreline-adjacent ZCTAs -------------------------------------------------------------------------

function readCoastVertices(shp) {
  const b = fs.readFileSync(shp);
  const pts = [];
  for (let off = 100; off < b.length;) {
    const clen = b.readUInt32BE(off + 4) * 2, s = off + 8;
    const bb = [b.readDoubleLE(s + 4), b.readDoubleLE(s + 12), b.readDoubleLE(s + 20), b.readDoubleLE(s + 28)];
    if (bb[0] > -125 && bb[2] < -114 && bb[1] > 32 && bb[3] < 42.1) {
      const nParts = b.readInt32LE(s + 36), nPts = b.readInt32LE(s + 40), p0 = s + 44 + nParts * 4;
      for (let i = 0; i < nPts; i++) pts.push([b.readDoubleLE(p0 + i * 16), b.readDoubleLE(p0 + i * 16 + 8)]);
    }
    off += 8 + clen;
  }
  return pts;
}

const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const MAX_DIST_M = 12000;
const MAX_VERTICES = 300; // boundary vertices sampled per ZCTA when measuring distance

// Distance in metres from every California ZCTA to the Census coastline (0 when the coastline is inside it or
// touches it), capped at MAX_DIST_M. Boundary vertices against coastline vertices, both dense, so the error is
// the vertex spacing (tens of metres). The shoreline-adjacent set is every ZCTA within `tolerance` metres.
async function fetchShoreZips(opts) {
  return cachedJson("shore-zctas.json", async () => {
    let year = new Date().getUTCFullYear(), url;
    for (; year >= 2022; year--) if (await head(COAST(year))) { url = COAST(year); break; }
    if (!url) throw new Error("no Census coastline file found");
    const zip = cachePath(`coastline-${year}.zip`);
    if (!fs.existsSync(zip)) await download(url, zip);
    execFileSync("unzip", ["-o", "-q", zip, "-d", cachePath("coastline")]);
    const coast = readCoastVertices(cachePath(`coastline/tl_${year}_us_coastline.shp`));
    // The coastline file has the open coast but not the interior shores of San Francisco Bay and other
    // estuaries, so the boundaries of the Census's tidal water areas (bays, estuaries, ocean: MTFCC H2051 and
    // H2053) are added as shoreline. Vertices are thinned to about 50 m, far finer than the distance rule.
    let waterVertices = 0;
    for (let offset = 0; ; offset += 10) {
      const j = await getJson(WATER_LAYER + "/query?" + new URLSearchParams({ where: "MTFCC IN ('H2051','H2053')", geometry: "-124.6,32.4,-114.0,42.1", geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "OBJECTID", returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.0005", orderByFields: "OBJECTID", f: "json", resultOffset: String(offset), resultRecordCount: "10" }));
      for (const f of j.features) for (const ring of f.geometry.rings) for (const p of ring) if (p[0] > -125 && p[0] < -114 && p[1] > 32 && p[1] < 42.1) { coast.push(p); waterVertices++; }
      if (!j.exceededTransferLimit || !j.features.length) break;
    }
    const CELL = 0.01, key = (cx, cy) => cx + "," + cy;
    const grid = new Map();
    for (const p of coast) { const k = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
    const zctas = [];
    for (let offset = 0; ; offset += 100) {
      const j = await getJson(ZCTA_LAYER + "/query?" + new URLSearchParams({ where: "ZCTA5>='90001' AND ZCTA5<='96162'", outFields: "ZCTA5", returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.0001", orderByFields: "OBJECTID", f: "json", resultOffset: String(offset), resultRecordCount: "100" }));
      zctas.push(...j.features);
      if (!j.exceededTransferLimit || !j.features.length) break;
    }
    const mPerLat = 111000, cosLat = Math.cos((37 * Math.PI) / 180);
    const dist = {};
    for (const f of zctas) {
      const rings = f.geometry.rings;
      const all = rings.flat();
      const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
      const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
      // 0: a coastline vertex lies inside the ZCTA
      let inside = false;
      for (let gx = Math.floor(minx / CELL); gx <= Math.floor(maxx / CELL) && !inside; gx++) for (let gy = Math.floor(miny / CELL); gy <= Math.floor(maxy / CELL) && !inside; gy++) {
        for (const p of grid.get(key(gx, gy)) || []) if (rings.filter((r) => inRing(p[0], p[1], r)).length % 2 === 1) { inside = true; break; }
      }
      if (inside) { dist[f.attributes.ZCTA5] = 0; continue; }
      // otherwise the nearest boundary-vertex to coast-vertex distance, searched in rings of grid cells
      let best = Infinity;
      const step = Math.max(1, Math.floor(all.length / MAX_VERTICES));
      for (let vi = 0; vi < all.length; vi += step) {
        const [x, y] = all[vi];
        const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
        const maxRing = Math.ceil(MAX_DIST_M / (CELL * mPerLat * cosLat));
        for (let ring = 0; ring <= maxRing; ring++) {
          if (ring * CELL * mPerLat * cosLat > best + CELL * mPerLat * 2) break;
          for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            for (const p of grid.get(key(cx + dx, cy + dy)) || []) {
              const d = Math.hypot((p[0] - x) * mPerLat * cosLat, (p[1] - y) * mPerLat);
              if (d < best) best = d;
            }
          }
        }
      }
      dist[f.attributes.ZCTA5] = Math.round(Math.min(best, MAX_DIST_M));
    }
    return { coastlineYear: year, waterVertices, zctas: zctas.length, dist };
  }, opts);
}

// Per county and shore-flagged code: the share of establishments and of estimated employment in
// shoreline-adjacent ZIPs, with the pooled fallbacks used when a county has none of a code.
function computeShares(zbp, shore, tolerance = SHORE_TOLERANCE_M) {
  const shoreSet = new Set(Object.entries(shore.dist).filter(([, d]) => d <= tolerance).map(([z]) => z));
  const acc = {}; // fips -> code -> {allE, shoreE, allJ, shoreJ}
  let unmatched = 0, totalEst = 0;
  for (const [zip, z] of Object.entries(zbp.zips)) {
    for (const [code, r] of Object.entries(z.codes)) {
      totalEst += r.est;
      if (!z.county) { unmatched += r.est; continue; }
      const a = ((acc[z.county] = acc[z.county] || {})[code] = acc[z.county][code] || { allE: 0, shoreE: 0, allJ: 0, shoreJ: 0 });
      a.allE += r.est; a.allJ += r.emp;
      if (shoreSet.has(zip)) { a.shoreE += r.est; a.shoreJ += r.emp; }
    }
  }
  const pool = (list) => list.reduce((s, a) => ({ allE: s.allE + a.allE, shoreE: s.shoreE + a.shoreE, allJ: s.allJ + a.allJ, shoreJ: s.shoreJ + a.shoreJ }), { allE: 0, shoreE: 0, allJ: 0, shoreJ: 0 });
  const ratio = (a) => (a.allE > 0 ? { est: a.shoreE / a.allE, emp: a.allJ > 0 ? a.shoreJ / a.allJ : a.shoreE / a.allE } : null);
  const state = {};
  for (const code of SHORE_CODES) state[code] = ratio(pool(Object.values(acc).map((c) => c[code]).filter(Boolean)));
  const out = { counties: {}, unmatchedEstShare: totalEst ? unmatched / totalEst : 0 };
  for (const [fips, codes] of Object.entries(acc)) {
    const countyPool = ratio(pool(Object.values(codes)));
    out.counties[fips] = { pooled: countyPool, codes: Object.fromEntries(SHORE_CODES.map((c) => { const r = codes[c] ? ratio(codes[c]) : null; return [c, r ? { ...r, basis: "code" } : countyPool ? { ...countyPool, basis: "county-pooled" } : { ...state[c], basis: "state" }]; })) };
  }
  out.state = state;
  return out;
}

async function fetchShoreShares(opts, spine) {
  const zbp = await fetchZbpDetail(opts, spine);
  const shore = await fetchShoreZips(opts);
  return { value: { zbpYear: zbp.value.year, coastlineYear: shore.value.coastlineYear, tolerance: SHORE_TOLERANCE_M, shoreZips: Object.values(shore.value.dist).filter((d) => d <= SHORE_TOLERANCE_M).length, zctas: shore.value.zctas, shares: computeShares(zbp.value, shore.value), dist: shore.value.dist, zbp: zbp.value }, fetched: zbp.fetched < shore.fetched ? zbp.fetched : shore.fetched };
}

module.exports = { fetchShoreShares, fetchZbpDetail, fetchShoreZips, computeShares, SHORE_CODES, SHORE_TOLERANCE_M };
