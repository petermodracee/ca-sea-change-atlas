import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { setSwatch } from "../shared/dom.js";
import { fetchLegendItems, renderImageLegendBlock, renderSwatchLegendBlock } from "../shared/legend.js";

// --- Geo / demographic info -------------------------------------------------
// Context layers that aren't flood tools themselves, so any flood layer can be
// overlaid on them. Each one is pulled from the agency that publishes the
// underlying data (federal/state government), not from a third-party
// re-packaging, so the licensing is the publisher's own:
//
//   EPA Smart Location Database   — US gov (EPA); block-group population and
//                                   jobs density, derived from Census/LEHD.
//   CDC/ATSDR Social Vulnerability Index 2022 — US gov (CDC); tract poverty
//                                   and age 65+ from the Census ACS.
//   USGS National Map Structures  — US gov (USGS); hospitals, fire/EMS,
//                                   police, schools. The same dataset NOAA's
//                                   Coastal Flood Exposure Mapper (CFEM)
//                                   uses for its Critical Facilities layer.
//   EPA Facility Registry Service — US gov (EPA); regulated facilities.
//   NOAA C-CAP land cover & Wetland Potential — NOAA's own datasets; served
//                                   through NOAA's CFEM map services.
//   Caltrans traffic counts       — CA gov; both AADT datasets are CC BY
//                                   (attribute Caltrans).
// The NOAA tile caches stop at zoom 16 (land cover) and 10 (wetland
// potential); maxNativeZoom makes Leaflet scale those tiles up beyond that
// instead of requesting tiles that don't exist.
//
// CFEM's own Employees layer isn't reused: its source is Esri Business
// Analyst, a licensed product NOAA's data-sources sheet says isn't public. EPA's
// Smart Location Database (LEHD-derived) stands in for it.

const CFEM_BASE = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper";
const SLD_URL = "https://geodata.epa.gov/arcgis/rest/services/OA/SmartLocationDatabase/MapServer";
const SVI_TRACT_URL = "https://onemap.cdc.gov/onemapservices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2";
const STRUCTURES_URL = "https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer";
const FRS_URL = "https://geodata.epa.gov/arcgis/rest/services/OEI/FRS_INTERESTS/MapServer";
const CALTRANS_AADT_URL = "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/Traffic_AADT/MapServer/0";
const CALTRANS_SHN_URL = "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/SHN_Lines/MapServer/0";
const CALTRANS_TRUCK_URL = "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/Truck_Volumes_AADT/MapServer/0";

const attribution = (text, href) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const NOAA_ATTR = attribution("NOAA Office for Coastal Management (C-CAP)", "https://coast.noaa.gov/digitalcoast/data/ccapregional.html");
const EPA_SLD_ATTR = attribution("EPA Smart Location Database", "https://www.epa.gov/smartgrowth/smart-location-mapping");
const CDC_ATTR = attribution("CDC/ATSDR Social Vulnerability Index", "https://www.atsdr.cdc.gov/place-health/php/svi/index.html");
const USGS_ATTR = attribution("USGS The National Map, Structures", "https://www.usgs.gov/national-digital-trends/structures");
const EPA_FRS_ATTR = attribution("EPA Facility Registry Service", "https://www.epa.gov/frs");
const CALTRANS_AADT_ATTR = attribution("Caltrans traffic volumes (AADT), CC BY", "https://data.ca.gov/dataset/traffic-volumes-aadt");
const CALTRANS_TRUCK_ATTR = attribution("Caltrans truck volumes (AADT), CC BY", "https://data.ca.gov/dataset/truck-volumes-aadt");

// Some of these services return upper-case field names on one sublayer and lower-case on another.
const field = (props, name) => props[name] !== undefined ? props[name] : props[name.toLowerCase()];
// Caltrans stores the truck count's estimate year as two digits (0-24 is 2000-2024, 72-99 is 1972-1999).
const fullYear = yy => yy == null ? "" : (Number(yy) < 50 ? 2000 : 1900) + Number(yy);
const fmt = n => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

// Class-break styling for the two SVI percentage fields (polygons).
function classStyle(breaks, colors){
  return value => {
    let i = breaks.findIndex(b => value < b);
    if(i < 0) i = colors.length - 1;
    return colors[i];
  };
}
const POVERTY_BREAKS = [10, 20, 30, 40];
const POVERTY_COLORS = ["#FEF0D9", "#FDCC8A", "#FC8D59", "#E34A33", "#B30000"];
const ELDERLY_BREAKS = [10, 15, 20, 25];
const ELDERLY_COLORS = ["#EDF8FB", "#B3CDE3", "#8C96C6", "#8856A7", "#810F7C"];
const rangeLabels = (breaks, unit) => breaks.reduce((acc, b, i) => {
  acc.push(i === 0 ? `Under ${b}${unit}` : `${breaks[i - 1]} to ${b}${unit}`);
  return i === breaks.length - 1 ? [...acc, `${b}${unit} or more`] : acc;
}, []);

// BCDC's own traffic legend breaks (their consequence layer legend), with a
// pale lowest class added because Caltrans' counts include lower volumes.
const AADT_BREAKS = [18476, 48501, 161000];
const AADT_COLORS = ["#F4C9A6", "#ED6E22", "#BE0031", "#793518"];
const AADT_LABELS = ["Under 18,476", "18,476 - 48,500", "48,501 - 161,000", "161,000 or more"];
const TRUCK_BREAKS = [623, 2135, 5901];
const TRUCK_LABELS = ["Under 623", "623 - 2,134", "2,135 - 5,900", "5,901 or more"];

// Critical facilities are drawn as our own circle markers (the USGS service's built-in icons are ~10px).
const FACILITY_TYPES = [
  { layer: 49, label: "Hospitals / medical centers", color: "#D62839" },
  { layer: 51, label: "Fire / EMS stations", color: "#F28C28" },
  { layer: 53, label: "Police stations", color: "#2F6DB5" },
  { layer: 58, label: "Schools", color: "#7B4FA0" }
];

// Caltrans publishes counts as points at postmile locations. To colour the road itself, each state
// highway line (which carries its route, county and begin/end postmile) is cut into pieces and each
// piece takes the value of the nearest count on the same route and county, found by interpolating
// postmile along the line's length. Both queries are live and per viewport; nothing is precomputed.
const MAX_POSTMILE_GAP = 2.5; // don't colour road further than this from any count
const ROAD_MIN_ZOOM = 10;

const routeKey = (route, suffix, county, prefix) => [route, suffix, county, prefix].map(v => String(v == null ? "" : v).trim()).join("|");

class TrafficRoadLayer extends L.LayerGroup {
  /** @param {{pane: string, attribution: string, countsUrl: string, countFields: string[], toCount: Function, colorFor: Function, classes: string[]}} options */
  constructor(options){
    super();
    this.options = options;
    this.pieces = [];
    this.loadedBounds = null;
    this.loadedZoom = null;
    this.token = 0;
  }

  getAttribution(){
    return this.options.attribution;
  }

  onAdd(map){
    super.onAdd(map);
    map.on("moveend", this.onMove, this);
    this.onMove();
  }

  onRemove(map){
    map.off("moveend", this.onMove, this);
    this.token++;
    this.clear();
    super.onRemove(map);
  }

  clear(){
    this.clearLayers();
    this.pieces = [];
    this.loadedBounds = null;
  }

  onMove(){
    const map = this._map;
    if(map.getZoom() < ROAD_MIN_ZOOM){ this.token++; this.clear(); return; }
    const view = map.getBounds();
    if(this.loadedBounds && this.loadedBounds.contains(view) && map.getZoom() <= this.loadedZoom) return;
    this.load(view.pad(0.5));
  }

  query(url, fields, bounds){
    return new Promise(resolve => {
      const query = L.esri.query({ url }).intersects(bounds).fields(fields);
      if(url === CALTRANS_SHN_URL) query.simplify(this._map, 0.5).precision(5);
      query.run((error, fc) => resolve(error || !fc ? null : fc.features));
    });
  }

  async load(bounds){
    const token = ++this.token;
    this._loading = true;
    this.fire("loading");
    const [lines, counts] = await Promise.all([
      this.query(CALTRANS_SHN_URL, ["Route", "RteSuffix", "County", "PMPrefix", "bPM", "ePM"], bounds),
      this.query(this.options.countsUrl, this.options.countFields, bounds.pad(0.1))
    ]);
    if(token !== this.token) return;
    this._loading = false;
    this.fire("load");
    if(!lines || !counts) return;
    this.draw(lines, counts);
    this.loadedBounds = bounds;
    this.loadedZoom = this._map.getZoom();
  }

  draw(lines, counts){
    this.clearLayers();
    this.pieces = [];
    const byRoute = new Map();
    counts.forEach(f => {
      const c = this.options.toCount(f.properties);
      if(!Number.isFinite(c.pm)) return;
      const key = routeKey(c.route, c.suffix, c.county, c.prefix);
      if(!byRoute.has(key)) byRoute.set(key, new Map());
      if(!byRoute.get(key).has(c.pm)) byRoute.get(key).set(c.pm, c); // a postmile can be listed twice; keep one
    });
    byRoute.forEach((byPm, key) => byRoute.set(key, [...byPm.values()].sort((a, b) => a.pm - b.pm)));
    lines.forEach(f => {
      const p = f.properties;
      const list = byRoute.get(routeKey(p.Route, p.RteSuffix, p.County, p.PMPrefix));
      if(list) this.drawLine(f.geometry, Number(p.bPM), Number(p.ePM), list);
    });
  }

  drawLine(geometry, beginPm, endPm, counts){
    const parts = (geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates)
      .map(part => part.map(([lng, lat]) => L.latLng(lat, lng)));
    const total = parts.reduce((sum, pts) => sum + pts.slice(1).reduce((s, pt, i) => s + pts[i].distanceTo(pt), 0), 0);
    if(!total) return;
    let travelled = 0;
    parts.forEach(pts => {
      let run = null;
      const flush = () => { if(run) this.addPiece(run); run = null; };
      for(let i = 0; i < pts.length - 1; i++){
        const len = pts[i].distanceTo(pts[i + 1]);
        const pm = beginPm + (endPm - beginPm) * (travelled + len / 2) / total;
        travelled += len;
        const count = counts.reduce((best, c) => !best || Math.abs(c.pm - pm) < Math.abs(best.pm - pm) ? c : best, null);
        if(!count || Math.abs(count.pm - pm) > MAX_POSTMILE_GAP){ flush(); continue; }
        const value = pm <= count.pm ? count.before : count.after; // Caltrans gives a count just before and just after its postmile
        if(!(value > 0)){ flush(); continue; }
        const key = `${count.pm}|${pm <= count.pm}`;
        if(run && run.key === key){ run.latlngs.push(pts[i + 1]); continue; }
        flush();
        run = { key, latlngs: [pts[i], pts[i + 1]], count, value };
      }
      flush();
    });
  }

  addPiece({ latlngs, count, value }){
    const color = this.options.colorFor(value);
    const line = L.polyline(latlngs, {
      pane: this.options.pane, interactive: false, color, opacity: 0.9,
      weight: 3 + 1.5 * this.options.classes.indexOf(color), lineCap: "butt", lineJoin: "round"
    });
    this.addLayer(line);
    this.pieces.push({ line, count, value });
  }

  /** The drawn piece nearest to a point, within `maxPx` screen pixels, or null. */
  nearest(latlng, maxPx){
    const map = this._map;
    const point = map.latLngToLayerPoint(latlng);
    let best = null;
    this.pieces.forEach(piece => {
      const pts = piece.line.getLatLngs().map(ll => map.latLngToLayerPoint(ll));
      for(let i = 0; i < pts.length - 1; i++){
        const d = L.LineUtil.pointToSegmentDistance(point, pts[i], pts[i + 1]);
        if(d <= maxPx && (!best || d < best.d)) best = { d, piece };
      }
    });
    return best && best.piece;
  }
}

const legendColorCache = new Map();

/** Reads a base64 PNG swatch's centre pixel as {r, g, b, a}. */
async function swatchColor(item){
  const bitmap = await createImageBitmap(await (await fetch(`data:${item.contentType};base64,${item.imageData}`)).blob());
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const [r, g, b, a] = ctx.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1).data;
  return { r, g, b, a };
}

/** A tiled service's legend as [{label, r, g, b}], with each class colour read from its swatch. Cached per service. */
function legendColors(url){
  if(!legendColorCache.has(url)){
    legendColorCache.set(url, fetchLegendItems(url, 0).then(items =>
      Promise.all(items.map(async item => ({ label: item.label.trim(), ...await swatchColor(item) })))).catch(err => {
      legendColorCache.delete(url);
      throw err;
    }));
  }
  return legendColorCache.get(url);
}

/** The {r, g, b, a} of one pixel of a cached map tile, or null if the tile can't be read (missing or cross-origin). */
async function tilePixel(url, px, py){
  try{
    const res = await fetch(url);
    if(!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const ctx = new OffscreenCanvas(256, 256).getContext("2d");
    ctx.drawImage(bitmap, 0, 0, 256, 256);
    const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
    return { r, g, b, a };
  }catch(err){
    return null;
  }
}

const LAYERS = [
  {
    id: "geoPopDensity", paneKey: "geoPeople", select: "geoPeopleSelect", swatch: "#B8C480", label: "Population density",
    build: (map, pane) => L.esri.dynamicMapLayer({ url: SLD_URL, layers: [2], f: "image", opacity: 0.7, pane, attribution: EPA_SLD_ATTR }),
    legend: () => renderImageLegendBlock(SLD_URL, 2, "People per acre (block group)"),
    identify: { url: `${SLD_URL}/2`, title: "Population density (EPA)", rows: p => [
      { label: "People per acre", value: Number(p.D1B).toFixed(1) }, { label: "Housing units per acre", value: Number(p.D1A).toFixed(1) }] }
  },
  {
    id: "geoJobsDensity", paneKey: "geoPeople", select: "geoPeopleSelect", swatch: "#6F86B8", label: "Jobs density",
    build: (map, pane) => L.esri.dynamicMapLayer({ url: SLD_URL, layers: [3], f: "image", opacity: 0.7, pane, attribution: EPA_SLD_ATTR }),
    legend: () => renderImageLegendBlock(SLD_URL, 3, "Jobs per acre (block group)"),
    identify: { url: `${SLD_URL}/3`, title: "Jobs density (EPA)", rows: p => [
      { label: "Jobs per acre", value: Number(p.D1C).toFixed(1) }, { label: "Total jobs in block group (2017)", value: fmt(p.TotEmp || 0) }] }
  },
  {
    id: "geoPoverty", paneKey: "geoPeople", select: "geoPeopleSelect", swatch: "#E34A33", label: "Poverty (below 150% of poverty line)",
    build(map, pane){
      return L.esri.featureLayer({
        url: SVI_TRACT_URL, where: "STATE='California'", minZoom: 8, pane, simplifyFactor: 0.5, precision: 4,
        fields: ["GRASP_ID", "FIPS", "EP_POV150"], attribution: CDC_ATTR,
        style: f => ({ pane, weight: 0.4, color: "#666", fillOpacity: 0.7, fillColor: classStyle(POVERTY_BREAKS, POVERTY_COLORS)(f.properties.EP_POV150) })
      });
    },
    legend: () => renderSwatchLegendBlock({ label: "Percent below 150% of poverty line (tract)", colors: POVERTY_COLORS, labels: rangeLabels(POVERTY_BREAKS, "%") }),
    identify: { url: SVI_TRACT_URL, where: "STATE='California'", title: "Poverty (CDC SVI)", rows: p => [
      { label: "Tract", value: p.LOCATION }, { label: "Below 150% of poverty line", value: `${p.EP_POV150}%` }] }
  },
  {
    id: "geoElderly", paneKey: "geoPeople", select: "geoPeopleSelect", swatch: "#8856A7", label: "Population age 65+",
    build(map, pane){
      return L.esri.featureLayer({
        url: SVI_TRACT_URL, where: "STATE='California'", minZoom: 8, pane, simplifyFactor: 0.5, precision: 4,
        fields: ["GRASP_ID", "FIPS", "EP_AGE65"], attribution: CDC_ATTR,
        style: f => ({ pane, weight: 0.4, color: "#666", fillOpacity: 0.7, fillColor: classStyle(ELDERLY_BREAKS, ELDERLY_COLORS)(f.properties.EP_AGE65) })
      });
    },
    legend: () => renderSwatchLegendBlock({ label: "Percent of population age 65+ (tract)", colors: ELDERLY_COLORS, labels: rangeLabels(ELDERLY_BREAKS, "%") }),
    identify: { url: SVI_TRACT_URL, where: "STATE='California'", title: "Age 65+ (CDC SVI)", rows: p => [
      { label: "Tract", value: p.LOCATION }, { label: "Population age 65+", value: `${p.EP_AGE65}%` }] }
  },
  {
    id: "geoFacilities", paneKey: "geoFacilities", swatch: "#D62839", label: "Critical facilities (hospitals, fire/EMS, police, schools)",
    build: (map, pane) => L.layerGroup(FACILITY_TYPES.map(t => L.esri.featureLayer({
      url: `${STRUCTURES_URL}/${t.layer}`, minZoom: 11, pane, attribution: USGS_ATTR,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { pane, radius: 7, color: "#fff", weight: 1.5, fillColor: t.color, fillOpacity: 0.95 })
    }))),
    legend: () => renderSwatchLegendBlock({ label: "Critical facilities (USGS Structures)", colors: FACILITY_TYPES.map(t => t.color), labels: FACILITY_TYPES.map(t => t.label) }),
    identify: { urls: [[`${STRUCTURES_URL}/49`, "Hospital / medical center"], [`${STRUCTURES_URL}/51`, "Fire / EMS station"],
      [`${STRUCTURES_URL}/53`, "Police station"], [`${STRUCTURES_URL}/58`, "School"]], nearby: "auto",
      title: "Critical facility (USGS Structures)", rows: (p, type) => [
      { label: "Name", value: field(p, "NAME") }, { label: "Type", value: type },
      { label: "Address", value: [field(p, "ADDRESS"), field(p, "CITY")].filter(Boolean).join(", ") }] }
  },
  {
    id: "geoFrs", paneKey: "geoFacilities", swatch: "#7A4F9E", label: "Regulated facilities, pollution sources (zoom in)",
    build: (map, pane) => L.esri.dynamicMapLayer({ url: FRS_URL, layers: [8], f: "image", opacity: 1, pane, attribution: EPA_FRS_ATTR }),
    legend: () => renderImageLegendBlock(FRS_URL, 8, "EPA-regulated facilities"),
    identify: { urls: [[`${FRS_URL}/8`, ""]], nearby: "auto", title: "EPA-regulated facility (FRS)", rows: p => [
      { label: "Name", value: p.PRIMARY_NAME }, { label: "Program", value: p.PGM_SYS_ACRNM },
      { label: "Address", value: [p.LOCATION_ADDRESS, p.CITY_NAME].filter(Boolean).join(", ") }] }
  },
  {
    id: "geoDeveloped", paneKey: "geoLand", select: "geoLandSelect", swatch: "#B23A48", label: "Developed land (NOAA C-CAP)",
    build: (map, pane) => L.esri.tiledMapLayer({ url: `${CFEM_BASE}/CFEM_LandCover_Developed/MapServer`, maxNativeZoom: 16, opacity: 0.7, pane, attribution: NOAA_ATTR }),
    legend: () => renderImageLegendBlock(`${CFEM_BASE}/CFEM_LandCover_Developed/MapServer`, 0, "Developed land (C-CAP)"),
    identifyTile: { url: `${CFEM_BASE}/CFEM_LandCover_Developed/MapServer`, maxNativeZoom: 16, title: "Developed land (NOAA C-CAP)" }
  },
  {
    id: "geoNatural", paneKey: "geoLand", select: "geoLandSelect", swatch: "#4C8C3C", label: "Wetlands, natural areas & open space (NOAA C-CAP)",
    build: (map, pane) => L.esri.tiledMapLayer({ url: `${CFEM_BASE}/CFEM_LandCover_NaturalAreasOpenSpace/MapServer`, maxNativeZoom: 16, opacity: 0.7, pane, attribution: NOAA_ATTR }),
    legend: () => renderImageLegendBlock(`${CFEM_BASE}/CFEM_LandCover_NaturalAreasOpenSpace/MapServer`, 0, "Natural areas and open space (C-CAP)"),
    identifyTile: { url: `${CFEM_BASE}/CFEM_LandCover_NaturalAreasOpenSpace/MapServer`, maxNativeZoom: 16, title: "Natural areas and open space (NOAA C-CAP)" }
  },
  {
    id: "geoDevChange", paneKey: "geoLand", select: "geoLandSelect", swatch: "#E07B39", label: "Land converted to development, 1996-2016 (NOAA C-CAP)",
    build: (map, pane) => L.esri.tiledMapLayer({ url: `${CFEM_BASE}/CFEM_LandCover_19962010Change/MapServer`, maxNativeZoom: 16, opacity: 0.8, pane, attribution: NOAA_ATTR }),
    legend: () => renderImageLegendBlock(`${CFEM_BASE}/CFEM_LandCover_19962010Change/MapServer`, 0, "Areas converted to development (C-CAP)"),
    identifyTile: { url: `${CFEM_BASE}/CFEM_LandCover_19962010Change/MapServer`, maxNativeZoom: 16, title: "Land converted to development (NOAA C-CAP)" }
  },
  {
    id: "geoWetlandPotential", paneKey: "geoLand", select: "geoLandSelect", swatch: "#2E8B8B", label: "Wetland potential (NOAA C-CAP)",
    build: (map, pane) => L.esri.tiledMapLayer({ url: `${CFEM_BASE}/CFEM_WetlandPotential/MapServer`, maxNativeZoom: 10, opacity: 0.7, pane, attribution: NOAA_ATTR }),
    legend: () => renderImageLegendBlock(`${CFEM_BASE}/CFEM_WetlandPotential/MapServer`, 0, "Wetland potential (likelihood, not a classification)"),
    identifyTile: { url: `${CFEM_BASE}/CFEM_WetlandPotential/MapServer`, maxNativeZoom: 10, title: "Wetland potential (NOAA C-CAP)" }
  },
  {
    id: "geoAadt", paneKey: "geoFacilities", swatch: "#BE0031", label: "Highway traffic counts (Caltrans AADT, zoom in)",
    build: (map, pane) => new TrafficRoadLayer({
      pane, attribution: CALTRANS_AADT_ATTR, countsUrl: CALTRANS_AADT_URL,
      countFields: ["RTE", "RTE_SFX", "CNTY", "PM_PFX", "PM", "DESCRIPTION", "BACK_AADT", "AHEAD_AADT"],
      classes: AADT_COLORS, colorFor: classStyle(AADT_BREAKS, AADT_COLORS),
      toCount: p => ({ route: p.RTE, suffix: p.RTE_SFX, county: p.CNTY, prefix: p.PM_PFX, pm: parseFloat(p.PM),
        description: p.DESCRIPTION, before: Number(p.BACK_AADT) || 0, after: Number(p.AHEAD_AADT) || 0 })
    }),
    legend: () => renderSwatchLegendBlock({ label: "Daily vehicles (AADT), state highways by nearest Caltrans count", colors: AADT_COLORS, labels: AADT_LABELS }),
    identifyRoad: { title: "Highway traffic count (Caltrans)", rows: ({ count, value }) => [
      { label: "Route", value: count.route }, { label: "Nearest count", value: count.description },
      { label: "Vehicles per day (annual average)", value: fmt(value) }] }
  },
  {
    id: "geoTruck", paneKey: "geoFacilities", swatch: "#793518", label: "Highway truck counts (Caltrans AADT, zoom in)",
    build: (map, pane) => new TrafficRoadLayer({
      pane, attribution: CALTRANS_TRUCK_ATTR, countsUrl: CALTRANS_TRUCK_URL,
      countFields: ["RTE", "RTE_SFX", "CNTY", "PM_PFX", "POSTMILE", "DESCRIPTION", "TOT_TRK_AADT", "EST_YEAR"],
      classes: AADT_COLORS, colorFor: classStyle(TRUCK_BREAKS, AADT_COLORS),
      toCount: p => ({ route: p.RTE, suffix: p.RTE_SFX, county: p.CNTY, prefix: p.PM_PFX, pm: Number(p.POSTMILE),
        description: p.DESCRIPTION, before: Number(p.TOT_TRK_AADT) || 0, after: Number(p.TOT_TRK_AADT) || 0, year: fullYear(p.EST_YEAR) })
    }),
    legend: () => renderSwatchLegendBlock({ label: "Daily trucks (AADT), state highways by nearest Caltrans count", colors: AADT_COLORS, labels: TRUCK_LABELS }),
    identifyRoad: { title: "Highway truck count (Caltrans)", rows: ({ count, value }) => [
      { label: "Route", value: count.route }, { label: "Nearest count", value: count.description },
      { label: "Trucks per day (annual average)", value: fmt(value) }, { label: "Count year", value: count.year }] }
  }
];

/** One layer in the "Geo / demographic info" group (a checkbox, or one option of a dropdown): builds its layer, legend and click-to-inspect provider from a LAYERS entry. */
class GeoInfoLayer extends BaseLayer {
  constructor(map, infoPopup, config){
    super(map, infoPopup, config);
    this.selectEl = config.select ? document.getElementById(config.select) : null;
    this.toggleEl = this.selectEl ? null : document.getElementById(config.id);
    this.legendEl = document.getElementById(`${config.id}Legend`);
  }

  isEnabled(){
    return this.selectEl ? this.selectEl.value === this.config.id : this.toggleEl.checked;
  }

  buildLayer(){
    return this.config.build(this.map, groupPane(this.map, this.config.paneKey));
  }

  async updateLegend(){
    if(!this.isEnabled()){ this.legendEl.hidden = true; this.legendEl.innerHTML = ""; return; }
    try{
      const block = await this.config.legend();
      if(!this.isEnabled()) return; // toggled off while the legend was loading
      this.legendEl.innerHTML = "";
      this.legendEl.appendChild(block);
      this.legendEl.hidden = false;
    }catch(err){
      this.legendEl.hidden = true;
    }
  }

  init(){
    if(this.selectEl){
      // "Hide" on the group clears the dropdown; the shared handler only unchecks checkboxes.
      this.selectEl.closest(".layer-group").addEventListener("layergroup:hide", () => {
        if(!this.selectEl.value) return;
        this.selectEl.value = "";
        this.selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }else{
      setSwatch(document.querySelector(`[data-swatch="${this.config.id}"]`), this.config.swatch, false);
    }
    (this.selectEl || this.toggleEl).addEventListener("change", () => this.refresh());
    if(this.config.identify) this.registerPopupProvider(latlng => this.identify(latlng));
    if(this.config.identifyTile) this.registerPopupProvider(latlng => this.identifyTile(latlng));
    if(this.config.identifyRoad) this.registerPopupProvider(latlng => this.identifyRoad(latlng));
  }

  /**
   * Click-to-inspect: an ArcGIS `query` at the point (polygons) or within a few pixels of it (points).
   * Point layers are queried rather than `identify`d because identify on some of these
   * services (USGS Structures, EPA FRS) returns statewide results regardless of the point.
   */
  async identify(latlng){
    if(!this.isEnabled()) return null;
    const spec = this.config.identify;
    const urls = spec.urls || [[spec.url, ""]];
    const radius = spec.nearby === "auto" ? this.pixelsToMeters(latlng, 10) : spec.nearby;
    const found = await Promise.all(urls.map(([url, type]) => this.queryOne(url, type, spec, latlng, radius)));
    const best = found.filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
    return best ? { title: spec.title, rows: spec.rows(best.properties, best.type).filter(r => r.value) } : null;
  }

  /**
   * Click-to-inspect for the NOAA land-cover tile layers. NOAA's services expose no class value
   * (their queryable layer is just county polygons), so read the class off the picture: fetch the
   * one cached tile under the click, take that pixel's colour, and match it to the service legend.
   */
  async identifyTile(latlng){
    if(!this.isEnabled()) return null;
    const spec = this.config.identifyTile;
    const z = Math.min(this.map.getZoom(), spec.maxNativeZoom);
    const point = this.map.project(latlng, z);
    const x = Math.floor(point.x / 256), y = Math.floor(point.y / 256);
    const [classes, pixel] = await Promise.all([
      legendColors(spec.url), tilePixel(`${spec.url}/tile/${z}/${y}/${x}`, Math.floor(point.x - x * 256), Math.floor(point.y - y * 256))
    ]);
    if(!pixel || pixel.a < 16) return { title: spec.title, note: "This category isn't mapped at this point." };
    const match = classes.map(c => ({ ...c, d: Math.hypot(c.r - pixel.r, c.g - pixel.g, c.b - pixel.b) })).sort((a, b) => a.d - b.d)[0];
    if(!match || match.d > 40) return null;
    return { title: spec.title, rows: [{ label: "Class", value: match.label }] };
  }

  /** Click-to-inspect for the highway count layers: the drawn road piece under (or within 10px of) the click. */
  identifyRoad(latlng){
    if(!this.isEnabled() || !this.layer) return null;
    const piece = this.layer.nearest(latlng, 10);
    const spec = this.config.identifyRoad;
    return piece ? { title: spec.title, rows: spec.rows(piece).filter(r => r.value) } : null;
  }

  pixelsToMeters(latlng, px){
    return px * 156543.03 * Math.cos(latlng.lat * Math.PI / 180) / Math.pow(2, this.map.getZoom());
  }

  queryOne(url, type, spec, latlng, radius){
    return new Promise(resolve => {
      const query = L.esri.query({ url });
      if(radius) query.nearby(latlng, radius); else query.intersects(latlng);
      if(spec.where) query.where(spec.where);
      query.run((error, fc) => {
        if(error || !fc || !fc.features.length){ resolve(null); return; }
        let best = null;
        fc.features.forEach(f => {
          const g = f.geometry;
          const distance = g && g.type === "Point" ? latlng.distanceTo(L.latLng(g.coordinates[1], g.coordinates[0])) : 0;
          if(!best || distance < best.distance) best = { properties: f.properties, type, distance };
        });
        resolve(best);
      });
    });
  }
}

/** Instantiates and initializes every layer in the "Geo / demographic info" group. */
export function initGeoInfoLayers(map, infoPopup){
  LAYERS.forEach(config => new GeoInfoLayer(map, infoPopup, config).init());
}
