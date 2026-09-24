// NOAA C-CAP land cover (30 m, CONUS, epochs 1996 and 2016), intersected with the same hazard
// extents as the rest of the pipeline.
//
// The two epochs are ~400 MB Cloud-Optimized-style tiled GeoTIFFs (NAD83 / Conus Albers, EPSG:5070,
// an equal-area projection, so a pixel is exactly 900 m2). Only the window a county covers is read
// (HTTP range requests, no download). Polygons are projected to Albers and scan-filled onto the
// window's pixel grid, and each pixel is counted once, by the class it has in the 2016 epoch:
//
//   - county land: pixels whose centre is inside a census block that has land, and that are not open
//     water (class 21). Pixels C-CAP left as background (class 0) inside such a block are counted as
//     `uncovered`, reported, and cause the section to be marked unavailable if they are most of the
//     county (`source-geography`: the C-CAP footprint is the coastal zone and stops short of some
//     inland counties).
//   - developed: classes 2-5 (high/medium/low intensity and open space). Development added
//     1996-2016 is developed in 2016 and not developed in 1996.
//   - wetland: 13-18 (palustrine/estuarine forested, scrub/shrub, emergent) and 22-23 (aquatic bed).
//   - upland: 8-12 (grassland, deciduous/evergreen/mixed forest, scrub/shrub) and 24 (tundra).
//   - other: everything else that is land (developed, cultivated, pasture, unconsolidated shore,
//     bare land, snow) and unclassified.
//
// Natural = wetland + upland. This follows NOAA's own grouping in the original snapshot.

const path = require("path");
const { cachePath, cachedJson } = require("./http");
const { toMulti } = require("./geo");

const BASE = "https://chs.coast.noaa.gov/htdata/raster1/landcover/bulkdownload/30m_lc/";
const FILES = { 1996: "conus_1996_ccap_landcover_20200311.tif", 2016: "conus_2016_ccap_landcover_20200311.tif" };
const ENDPOINT = BASE + FILES[2016];
const PX_M2 = 900;
const SQ_M_PER_SQ_MI = 2589988.110336;

const isDev = new Uint8Array(32), isWet = new Uint8Array(32), isUp = new Uint8Array(32), isLand = new Uint8Array(32);
for (let c = 1; c < 32; c++) if (c !== 21) isLand[c] = 1;
[2, 3, 4, 5].forEach((c) => (isDev[c] = 1));
[13, 14, 15, 16, 17, 18, 22, 23].forEach((c) => (isWet[c] = 1));
[8, 9, 10, 11, 12, 24].forEach((c) => (isUp[c] = 1));

// Lon/lat (degrees) to EPSG:5070, NAD83 / Conus Albers (Snyder, ellipsoidal Albers equal-area).
function albers() {
  const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, e = Math.sqrt(e2), d = Math.PI / 180;
  const m = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const q = (p) => (1 - e2) * (Math.sin(p) / (1 - e2 * Math.sin(p) ** 2) - (1 / (2 * e)) * Math.log((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))));
  const p1 = 29.5 * d, p2 = 45.5 * d, p0 = 23 * d, l0 = -96 * d;
  const n = (m(p1) ** 2 - m(p2) ** 2) / (q(p2) - q(p1));
  const C = m(p1) ** 2 + n * q(p1);
  const rho0 = (a * Math.sqrt(C - n * q(p0))) / n;
  return ([lon, lat]) => {
    const p = lat * d, th = n * (lon * d - l0), rho = (a * Math.sqrt(C - n * q(p))) / n;
    return [rho * Math.sin(th), rho0 - rho * Math.cos(th)];
  };
}

// Scan-fills polygons (even-odd within each polygon, holes included) onto a w x h pixel grid whose
// top-left corner is (x0, y0) in Albers metres. Returns Uint8Array(w*h) with 1 inside. `into` lets a
// caller OR several masks into one buffer.
function rasterize(geoms, proj, win, into) {
  const { x0, y0, w, h } = win;
  const out = into || new Uint8Array(w * h);
  for (const g of geoms) {
    for (const poly of toMulti(g)) {
      // Projected ring vertices in pixel space.
      const rings = poly.map((ring) => ring.map((pt) => { const [X, Y] = proj(pt); return [(X - x0) / 30, (y0 - Y) / 30]; }));
      let minY = Infinity, maxY = -Infinity;
      for (const r of rings) for (const [, py] of r) { if (py < minY) minY = py; if (py > maxY) maxY = py; }
      const r0 = Math.max(0, Math.ceil(minY - 0.5)), r1 = Math.min(h - 1, Math.floor(maxY - 0.5));
      if (r1 < r0) continue;
      const xs = Array.from({ length: r1 - r0 + 1 }, () => []);
      for (const ring of rings) {
        for (let i = 0, n = ring.length; i < n; i++) {
          const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n];
          if (ay === by) continue;
          const lo = Math.min(ay, by), hi = Math.max(ay, by);
          const s = Math.max(r0, Math.ceil(lo - 0.5)), t = Math.min(r1, Math.ceil(hi - 0.5) - 1);
          for (let r = s; r <= t; r++) xs[r - r0].push(ax + ((r + 0.5 - ay) * (bx - ax)) / (by - ay));
        }
      }
      for (let r = r0; r <= r1; r++) {
        const row = xs[r - r0].sort((p, q) => p - q);
        for (let k = 0; k + 1 < row.length; k += 2) {
          const c0 = Math.max(0, Math.ceil(row[k] - 0.5)), c1 = Math.min(w - 1, Math.ceil(row[k + 1] - 0.5) - 1);
          for (let c = c0; c <= c1; c++) out[r * w + c] = 1;
        }
      }
    }
  }
  return out;
}

// Reads the window in bands of 1,024 rows, each retried on its own: a big county (Los Angeles is
// 4,562 x 7,831 pixels) is thousands of range requests, and one dropped connection should cost a
// band, not the whole read.
async function readWindow(tiffs, year, win, colRow) {
  const img = await tiffs[year].getImage();
  const [c0, r0] = colRow;
  const out = new Uint8Array(win.w * win.h);
  const BAND = 1024;
  for (let y = 0; y < win.h; y += BAND) {
    const rows = Math.min(BAND, win.h - y);
    let lastErr, band = null;
    for (let attempt = 1; attempt <= 6 && !band; attempt++) {
      try {
        [band] = await img.readRasters({ window: [c0, r0 + y, c0 + win.w, r0 + y + rows], samples: [0], interleave: false });
      } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 2000 * attempt)); }
    }
    if (!band) throw lastErr;
    out.set(band, y * win.w);
  }
  return out;
}

// counts(band, mask) -> {land, wet, up, other} pixel counts of `mask` pixels by class.
function tally(band, mask, inCounty) {
  let land = 0, wet = 0, up = 0;
  for (let i = 0; i < band.length; i++) {
    if (!mask[i] || !inCounty[i]) continue;
    const c = band[i];
    if (!isLand[c]) continue;
    land++;
    if (isWet[c]) wet++;
    else if (isUp[c]) up++;
  }
  return { land, wet, up, other: land - wet - up };
}

// `masks`: {sfha: [geoms], slr: {ft: [geoms]}, low: {ft: [geoms]}}; `blocks` as elsewhere.
async function computeCcap({ blocks, sfha, slr, low, increments, log }) {
  const { fromUrl } = await import("geotiff");
  const proj = albers();
  const tiffs = {};
  for (const y of [1996, 2016]) {
    for (let attempt = 1; ; attempt++) {
      try { tiffs[y] = await fromUrl(BASE + FILES[y]); break; } catch (e) { if (attempt >= 5) throw e; await new Promise((r) => setTimeout(r, 2000 * attempt)); }
    }
  }
  const img = await tiffs[2016].getImage();
  const [bx0, , , by1] = img.getBoundingBox();
  const W = img.getWidth(), H = img.getHeight();

  // County window from the block polygons.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of blocks) for (const poly of toMulti(b.geometry)) for (const pt of poly[0]) { const [X, Y] = proj(pt); if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; }
  const c0 = Math.max(0, Math.floor((minX - bx0) / 30) - 1), c1 = Math.min(W, Math.ceil((maxX - bx0) / 30) + 1);
  const r0 = Math.max(0, Math.floor((by1 - maxY) / 30) - 1), r1 = Math.min(H, Math.ceil((by1 - minY) / 30) + 1);
  const win = { x0: bx0 + c0 * 30, y0: by1 - r0 * 30, w: c1 - c0, h: r1 - r0 };
  log && log("C-CAP window " + win.w + " x " + win.h + " px");

  const inCounty = rasterize(blocks.filter((b) => b.landM2 > 0).map((b) => b.geometry), proj, win);
  const band16 = await readWindow(tiffs, 2016, win, [c0, r0]);
  const band96 = await readWindow(tiffs, 1996, win, [c0, r0]);

  let countyPx = 0, uncovered = 0, water = 0, landPx = 0;
  for (let i = 0; i < inCounty.length; i++) {
    if (!inCounty[i]) continue;
    countyPx++;
    const c = band16[i];
    if (c === 0) uncovered++;
    else if (c === 21) water++;
    else landPx++;
  }

  const sfhaMask = rasterize(sfha, proj, win);
  let insideLand = 0, insideNatural = 0, devIn = 0, addedIn = 0, devOut = 0, addedOut = 0;
  for (let i = 0; i < band16.length; i++) {
    if (!inCounty[i]) continue;
    const c = band16[i];
    if (!isLand[c]) continue;
    const dev16 = isDev[c], added = dev16 && !isDev[band96[i]];
    if (sfhaMask[i]) {
      insideLand++;
      if (isWet[c] || isUp[c]) insideNatural++;
      if (dev16) devIn++;
      if (added) addedIn++;
    } else {
      if (dev16) devOut++;
      if (added) addedOut++;
    }
  }

  // SLR: combined (ocean-connected plus low-lying) at each increment, by 2016 class.
  const comp = [], connectedOnly = [];
  for (const ft of increments) {
    const m = rasterize(slr[ft] || [], proj, win);
    connectedOnly.push(tally(band16, m, inCounty));
    rasterize(low[ft] || [], proj, win, m);
    comp.push(tally(band16, m, inCounty));
  }

  const sq = (px) => (px * PX_M2) / SQ_M_PER_SQ_MI;
  return {
    window: { w: win.w, h: win.h },
    countyPixels: countyPx, uncoveredPixels: uncovered, waterPixels: water, landPixels: landPx,
    uncoveredShare: countyPx ? uncovered / countyPx : 1,
    flood: {
      floodplainLandSqMi: sq(insideLand), naturalInsideSqMi: sq(insideNatural),
      developedInsideSqMi: sq(devIn), addedInsideSqMi: sq(addedIn),
      developedOutsideSqMi: sq(devOut), addedOutsideSqMi: sq(addedOut),
    },
    slr: comp.map((t) => ({ wetland: sq(t.wet), upland: sq(t.up), other: sq(t.other), land: sq(t.land) })),
    // Diagnostics only: the ocean-connected part alone, for comparison with NOAA's published tool.
    slrConnectedOnly: connectedOnly.map((t) => ({ wetland: sq(t.wet), upland: sq(t.up), other: sq(t.other), land: sq(t.land) })),
    increments,
  };
}

async function fetchCcap(fips, args, opts) {
  const r = await cachedJson("ccap-" + fips + ".json", () => computeCcap(args), opts);
  return { value: r.value, fetched: r.fetched };
}

module.exports = { ENDPOINT, fetchCcap, computeCcap, albers, rasterize };
