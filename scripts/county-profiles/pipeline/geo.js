// Geometry for the County Profiles intersect: point-in-polygon with a per-ring edge index, polygon
// area on an equal-area projection, and the SFHA-union clipping used for land-in-floodplain area.
// Coordinates are [lon, lat] in degrees (NAD83 and WGS84 differ by well under a metre here, far
// below any block or facility's own positional error). Polygons are GeoJSON-style: an array of
// rings, ring 0 the outer boundary and the rest holes.

const polygonClipping = require("polygon-clipping");

const BINS = 128;

// One closed ring with its edges bucketed by latitude band, so a point test looks at a few edges
// instead of every vertex of a coastline with 100,000 of them.
class Ring {
  constructor(coords) {
    let pts = coords;
    if (pts.length > 1) {
      const a = pts[0], b = pts[pts.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) pts = pts.slice(0, -1);
    }
    const n = pts.length;
    this.n = n;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = pts[i][0], y = pts[i][1];
      this.xs[i] = x;
      this.ys[i] = y;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
    this.bbox = [minx, miny, maxx, maxy];
    this.h = (maxy - miny) / BINS || 1;
    const lists = Array.from({ length: BINS }, () => []);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const lo = Math.min(this.ys[i], this.ys[j]), hi = Math.max(this.ys[i], this.ys[j]);
      const b0 = Math.min(BINS - 1, Math.floor((lo - miny) / this.h));
      const b1 = Math.min(BINS - 1, Math.floor((hi - miny) / this.h));
      for (let b = b0; b <= b1; b++) lists[b].push(i);
    }
    this.bins = lists.map((l) => Int32Array.from(l));
  }

  // Even-odd ray cast to the right. Points exactly on an edge are decided arbitrarily but
  // consistently, which is all a block's internal point or a facility needs.
  contains(x, y) {
    const [minx, miny, maxx, maxy] = this.bbox;
    if (x < minx || x > maxx || y < miny || y > maxy) return false;
    const b = Math.min(BINS - 1, Math.floor((y - miny) / this.h));
    const edges = this.bins[b];
    let inside = false;
    for (let k = 0; k < edges.length; k++) {
      const i = edges[k], j = (i + 1) % this.n;
      const yi = this.ys[i], yj = this.ys[j];
      if (yi > y !== yj > y) {
        const xi = this.xs[i], xj = this.xs[j];
        if (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }
}

// A set of polygon features (each a Polygon or MultiPolygon geometry) that can answer "is this
// point inside any of them". Features are tested independently, so overlapping features are fine.
class PolygonSet {
  constructor(geometries) {
    this.parts = []; // {bbox, rings: Ring[]} one per polygon (a MultiPolygon contributes several)
    for (const g of geometries) {
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        const rings = poly.map((r) => new Ring(r));
        this.parts.push({ bbox: rings[0].bbox, rings });
      }
    }
  }

  contains(x, y) {
    for (const p of this.parts) {
      const [minx, miny, maxx, maxy] = p.bbox;
      if (x < minx || x > maxx || y < miny || y > maxy) continue;
      let inside = false;
      for (const r of p.rings) if (r.contains(x, y)) inside = !inside;
      if (inside) return true;
    }
    return false;
  }
}

// Equal-area projection (Lambert azimuthal on the authalic sphere) centred on `origin`, in metres.
function projector(origin) {
  const R = 6371007.2, d = Math.PI / 180;
  const l0 = origin[0] * d, p0 = origin[1] * d;
  return ([lon, lat]) => {
    const l = lon * d, p = lat * d;
    const k = Math.sqrt(2 / (1 + Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0)));
    return [R * k * Math.cos(p) * Math.sin(l - l0), R * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0))];
  };
}

const ringArea = (ring, proj) => {
  let s = 0;
  const pts = ring.map(proj);
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
};

// Area in square metres of a polygon given as rings (outer minus holes).
function polygonArea(rings, proj) {
  return rings.reduce((s, r, i) => s + (i === 0 ? 1 : -1) * ringArea(r, proj), 0);
}

// polygon-clipping speaks MultiPolygon coordinate arrays.
const toMulti = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
const multiArea = (multi, proj) => multi.reduce((s, poly) => s + polygonArea(poly, proj), 0);
const multiBbox = (multi) => {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const poly of multi) for (const [x, y] of poly[0]) {
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  return [minx, miny, maxx, maxy];
};

// Sutherland-Hodgman clip of one ring to an axis-aligned box. Used to hand polygon-clipping only the
// part of a big floodplain polygon near one block; area is preserved inside the box.
function clipRingToBox(ring, [minx, miny, maxx, maxy]) {
  const edges = [
    [(p) => p[0] >= minx, (a, b) => [minx, a[1] + ((b[1] - a[1]) * (minx - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= maxx, (a, b) => [maxx, a[1] + ((b[1] - a[1]) * (maxx - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= miny, (a, b) => [a[0] + ((b[0] - a[0]) * (miny - a[1])) / (b[1] - a[1]), miny]],
    [(p) => p[1] <= maxy, (a, b) => [a[0] + ((b[0] - a[0]) * (maxy - a[1])) / (b[1] - a[1]), maxy]],
  ];
  let out = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (!out.length) return [];
  }
  return out.length >= 3 ? [...out, out[0]] : [];
}

module.exports = { clipRingToBox, Ring, PolygonSet, projector, polygonArea, multiArea, multiBbox, toMulti, polygonClipping };
