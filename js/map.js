const REGION_FILES = {
  "bay-area-counties": "data/coverage/bay-area-counties.geojson",
  "east-contra-costa": "data/coverage/east-contra-costa.geojson",
  "california-state": "data/coverage/california-state.geojson",
  "orange-county": "data/coverage/orange-county.geojson"
};

// layer id (as used in the panel + registry) -> region-data key it draws from.
// "national" reuses the california-state geometry in a visually distinct style.
const REGION_GEOMETRY_SOURCE = {
  "bay-area-counties": "bay-area-counties",
  "east-contra-costa": "east-contra-costa",
  "california-state": "california-state",
  "national": "california-state",
  "orange-county": "orange-county"
};

const REGION_STYLES = {
  "bay-area-counties": { color: "#1F7A6C", weight: 1.5, fillColor: "#1F7A6C", fillOpacity: 0.18 },
  "east-contra-costa": { color: "#1F7A6C", weight: 1.5, dashArray: "4,4", fillColor: "#1F7A6C", fillOpacity: 0.12, dashed: true },
  "california-state": { color: "#1B3A4B", weight: 2, fillColor: "#1B3A4B", fillOpacity: 0.05 },
  "national": { color: "#1B3A4B", weight: 1.5, dashArray: "6,5", fillColor: "#1B3A4B", fillOpacity: 0, dashed: true },
  "orange-county": { color: "#AE4A2C", weight: 1.5, fillColor: "#AE4A2C", fillOpacity: 0.18 }
};

const BCDC_WMS_URL = "https://mapserver.adaptingtorisingtides.org/cgi-bin/mapserv?map=/opt/slrviewer/mapfiles/bcdc.map";
const BCDC_WATER_LEVELS = [0, 12, 24, 36, 48, 52, 66, 77, 84, 96, 108]; // inches above MHHW, matches BCDC's own "Total Water Level" slider

const SLR_OPTIONS = BCDC_WATER_LEVELS.map(v => ({ inches: v, label: v === 0 ? "No SLR" : `${v}"` }));

// Storm-surge return-period baseline inches above MHHW, Bay-wide regional
// average — taken from BCDC's own data/storm-surge.json ("regional" block,
// fetched and inspected directly from their site). Deliberately just the
// one regional figure, not BCDC's per-county baselines/corrections — this
// map doesn't have a county-selection step, and the county-precision
// version of this feature turned out not to be worth the complexity.
const STORM_SURGE_OPTIONS = [
  { key: "none", label: "No Storm Surge", inches: 0 },
  { key: "1", label: "King Tide", inches: 14 },
  { key: "2", label: "2-yr", inches: 18 },
  { key: "5", label: "5-yr", inches: 23 },
  { key: "10", label: "10-yr", inches: 27 },
  { key: "25", label: "25-yr", inches: 32 },
  { key: "50", label: "50-yr", inches: 37 },
  { key: "100", label: "100-yr", inches: 42 }
];

function nearestLevelIndex(targetInches){
  let bestIdx = 0, bestDiff = Infinity;
  BCDC_WATER_LEVELS.forEach((v, i) => {
    const diff = Math.abs(v - targetInches);
    if(diff < bestDiff){ bestDiff = diff; bestIdx = i; }
  });
  return bestIdx;
}

// Per-water-level BCDC layers, one checkbox each, all driven by the same
// current water level. WMS layer name is `${prefix}${inches}`.
const BCDC_LAYER_TYPES = {
  "inundation": { prefix: "inundation", opacity: 0.72, color: "#2E6FA3" },
  "overtopping": { prefix: "overtopping", opacity: 0.9, color: "#C0392B" },
  "lowlying": { prefix: "lowlying", opacity: 0.6, color: "#4C8C3C", dashed: true }
};
const LEGAL_DELTA_COLOR = "#7A7A7A";

// Legend content (colors, units, class-break labels) for the flood layers
// and each consequence category — taken directly from BCDC's own
// build/slr.js (the config their legend widget is built from), not
// reconstructed from the WMS server, which doesn't expose real
// classification metadata via GetLegendGraphic.
const LAYER_LEGENDS = {
  inundation: {
    label: "Depth of Flooding",
    colors: ["#98edf0", "#80c7e0", "#68a1d0", "#507bc0", "#3855b0", "#202fa0", "#090991"],
    labels: ["0 - 2 feet", "2 - 4 feet", "4 - 6 feet", "6 - 8 feet", "8 - 10 feet", "10 - 12 feet", "12+ feet"]
  },
  overtopping: {
    label: "Shoreline Overtopping",
    colors: ["#FA3411", "#B2B2B2"],
    labels: ["Overtopping", "No Overtopping"],
    line: true
  },
  lowlying: {
    label: "Low-lying Areas",
    colors: ["#50DC0C"],
    labels: ["Low-lying Area"],
    hatch: true
  }
};

const CONSEQUENCE_LEGENDS = {
  highway_vehicle: { label: "Daily Vehicle Traffic (Vehicles (AADT))", colors: ["#ED6E22", "#BE0031", "#793518"], labels: ["18,476 - 48,500", "48,501 - 161,000", "161,000 - 275,000"], line: true },
  highway_truck: { label: "Daily Truck Traffic (Trucks (AADTT))", colors: ["#ED6E22", "#BE0031", "#793518"], labels: ["623 - 2,133", "2,135 - 5,900", "5,901 - 25,359"], line: true },
  rail: { label: "Passenger Flow (Daily Average Passengers)", colors: ["#ED6E22", "#BE0031", "#793518"], labels: ["471 - 2,263", "2,264 - 9,287", "9,288 - 236,300"], line: true },
  recreation: { label: "Visitation (Photo User Days per county)", colors: ["#42A858", "#348F58", "#2B6647"], labels: ["Low", "Medium", "High"] },
  tidalhabitat: { label: "Tidal Marsh Impacted (Acres per county)", colors: ["#42A858", "#348F58", "#2B6647"], labels: ["0 - 2,548", "2,548 - 4,448", "4,448 - 12,787"] },
  housing: { label: "Housing (Residential Units (2010) per census block group)", colors: ["#109ECD", "#1C889D", "#06597C"], labels: ["1 - 84", "85 - 334", "335 - 6,331"] },
  jobs: { label: "Jobs (Job Spaces (2010) per census block group)", colors: ["#109ECD", "#1C889D", "#06597C"], labels: ["1 - 45", "46 - 479", "480 - 6,379"] },
  vulcom_social: { label: "Socially Vulnerable Housing (Residential Units (2010) per census block group)", colors: ["#828DC3", "#6A6D90", "#404459"], labels: ["1 - 440", "441 - 2,350", "2,351 - 6,379"] },
  vulcom_contam: { label: "Contamination-Vulnerable Housing (Residential Units (2010) per census block group)", colors: ["#828DC3", "#6A6D90", "#404459"], labels: ["0 - 78", "79 - 293", "294 - 6,379"] }
};

// Consequence-indicator layers from ART Bay Area's regional analysis.
// levelDependent ones only exist for the 10 non-zero water levels
// (BCDC_WATER_LEVELS minus 0) — there's no "at 0 inches" consequence layer.
//
// brokenUpstream: confirmed directly against BCDC's live server (not a
// request-format issue on our side) — GetFeatureInfo returns zero features
// for these three layers across multiple real highway/rail locations and a
// bbox spanning the whole Bay, while other consequence layers queried the
// same way return real data. Looks like a gap in BCDC's own published data,
// so these are disabled here rather than silently showing nothing.
const CONSEQUENCE_LAYERS = {
  "highway_vehicle": { name: "consequence_highway_vehicle", levelDependent: false, brokenUpstream: true },
  "highway_truck": { name: "consequence_highway_truck", levelDependent: false, brokenUpstream: true },
  "rail": { name: "consequence_rail", levelDependent: false, brokenUpstream: true },
  "recreation": { prefix: "consequence_recreation_", levelDependent: true },
  "tidalhabitat": { prefix: "consequence_tidalhabitat_", levelDependent: true },
  "housing": { prefix: "consequence_housing_", levelDependent: true },
  "jobs": { prefix: "consequence_jobs_", levelDependent: true },
  "vulcom_social": { prefix: "consequence_vulcom_social_", levelDependent: true },
  "vulcom_contam": { prefix: "consequence_vulcom_contam_", levelDependent: true }
};

// --- USGS CoSMoS / Our Coast, Our Future -----------------------------------
// Live ArcGIS FeatureServer. One polygon sublayer per scenario (a modeled
// flood-extent boundary for that scenario) — there's no per-feature depth
// attribute on these layers (confirmed directly: fields are just OBJECTID/
// COUNTY/DIST/Shape__Area/Shape__Length), so "inside the polygon" is itself
// the answer to "does this point flood under scenario X," unlike BCDC's
// per-point depth values.
//
// Layer ids below come from a one-time inspection of
// `${COSMOS_FEATURESERVER_URL}?f=json` (27 sublayers, named
// `${prefix}_SLR${cm}`) — not re-fetched at runtime, since the service's
// own layer list doesn't change between page loads.
const COSMOS_FEATURESERVER_URL = "https://services1.arcgis.com/8CpMUd3fdw6aXef7/ArcGIS/rest/services/CoSMoS_SLR/FeatureServer";
const COSMOS_SCENARIOS = [
  { key: "avg", label: "Average (no storm)" },
  { key: "w020", label: "20-yr storm" },
  { key: "w100", label: "100-yr storm" }
];
const COSMOS_SLR_CM = [0, 25, 50, 75, 100, 150, 200, 300, 500];
const COSMOS_LAYER_IDS = {
  avg:  { 0: 0, 25: 1, 50: 2, 75: 3, 100: 4, 150: 5, 200: 6, 300: 7, 500: 8 },
  w020: { 0: 9, 25: 10, 50: 11, 75: 12, 100: 13, 150: 14, 200: 15, 300: 16, 500: 17 },
  w100: { 0: 18, 25: 19, 50: 20, 75: 21, 100: 22, 150: 23, 200: 24, 300: 25, 500: 26 }
};
const COSMOS_COLOR = "#8C2D8C";
const COSMOS_ATTRIBUTION = 'Flood extent: <a href="https://www.usgs.gov/centers/pcmsc/science/coastal-storm-modeling-system-cosmos" target="_blank" rel="noopener">USGS CoSMoS / Our Coast, Our Future</a>';

// --- NOAA Sea Level Rise Viewer ---------------------------------------------
// Unlike BCDC/CoSMoS (one service, many sublayers), this is a whole separate
// MapServer per scenario — half-foot increments from 0 to 10 ft, named
// `slr_{X}ft`/`slr_{X}_{Y}ft`. Picking a scenario means swapping which
// MapServer is active, not changing a parameter — hence a dropdown here
// rather than a slider (see BRIEF.md/plan notes for the reasoning). Layer 0
// (polygon "Low-lying Areas") is the queryable one; layer 1 (raster "Depth")
// renders alongside it but has no per-feature attributes worth querying.
const NOAA_SLR_BASE = "https://coast.noaa.gov/arcgis/rest/services/dc_slr";
const NOAA_SLR_SCENARIOS = (() => {
  const opts = [];
  for(let tenths = 0; tenths <= 100; tenths += 5){
    const ft = tenths / 10;
    const label = `${ft} ft`;
    const slug = Number.isInteger(ft) ? `${ft}ft` : `${Math.floor(ft)}_5ft`;
    opts.push({ key: slug, label, url: `${NOAA_SLR_BASE}/slr_${slug}/MapServer` });
  }
  return opts;
})();
const NOAA_SLR_ATTRIBUTION = 'Flood data: <a href="https://coast.noaa.gov/slr/" target="_blank" rel="noopener">NOAA Office for Coastal Management, Sea Level Rise Viewer</a>';
const NOAA_SLR_COLOR = "#2F6FA0";

let map, marker;
let regionData = {};       // regionId -> FeatureCollection
let layerRegistry = {};    // panel layer id -> Leaflet layer instance
let bcdcLayers = {};        // BCDC_LAYER_TYPES id -> active Leaflet WMS layer, or absent
let legalDeltaLayer = null;
let consequenceLayer = null;
let cosmosLayer = null;
let noaaSlrLayer = null;
let infoPopup = null; // set in main(), from js/info-popup.js

async function loadRegionData(){
  const regionIds = Object.keys(REGION_FILES);
  const results = await Promise.all(regionIds.map(id => fetch(REGION_FILES[id]).then(r => r.json())));
  regionIds.forEach((id, i) => { regionData[id] = results[i]; });
}

// Simple in-memory cache for map-data requests, scoped to this page
// session and shared across every live data source (BCDC's WMS server,
// and the ArcGIS REST sources below). None of these servers send a
// meaningful Cache-Control/Expires header on tiles, GetFeatureInfo, or
// identify/query responses (confirmed by inspecting each one's response
// headers directly), so without this, revisiting the same tile or
// clicking the same point twice re-triggers a full live render/query on
// the source's server every time. This just avoids repeating an
// identical request (same URL) more than once per session — it doesn't
// survive a reload, and doesn't change what's shown, since none of these
// sources' data changes mid-visit for a fixed scenario/layer selection.
const sharedRequestCache = new Map(); // url -> Promise<result>

function cachedFetch(url, transform){
  if(sharedRequestCache.has(url)) return sharedRequestCache.get(url);
  const promise = fetch(url).then(transform).catch(err => { sharedRequestCache.delete(url); throw err; });
  sharedRequestCache.set(url, promise);
  return promise;
}

// Leaflet's own WMS tile layer just sets <img src> directly, which can't be
// routed through our cache — so this fetches each tile once (cached by
// URL) and hands the resulting blob to the <img> ourselves.
const CachedBcdcTileLayer = L.TileLayer.WMS.extend({
  createTile: function(coords, done){
    const img = document.createElement("img");
    const url = this.getTileUrl(coords);
    cachedFetch(url, res => res.blob().then(blob => URL.createObjectURL(blob)))
      .then(objectUrl => { img.src = objectUrl; done(null, img); })
      .catch(err => done(err, img));
    return img;
  }
});

function buildBcdcWmsLayer(layerName, opacity){
  return new CachedBcdcTileLayer(BCDC_WMS_URL, {
    layers: layerName,
    version: "1.3.0",
    format: "image/png",
    transparent: true,
    opacity: opacity,
    attribution: 'Flood data: <a href="https://explorer.adaptingtorisingtides.org/" target="_blank" rel="noopener">BCDC Adapting to Rising Tides</a>'
  });
}

// --- BCDC GetFeatureInfo (click-to-inspect) -------------------------------
//
// Field names below (value_0, ot_ft, twl{N}_acres, etc.) come straight from
// BCDC's own build/slr.js click-render module, fetched and read directly —
// the WMS server's GetFeatureInfo has no documented schema of its own.

function bcdcFeatureInfoUrl(layerName, latlng){
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const point = map.latLngToContainerPoint(latlng);
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetFeatureInfo",
    LAYERS: layerName, QUERY_LAYERS: layerName,
    CRS: "EPSG:3857",
    BBOX: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    WIDTH: String(Math.round(size.x)), HEIGHT: String(Math.round(size.y)),
    I: String(Math.round(point.x)), J: String(Math.round(point.y)),
    INFO_FORMAT: "application/vnd.ogc.gml",
    FEATURE_COUNT: "5"
  });
  return `${BCDC_WMS_URL}&${params.toString()}`;
}

function parseGmlFeatures(xmlText, layerName){
  const featureTag = `${layerName}_feature`;
  const blocks = [...xmlText.matchAll(new RegExp(`<${featureTag}>([\\s\\S]*?)</${featureTag}>`, "g"))].map(m => m[1]);
  return blocks.map(block => {
    const attrs = {};
    const re = /<(\w+)>([^<]*)<\/\1>/g;
    let m;
    while((m = re.exec(block))){
      if(m[1] === "wkb_geometry") continue;
      attrs[m[1]] = m[2];
    }
    return attrs;
  });
}

async function fetchBcdcFeatures(layerName, latlng){
  const url = bcdcFeatureInfoUrl(layerName, latlng);
  return cachedFetch(url, async res => parseGmlFeatures(await res.text(), layerName));
}

function fmtNum(n, decimals){
  const num = Number(n);
  if(Number.isNaN(num)) return String(n);
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parseHighwayInfo(features, aadtField, aadtLabel){
  if(!features.length) return null;
  const f = features[0];
  const rows = [];
  if(f.route) rows.push({ label: "Route", value: f.route });
  if(f.r_length_m) rows.push({ label: "Length", value: `${fmtNum(Number(f.r_length_m) * 0.000621371, 1)} mi` });
  if(f[aadtField] !== undefined) rows.push({ label: aadtLabel, value: fmtNum(f[aadtField], 0) });
  if(Number(f.lifeline_rt)) rows.push({ label: "Lifeline Route", value: "Yes" });
  return rows.length ? { title: "Highway / Interstate Impacts", rows } : null;
}

function parseRailInfo(features){
  if(!features.length) return null;
  const f = features[0];
  if("station_na" in f){
    return { title: "Rail Station Impacts", rows: [
      { label: "Station", value: `${f.agencyname || ""} — ${f.station_na}` },
      { label: "Daily Avg. Passengers", value: fmtNum(f.total_ride, 0) }
    ]};
  }
  return { title: "Rail Line Impacts", rows: [
    { label: "Operator", value: f.operator || "—" },
    { label: "Daily Avg. Passengers", value: fmtNum(f.ridership, 0) }
  ]};
}

function parseTwlFieldInfo(features, suffix, label, decimals){
  if(!features.length) return null;
  const f = features[0];
  const key = Object.keys(f).find(k => k.startsWith("twl") && k.endsWith(`_${suffix}`));
  if(!key) return null;
  return { title: f.name || "Consequence", rows: [{ label, value: fmtNum(f[key], decimals) }] };
}

function parseVulcomInfo(features, rankField){
  if(!features.length) return null;
  const f = features[0];
  const rows = [{ label: "Residential Units (2010)", value: fmtNum(f.sum_res_units_2010, 0) }];
  if(f[rankField]) rows.push({ label: "Rank", value: f[rankField] });
  if(f.oluname) rows.push({ label: "Area", value: f.oluname });
  return { title: "Vulnerable Communities Impacts", rows };
}

const CONSEQUENCE_INFO_PARSERS = {
  highway_vehicle: features => parseHighwayInfo(features, "veh_aadt_num_av", "Vehicles (AADT)"),
  highway_truck: features => parseHighwayInfo(features, "truckaadt_num_av", "Trucks (AADTT)"),
  rail: features => parseRailInfo(features),
  recreation: features => parseTwlFieldInfo(features, "sum", "Photo User Days", 1),
  tidalhabitat: features => parseTwlFieldInfo(features, "acres", "Acres", 0),
  housing: features => parseTwlFieldInfo(features, "res_units_2010", "Residential Units (2010)", 0),
  jobs: features => parseTwlFieldInfo(features, "job_spaces_2010", "Job Spaces (2010)", 0),
  vulcom_social: features => parseVulcomInfo(features, "socvlnrank"),
  vulcom_contam: features => parseVulcomInfo(features, "contamrank")
};

function setSwatch(el, color, dashed){
  el.style.background = dashed
    ? `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)`
    : color;
}

function initMap(){
  map = L.map("map", { scrollWheelZoom: true }).setView([37.2, -119.4], 6);
  window.map = map; // exposed for debugging/testing
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  Object.keys(REGION_STYLES).forEach(layerId => {
    const style = REGION_STYLES[layerId];
    const geomKey = REGION_GEOMETRY_SOURCE[layerId];
    layerRegistry[layerId] = L.geoJSON(regionData[geomKey], { style });

    const swatchEl = document.querySelector(`[data-swatch="${layerId}"]`);
    if(swatchEl) setSwatch(swatchEl, style.color, !!style.dashed);
  });

  Object.keys(BCDC_LAYER_TYPES).forEach(typeId => {
    const t = BCDC_LAYER_TYPES[typeId];
    const swatchEl = document.querySelector(`[data-swatch="bcdc-${typeId}"]`);
    if(swatchEl) setSwatch(swatchEl, t.color, !!t.dashed);
  });
  const legalDeltaSwatch = document.querySelector('[data-swatch="legaldelta"]');
  if(legalDeltaSwatch) setSwatch(legalDeltaSwatch, LEGAL_DELTA_COLOR, true);

  document.querySelectorAll('.layer-item input[data-layer]').forEach(cb => {
    const layerId = cb.dataset.layer;
    if(cb.checked) layerRegistry[layerId].addTo(map);
    cb.addEventListener("change", () => {
      if(cb.checked) layerRegistry[layerId].addTo(map);
      else map.removeLayer(layerRegistry[layerId]);
    });
  });

  const legalDeltaToggle = document.querySelector('[data-static-layer="legaldelta"]');
  legalDeltaToggle.addEventListener("change", () => {
    if(legalDeltaToggle.checked){
      legalDeltaLayer = buildBcdcWmsLayer("legaldelta", 0.9);
      legalDeltaLayer.addTo(map);
    } else if(legalDeltaLayer){
      map.removeLayer(legalDeltaLayer);
      legalDeltaLayer = null;
    }
  });

  map.on("click", e => {
    if(marker) map.removeLayer(marker);
    marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
    infoPopup.showAt(e.latlng);
  });
}

function initGroupCollapse(){
  document.querySelectorAll(".group-collapse-btn").forEach(btn => {
    const body = document.getElementById(btn.getAttribute("aria-controls"));
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
    });
  });
}

function initFloodOverlay(){
  const levelSlider = document.getElementById("floodLevel");
  const levelValue = document.getElementById("floodLevelValue");
  const modeTabs = document.querySelectorAll(".mode-tab");
  const modeLevel = document.getElementById("modeLevel");
  const modeScenario = document.getElementById("modeScenario");
  const slrButtonsEl = document.getElementById("slrButtons");
  const stormButtonsEl = document.getElementById("stormButtons");
  const scenarioResultEl = document.getElementById("scenarioResult");
  const equivCaptionEl = document.getElementById("equivCaption");
  const equivScenariosEl = document.getElementById("equivScenarios");
  const bcdcCheckboxes = document.querySelectorAll("[data-bcdc-layer]");
  const impactTabs = document.querySelectorAll(".impact-tab");
  const impactFlooding = document.getElementById("impactFlooding");
  const impactConsequence = document.getElementById("impactConsequence");
  const consequenceSelect = document.getElementById("consequenceSelect");
  const consequenceNoteEl = document.getElementById("consequenceNote");
  const bcdcLegendEl = document.getElementById("bcdcLegend");

  let currentLevelIndex = Number(levelSlider.value);
  let selectedSlrInches = null;
  let selectedStormInches = null;

  const currentInches = () => BCDC_WATER_LEVELS[currentLevelIndex];

  function refreshLayer(typeId){
    const t = BCDC_LAYER_TYPES[typeId];
    if(bcdcLayers[typeId]) map.removeLayer(bcdcLayers[typeId]);
    bcdcLayers[typeId] = buildBcdcWmsLayer(`${t.prefix}${currentInches()}`, t.opacity);
    bcdcLayers[typeId].addTo(map);
  }

  function refreshConsequenceLayer(){
    const key = consequenceSelect.value;
    if(consequenceLayer){ map.removeLayer(consequenceLayer); consequenceLayer = null; }
    consequenceNoteEl.textContent = "";
    if(!key) return;
    const def = CONSEQUENCE_LAYERS[key];
    if(def.brokenUpstream){
      consequenceNoteEl.textContent = "BCDC's live server currently returns no data for this category (confirmed directly — not a bug in this map). No layer to show.";
      return;
    }
    if(def.levelDependent && currentInches() === 0){
      consequenceNoteEl.textContent = "No consequence layer at 0\" — pick a non-zero water level to see this category.";
      return;
    }
    const layerName = def.levelDependent ? `${def.prefix}${currentInches()}` : def.name;
    consequenceLayer = buildBcdcWmsLayer(layerName, 0.85);
    consequenceLayer.addTo(map);
  }

  function refreshAllChecked(){
    bcdcCheckboxes.forEach(cb => { if(cb.checked) refreshLayer(cb.dataset.bcdcLayer); });
    refreshConsequenceLayer();
    renderBcdcLegend();
  }

  function renderBcdcLegend(){
    const items = [];
    bcdcCheckboxes.forEach(cb => { if(cb.checked) items.push(LAYER_LEGENDS[cb.dataset.bcdcLayer]); });
    const consKey = consequenceSelect.value;
    if(consKey && !CONSEQUENCE_LAYERS[consKey].brokenUpstream) items.push(CONSEQUENCE_LEGENDS[consKey]);

    bcdcLegendEl.innerHTML = "";
    bcdcLegendEl.hidden = items.length === 0;
    items.forEach(item => {
      const block = document.createElement("div");
      block.className = "legend-block";
      const title = document.createElement("div");
      title.className = "legend-block-title";
      title.textContent = item.label;
      block.appendChild(title);
      item.colors.forEach((color, i) => {
        const row = document.createElement("div");
        row.className = "legend-block-row";
        const sw = document.createElement("span");
        sw.className = "legend-block-swatch" + (item.line ? " line" : "") + (item.hatch ? " hatch" : "");
        if(item.hatch){ sw.style.color = color; } else { sw.style.background = color; }
        const lbl = document.createElement("span");
        lbl.textContent = item.labels[i];
        row.appendChild(sw);
        row.appendChild(lbl);
        block.appendChild(row);
      });
      bcdcLegendEl.appendChild(block);
    });
  }

  function setLevelIndex(idx){
    currentLevelIndex = idx;
    levelSlider.value = idx;
    levelValue.textContent = `${currentInches()}"`;
    refreshAllChecked();
    updateEquivalentScenarios();
  }

  // Combos within BCDC's own ±3" binning tolerance count as "matching."
  function isWithinTolerance(sum){
    return Math.abs(sum - BCDC_WATER_LEVELS[nearestLevelIndex(sum)]) <= 3;
  }

  function updateEquivalentScenarios(){
    const twl = currentInches();
    equivCaptionEl.textContent = "This level represents similar flooding under these Sea Level Rise + Storm Surge combinations (SF Bay region, regional):";
    const rows = [];
    SLR_OPTIONS.forEach(s => {
      STORM_SURGE_OPTIONS.forEach(g => {
        const sum = s.inches + g.inches;
        if(Math.abs(sum - twl) <= 3) rows.push({ slr: s.label, storm: g.label, sum });
      });
    });
    rows.sort((a, b) => a.sum - b.sum || (b.storm === "No Storm Surge" ? -1 : 0));

    equivScenariosEl.innerHTML = "";
    if(!rows.length){
      equivScenariosEl.innerHTML = '<p class="equiv-note">No combination matches this level within the usual ±3" tolerance.</p>';
      return;
    }
    const head = document.createElement("div");
    head.className = "equiv-row equiv-head";
    head.innerHTML = "<span>Sea Level Rise</span><span>Storm Surge</span>";
    equivScenariosEl.appendChild(head);
    rows.forEach(r => {
      const row = document.createElement("div");
      row.className = "equiv-row";
      row.innerHTML = `<span>${r.slr}</span><span>${r.storm}</span>`;
      equivScenariosEl.appendChild(row);
    });
  }

  function updateGreying(){
    stormButtonsEl.querySelectorAll(".scenario-btn").forEach(b => {
      const disabled = selectedSlrInches !== null && !isWithinTolerance(selectedSlrInches + Number(b.dataset.inches));
      b.disabled = disabled;
    });
    slrButtonsEl.querySelectorAll(".scenario-btn").forEach(b => {
      const disabled = selectedStormInches !== null && !isWithinTolerance(Number(b.dataset.inches) + selectedStormInches);
      b.disabled = disabled;
    });
  }

  function buildButtonGrid(container, options, onPick){
    options.forEach(opt => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "scenario-btn";
      b.textContent = opt.label;
      b.dataset.inches = opt.inches;
      b.addEventListener("click", () => {
        container.querySelectorAll(".scenario-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        onPick(opt);
      });
      container.appendChild(b);
    });
  }

  function updateScenarioResult(){
    updateGreying();
    if(selectedSlrInches === null || selectedStormInches === null){
      scenarioResultEl.textContent = "Select a sea level rise and storm surge amount to see the closest matching Total Water Level.";
      return;
    }
    const idx = nearestLevelIndex(selectedSlrInches + selectedStormInches);
    setLevelIndex(idx);
    scenarioResultEl.textContent = `Closest matching Total Water Level: ${currentInches()}" above MHHW (regional approximation — BCDC's own tool uses county-specific storm-tide data).`;
  }

  modeTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      modeTabs.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const scenario = btn.dataset.mode === "scenario";
      modeLevel.hidden = scenario;
      modeScenario.hidden = !scenario;
    });
  });

  buildButtonGrid(slrButtonsEl, SLR_OPTIONS, opt => { selectedSlrInches = opt.inches; updateScenarioResult(); });
  buildButtonGrid(stormButtonsEl, STORM_SURGE_OPTIONS, opt => { selectedStormInches = opt.inches; updateScenarioResult(); });
  updateEquivalentScenarios();

  levelValue.textContent = `${currentInches()}"`;

  impactTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      impactTabs.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const consequence = btn.dataset.impact === "consequence";
      impactFlooding.hidden = consequence;
      impactConsequence.hidden = !consequence;
    });
  });

  consequenceSelect.addEventListener("change", () => {
    refreshConsequenceLayer();
    renderBcdcLegend();
  });

  bcdcCheckboxes.forEach(cb => {
    const typeId = cb.dataset.bcdcLayer;
    cb.addEventListener("change", () => {
      if(cb.checked){
        refreshLayer(typeId);
      } else if(bcdcLayers[typeId]){
        map.removeLayer(bcdcLayers[typeId]);
        delete bcdcLayers[typeId];
      }
      renderBcdcLegend();
    });
  });

  levelSlider.addEventListener("input", () => setLevelIndex(Number(levelSlider.value)));

  renderBcdcLegend();

  document.getElementById("hideAllBcdc").addEventListener("click", () => {
    bcdcCheckboxes.forEach(cb => {
      if(cb.checked){ cb.checked = false; cb.dispatchEvent(new Event("change")); }
    });
    const legalDeltaToggle = document.querySelector('[data-static-layer="legaldelta"]');
    if(legalDeltaToggle.checked){ legalDeltaToggle.checked = false; legalDeltaToggle.dispatchEvent(new Event("change")); }
    if(consequenceSelect.value){ consequenceSelect.value = ""; consequenceSelect.dispatchEvent(new Event("change")); }
  });

  // --- click-to-inspect providers ---
  infoPopup.registerProvider(async latlng => {
    const cb = document.querySelector('[data-bcdc-layer="inundation"]');
    if(!cb.checked) return null;
    const features = await fetchBcdcFeatures(`inundation${currentInches()}`, latlng);
    if(!features.length) return { title: "Depth of Flooding", note: `Not flooded at ${currentInches()}" above MHHW at this point.` };
    const depthFt = Number(features[0].value_0) / 12;
    return { title: "Depth of Flooding", rows: [{ label: "Depth", value: `${fmtNum(depthFt, 2)} feet` }] };
  });

  infoPopup.registerProvider(async latlng => {
    const cb = document.querySelector('[data-bcdc-layer="overtopping"]');
    if(!cb.checked) return null;
    const features = await fetchBcdcFeatures(`overtopping${currentInches()}`, latlng);
    if(!features.length) return { title: "Shoreline Overtopping", note: `No overtopping predicted at ${currentInches()}" above MHHW at this point.` };
    const f = features[0];
    const rows = [{ label: "Overtopping Depth", value: `${fmtNum(f.ot_ft, 2)} feet` }];
    if(f["class"]) rows.push({ label: "Shoreline Type", value: f["class"] });
    return { title: "Shoreline Overtopping", rows };
  });

  infoPopup.registerProvider(async latlng => {
    const key = consequenceSelect.value;
    if(!key) return null;
    const def = CONSEQUENCE_LAYERS[key];
    if(def.brokenUpstream){
      return { title: CONSEQUENCE_LEGENDS[key].label, note: "BCDC's live server currently returns no data for this category." };
    }
    if(def.levelDependent && currentInches() === 0){
      return { title: CONSEQUENCE_LEGENDS[key].label, note: 'No consequence layer at 0" above MHHW.' };
    }
    const layerName = def.levelDependent ? `${def.prefix}${currentInches()}` : def.name;
    const features = await fetchBcdcFeatures(layerName, latlng);
    const parsed = CONSEQUENCE_INFO_PARSERS[key](features);
    return parsed || { title: CONSEQUENCE_LEGENDS[key].label, note: "No data at this point." };
  });
}

// --- CoSMoS layer + scenario picker ---------------------------------------

function initCosmos(){
  const toggle = document.getElementById("cosmosToggle");
  const scenarioTabs = document.querySelectorAll("[data-cosmos-scenario]");
  const slrButtonsEl = document.getElementById("cosmosSlrButtons");
  const resultEl = document.getElementById("cosmosResult");
  const swatchEl = document.querySelector('[data-swatch="cosmos"]');
  if(swatchEl) setSwatch(swatchEl, COSMOS_COLOR, false);

  let scenario = "avg";
  let slrCm = 0;

  function currentLayerId(){
    return COSMOS_LAYER_IDS[scenario][slrCm];
  }

  function currentLabel(){
    const scenarioLabel = COSMOS_SCENARIOS.find(s => s.key === scenario).label;
    return `${scenarioLabel}, ${slrCm} cm SLR`;
  }

  function refreshCosmosLayer(){
    if(cosmosLayer){ map.removeLayer(cosmosLayer); cosmosLayer = null; }
    resultEl.textContent = `Showing: ${currentLabel()}`;
    if(!toggle.checked) return;
    cosmosLayer = L.esri.featureLayer({
      url: `${COSMOS_FEATURESERVER_URL}/${currentLayerId()}`,
      style: { color: COSMOS_COLOR, weight: 1, fillColor: COSMOS_COLOR, fillOpacity: 0.35 },
      attribution: COSMOS_ATTRIBUTION
    });
    cosmosLayer.addTo(map);
  }

  scenarioTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      scenarioTabs.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      scenario = btn.dataset.cosmosScenario;
      refreshCosmosLayer();
    });
  });

  COSMOS_SLR_CM.forEach(cm => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "scenario-btn";
    if(cm === slrCm) b.classList.add("active");
    b.textContent = cm === 0 ? "0 cm (existing)" : `${cm} cm`;
    b.dataset.cm = cm;
    b.addEventListener("click", () => {
      slrButtonsEl.querySelectorAll(".scenario-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      slrCm = cm;
      refreshCosmosLayer();
    });
    slrButtonsEl.appendChild(b);
  });

  toggle.addEventListener("change", refreshCosmosLayer);
  resultEl.textContent = `Showing: ${currentLabel()}`;

  infoPopup.registerProvider(async latlng => {
    if(!toggle.checked) return null;
    const layerId = currentLayerId();
    return new Promise(resolve => {
      L.esri.query({ url: `${COSMOS_FEATURESERVER_URL}/${layerId}` })
        .contains(latlng)
        .run((error, featureCollection) => {
          if(error){ resolve(null); return; }
          const label = `CoSMoS — ${currentLabel()}`;
          if(!featureCollection || !featureCollection.features.length){
            resolve({ title: label, note: "Not within the modeled flood extent at this point." });
            return;
          }
          const county = featureCollection.features[0].properties.COUNTY;
          const rows = [{ label: "Within modeled flood extent", value: "Yes" }];
          if(county) rows.push({ label: "County", value: county });
          resolve({ title: label, rows });
        });
    });
  });
}

// --- NOAA Sea Level Rise Viewer --------------------------------------------

function initNoaaSlr(){
  const toggle = document.getElementById("noaaSlrToggle");
  const select = document.getElementById("noaaSlrScenario");
  const resultEl = document.getElementById("noaaSlrResult");
  const swatchEl = document.querySelector('[data-swatch="noaa-slr"]');
  if(swatchEl) setSwatch(swatchEl, NOAA_SLR_COLOR, false);

  NOAA_SLR_SCENARIOS.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.key;
    o.textContent = opt.label;
    select.appendChild(o);
  });
  select.value = "3ft";

  function currentScenario(){
    return NOAA_SLR_SCENARIOS.find(s => s.key === select.value);
  }

  function refreshNoaaSlrLayer(){
    if(noaaSlrLayer){ map.removeLayer(noaaSlrLayer); noaaSlrLayer = null; }
    const scenario = currentScenario();
    resultEl.textContent = `Showing: ${scenario.label} of sea level rise.`;
    if(!toggle.checked) return;
    noaaSlrLayer = L.esri.dynamicMapLayer({
      url: scenario.url,
      layers: [0, 1],
      opacity: 0.75,
      attribution: NOAA_SLR_ATTRIBUTION
    });
    noaaSlrLayer.addTo(map);
  }

  toggle.addEventListener("change", refreshNoaaSlrLayer);
  select.addEventListener("change", refreshNoaaSlrLayer);
  resultEl.textContent = `Showing: ${currentScenario().label} of sea level rise.`;

  infoPopup.registerProvider(async latlng => {
    if(!toggle.checked) return null;
    const scenario = currentScenario();
    const label = `NOAA SLR Viewer — ${scenario.label}`;
    return new Promise(resolve => {
      L.esri.identifyFeatures({ url: scenario.url })
        .on(map)
        .at(latlng)
        .layers("visible:0")
        .tolerance(3)
        .run((error, featureCollection) => {
          if(error){ resolve(null); return; }
          if(!featureCollection || !featureCollection.features.length){
            resolve({ title: label, note: "Not within a mapped low-lying area at this point." });
            return;
          }
          resolve({ title: label, rows: [{ label: "Within low-lying area", value: "Yes" }] });
        });
    });
  });
}

async function geocode(query){
  const statusEl = document.getElementById("searchStatus");
  statusEl.textContent = "Searching…";
  statusEl.classList.remove("error");
  try{
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    const results = await res.json();
    if(!results.length){
      statusEl.textContent = `No match found for "${query}".`;
      statusEl.classList.add("error");
      return;
    }
    const { lat, lon, display_name } = results[0];
    const latN = parseFloat(lat), lonN = parseFloat(lon);
    map.setView([latN, lonN], 10);
    if(marker) map.removeLayer(marker);
    marker = L.marker([latN, lonN]).addTo(map);
    statusEl.textContent = `Showing results for: ${display_name}`;
  } catch(err){
    statusEl.textContent = "Search failed — check your connection and try again.";
    statusEl.classList.add("error");
  }
}

document.getElementById("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("searchInput").value.trim();
  if(q) geocode(q);
});

async function main(){
  await loadRegionData();
  initMap();
  infoPopup = createInfoPopup(map);
  initFloodOverlay();
  initCosmos();
  initNoaaSlr();
  initGroupCollapse();
}

main();
