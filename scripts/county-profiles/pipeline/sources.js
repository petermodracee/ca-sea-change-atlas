// One fetcher per source. Each returns {value, fetched, ...} where `fetched` is the date the data
// was actually retrieved (a cached run keeps the original date). Raw downloads are cached under
// scripts/county-profiles/.cache/ and never committed. Endpoints were enumerated, not assumed;
// docs/COUNTY-PROFILES.md ("Data pipeline") records what each one is.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const { CACHE_DIR, cachePath, cachedJson, getJson, request, arcgisQueryAll, streamLines, verifyEndpoint, writeMeta, readMeta, today } = require("./http");

const NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const TIGER_BLOCKS = "https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/Tracts_Blocks/MapServer/2";
const USGS = "https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer";
const LODES = "https://lehd.ces.census.gov/data/lodes/LODES8/ca";
const ACS_DIR = "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData";
const SLR_ZIP = "https://chs.coast.noaa.gov/htdata/Inundation/SLR/BulkDownload/Sea_Level_Rise_Vectors/CA/CA_South_slr_data_dist.zip";
const OPENFEMA = "https://www.fema.gov/api/open/v3/NfipClaims";

const SOURCE_ENDPOINTS = { nfhl: NFHL + "?f=json", tiger: TIGER_BLOCKS + "?f=json", usgs: USGS + "?f=json", lodes: LODES + "/version.txt", acs: ACS_DIR + "/acsdt5y2024-b01003.dat", openfema: OPENFEMA + "?$top=1&$select=id", slr: SLR_ZIP };

// GeoJSON pager for ArcGIS layers (the JSON format's esri rings would need ring-orientation logic).
async function geojsonAll(layerUrl, params, pageSize) {
  const feats = [];
  for (let offset = 0; ; offset += pageSize) {
    const qs = new URLSearchParams({ ...params, f: "geojson", resultOffset: String(offset), resultRecordCount: String(pageSize) });
    const j = await getJson(layerUrl + "/query?" + qs);
    feats.push(...(j.features || []));
    if ((j.features || []).length < pageSize) break;
  }
  return feats;
}

// --- Census 2020 tabulation blocks (TIGERweb): internal point, 2020 population, land area, polygon --

async function fetchBlocks(fips, opts) {
  const state = fips.slice(0, 2), county = fips.slice(2);
  const r = await cachedJson("tiger-blocks-" + fips + ".json", async () => {
    const feats = await geojsonAll(TIGER_BLOCKS, {
      where: `STATE='${state}' AND COUNTY='${county}'`,
      outFields: "GEOID,POP100,HU100,AREALAND,AREAWATER,INTPTLON,INTPTLAT",
      outSR: "4326", geometryPrecision: "6", orderByFields: "GEOID",
    }, 2000);
    return feats.map((f) => ({
      geoid: f.properties.GEOID,
      pop: f.properties.POP100,
      hu: f.properties.HU100,
      landM2: f.properties.AREALAND,
      waterM2: f.properties.AREAWATER,
      lon: parseFloat(f.properties.INTPTLON),
      lat: parseFloat(f.properties.INTPTLAT),
      geometry: f.geometry,
    }));
  }, opts);
  return { value: r.value, fetched: r.fetched };
}

// --- FEMA NFHL: effective SFHA polygons and FIRM panel dates -----------------------------------

async function fetchNfhl(fips, opts) {
  const dfirm = fips + "C";
  const r = await cachedJson("nfhl-" + fips + ".json", async () => {
    // Layer 28 Flood Hazard Zones (SFHA_TF = 'T' is the Special Flood Hazard Area); layer 3 FIRM Panels.
    const feats = await geojsonAll(NFHL + "/28", { where: `DFIRM_ID='${dfirm}' AND SFHA_TF='T'`, outFields: "FLD_ZONE,ZONE_SUBTY", outSR: "4326", geometryPrecision: "6", orderByFields: "OBJECTID" }, 100);
    const stats = await getJson(NFHL + "/3/query?" + new URLSearchParams({
      where: `DFIRM_ID='${dfirm}'`, f: "json",
      outStatistics: JSON.stringify([{ statisticType: "min", onStatisticField: "EFF_DATE", outStatisticFieldName: "mn" }, { statisticType: "max", onStatisticField: "EFF_DATE", outStatisticFieldName: "mx" }, { statisticType: "count", onStatisticField: "EFF_DATE", outStatisticFieldName: "n" }]),
    }));
    const a = stats.features[0].attributes;
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const panels = await geojsonAll(NFHL + "/3", { where: `DFIRM_ID='${dfirm}'`, outFields: "FIRM_PAN,EFF_DATE", outSR: "4326", geometryPrecision: "5", orderByFields: "OBJECTID" }, 200);
    return { dfirm, sfha: feats.map((f) => ({ zone: f.properties.FLD_ZONE, subtype: f.properties.ZONE_SUBTY, geometry: f.geometry })), effStart: iso(a.mn), effEnd: iso(a.mx), panelCount: a.n, panels: panels.map((f) => f.geometry) };
  }, opts);
  return { value: r.value, fetched: r.fetched };
}

// --- Census ACS 5-year (2020-2024), block groups, from the keyless bulk summary files ---------------
// Poverty is C17002 (ratio of income to poverty level) classes under 0.50 and 0.50-0.99, i.e. below
// the poverty level: B17001, the usual poverty table, is not published below tract level.
// The Census API now refuses keyless requests; the table-based summary files carry the same
// estimates. Each is a national pipe-delimited file (~100-200 MB); it is streamed and only the
// county's block-group rows are kept.

async function acsRows(table, fips, wanted, opts) {
  const r = await cachedJson("acs-" + table + "-" + fips + ".json", async () => {
    let header = null;
    const idx = {};
    const out = { bg: {}, county: null };
    await streamLines(`${ACS_DIR}/acsdt5y2024-${table}.dat`, (line) => {
      if (!header) {
        header = line.split("|");
        for (const w of wanted) {
          const i = header.indexOf(w);
          if (i < 0) throw new Error("ACS " + table + ": column " + w + " not in header");
          idx[w] = i;
        }
        return;
      }
      const isBg = line.startsWith("1500000US" + fips);
      const isCounty = line.startsWith("0500000US" + fips);
      if (!isBg && !isCounty) return;
      const cells = line.split("|");
      const rec = {};
      for (const w of wanted) rec[w] = Number(cells[idx[w]]);
      if (isBg) out.bg[cells[0].slice(9)] = rec;
      else out.county = rec;
    });
    return out;
  }, opts);
  return r;
}

async function fetchAcs(fips, opts) {
  const male = [20, 21, 22, 23, 24, 25].map((n) => "B01001_E0" + String(n).padStart(2, "0"));
  const female = [44, 45, 46, 47, 48, 49].map((n) => "B01001_E0" + String(n).padStart(2, "0"));
  const age = await acsRows("b01001", fips, ["B01001_E001", ...male, ...female], opts);
  const pov = await acsRows("c17002", fips, ["C17002_E001", "C17002_E002", "C17002_E003"], opts);
  // A negative estimate is a Census null code (no data / not applicable); it is counted as 0 and reported.
  let nulls = 0;
  const clean = (v) => (v < 0 || !Number.isFinite(v) ? (nulls++, 0) : v);
  const bg = {};
  for (const [g, r] of Object.entries(age.value.bg)) {
    bg[g] = { pop: clean(r.B01001_E001), over65: [...male, ...female].reduce((s, k) => s + clean(r[k]), 0), poverty: 0 };
  }
  for (const [g, r] of Object.entries(pov.value.bg)) {
    if (!bg[g]) bg[g] = { pop: 0, over65: 0, poverty: 0 };
    bg[g].poverty = clean(r.C17002_E002) + clean(r.C17002_E003);
  }
  const c = age.value.county, p = pov.value.county;
  const county = { pop: c.B01001_E001, over65: [...male, ...female].reduce((s, k) => s + c[k], 0), poverty: p.C17002_E002 + p.C17002_E003 };
  return { value: { bg, county, nulls }, fetched: age.fetched };
}

// --- LEHD LODES8 workplace area characteristics: jobs by workplace block ---------------------------

async function fetchLodes(fips, opts) {
  // The newest year published for California: probe downward from the current year.
  let year = null;
  for (let y = new Date().getFullYear(); y >= 2019 && !year; y--) {
    try { await request(`${LODES}/wac/ca_wac_S000_JT00_${y}.csv.gz`, { method: "HEAD" }); year = y; } catch (_) { /* not published */ }
  }
  if (!year) throw new Error("no LODES8 CA WAC year found");
  const r = await cachedJson("lodes-wac-" + fips + "-" + year + ".json", async () => {
    let cols = null;
    const jobs = {};
    await streamLines(`${LODES}/wac/ca_wac_S000_JT00_${year}.csv.gz`, (line) => {
      if (!cols) { cols = line.split(","); if (cols[0] !== "w_geocode" || cols[1] !== "C000") throw new Error("unexpected LODES header"); return; }
      if (!line.startsWith(fips)) return;
      const c = line.split(",");
      jobs[c[0]] = Number(c[1]);
    }, { gunzip: true });
    return { year, jobs };
  }, opts);
  return { value: r.value, fetched: r.fetched };
}

// --- USGS National Map structures: critical facilities ------------------------------------------------

const FACILITY_LAYERS = [
  { key: "schools", label: "Schools", layer: 23 },
  { key: "police", label: "Police stations", layer: 18 },
  { key: "fire", label: "Fire stations", layer: 16 },
  { key: "medical", label: "Medical facilities", layer: 14 },
];

async function fetchUsgs(bbox, fips, opts) {
  const r = await cachedJson("usgs-structures-" + fips + ".json", async () => {
    const out = {};
    for (const f of FACILITY_LAYERS) {
      const feats = await arcgisQueryAll(`${USGS}/${f.layer}`, {
        where: "1=1", geometry: bbox.join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects",
        outFields: "PERMANENT_IDENTIFIER,NAME,FTYPE,FCODE,CITY,LOADDATE", returnGeometry: "true", orderByFields: "OBJECTID",
      }, { pageSize: 2000 });
      out[f.key] = feats.map((x) => ({ id: x.attributes.PERMANENT_IDENTIFIER, name: x.attributes.NAME, ftype: x.attributes.FTYPE, fcode: x.attributes.FCODE, city: x.attributes.CITY, loaded: x.attributes.loaddate ?? x.attributes.LOADDATE, x: x.geometry.x, y: x.geometry.y }));
    }
    return out;
  }, opts);
  return { value: r.value, fetched: r.fetched };
}

// --- OpenFEMA NFIP claims (v3; v2 is deprecated and removed 2026-10-15) ---------------------------------

// A claim belongs to the county if either its `countyCode` or the county prefix of its `censusGeoid`
// (a block-group id) says so. `countyCode` alone misses claims where it is null; in Orange County
// that is 4 claims from the 1980s, none in a published period, but the guard costs one clause and
// is right for every county. Filtering by NFIP community number was tried and rejected (see
// docs/DECISIONS.md): it returned the identical claims here and is a worse key elsewhere.
async function fetchClaims(fips, opts) {
  const r = await cachedJson("openfema-claims-" + fips + ".json", async () => {
    const rows = new Map();
    const select = "id,dateOfLoss,yearOfLoss,amountPaidOnBuildingClaim,amountPaidOnContentsClaim,amountPaidOnIncreasedCostOfComplianceClaim,asOfDate";
    const filter = `countyCode eq '${fips}' or startswith(censusGeoid,'${fips}')`;
    for (let skip = 0; ; skip += 10000) {
      const url = `${OPENFEMA}?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=10000&$skip=${skip}&$orderby=id`;
      const page = (await getJson(url)).NfipClaims || [];
      for (const c of page) rows.set(c.id, c);
      if (page.length < 10000) break;
    }
    return [...rows.values()];
  }, opts);
  return { value: r.value, fetched: r.fetched };
}

// --- NOAA sea level rise inundation: ocean-connected polygons, 2/4/6/8/10 ft above MHHW ------------------

async function fetchSlr(bbox, increments, fips, opts) {
  const name = "slr-" + fips + ".json";
  const cached = readMeta(name);
  if (!opts?.refresh && cached && fs.existsSync(cachePath(name))) return { value: JSON.parse(fs.readFileSync(cachePath(name), "utf8")), fetched: cached.fetched };
  const zip = cachePath("CA_South_slr_data_dist.zip");
  if (!fs.existsSync(zip)) {
    const res = await request(SLR_ZIP);
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const dir = cachePath("slr");
  const gpkg = path.join(dir, "CA_South_slr_final_dist.gpkg");
  if (!fs.existsSync(gpkg)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
  }
  const db = new DatabaseSync(gpkg, { readOnly: true });
  const load = (kind) => {
    const out = {};
    for (const ft of increments) {
      const table = `CA_South_${kind}_${ft}_0ft`;
      const rtree = `rtree_${table}_Shape`;
      const rows = db.prepare(`select t.Shape as g from "${table}" t join "${rtree}" r on r.id = t.rowid where r.maxx >= ? and r.minx <= ? and r.maxy >= ? and r.miny <= ?`).all(bbox[0], bbox[2], bbox[1], bbox[3]);
      out[ft] = rows.map((row) => gpkgToGeoJSON(row.g));
    }
    return out;
  };
  // _slr_ = ocean-connected inundation; _low_ = unconnected low-lying areas that may flood.
  const value = { table: "CA_South_slr_final_dist.gpkg", increments: load("slr"), low: load("low") };
  db.close();
  fs.writeFileSync(cachePath(name), JSON.stringify(value));
  writeMeta(name);
  return { value, fetched: today() };
}

// GeoPackage geometry blob (header + ISO WKB) -> GeoJSON Polygon/MultiPolygon.
function gpkgToGeoJSON(buf) {
  const flags = buf[3];
  const envSize = [0, 32, 48, 48, 64][(flags >> 1) & 7];
  let off = 8 + envSize;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const readGeom = () => {
    const le = dv.getUint8(off) === 1; off += 1;
    const type = dv.getUint32(off, le) % 1000; off += 4;
    const f64 = () => { const v = dv.getFloat64(off, le); off += 8; return v; };
    const ring = () => { const n = dv.getUint32(off, le); off += 4; const r = []; for (let i = 0; i < n; i++) r.push([f64(), f64()]); return r; };
    const poly = () => { const n = dv.getUint32(off, le); off += 4; const rs = []; for (let i = 0; i < n; i++) rs.push(ring()); return rs; };
    if (type === 3) return { type: "Polygon", coordinates: poly() };
    if (type === 6) {
      const n = dv.getUint32(off, le); off += 4;
      const polys = [];
      for (let i = 0; i < n; i++) polys.push(readGeom().coordinates);
      return { type: "MultiPolygon", coordinates: polys };
    }
    throw new Error("unexpected WKB geometry type " + type);
  };
  return readGeom();
}

module.exports = { SOURCE_ENDPOINTS, FACILITY_LAYERS, fetchBlocks, fetchNfhl, fetchAcs, fetchLodes, fetchUsgs, fetchClaims, fetchSlr, verifyEndpoint };
