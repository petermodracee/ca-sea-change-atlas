#!/usr/bin/env node
// On demand (not part of the build or workflow): share of pixels that went from non-developed in 2016 to developed in 2021, and of the county's land, inside CAL FIRE FRAP perimeters of 2017-2021; node scripts/county-profiles/analysis/fire-check.js 06087,06097
// Read-only. Uses the pipeline's cached county inputs (fetching them if absent) and range-reads the C-CAP rasters. See docs/DECISIONS.md, "C-CAP land cover moves to 1996 to 2021".
const path = require("path");
const R = path.join(__dirname, "..", "pipeline") + path.sep;
const S = require(R + "sources");
const { albers, rasterize } = require(R + "ccap");
const { toMulti } = require(R + "geo");
const { getJson } = require(R + "http");
const { fromUrl } = require("geotiff");
const spine = require("../../../site/_data/countySpine.json");

const NEW = "https://ocmgeodatastor1.blob.core.windows.net/ccap/bulk_download/C-CAP_Regional_30-meter_Data/C-CAP_Regional_Land_Cover_Classification/CONUS/conus_";
const FIRE = "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/California_Historic_Fire_Perimeters/FeatureServer/0";
const SQMI = 900 / 2589988.110336;
const isDev = new Uint8Array(32); [2, 3, 4, 5].forEach((c) => (isDev[c] = 1));
const NAMES = { 0: "background", 1: "unclassified", 2: "dev high", 3: "dev medium", 4: "dev low", 5: "dev open space", 6: "cultivated", 7: "pasture/hay", 8: "grassland", 9: "deciduous forest", 10: "evergreen forest", 11: "mixed forest", 12: "scrub/shrub", 13: "palustrine forested wet", 14: "palustrine scrub wet", 15: "palustrine emergent wet", 16: "estuarine forested wet", 17: "estuarine scrub wet", 18: "estuarine emergent wet", 19: "unconsolidated shore", 20: "bare land", 21: "open water", 22: "palustrine aquatic bed", 23: "estuarine aquatic bed", 24: "tundra", 25: "snow/ice" };

async function readWindow(img, win, c0, r0) {
  const out = new Uint8Array(win.w * win.h);
  for (let y = 0; y < win.h; y += 1024) {
    const rows = Math.min(1024, win.h - y);
    let band;
    for (let a = 1; a <= 6 && !band; a++) {
      try { [band] = await img.readRasters({ window: [c0, r0 + y, c0 + win.w, r0 + y + rows], samples: [0], interleave: false }); }
      catch (e) { if (a === 6) throw e; await new Promise((r) => setTimeout(r, 2000 * a)); }
    }
    out.set(band, y * win.w);
  }
  return out;
}

async function perimeters(bbox) {
  const feats = [];
  for (let offset = 0; ; offset += 500) {
    const qs = new URLSearchParams({
      where: "YEAR_ >= 2017 AND YEAR_ <= 2021", geometry: bbox.join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
      outFields: "YEAR_,FIRE_NAME,OBJECTIVE,GIS_ACRES,AGENCY", outSR: "4326", geometryPrecision: "6", orderByFields: "OBJECTID", f: "geojson", resultOffset: String(offset), resultRecordCount: "500",
    });
    const j = await getJson(FIRE + "/query?" + qs);
    feats.push(...(j.features || []));
    if ((j.features || []).length < 500) break;
  }
  return feats;
}

const pct = (a, b) => (b ? +((100 * a) / b).toFixed(1) : null);

(async () => {
  const imgs = {};
  for (const y of [1996, 2016, 2021]) imgs[y] = await (await fromUrl(NEW + y + "_ccap_landcover.tif")).getImage();
  const proj = albers();
  for (const fips of process.argv[2].split(",")) {
    const name = spine.counties.find((c) => c.fips === fips).name;
    const blocks = (await S.fetchBlocks(fips, {})).value, nfhl = (await S.fetchNfhl(fips, {})).value;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const b of blocks) for (const poly of toMulti(b.geometry)) for (const pt of poly[0]) {
      const [X, Y] = proj(pt); if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
      bb = [Math.min(bb[0], pt[0]), Math.min(bb[1], pt[1]), Math.max(bb[2], pt[0]), Math.max(bb[3], pt[1])];
    }
    const [bx0, , , by1] = imgs[2021].getBoundingBox();
    const W = imgs[2021].getWidth(), H = imgs[2021].getHeight();
    const c0 = Math.max(0, Math.floor((minX - bx0) / 30) - 1), c1 = Math.min(W, Math.ceil((maxX - bx0) / 30) + 1);
    const r0 = Math.max(0, Math.floor((by1 - maxY) / 30) - 1), r1 = Math.min(H, Math.ceil((by1 - minY) / 30) + 1);
    const win = { x0: bx0 + c0 * 30, y0: by1 - r0 * 30, w: c1 - c0, h: r1 - r0 };
    const inC = rasterize(blocks.filter((b) => b.landM2 > 0).map((b) => b.geometry), proj, win);
    const sfha = rasterize(nfhl.sfha.map((f) => f.geometry), proj, win);
    const b96 = await readWindow(imgs[1996], win, c0, r0), b16 = await readWindow(imgs[2016], win, c0, r0), b21 = await readWindow(imgs[2021], win, c0, r0);
    const feats = await perimeters([bb[0] - 0.01, bb[1] - 0.01, bb[2] + 0.01, bb[3] + 0.01]);
    const fire = rasterize(feats.map((f) => f.geometry), proj, win);
    const objective = {}; for (const f of feats) objective[f.properties.OBJECTIVE] = (objective[f.properties.OBJECTIVE] || 0) + 1;

    const up = { forestToGrass: [0, 0], grassToForest: [0, 0], forestToScrub: [0, 0], scrubToForest: [0, 0], grassToScrub: [0, 0], scrubToGrass: [0, 0] };
    const cls = (c) => (c >= 9 && c <= 11 ? "forest" : c === 8 ? "grass" : c === 12 ? "scrub" : null);
    for (let i = 0; i < inC.length; i++) {
      if (!inC[i]) continue;
      const x = cls(b16[i]), y = cls(b21[i]);
      if (!x || !y || x === y) continue;
      const k = x + "To" + y[0].toUpperCase() + y.slice(1);
      up[k][0]++; if (fire[i]) up[k][1]++;
    }
    const mk = () => ({ n: 0, inFire: 0, toIn: {}, toOut: {}, fromIn: {}, fromOut: {}, sfhaN: 0, sfhaInFire: 0 });
    const m = { y1621: mk(), y9621: mk() };
    let landPx = 0, landFire = 0, landSfha = 0, landSfhaFire = 0;
    for (let i = 0; i < inC.length; i++) {
      if (!inC[i]) continue;
      const e = b21[i];
      if (e !== 0 && e !== 21) { landPx++; if (fire[i]) landFire++; if (sfha[i]) { landSfha++; if (fire[i]) landSfhaFire++; } }
      if (!isDev[e]) continue;
      for (const [k, s] of [["y1621", b16[i]], ["y9621", b96[i]]]) {
        if (isDev[s]) continue;
        const r = m[k], f = fire[i];
        r.n++; if (f) r.inFire++;
        const to = f ? r.toIn : r.toOut, from = f ? r.fromIn : r.fromOut;
        to[e] = (to[e] || 0) + 1; from[s] = (from[s] || 0) + 1;
        if (sfha[i]) { r.sfhaN++; if (f) r.sfhaInFire++; }
      }
    }
    const named = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c + " " + NAMES[c], n]));
    const out = { fips, name, perimeters2017_2021: feats.length, objective, landSqMi: +(landPx * SQMI).toFixed(1), landInFireSharePct: pct(landFire, landPx), sfhaLandInFireSharePct: pct(landSfhaFire, landSfha) };
    // Upland-to-upland changes (sq mi): county-wide and inside the perimeters. A burn shows as forest turning to grassland.
    out.uplandChangesSqMi = Object.fromEntries(Object.entries(up).map(([k, [n, f]]) => [k, { all: +(n * SQMI).toFixed(1), inPerimeters: +(f * SQMI).toFixed(1) }]));
    for (const [k, r] of Object.entries(m)) {
      out[k] = {
        changedPx: r.n, changedSqMi: +(r.n * SQMI).toFixed(2), inFirePx: r.inFire, inFireSqMi: +(r.inFire * SQMI).toFixed(2), inFireSharePct: pct(r.inFire, r.n),
        inFloodplainPx: r.sfhaN, inFloodplainInFireSharePct: pct(r.sfhaInFire, r.sfhaN),
        toClassInsideFire: named(r.toIn), toClassOutsideFire: named(r.toOut), fromClassInsideFire: named(r.fromIn), fromClassOutsideFire: named(r.fromOut),
      };
    }
    console.log(JSON.stringify(out));
  }
})().catch((e) => { console.error(e); process.exit(1); });
