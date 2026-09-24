// Areal apportionment: the share of each census block's own polygon that lies inside a hazard
// mask. Weighting a block's people (or jobs) by that share, instead of testing only its internal
// point, stops a block that straddles an irregular boundary from counting as wholly in or wholly out.
// Facilities are points and never go through here.
//
// A mask is a list of GeoJSON Polygon/MultiPolygon geometries whose features do not overlap (the
// SFHA's areas sum to the area of their union; NOAA's connected and unconnected SLR polygons are
// disjoint by construction), so a block's covered area is the sum of its intersections with each
// nearby polygon. `overlapCheck` verifies that per mask instead of assuming it.

const { clipRingToBox, multiArea, multiBbox, toMulti, polygonClipping } = require("./geo");

class ArealMasker {
  constructor(blocks, proj) {
    this.proj = proj;
    this.blocks = blocks;
    this.multi = blocks.map((b) => toMulti(b.geometry));
    this.bbox = this.multi.map(multiBbox);
    this.area = Float64Array.from(this.multi, (m) => multiArea(m, proj));
  }

  // Splits every polygon of a mask into a grid of tiles by recursive bounding-box clipping (each
  // level touches each vertex about once, so a 200,000-vertex coastline costs a few million steps,
  // not one full pass per block). Returns Map(tileKey -> polygons clipped to that tile).
  tile(geoms, extent, tileDeg) {
    const tiles = new Map();
    const nx = Math.ceil((extent[2] - extent[0]) / tileDeg), ny = Math.ceil((extent[3] - extent[1]) / tileDeg);
    const emit = (box, rings) => {
      const ix = Math.min(nx - 1, Math.max(0, Math.floor((box[0] + 1e-9 - extent[0]) / tileDeg)));
      const iy = Math.min(ny - 1, Math.max(0, Math.floor((box[1] + 1e-9 - extent[1]) / tileDeg)));
      const key = ix + "," + iy;
      if (!tiles.has(key)) tiles.set(key, []);
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const [x, y] of rings[0]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      tiles.get(key).push({ rings, bbox: [minx, miny, maxx, maxy] });
    };
    const split = (box, rings) => {
      const outer = clipRingToBox(rings[0], box);
      if (!outer.length) return;
      const clipped = [outer];
      for (let h = 1; h < rings.length; h++) { const r = clipRingToBox(rings[h], box); if (r.length) clipped.push(r); }
      // Boxes are whole numbers of tiles, so split on integer tile counts (float widths can round a
      // child up to its parent's size and recurse forever).
      const cx = Math.round((box[2] - box[0]) / tileDeg), cy = Math.round((box[3] - box[1]) / tileDeg);
      if (cx <= 1 && cy <= 1) { emit(box, clipped); return; }
      const mx = cx > 1 ? box[0] + Math.floor(cx / 2) * tileDeg : null;
      const my = cy > 1 ? box[1] + Math.floor(cy / 2) * tileDeg : null;
      const xs = mx === null ? [[box[0], box[2]]] : [[box[0], mx], [mx, box[2]]];
      const ys = my === null ? [[box[1], box[3]]] : [[box[1], my], [my, box[3]]];
      for (const [x0, x1] of xs) for (const [y0, y1] of ys) split([x0, y0, x1, y1], clipped);
    };
    const ext = [extent[0], extent[1], extent[0] + nx * tileDeg, extent[1] + ny * tileDeg];
    for (const g of geoms) for (const poly of toMulti(g)) {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const [x, y] of poly[0]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      if (maxx < ext[0] || minx > ext[2] || maxy < ext[1] || miny > ext[3]) continue;
      split(ext, poly);
    }
    return { tiles, nx, ny, tileDeg, extent };
  }

  // Returns {frac: Float64Array (0..1 per block), failures}. Failures are intersections
  // polygon-clipping could not complete; the caller fails the run if any occurs, so a block is never
  // silently treated as uncovered.
  fractions(geoms, { sample = 0 } = {}) {
    // Two grids: fine tiles for ordinary blocks, coarse tiles (built only if needed) for the few
    // blocks that span many fine tiles, so a big block does not gather thousands of fragments.
    let fine = null, coarse = null;
    const FINE = 0.02, COARSE = 0.1;
    const N = this.blocks.length;
    const frac = new Float64Array(N);
    let failures = 0;
    const overlap = { sampled: 0, individual: 0, combined: 0 };
    let seen = 0;
    for (let i = 0; i < N; i++) {
      const bb = this.bbox[i];
      const big = (bb[2] - bb[0]) > FINE * 3 || (bb[3] - bb[1]) > FINE * 3;
      let grid;
      if (big) grid = coarse || (coarse = this.tile(geoms, this.extent(), COARSE));
      else grid = fine || (fine = this.tile(geoms, this.extent(), FINE));
      const ix0 = Math.max(0, Math.floor((bb[0] - grid.extent[0]) / grid.tileDeg)), ix1 = Math.min(grid.nx - 1, Math.floor((bb[2] - grid.extent[0]) / grid.tileDeg));
      const iy0 = Math.max(0, Math.floor((bb[1] - grid.extent[1]) / grid.tileDeg)), iy1 = Math.min(grid.ny - 1, Math.floor((bb[3] - grid.extent[1]) / grid.tileDeg));
      const box = [bb[0] - 1e-6, bb[1] - 1e-6, bb[2] + 1e-6, bb[3] + 1e-6];
      const cand = [];
      for (let x = ix0; x <= ix1; x++) for (let y = iy0; y <= iy1; y++) {
        for (const p of grid.tiles.get(x + "," + y) || []) {
          if (p.bbox[0] > bb[2] || p.bbox[2] < bb[0] || p.bbox[1] > bb[3] || p.bbox[3] < bb[1]) continue;
          const outer = clipRingToBox(p.rings[0], box);
          if (!outer.length) continue;
          const poly = [outer];
          for (let h = 1; h < p.rings.length; h++) { const r = clipRingToBox(p.rings[h], box); if (r.length) poly.push(r); }
          cand.push(poly);
        }
      }
      if (!cand.length) continue;
      try {
        const covered = multiArea(polygonClipping.intersection(this.multi[i], cand), this.proj);
        // Overlap check on a sample of blocks that meet 2+ fragments: the area of each fragment
        // taken alone, summed, must equal the area of them taken together, or the mask overlaps itself.
        if (sample && cand.length > 1 && overlap.sampled < sample && seen++ % 11 === 0) {
          overlap.sampled++;
          overlap.combined += covered;
          overlap.individual += cand.reduce((a, c) => a + multiArea(polygonClipping.intersection(this.multi[i], [c]), this.proj), 0);
        }
        if (this.area[i] > 0) frac[i] = Math.min(1, covered / this.area[i]);
      } catch (e) { failures++; }
    }
    return { frac, failures, overlap };
  }

  extent() {
    if (!this._extent) {
      const e = [Infinity, Infinity, -Infinity, -Infinity];
      for (const b of this.bbox) { e[0] = Math.min(e[0], b[0]); e[1] = Math.min(e[1], b[1]); e[2] = Math.max(e[2], b[2]); e[3] = Math.max(e[3], b[3]); }
      this._extent = e;
    }
    return this._extent;
  }
}

module.exports = { ArealMasker };
