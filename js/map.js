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
// The real "Our Coast, Our Future" (OCOF) tool — the reference UI this
// layer replicates — is not an ArcGIS REST service at all: its own network
// traffic shows it's backed by Point Blue Conservation Science's own
// GeoServer/tile infrastructure (geo.pointblue.org), serving the same
// underlying USGS CoSMoS model output (public domain; Point Blue asks only
// for a courtesy citation, confirmed directly against their "suggested
// citations" PDF — no redistribution restriction). Confirmed no useful
// Cache-Control on either the tiles or OCOF's own JSON config, so this
// reuses the same session cache as everything else on this page.
//
// The actual flood imagery/WMS renders are always fetched live from
// geo.pointblue.org at request time — nothing about the *data* is stored
// locally. What IS stored locally, in `data/cosmos-layers.json`, is the
// URL/WMS-layer-name *template* per topic + county/sub-region (with
// {slr3}/{storm3}/{inlet} placeholders) — because OCOF's own live layer
// catalog, which would otherwise let this be discovered at runtime, has no
// CORS header and can't be fetched cross-origin from this site's JS
// (confirmed directly; geo.pointblue.org itself, the actual tile/WMS
// server, does send Access-Control-Allow-Origin: *, just not OCOF's own
// config API). So the naming convention is captured once as local config,
// same category as BCDC_WATER_LEVELS/NOAA_SLR_SCENARIOS above, just larger
// and kept in its own JSON file — see that file's own header comment for
// the full provenance. Item `kind` is either `tilexyz` (a static
// pre-rendered XYZ tile pyramid — no backing query service, so not
// click-to-inspect-able) or `imagewms` (a GeoServer WMS layer — supports
// GetFeatureInfo, same mechanism as BCDC's).
//
// `COSMOS_REGIONS` mirrors OCOF's own `regionsMetadata.json` (fetched and
// verified directly this session) — which topics exist per region, and
// each region's valid SLR/storm-frequency stops.
const COSMOS_LAYERS_URL = "data/cosmos-layers.json";
const COSMOS_TILE_ATTRIBUTION = 'Flood data: <a href="https://ourcoastourfuture.org/" target="_blank" rel="noopener">USGS CoSMoS, via Point Blue Conservation Science\'s Our Coast, Our Future</a>';
// Every scenario topic has its own color scale (rendered server-side by
// GeoServer) rather than one fixed project color, so there's no single
// swatch to show in the layer panel the way BCDC's per-layer swatches
// work — the real legend is fetched live below instead (GetLegendGraphic).
const COSMOS_LEGEND_BASE = "https://geo.pointblue.org/geoserver/wms";

const COSMOS_REGIONS = {
  california_coast: {
    name: "California Coast",
    topics: [
      { id: 1, title: "Flooding", vars: ["slr", "storm"] },
      { id: 2, title: "Flood Duration", vars: ["slr", "storm"] },
      { id: 3, title: "Min / Max Flooding", vars: ["slr", "storm"] },
      { id: 4, title: "Wave Height", vars: ["slr", "storm"] },
      { id: 5, title: "Current Velocity", vars: ["slr", "storm"] },
      { id: 6, title: "Cliff Retreat", vars: ["slr", "hold"] },
      { id: 7, title: "Shoreline Position", vars: ["slr", "hold", "nourish"] },
      { id: 18, title: "Groundwater", vars: ["slr", "kvalue"] }
    ],
    slr: [0, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 500],
    storm: [
      { value: 0, label: "None" },
      { value: 1, label: "Annual" },
      { value: 20, label: "20 year" },
      { value: 100, label: "100 year" }
    ]
  },
  russian_river: {
    name: "Russian River",
    topics: [
      { id: 8, title: "Flooding", vars: ["slr", "storm", "open"] }
    ],
    slr: [0, 50, 100, 150, 200, 250, 300, 500],
    storm: [{ value: 100, label: "100 year" }]
  },
  los_penasquitos_lagoon: {
    name: "Los Peñasquitos Lagoon",
    topics: [
      { id: 9, title: "Flooding", vars: ["slr", "storm", "open"] },
      { id: 12, title: "Wave Height", vars: ["slr", "storm", "open"] },
      { id: 15, title: "Current Velocity", vars: ["slr", "storm", "open"] }
    ],
    slr: [0, 50, 100, 150, 200, 500],
    storm: [
      { value: 0, label: "None" },
      { value: 1, label: "Annual" },
      { value: 20, label: "20 year" },
      { value: 100, label: "100 year" }
    ]
  }
};

// Groundwater's "kvalue" (hydraulic conductivity, m/day) — confirmed the
// only three values present in the live collection.
const COSMOS_KVALUES = [
  { value: 0.1, label: "Low (K=0.1 m/day)" },
  { value: 1, label: "Medium (K=1 m/day)" },
  { value: 10, label: "High (K=10 m/day)" }
];

// --- NOAA Sea Level Rise Viewer ---------------------------------------------
// Unlike BCDC/CoSMoS (one service, many sublayers), this is a whole separate
// MapServer per scenario — half-foot increments from 0 to 10 ft, named
// `slr_{X}ft`/`slr_{X}_{Y}ft`. Picking a scenario means swapping which
// MapServer is active, not changing a parameter, but each one is a
// pre-cached tiled service (`singleFusedMapCache: true`, confirmed
// directly against slr_3ft's own metadata) — rendered with
// `L.esri.tiledMapLayer`, not `dynamicMapLayer`. An earlier version of
// this code used `dynamicMapLayer`, which doesn't respect per-layer
// visibility against a fused tile cache and rendered as a giant solid
// coverage box across the whole tile extent rather than the real
// low-lying-area/depth data. Layer 0 (polygon "Low-lying Areas") is the
// queryable one; layer 1 (raster "Depth") renders alongside it but has
// no per-feature attributes worth querying. Both are `defaultVisibility:
// true`, so the tiled cache always shows both together — no `layers`
// option needed (and none is honored for a fused cache anyway).
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

// --- NOAA High Tide Flooding stations ---------------------------------------
// The real area-based "High Tide Flooding" / flood-frequency layer NOAA's
// own SLR Viewer shows (`dc_slr/Flood_Frequency`) requires an ArcGIS
// token this project has no way to obtain (confirmed directly — the
// service returns "Token Required" even on every public mirror
// subdomain). The one publicly reachable service with "High Tide
// Flooding" in its name (`FloodExposureMapper/CFEM_HighTideFlooding`) is
// essentially empty — confirmed directly: only 2 features total in the
// whole layer, neither in California, neither even a coastal county.
// `dc_slr/Point_Layers` sublayer 1 ("High Tide Flooding Stations") is the
// real, public, substantive alternative: NOAA CO-OPS tide-gauge stations
// with their minor/moderate/major flood thresholds (confirmed 12
// California stations). It's point data, not an area layer, and
// deliberately not tied to the SLR amount slider — these thresholds are
// today's, not a future scenario.
const NOAA_HTF_URL = "https://coast.noaa.gov/arcgis/rest/services/dc_slr/Point_Layers/MapServer";
const NOAA_HTF_LAYER_ID = 1;
const NOAA_HTF_COLOR = "#E8A33D";
const NOAA_HTF_ATTRIBUTION = 'High tide flooding stations: <a href="https://coast.noaa.gov/slr/" target="_blank" rel="noopener">NOAA Office for Coastal Management</a>';
const NOAA_SLR_COLOR = "#2F6FA0";

// --- FEMA National Flood Hazard Layer ---------------------------------------
// Restricted to sublayer 28 ("Flood Hazard Zones") only, not the full 30+
// sublayer composite NFHL service — this is the one that distinguishes
// Zone AE/Zone X etc. (confirmed via direct REST introspection: unique-value
// renderer on FLD_ZONE/ZONE_SUBTY, fields include SFHA_TF/STATIC_BFE).
// This is "effective" flood data (FEMA's default, current-adopted maps) —
// FEMA's preliminary/pending map updates are a separate NFHL sublayer this
// project deliberately doesn't show, per the task's insurance-rating caveat.
//
// Licensing note: FEMA's own NFHL metadata (hazards.fema.gov's metadata XML)
// states use constraints as "Acknowledgement of FEMA would be appreciated in
// products derived from these data" and access constraints "None" — i.e.
// standard U.S. federal public-domain data with a courtesy request, same
// footing as the NOAA/USGS sources above. A CC-BY 3.0 label appears on a
// third-party Data Basin mirror of this same service, but that's Data
// Basin's own platform-wide license on their copy, not a term FEMA itself
// imposes — see BRIEF.md for the full citation trail. FEMA is still credited
// prominently below regardless, as good practice.
const FEMA_NFHL_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const FEMA_NFHL_ZONES_LAYER_ID = 28;
const FEMA_NFHL_COLOR = "#C0392B";
const FEMA_NFHL_ATTRIBUTION = 'Flood zones: <a href="https://www.fema.gov/flood-maps/national-flood-hazard-layer" target="_blank" rel="noopener">FEMA National Flood Hazard Layer</a>';
// Layer 28 has its own server-side minScale (36,111.9, confirmed directly
// against its metadata) — FEMA just doesn't render/query these zone
// polygons when zoomed out past roughly a neighborhood view. Confirmed
// empirically (fetching real export tiles and checking pixel content):
// fully transparent through zoom 13 at Bay Area latitudes, real content
// from zoom 14 on. Toggling the layer on while zoomed out further than
// this produces a real request that legitimately renders nothing — not
// a bug, but worth a note so it doesn't look like the layer is broken.
const FEMA_NFHL_MIN_ZOOM = 14;

// --- NOAA Coastal Flood Exposure Mapper --------------------------------------
// The composite "how many hazards overlap here" layer, restricted to its
// California sublayer. The real, confirmed sublayer name is
// `CA_FloodComposite` (id 42) — not `CA_FloodComposite_int`, which doesn't
// exist on this service; confirmed directly via the service's own layer
// list. It's a raster layer (esri-leaflet/ArcGIS's ordinary vector `/query`
// endpoint doesn't work against it — "Invalid or missing input parameters"
// — but its `/identify` operation does, returning a HAZ_NUM code and a
// plain-English DESCRPTN string listing which hazards overlap, e.g. "FEMA
// Zones... & Sea Level Rise... & Tsunami Run Up Zone"), so click-to-inspect
// below hand-builds an identify request the same way BCDC's GetFeatureInfo
// does, rather than going through esri-leaflet's query helpers.
const CFEM_COMPOSITE_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_CoastalFloodHazardComposite/MapServer";
const CFEM_COMPOSITE_LAYER_ID = 42;
const CFEM_COLOR = "#B26A00";
const CFEM_ATTRIBUTION = 'Hazard overlap: <a href="https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html" target="_blank" rel="noopener">NOAA Office for Coastal Management, Coastal Flood Exposure Mapper</a>';

// The real CFEM tool (coast.noaa.gov/floodexposure) exposes several more
// hazard layers beyond the composite: High Tide Flooding, FEMA Flood
// Zones, Tsunami, Storm Surge, Sea Level Rise, Great Lakes Water Levels.
// This is a comparison site, so "another layer group already shows
// roughly this hazard" isn't a reason to skip one of CFEM's own — its
// version may use different data, resolution, or classification, and
// that's exactly the kind of thing worth being able to compare. So all
// of these are wired up except:
//   - Sea Level Rise: CFEM has no dedicated SLR service of its own (its
//     folder listing has none), and toggling it in the live app visually
//     matches the same `dc_slr` low-lying-areas rendering already used by
//     this map's separate NOAA Sea Level Rise Viewer group — same
//     underlying NOAA data, not an independent CFEM rendering, so
//     duplicating it wouldn't add real comparison value.
//   - Great Lakes Water Levels: doesn't apply to California.
//
// An earlier pass concluded CFEM_Tsunami was broken for California
// (based on its renderer only classifying 2 Alabama FIPS codes, and an
// `/export`-based image test showing a flat background). That was
// wrong: CFEM_Tsunami is a `singleFusedMapCache: true` tiled service —
// same bug class as the NOAA SLR `dynamicMapLayer` issue fixed
// elsewhere in this file — `/export` against a fused cache doesn't
// reliably reflect what the cache actually serves. Real `/tile/z/y/x`
// requests confirmed substantial real content over the Bay Area.
// CFEM_HighTideFlooding and CFEM_FEMAFloodZones are the same story:
// both are separate, real, working tiled services (confirmed the same
// way), each with its own distinct legend from what this map's other
// layer groups show.
//
// None of these three support useful click-to-inspect despite their
// services advertising Query capability: `/query` against each one
// returns the exact same leftover county-eligibility attribute table
// (FIPSSTCO, WatershedCounty, etc.) rather than the actual rendered
// classification — confirmed directly against real coastal points. The
// vector "Feature Layer" schema these services expose is disconnected
// from what their tile cache actually renders. So, like CoSMoS's
// tile-only topics, these get a live legend but no popup provider.
const CFEM_HTF_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_HighTideFlooding/MapServer";
const CFEM_HTF_LAYER_ID = 0;
const CFEM_FEMA_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_FEMAFloodZones/MapServer";
const CFEM_FEMA_LAYER_ID = 1;
const CFEM_TSUNAMI_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_Tsunami/MapServer";
const CFEM_TSUNAMI_LAYER_ID = 0;

// The genuinely new, addable layer: Storm Surge, traced from the live
// tool's own network traffic to a separate ArcGIS Online hosted tile
// service (not under coast.noaa.gov/arcgis at all), published by
// NOAA/NWS/NHC's Storm Surge Unit: SLOSH-model "Maximum of MEOWs"
// near-worst-case inundation, one tiled MapServer per hurricane category.
// Confirmed directly (fetching real tiles by hand): only categories 1-2
// have any California coverage, and only for Southern California — a
// tile request for the Bay Area 404s for every category, matching NOAA's
// own note that Southern California coverage was added "for hurricane
// wind category 1 and 2 storms" specifically. Capabilities are
// "Map,TilesOnly,Tilemap" (no Query/Data), so — like CoSMoS's tiled
// topics — there's no click-to-inspect for this one, only a live legend.
const CFEM_SURGE_BASE = "https://tiles.arcgis.com/tiles/C8EMgrsFcRFL6LrL/arcgis/rest/services";
const CFEM_SURGE_CATEGORIES = [1, 2];
const CFEM_SURGE_LAYER_ID = 0;
const CFEM_SURGE_COLOR = "#6B4FA0";
const CFEM_SURGE_ATTRIBUTION = 'Storm surge: <a href="https://www.nhc.noaa.gov/nationalsurge/" target="_blank" rel="noopener">NOAA/NWS/NHC Storm Surge Unit</a>';
const CFEM_HAZARD_ATTRIBUTION = 'Hazard layer: <a href="https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html" target="_blank" rel="noopener">NOAA Office for Coastal Management, Coastal Flood Exposure Mapper</a>';

let map, marker;
let regionData = {};       // regionId -> FeatureCollection
let layerRegistry = {};    // panel layer id -> Leaflet layer instance
let bcdcLayers = {};        // BCDC_LAYER_TYPES id -> active Leaflet WMS layer, or absent
let legalDeltaLayer = null;
let consequenceLayer = null;
let cosmosLayers = []; // { layer, item } pairs currently on the map for the active CoSMoS topic
let cosmosCollectionPromise = null;
let noaaSlrLayer = null;
let noaaHtfLayer = null;
let femaNfhlLayer = null;
let cfemLayer = null;
let cfemSurgeLayer = null;
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

// Leaflet's own tile layers just set <img src> directly, which can't be
// routed through our cache — so these fetch each tile once (cached by
// URL) and hand the resulting blob to the <img> themselves. One variant
// per Leaflet base class: WMS (BCDC, CoSMoS's WMS-backed topics) and plain
// XYZ (CoSMoS's static pre-rendered tile topics).
const CachedWmsTileLayer = L.TileLayer.WMS.extend({
  createTile: function(coords, done){
    const img = document.createElement("img");
    const url = this.getTileUrl(coords);
    cachedFetch(url, res => res.blob().then(blob => URL.createObjectURL(blob)))
      .then(objectUrl => { img.src = objectUrl; done(null, img); })
      .catch(err => done(err, img));
    return img;
  }
});

const CachedXyzTileLayer = L.TileLayer.extend({
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
  return new CachedWmsTileLayer(BCDC_WMS_URL, {
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

function getCosmosLayerDefs(){
  if(!cosmosCollectionPromise){
    cosmosCollectionPromise = fetch(COSMOS_LAYERS_URL).then(r => r.json()).then(json => json.layers);
  }
  return cosmosCollectionPromise;
}

// Fill a template's {slr3}/{storm3}/{inlet} placeholders with real values,
// then hand it back as either a ready-to-use tile URL or WMS layer name.
function fillCosmosTemplate(def, want){
  const slr3 = String(want.slr).padStart(3, "0");
  let out = def.template.replace(/\{slr3\}/g, slr3);
  if(/\{storm3\}/.test(out)){
    if(typeof want.storm !== "number") return null; // this layer needs a storm value we don't have
    out = out.replace(/\{storm3\}/g, String(want.storm).padStart(3, "0"));
  }
  if(/\{inlet\}/.test(out)) out = out.replace(/\{inlet\}/g, want.open ? "open_inlet" : "closed_inlet");
  return out;
}

// GeoServer WMS GetFeatureInfo, same shape as BCDC's own GetFeatureInfo
// helper below — bbox/pixel math duplicated rather than shared since the
// two WMS servers use different CRS/version conventions.
function cosmosWmsIdentifyUrl(gsLayer, latlng){
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const point = map.latLngToContainerPoint(latlng);
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo",
    LAYERS: gsLayer, QUERY_LAYERS: gsLayer, STYLES: "",
    BBOX: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    WIDTH: String(Math.round(size.x)), HEIGHT: String(Math.round(size.y)),
    SRS: "EPSG:3857",
    X: String(Math.round(point.x)), Y: String(Math.round(point.y)),
    INFO_FORMAT: "application/json", FEATURE_COUNT: "1"
  });
  return `https://geo.pointblue.org/geoserver/ocof/wms?${params.toString()}`;
}

function initCosmos(){
  const toggle = document.getElementById("cosmosToggle");
  const regionSelect = document.getElementById("cosmosRegionSelect");
  const topicSelect = document.getElementById("cosmosTopicSelect");
  const extraControlsEl = document.getElementById("cosmosExtraControls");
  const slrSlider = document.getElementById("cosmosSlrSlider");
  const slrValueEl = document.getElementById("cosmosSlrValue");
  const stormButtonsEl = document.getElementById("cosmosStormButtons");
  const resultEl = document.getElementById("cosmosResult");
  const legendEl = document.getElementById("cosmosLegend");
  const clickHintEl = document.getElementById("cosmosClickHint");

  Object.keys(COSMOS_REGIONS).forEach(key => {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = COSMOS_REGIONS[key].name;
    regionSelect.appendChild(o);
  });
  regionSelect.value = "california_coast";

  let slrIndex = 0;
  let stormValue = null;
  let minMaxVariant = "max";
  const extraState = {}; // hold/nourish/open/kvalue current values

  function currentRegion(){ return COSMOS_REGIONS[regionSelect.value]; }
  function currentTopic(){ return currentRegion().topics.find(t => t.id === Number(topicSelect.value)); }

  function populateTopics(){
    topicSelect.innerHTML = "";
    currentRegion().topics.forEach(t => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.title;
      topicSelect.appendChild(o);
    });
    topicSelect.value = currentRegion().topics[0].id;
  }

  function populateSlr(){
    const slrs = currentRegion().slr;
    slrSlider.min = 0;
    slrSlider.max = slrs.length - 1;
    if(slrIndex >= slrs.length) slrIndex = 0;
    slrSlider.value = slrIndex;
    slrValueEl.textContent = `${slrs[slrIndex]} cm`;
  }

  function populateStorm(){
    const storms = currentRegion().storm;
    stormButtonsEl.innerHTML = "";
    if(!storms.find(s => s.value === stormValue)) stormValue = storms[0].value;
    storms.forEach(s => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "scenario-btn";
      if(s.value === stormValue) b.classList.add("active");
      b.textContent = s.label;
      if(storms.length === 1) b.disabled = true;
      b.addEventListener("click", () => {
        stormButtonsEl.querySelectorAll(".scenario-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        stormValue = s.value;
        refreshCosmosLayers();
      });
      stormButtonsEl.appendChild(b);
    });
  }

  function populateExtraControls(){
    extraControlsEl.innerHTML = "";
    extraControlsEl.className = "extra-controls";
    const topic = currentTopic();
    updateClickHint(topic.id);
    const vars = topic.vars.filter(v => v !== "slr" && v !== "storm");
    if(topic.id === 3){
      const wrap = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = minMaxVariant === "min";
      cb.addEventListener("change", () => { minMaxVariant = cb.checked ? "min" : "max"; refreshCosmosLayers(); });
      wrap.appendChild(cb);
      wrap.appendChild(document.createTextNode("Show minimum instead of maximum"));
      extraControlsEl.appendChild(wrap);
    }
    vars.forEach(v => {
      if(v === "hold"){
        if(!("hold" in extraState)) extraState.hold = true;
        const wrap = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = extraState.hold;
        cb.addEventListener("change", () => { extraState.hold = cb.checked; refreshCosmosLayers(); });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode("Hold the line (shoreline armoring)"));
        extraControlsEl.appendChild(wrap);
      } else if(v === "nourish"){
        if(!("nourish" in extraState)) extraState.nourish = false;
        const wrap = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = extraState.nourish;
        cb.addEventListener("change", () => { extraState.nourish = cb.checked; refreshCosmosLayers(); });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode("Beach nourishment"));
        extraControlsEl.appendChild(wrap);
      } else if(v === "open"){
        if(!("open" in extraState)) extraState.open = false;
        const wrap = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = extraState.open;
        cb.addEventListener("change", () => { extraState.open = cb.checked; refreshCosmosLayers(); });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode("Mouth open"));
        extraControlsEl.appendChild(wrap);
      } else if(v === "kvalue"){
        if(!("kvalue" in extraState)) extraState.kvalue = 1;
        const label = document.createElement("label");
        label.textContent = "Groundwater conductivity";
        const sel = document.createElement("select");
        COSMOS_KVALUES.forEach(k => {
          const o = document.createElement("option");
          o.value = k.value;
          o.textContent = k.label;
          if(k.value === extraState.kvalue) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", () => { extraState.kvalue = Number(sel.value); refreshCosmosLayers(); });
        extraControlsEl.appendChild(label);
        extraControlsEl.appendChild(sel);
      }
    });
  }

  function currentWantVars(){
    const slrs = currentRegion().slr;
    const topic = currentTopic();
    const want = { slr: slrs[slrIndex] };
    topic.vars.forEach(v => {
      if(v === "storm") want.storm = stormValue;
      else if(v !== "slr") want[v] = extraState[v];
    });
    return want;
  }

  async function refreshCosmosLayers(){
    cosmosLayers.forEach(({ layer }) => map.removeLayer(layer));
    cosmosLayers = [];
    if(!toggle.checked) return;

    const topic = currentTopic();
    const region = currentRegion();
    const want = currentWantVars();

    resultEl.textContent = `Loading: ${topic.title}, ${region.name}…`;
    const allDefs = await getCosmosLayerDefs();
    // Guard against a slower-resolving fetch landing after the user has
    // since changed the topic/region/scenario.
    if(!toggle.checked || currentTopic().id !== topic.id) return;

    let defs = allDefs.filter(d => d.topicId === topic.id);
    if(topic.id === 3) defs = defs.filter(d => d.variant === minMaxVariant);
    if(topic.id === 6) defs = defs.filter(d => d.variant === (extraState.hold ? "hold" : "no_hold"));
    if(topic.id === 18) defs = defs.filter(d => d.kvalue === extraState.kvalue);

    let matchedAny = false;
    defs.forEach(def => {
      const filled = fillCosmosTemplate(def, want);
      if(!filled) return;
      let layer;
      if(def.kind === "tilexyz"){
        layer = new CachedXyzTileLayer("https:" + filled, { opacity: 0.7, attribution: COSMOS_TILE_ATTRIBUTION });
      } else if(def.kind === "imagewms"){
        layer = new CachedWmsTileLayer("https://geo.pointblue.org/geoserver/ocof/wms", {
          layers: filled, styles: def.style || "", version: "1.1.1",
          format: "image/png", transparent: true, opacity: 0.7,
          attribution: COSMOS_TILE_ATTRIBUTION
        });
      }
      if(layer){
        layer.addTo(map);
        cosmosLayers.push({ layer, def, gsLayer: def.kind === "imagewms" ? filled : null, specLabel: def.label });
        matchedAny = true;
      }
    });

    resultEl.textContent = matchedAny
      ? `Showing: ${topic.title}, ${region.name}, ${want.slr} cm SLR${"storm" in want ? `, ${region.storm.find(s => s.value === want.storm).label} storm` : ""}.`
      : `No modeled data available for this combination (${topic.title}, ${region.name}).`;

    updateCosmosLegend(defs);
  }

  // One real legend graphic per distinct active color scale, fetched live
  // from GeoServer (GetLegendGraphic) — CoSMoS has no fixed project color;
  // every topic renders with its own server-defined scale. Paired with
  // this layer's own label, since some of GeoServer's single-class
  // legends (e.g. Flood Extent, Wave Runup) render a bare color swatch
  // with no text baked into the graphic itself.
  function updateCosmosLegend(defs){
    const byStyle = new Map();
    defs.forEach(d => { if(d.style && !byStyle.has(d.style)) byStyle.set(d.style, d.label); });
    legendEl.innerHTML = "";
    legendEl.hidden = byStyle.size === 0;
    byStyle.forEach((label, style) => {
      const block = document.createElement("div");
      block.className = "legend-block";
      const title = document.createElement("div");
      title.className = "legend-block-title";
      title.textContent = label;
      const img = document.createElement("img");
      img.src = `${COSMOS_LEGEND_BASE}?REQUEST=GetLegendGraphic&VERSION=1.0.0&FORMAT=image/png&WIDTH=140&HEIGHT=24&STRICT=false&style=${encodeURIComponent(style)}`;
      img.alt = `${label} legend`;
      img.className = "cosmos-legend-img";
      block.appendChild(title);
      block.appendChild(img);
      legendEl.appendChild(block);
    });
  }

  async function updateClickHint(topicId){
    const allDefs = await getCosmosLayerDefs();
    const hasIdentify = allDefs.some(d => d.topicId === topicId && d.kind === "imagewms");
    clickHintEl.textContent = hasIdentify
      ? "Click the map to see modeled values for the selected scenario, where available."
      : "Scales are shown below; click-to-inspect isn't available for this topic.";
  }

  regionSelect.addEventListener("change", () => {
    populateTopics();
    populateSlr();
    populateStorm();
    populateExtraControls();
    refreshCosmosLayers();
  });
  topicSelect.addEventListener("change", () => {
    populateExtraControls();
    refreshCosmosLayers();
  });
  slrSlider.addEventListener("input", () => {
    slrIndex = Number(slrSlider.value);
    slrValueEl.textContent = `${currentRegion().slr[slrIndex]} cm`;
    refreshCosmosLayers();
  });
  toggle.addEventListener("change", refreshCosmosLayers);

  populateTopics();
  populateSlr();
  populateStorm();
  populateExtraControls();

  infoPopup.registerProvider(async latlng => {
    if(!toggle.checked || !cosmosLayers.length) return null;
    const wmsLayers = cosmosLayers.filter(l => l.gsLayer);
    if(!wmsLayers.length){
      return { title: "CoSMoS", note: "Click-to-inspect isn't available for this topic." };
    }
    const results = await Promise.all(wmsLayers.map(({ gsLayer, specLabel }) =>
      cachedFetch(cosmosWmsIdentifyUrl(gsLayer, latlng), res => res.json())
        .then(json => ({ specLabel, features: (json && json.features) || [] }))
        .catch(() => ({ specLabel, features: [] }))
    ));
    const withData = results.find(r => r.features.length);
    if(!withData) return { title: "CoSMoS", note: "No modeled data at this point for the active layer(s)." };
    const props = withData.features[0].properties || {};
    const rows = Object.keys(props).slice(0, 6).map(k => ({ label: k, value: String(props[k]) }));
    return { title: `CoSMoS — ${withData.specLabel}`, rows: rows.length ? rows : [{ label: "Match", value: "Yes" }] };
  });
}

// --- NOAA Sea Level Rise Viewer --------------------------------------------

function initNoaaSlr(){
  const toggle = document.getElementById("noaaSlrToggle");
  const slider = document.getElementById("noaaSlrSlider");
  const valueEl = document.getElementById("noaaSlrValue");
  const resultEl = document.getElementById("noaaSlrResult");
  const swatchEl = document.querySelector('[data-swatch="noaa-slr"]');
  if(swatchEl) setSwatch(swatchEl, NOAA_SLR_COLOR, false);

  slider.min = 0;
  slider.max = NOAA_SLR_SCENARIOS.length - 1;
  slider.value = 6; // 3ft, matching the old dropdown's default

  function currentScenario(){
    return NOAA_SLR_SCENARIOS[Number(slider.value)];
  }

  function refreshNoaaSlrLayer(){
    if(noaaSlrLayer){ map.removeLayer(noaaSlrLayer); noaaSlrLayer = null; }
    const scenario = currentScenario();
    valueEl.textContent = scenario.label;
    resultEl.textContent = `Showing: ${scenario.label} of sea level rise.`;
    if(!toggle.checked) return;
    noaaSlrLayer = L.esri.tiledMapLayer({
      url: scenario.url,
      opacity: 0.75,
      attribution: NOAA_SLR_ATTRIBUTION
    });
    noaaSlrLayer.addTo(map);
  }

  toggle.addEventListener("change", refreshNoaaSlrLayer);
  slider.addEventListener("input", refreshNoaaSlrLayer);
  valueEl.textContent = currentScenario().label;
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

// --- NOAA High Tide Flooding stations ---------------------------------------

function initNoaaHtf(){
  const toggle = document.getElementById("noaaHtfToggle");
  const swatchEl = document.querySelector('[data-swatch="noaa-htf"]');
  if(swatchEl) setSwatch(swatchEl, NOAA_HTF_COLOR, false);

  function refreshNoaaHtfLayer(){
    if(noaaHtfLayer){ map.removeLayer(noaaHtfLayer); noaaHtfLayer = null; }
    if(!toggle.checked) return;
    noaaHtfLayer = L.esri.featureLayer({
      url: `${NOAA_HTF_URL}/${NOAA_HTF_LAYER_ID}`,
      pointToLayer: (geojson, latlng) => L.circleMarker(latlng, {
        radius: 6, color: "#7A5417", weight: 1.5, fillColor: NOAA_HTF_COLOR, fillOpacity: 0.9
      }),
      attribution: NOAA_HTF_ATTRIBUTION
    });
    noaaHtfLayer.addTo(map);
  }

  toggle.addEventListener("change", refreshNoaaHtfLayer);

  infoPopup.registerProvider(async latlng => {
    if(!toggle.checked) return null;
    return new Promise(resolve => {
      L.esri.query({ url: `${NOAA_HTF_URL}/${NOAA_HTF_LAYER_ID}` })
        .nearby(latlng, 80000) // stations are sparse (~12 for the whole CA coast)
        .run((error, featureCollection) => {
          if(error){ resolve(null); return; }
          if(!featureCollection || !featureCollection.features.length){
            resolve({ title: "High Tide Flooding", note: "No tide station within 80 km of this point." });
            return;
          }
          // .nearby() bounds the query by radius but doesn't guarantee
          // nearest-first order (confirmed directly — it returned a
          // station 44km away over one <5km away), so pick the true
          // minimum client-side across whatever it returned.
          let feature = null, minDist = Infinity;
          featureCollection.features.forEach(f => {
            const [lng, lat] = f.geometry.coordinates;
            const d = latlng.distanceTo(L.latLng(lat, lng));
            if(d < minDist){ minDist = d; feature = f; }
          });
          const f = feature.properties;
          const distanceKm = (minDist / 1000).toFixed(0);
          resolve({
            title: `High Tide Flooding — nearest station: ${f.Station_Name}`,
            rows: [
              { label: "Distance from clicked point", value: `${distanceKm} km` },
              { label: "Minor flooding threshold", value: `${f.minor_ft} ft above MHHW` },
              { label: "Moderate flooding threshold", value: `${f.moderate_ft} ft above MHHW` },
              { label: "Major flooding threshold", value: `${f.major_ft} ft above MHHW` }
            ]
          });
        });
    });
  });
}

// --- FEMA National Flood Hazard Layer ---------------------------------------

function initFemaNfhl(){
  const toggle = document.getElementById("femaToggle");
  const resultEl = document.getElementById("femaResult");
  const legendEl = document.getElementById("femaLegend");
  const swatchEl = document.querySelector('[data-swatch="fema"]');
  if(swatchEl) setSwatch(swatchEl, FEMA_NFHL_COLOR, false);

  let femaLegendPromise = null;
  function getFemaLegend(){
    if(!femaLegendPromise){
      femaLegendPromise = cachedFetch(`${FEMA_NFHL_URL}/legend?f=json`, res => res.json())
        .then(json => (json.layers.find(l => l.layerId === FEMA_NFHL_ZONES_LAYER_ID) || {}).legend || []);
    }
    return femaLegendPromise;
  }

  async function updateFemaLegend(){
    if(!toggle.checked){ legendEl.hidden = true; legendEl.innerHTML = ""; return; }
    const items = await getFemaLegend();
    legendEl.innerHTML = "";
    const block = document.createElement("div");
    block.className = "legend-block";
    const title = document.createElement("div");
    title.className = "legend-block-title";
    title.textContent = "Flood Hazard Zones";
    block.appendChild(title);
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "legend-block-row";
      const sw = document.createElement("img");
      sw.src = `data:${item.contentType};base64,${item.imageData}`;
      sw.className = "fema-legend-swatch";
      const lbl = document.createElement("span");
      lbl.textContent = item.label.trim();
      row.appendChild(sw);
      row.appendChild(lbl);
      block.appendChild(row);
    });
    legendEl.appendChild(block);
    legendEl.hidden = false;
  }

  function updateFemaStatus(){
    if(!toggle.checked){ resultEl.textContent = ""; return; }
    resultEl.textContent = map.getZoom() < FEMA_NFHL_MIN_ZOOM
      ? "Zoom in further (roughly to a neighborhood view) to see FEMA flood zones — FEMA's own server doesn't render this layer at a regional zoom."
      : "";
  }

  function refreshFemaLayer(){
    if(femaNfhlLayer){ map.removeLayer(femaNfhlLayer); femaNfhlLayer = null; }
    if(!toggle.checked) return;
    femaNfhlLayer = L.esri.dynamicMapLayer({
      url: FEMA_NFHL_URL,
      layers: [FEMA_NFHL_ZONES_LAYER_ID],
      opacity: 0.6,
      attribution: FEMA_NFHL_ATTRIBUTION
    });
    femaNfhlLayer.addTo(map);
  }

  toggle.addEventListener("change", () => { refreshFemaLayer(); updateFemaStatus(); updateFemaLegend(); });
  map.on("zoomend", updateFemaStatus);

  infoPopup.registerProvider(async latlng => {
    if(!toggle.checked) return null;
    return new Promise(resolve => {
      L.esri.query({ url: `${FEMA_NFHL_URL}/${FEMA_NFHL_ZONES_LAYER_ID}` })
        .contains(latlng)
        .run((error, featureCollection) => {
          if(error){ resolve(null); return; }
          if(!featureCollection || !featureCollection.features.length){
            resolve({ title: "FEMA Flood Zone", note: "No flood zone mapped at this point." });
            return;
          }
          const f = featureCollection.features[0].properties;
          const rows = [{ label: "Flood Zone", value: f.FLD_ZONE || "—" }];
          if(f.ZONE_SUBTY) rows.push({ label: "Zone Subtype", value: f.ZONE_SUBTY });
          rows.push({ label: "Special Flood Hazard Area", value: f.SFHA_TF === "T" ? "Yes" : "No" });
          if(typeof f.STATIC_BFE === "number" && f.STATIC_BFE > -9999){
            rows.push({ label: "Base Flood Elevation", value: `${fmtNum(f.STATIC_BFE, 1)} ft` });
          }
          resolve({ title: "FEMA Flood Zone", rows });
        });
    });
  });
}

// --- NOAA Coastal Flood Exposure Mapper (composite) -------------------------

function cfemIdentifyUrl(latlng){
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const params = new URLSearchParams({
    f: "json",
    geometry: `${latlng.lng},${latlng.lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: `visible:${CFEM_COMPOSITE_LAYER_ID}`,
    tolerance: "3",
    mapExtent: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    imageDisplay: `${Math.round(size.x)},${Math.round(size.y)},96`,
    returnGeometry: "false"
  });
  return `${CFEM_COMPOSITE_URL}/identify?${params.toString()}`;
}

function initCfem(){
  const toggle = document.getElementById("cfemToggle");
  const swatchEl = document.querySelector('[data-swatch="cfem"]');
  if(swatchEl) setSwatch(swatchEl, CFEM_COLOR, false);

  function refreshCfemLayer(){
    if(cfemLayer){ map.removeLayer(cfemLayer); cfemLayer = null; }
    if(!toggle.checked) return;
    cfemLayer = L.esri.dynamicMapLayer({
      url: CFEM_COMPOSITE_URL,
      layers: [CFEM_COMPOSITE_LAYER_ID],
      opacity: 0.65,
      attribution: CFEM_ATTRIBUTION
    });
    cfemLayer.addTo(map);
  }

  toggle.addEventListener("change", refreshCfemLayer);

  infoPopup.registerProvider(async latlng => {
    if(!toggle.checked) return null;
    const url = cfemIdentifyUrl(latlng);
    const json = await cachedFetch(url, res => res.json());
    const result = json.results && json.results[0];
    if(!result || !result.attributes){
      return { title: "NOAA Coastal Flood Exposure", note: "No mapped hazard overlap at this point." };
    }
    const desc = result.attributes["Raster.DESCRPTN"];
    const count = result.attributes["Raster.HAZ_NUM"];
    if(!desc){
      return { title: "NOAA Coastal Flood Exposure", note: "No mapped hazard overlap at this point." };
    }
    const rows = [];
    if(count) rows.push({ label: "Number of overlapping hazards", value: count });
    rows.push({ label: "Overlapping hazards", value: desc });
    return { title: "NOAA Coastal Flood Exposure", rows };
  });

  initCfemStormSurge();
  initCfemHazardLayer({ toggleId: "cfemHtfToggle", legendId: "cfemHtfLegend", swatch: "cfem-htf", color: "#2E86AB", url: CFEM_HTF_URL, layerId: CFEM_HTF_LAYER_ID, title: "High Tide Flooding (CFEM)" });
  initCfemHazardLayer({ toggleId: "cfemFemaToggle", legendId: "cfemFemaLegend", swatch: "cfem-fema", color: "#C0392B", url: CFEM_FEMA_URL, layerId: CFEM_FEMA_LAYER_ID, title: "FEMA Flood Zones (CFEM)" });
  initCfemHazardLayer({ toggleId: "cfemTsunamiToggle", legendId: "cfemTsunamiLegend", swatch: "cfem-tsunami", color: "#8C2D8C", url: CFEM_TSUNAMI_URL, layerId: CFEM_TSUNAMI_LAYER_ID, title: "Tsunami Run-up (CFEM)" });
}

// Shared logic for CFEM's simple single-toggle hazard layers (High Tide
// Flooding, FEMA Flood Zones, Tsunami) — each is a real, separate, tiled
// MapServer with no usable click-to-inspect (see the comment above their
// config constants), just a live legend fetched from the service's own
// /legend endpoint, same pattern as FEMA's main layer group.
function initCfemHazardLayer({ toggleId, legendId, swatch, color, url, layerId, title }){
  const toggle = document.getElementById(toggleId);
  const legendEl = document.getElementById(legendId);
  const swatchEl = document.querySelector(`[data-swatch="${swatch}"]`);
  if(swatchEl) setSwatch(swatchEl, color, false);
  let layer = null;

  async function updateLegend(){
    if(!toggle.checked){ legendEl.hidden = true; legendEl.innerHTML = ""; return; }
    const json = await cachedFetch(`${url}/legend?f=json`, res => res.json());
    const items = ((json.layers || []).find(l => l.layerId === layerId) || {}).legend || [];
    legendEl.innerHTML = "";
    const block = document.createElement("div");
    block.className = "legend-block";
    const titleEl = document.createElement("div");
    titleEl.className = "legend-block-title";
    titleEl.textContent = title;
    block.appendChild(titleEl);
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "legend-block-row";
      const sw = document.createElement("img");
      sw.src = `data:${item.contentType};base64,${item.imageData}`;
      sw.className = "fema-legend-swatch";
      const lbl = document.createElement("span");
      lbl.textContent = item.label;
      row.appendChild(sw);
      row.appendChild(lbl);
      block.appendChild(row);
    });
    legendEl.appendChild(block);
    legendEl.hidden = false;
  }

  function refreshLayer(){
    if(layer){ map.removeLayer(layer); layer = null; }
    if(!toggle.checked) return;
    layer = L.esri.tiledMapLayer({ url, opacity: 0.65, attribution: CFEM_HAZARD_ATTRIBUTION });
    layer.addTo(map);
  }

  toggle.addEventListener("change", () => { refreshLayer(); updateLegend(); });
}

function initCfemStormSurge(){
  const toggle = document.getElementById("cfemSurgeToggle");
  const buttonsEl = document.getElementById("cfemSurgeCategoryButtons");
  const legendEl = document.getElementById("cfemSurgeLegend");
  const swatchEl = document.querySelector('[data-swatch="cfem-surge"]');
  if(swatchEl) setSwatch(swatchEl, CFEM_SURGE_COLOR, false);

  let category = 1;

  function currentUrl(){
    return `${CFEM_SURGE_BASE}/Storm_Surge_HazardMaps_Category${category}_v3/MapServer`;
  }

  async function updateLegend(){
    if(!toggle.checked){ legendEl.hidden = true; legendEl.innerHTML = ""; return; }
    const json = await cachedFetch(`${currentUrl()}/legend?f=json`, res => res.json());
    const items = ((json.layers || []).find(l => l.layerId === CFEM_SURGE_LAYER_ID) || {}).legend || [];
    legendEl.innerHTML = "";
    const block = document.createElement("div");
    block.className = "legend-block";
    const title = document.createElement("div");
    title.className = "legend-block-title";
    title.textContent = `Storm Surge — Category ${category} Inundation Height`;
    block.appendChild(title);
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "legend-block-row";
      const sw = document.createElement("img");
      sw.src = `data:${item.contentType};base64,${item.imageData}`;
      sw.className = "fema-legend-swatch";
      const lbl = document.createElement("span");
      lbl.textContent = item.label;
      row.appendChild(sw);
      row.appendChild(lbl);
      block.appendChild(row);
    });
    legendEl.appendChild(block);
    legendEl.hidden = false;
  }

  function refreshLayer(){
    if(cfemSurgeLayer){ map.removeLayer(cfemSurgeLayer); cfemSurgeLayer = null; }
    if(!toggle.checked) return;
    cfemSurgeLayer = L.esri.tiledMapLayer({
      url: currentUrl(),
      opacity: 0.7,
      attribution: CFEM_SURGE_ATTRIBUTION
    });
    cfemSurgeLayer.addTo(map);
  }

  CFEM_SURGE_CATEGORIES.forEach(cat => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "scenario-btn";
    if(cat === category) b.classList.add("active");
    b.textContent = `Category ${cat}`;
    b.addEventListener("click", () => {
      buttonsEl.querySelectorAll(".scenario-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      category = cat;
      refreshLayer();
      updateLegend();
    });
    buttonsEl.appendChild(b);
  });

  toggle.addEventListener("change", () => { refreshLayer(); updateLegend(); });
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
  initNoaaHtf();
  initFemaNfhl();
  initCfem();
  initGroupCollapse();
}

main();
