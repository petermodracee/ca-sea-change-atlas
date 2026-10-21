#!/usr/bin/env node
// On demand (not part of the build or workflow): how close pixels that went from non-developed in 2016 to developed open space in 2021 lie to 2016 Census TIGER roads, and whether they form thin strips or patches; node scripts/county-profiles/analysis/road-check.js 06087,06097
// Read-only. Downloads tl_2016_<fips>_roads.zip into scripts/county-profiles/.cache/ (needs `unzip`). See docs/DECISIONS.md, "C-CAP land cover moves to 1996 to 2021".
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const R = path.join(__dirname, "..", "pipeline") + path.sep;
const S = require(R + "sources");
const { albers, rasterize } = require(R + "ccap");
const { toMulti } = require(R + "geo");
const { fromUrl } = require("geotiff");
const { cachePath } = require(R + "http");
const spine = require("../../../site/_data/countySpine.json");

// The county's 2016 TIGER/Line roads shapefile (all road classes), downloaded once into its own cache directory.
async function roadsShp(fips) {
  const dir = cachePath("tiger-roads-" + fips), shp = path.join(dir, "tl_2016_" + fips + "_roads.shp");
  if (fs.existsSync(shp)) return shp;
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch("https://www2.census.gov/geo/tiger/TIGER2016/ROADS/tl_2016_" + fips + "_roads.zip");
  if (!res.ok) throw new Error("HTTP " + res.status + " for the roads file of " + fips);
  const zip = path.join(dir, "roads.zip");
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
  return shp;
}

const NEW = "https://ocmgeodatastor1.blob.core.windows.net/ccap/bulk_download/C-CAP_Regional_30-meter_Data/C-CAP_Regional_Land_Cover_Classification/CONUS/conus_";
const isDev = new Uint8Array(32); [2, 3, 4, 5].forEach((c) => (isDev[c] = 1));

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

// ESRI shapefile polylines (type 3) -> arrays of [lon, lat] parts.
function readPolylines(file) {
  const b = fs.readFileSync(file);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getInt32(0, false) !== 9994 || dv.getInt32(32, true) !== 3) throw new Error("not a polyline shapefile: " + file);
  const lines = [];
  let off = 100, records = 0;
  while (off + 8 <= b.length) {
    const len = dv.getInt32(off + 4, false) * 2; off += 8;
    const type = dv.getInt32(off, true);
    if (type === 3) {
      const nParts = dv.getInt32(off + 36, true), nPts = dv.getInt32(off + 40, true);
      const partsAt = off + 44, ptsAt = partsAt + 4 * nParts;
      const starts = []; for (let i = 0; i < nParts; i++) starts.push(dv.getInt32(partsAt + 4 * i, true)); starts.push(nPts);
      for (let p = 0; p < nParts; p++) {
        const pts = [];
        for (let i = starts[p]; i < starts[p + 1]; i++) pts.push([dv.getFloat64(ptsAt + 16 * i, true), dv.getFloat64(ptsAt + 16 * i + 8, true)]);
        lines.push(pts);
      }
    }
    records++; off += len;
  }
  return { lines, records };
}

// Distance (m) from each pixel centre to the nearest road, exact up to `cap`; Infinity beyond.
function distanceRaster(lines, proj, win, cap) {
  const dist = new Float32Array(win.w * win.h).fill(Infinity);
  for (const line of lines) {
    const pts = line.map((p) => proj(p));
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const cmin = Math.max(0, Math.floor((Math.min(ax, bx) - cap - win.x0) / 30)), cmax = Math.min(win.w - 1, Math.ceil((Math.max(ax, bx) + cap - win.x0) / 30));
      const rmin = Math.max(0, Math.floor((win.y0 - Math.max(ay, by) - cap) / 30)), rmax = Math.min(win.h - 1, Math.ceil((win.y0 - Math.min(ay, by) + cap) / 30));
      if (cmax < cmin || rmax < rmin) continue;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      for (let r = rmin; r <= rmax; r++) {
        const py = win.y0 - (r + 0.5) * 30;
        for (let c = cmin; c <= cmax; c++) {
          const px = win.x0 + (c + 0.5) * 30;
          let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + t * dx - px, ey = ay + t * dy - py, d = Math.sqrt(ex * ex + ey * ey);
          if (d < dist[r * win.w + c]) dist[r * win.w + c] = d;
        }
      }
    }
  }
  return dist;
}

const pct = (a, b) => (b ? +((100 * a) / b).toFixed(1) : null);

// Shape of a pixel set: neighbours (8-connected) that are also in the set, and connected-component sizes.
function shape(mask, w, h) {
  let n = 0, le2 = 0, ge6 = 0, sumNb = 0;
  const label = new Int32Array(w * h), sizes = [0];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    if (!mask[i]) continue;
    n++;
    let nb = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < h && cc >= 0 && cc < w && mask[rr * w + cc]) nb++;
    }
    sumNb += nb; if (nb <= 2) le2++; if (nb >= 6) ge6++;
  }
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    const id = sizes.length; let size = 0; stack.push(s); label[s] = id;
    while (stack.length) {
      const i = stack.pop(); size++;
      const r = (i / w) | 0, c = i - r * w;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
        const j = rr * w + cc;
        if (mask[j] && !label[j]) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  const comp = sizes.slice(1).sort((a, b) => a - b);
  const inComps = (lo, hi) => comp.filter((z) => z >= lo && z <= hi).reduce((p, q) => p + q, 0);
  return {
    pixels: n, meanChangedNeighbours: +(sumNb / n).toFixed(2), shareAtMost2NeighboursPct: pct(le2, n), shareAtLeast6NeighboursPct: pct(ge6, n),
    components: comp.length, medianComponentPx: comp[(comp.length / 2) | 0], largestComponentPx: comp[comp.length - 1],
    shareInComponentsUpTo5pxPct: pct(inComps(1, 5), n), shareInComponentsUpTo20pxPct: pct(inComps(1, 20), n), shareInComponentsOver100pxPct: pct(inComps(101, Infinity), n),
  };
}

(async () => {
  const imgs = {};
  for (const y of [2016, 2021]) imgs[y] = await (await fromUrl(NEW + y + "_ccap_landcover.tif")).getImage();
  const proj = albers();
  for (const fips of process.argv[2].split(",")) {
    const name = spine.counties.find((c) => c.fips === fips).name;
    const blocks = (await S.fetchBlocks(fips, {})).value;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const bl of blocks) for (const poly of toMulti(bl.geometry)) for (const pt of poly[0]) { const [X, Y] = proj(pt); if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; }
    const [bx0, , , by1] = imgs[2021].getBoundingBox();
    const W = imgs[2021].getWidth(), H = imgs[2021].getHeight();
    const c0 = Math.max(0, Math.floor((minX - bx0) / 30) - 1), c1 = Math.min(W, Math.ceil((maxX - bx0) / 30) + 1);
    const r0 = Math.max(0, Math.floor((by1 - maxY) / 30) - 1), r1 = Math.min(H, Math.ceil((by1 - minY) / 30) + 1);
    const win = { x0: bx0 + c0 * 30, y0: by1 - r0 * 30, w: c1 - c0, h: r1 - r0 };
    const inC = rasterize(blocks.filter((b) => b.landM2 > 0).map((b) => b.geometry), proj, win);
    const b16 = await readWindow(imgs[2016], win, c0, r0), b21 = await readWindow(imgs[2021], win, c0, r0);
    const { lines, records } = readPolylines(await roadsShp(fips));
    const dist = distanceRaster(lines, proj, win, 60);
    const A = new Uint8Array(inC.length), B = new Uint8Array(inC.length), L = new Uint8Array(inC.length);
    for (let i = 0; i < inC.length; i++) {
      if (!inC[i]) continue;
      const e = b21[i];
      if (e !== 0 && e !== 21) L[i] = 1;
      if (e === 5 && !isDev[b16[i]]) A[i] = 1;
      if (e === 5 && b16[i] === 5) B[i] = 1;
    }
    const near = (m) => { let n = 0, d30 = 0, d60 = 0; for (let i = 0; i < m.length; i++) if (m[i]) { n++; if (dist[i] <= 30) d30++; if (dist[i] <= 60) d60++; } return { pixels: n, within30mPct: pct(d30, n), within60mPct: pct(d60, n) }; };
    const out = { fips, name, roadFeatures: lines.length, roadRecords: records, changedToOpenSpace: { ...near(A), shape: shape(A, win.w, win.h) }, alreadyOpenSpace2016: near(B), allCountyLand: near(L) };
    // the same shape statistics for the already-open-space set, for context
    out.alreadyOpenSpace2016.shape = shape(B, win.w, win.h);
    console.log(JSON.stringify(out));
  }
})().catch((e) => { console.error(e); process.exit(1); });
