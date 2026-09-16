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

// Per-water-level BCDC layers, one checkbox each, all driven by the same
// current water level. WMS layer name is `${prefix}${inches}`.
const BCDC_LAYER_TYPES = {
  "inundation": { prefix: "inundation", opacity: 0.72, color: "#2E6FA3" },
  "overtopping": { prefix: "overtopping", opacity: 0.9, color: "#C0392B" },
  "lowlying": { prefix: "lowlying", opacity: 0.6, color: "#4C8C3C", dashed: true }
};
const LEGAL_DELTA_COLOR = "#7A7A7A";

const SLR_OPTIONS = BCDC_WATER_LEVELS.map(v => ({ inches: v, label: v === 0 ? "No SLR" : `${v}"` }));

// Storm-surge return-period baseline inches above MHHW, Bay-wide regional
// average — taken from BCDC's own data/storm-surge.json ("regional" block).
// Simplified: BCDC's live tool also applies per-county baselines and
// scenario-specific corrections on top of this; we use the single
// regional figure since this map doesn't have a county-selection step.
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

let map, marker;
let regionData = {};       // regionId -> FeatureCollection
let layerRegistry = {};    // panel layer id -> Leaflet layer instance
let bcdcLayers = {};        // BCDC_LAYER_TYPES id -> active Leaflet WMS layer, or absent
let legalDeltaLayer = null;

async function loadRegionData(){
  const regionIds = Object.keys(REGION_FILES);
  const results = await Promise.all(regionIds.map(id => fetch(REGION_FILES[id]).then(r => r.json())));
  regionIds.forEach((id, i) => { regionData[id] = results[i]; });
}

function buildBcdcWmsLayer(layerName, opacity){
  return L.tileLayer.wms(BCDC_WMS_URL, {
    layers: layerName,
    version: "1.3.0",
    format: "image/png",
    transparent: true,
    opacity: opacity,
    attribution: 'Flood data: <a href="https://explorer.adaptingtorisingtides.org/" target="_blank" rel="noopener">BCDC Adapting to Rising Tides</a>'
  });
}

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
  const bcdcCheckboxes = document.querySelectorAll("[data-bcdc-layer]");

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

  function refreshAllChecked(){
    bcdcCheckboxes.forEach(cb => { if(cb.checked) refreshLayer(cb.dataset.bcdcLayer); });
  }

  function setLevelIndex(idx){
    currentLevelIndex = idx;
    levelSlider.value = idx;
    levelValue.textContent = `${currentInches()}"`;
    refreshAllChecked();
  }

  levelValue.textContent = `${currentInches()}"`;

  bcdcCheckboxes.forEach(cb => {
    const typeId = cb.dataset.bcdcLayer;
    cb.addEventListener("change", () => {
      if(cb.checked){
        refreshLayer(typeId);
      } else if(bcdcLayers[typeId]){
        map.removeLayer(bcdcLayers[typeId]);
        delete bcdcLayers[typeId];
      }
    });
  });

  levelSlider.addEventListener("input", () => setLevelIndex(Number(levelSlider.value)));

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

  function buildButtonGrid(container, options, onPick){
    options.forEach(opt => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "scenario-btn";
      b.textContent = opt.label;
      b.addEventListener("click", () => {
        container.querySelectorAll(".scenario-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        onPick(opt);
      });
      container.appendChild(b);
    });
  }

  function updateScenarioResult(){
    if(selectedSlrInches === null || selectedStormInches === null){
      scenarioResultEl.textContent = "Select a sea level rise and storm surge amount to see the closest matching Total Water Level.";
      return;
    }
    const idx = nearestLevelIndex(selectedSlrInches + selectedStormInches);
    setLevelIndex(idx);
    scenarioResultEl.textContent = `Closest matching Total Water Level: ${currentInches()}" above MHHW (regional approximation — BCDC's own tool uses county-specific storm-tide data).`;
  }

  buildButtonGrid(slrButtonsEl, SLR_OPTIONS, opt => { selectedSlrInches = opt.inches; updateScenarioResult(); });
  buildButtonGrid(stormButtonsEl, STORM_SURGE_OPTIONS, opt => { selectedStormInches = opt.inches; updateScenarioResult(); });
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
  initFloodOverlay();
}

main();
