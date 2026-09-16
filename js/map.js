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

// Consequence-indicator layers from ART Bay Area's regional analysis.
// levelDependent ones only exist for the 10 non-zero water levels
// (BCDC_WATER_LEVELS minus 0) — there's no "at 0 inches" consequence layer.
const CONSEQUENCE_LAYERS = {
  "highway_vehicle": { name: "consequence_highway_vehicle", levelDependent: false },
  "highway_truck": { name: "consequence_highway_truck", levelDependent: false },
  "rail": { name: "consequence_rail", levelDependent: false },
  "recreation": { prefix: "consequence_recreation_", levelDependent: true },
  "tidalhabitat": { prefix: "consequence_tidalhabitat_", levelDependent: true },
  "housing": { prefix: "consequence_housing_", levelDependent: true },
  "jobs": { prefix: "consequence_jobs_", levelDependent: true },
  "vulcom_social": { prefix: "consequence_vulcom_social_", levelDependent: true },
  "vulcom_contam": { prefix: "consequence_vulcom_contam_", levelDependent: true }
};

const SLR_OPTIONS = BCDC_WATER_LEVELS.map(v => ({ inches: v, label: v === 0 ? "No SLR" : `${v}"` }));

const STORM_SURGE_DEFS = [
  { key: "none", label: "No Storm Surge" },
  { key: "1", label: "King Tide" },
  { key: "2", label: "2-yr" },
  { key: "5", label: "5-yr" },
  { key: "10", label: "10-yr" },
  { key: "25", label: "25-yr" },
  { key: "50", label: "50-yr" },
  { key: "100", label: "100-yr" }
];

// Storm-surge return-period baseline inches above MHHW, by planning area —
// taken directly from BCDC's own data/storm-surge.json (fetched and
// inspected from their site). Baselines only: BCDC's live tool also
// applies per-scenario "exceptions"/"force" corrections on top of these
// numbers per county, which we don't reproduce here.
const STORM_SURGE_BY_AREA = {
  "regional": { label: "SF Bay region (regional)", 1: 14, 2: 18, 5: 23, 10: 27, 25: 32, 50: 37, 100: 42 },
  "marin county": { label: "Marin County", 1: 14, 2: 18, 5: 23, 10: 27, 25: 32, 50: 37, 100: 42 },
  "sonoma county": { label: "Sonoma County", 1: 15, 2: 19, 5: 24, 10: 28, 25: 34, 50: 38, 100: 43 },
  "napa county": { label: "Napa County", 1: 15, 2: 19, 5: 24, 10: 27, 25: 33, 50: 37, 100: 42 },
  "solano county": { label: "Solano County", 1: 15, 2: 18, 5: 23, 10: 27, 25: 32, 50: 36, 100: 41 },
  "contra costa county": { label: "Contra Costa County", 1: 14, 2: 18, 5: 23, 10: 27, 25: 32, 50: 36, 100: 41 },
  "alameda county": { label: "Alameda County", 1: 15, 2: 19, 5: 24, 10: 27, 25: 32, 50: 37, 100: 42 },
  "santa clara county": { label: "Santa Clara County", 1: 14, 2: 20, 5: 24, 10: 28, 25: 34, 50: 40, 100: 47 },
  "san mateo county": { label: "San Mateo County", 1: 15, 2: 19, 5: 24, 10: 27, 25: 32, 50: 37, 100: 42 },
  "san francisco county": { label: "San Francisco County", 1: 12, 2: 19, 5: 23, 10: 27, 25: 32, 50: 36, 100: 41 }
};

function stormInches(areaKey, defKey){
  if(defKey === "none") return 0;
  return STORM_SURGE_BY_AREA[areaKey][defKey];
}

function nearestLevelIndex(targetInches){
  let bestIdx = 0, bestDiff = Infinity;
  BCDC_WATER_LEVELS.forEach((v, i) => {
    const diff = Math.abs(v - targetInches);
    if(diff < bestDiff){ bestDiff = diff; bestIdx = i; }
  });
  return bestIdx;
}

// Point-in-polygon (ray casting), used to auto-detect which of the 9 Bay
// Area counties a clicked/searched point falls in, reusing the same
// bay-area-counties.geojson already loaded for the coverage-region layer.
// No turf.js needed for this — just enough geometry math for one query.
function pointInRing(pt, ring){
  let inside = false;
  for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(pt, rings){
  if(!pointInRing(pt, rings[0])) return false;
  for(let k = 1; k < rings.length; k++){
    if(pointInRing(pt, rings[k])) return false; // inside a hole
  }
  return true;
}

function pointInGeometry(pt, geometry){
  if(geometry.type === "Polygon") return pointInPolygonCoords(pt, geometry.coordinates);
  if(geometry.type === "MultiPolygon") return geometry.coordinates.some(poly => pointInPolygonCoords(pt, poly));
  return false;
}

function findCountyAreaKey(lat, lng){
  const fc = regionData["bay-area-counties"];
  if(!fc) return null;
  const pt = [lng, lat];
  const feature = fc.features.find(f => pointInGeometry(pt, f.geometry));
  return feature ? `${feature.properties.name.toLowerCase()} county` : null;
}

let map, marker;
let regionData = {};       // regionId -> FeatureCollection
let layerRegistry = {};    // panel layer id -> Leaflet layer instance
let bcdcLayers = {};        // BCDC_LAYER_TYPES id -> active Leaflet WMS layer, or absent
let legalDeltaLayer = null;
let consequenceLayer = null;
let applyAreaFromPoint = () => {}; // set by initFloodOverlay; called with (lat, lng) on click/search

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
    applyAreaFromPoint(e.latlng.lat, e.latlng.lng);
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
  const impactTabs = document.querySelectorAll(".impact-tab");
  const impactFlooding = document.getElementById("impactFlooding");
  const impactConsequence = document.getElementById("impactConsequence");
  const consequenceSelect = document.getElementById("consequenceSelect");
  const consequenceNoteEl = document.getElementById("consequenceNote");
  const areaSelect = document.getElementById("areaSelect");
  const areaAutoNote = document.getElementById("areaAutoNote");
  const equivCaptionEl = document.getElementById("equivCaption");
  const equivScenariosEl = document.getElementById("equivScenarios");

  let currentLevelIndex = Number(levelSlider.value);
  let currentArea = "regional";
  let selectedSlrInches = null;
  let selectedStormKey = null;

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
    equivCaptionEl.textContent = `This level represents similar flooding under these Sea Level Rise + Storm Surge combinations (${STORM_SURGE_BY_AREA[currentArea].label}):`;
    const rows = [];
    SLR_OPTIONS.forEach(s => {
      STORM_SURGE_DEFS.forEach(g => {
        const sum = s.inches + stormInches(currentArea, g.key);
        if(Math.abs(sum - twl) <= 3) rows.push({ slr: s.label, storm: g.label, sum });
      });
    });
    rows.sort((a, b) => a.sum - b.sum || (b.storm === "No Storm Surge" ? -1 : 0));

    equivScenariosEl.innerHTML = "";
    if(!rows.length){
      equivScenariosEl.innerHTML = '<p class="equiv-note">No combination matches this level within the usual ±3" tolerance for this baseline.</p>';
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
      const disabled = selectedSlrInches !== null &&
        !isWithinTolerance(selectedSlrInches + stormInches(currentArea, b.dataset.key));
      b.disabled = disabled;
    });
    slrButtonsEl.querySelectorAll(".scenario-btn").forEach(b => {
      const disabled = selectedStormKey !== null &&
        !isWithinTolerance(Number(b.dataset.key) + stormInches(currentArea, selectedStormKey));
      b.disabled = disabled;
    });
  }

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

  consequenceSelect.addEventListener("change", refreshConsequenceLayer);

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

  function buildButtonGrid(container, options, keyOf, onPick){
    container.innerHTML = "";
    options.forEach(opt => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "scenario-btn";
      b.textContent = opt.label;
      b.dataset.key = keyOf(opt);
      b.addEventListener("click", () => {
        container.querySelectorAll(".scenario-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        onPick(opt);
      });
      container.appendChild(b);
    });
  }

  function reapplyActiveButton(container, key){
    container.querySelectorAll(".scenario-btn").forEach(b => {
      b.classList.toggle("active", key !== null && b.dataset.key === String(key));
    });
  }

  function buildStormButtons(){
    buildButtonGrid(stormButtonsEl, STORM_SURGE_DEFS, opt => opt.key, opt => {
      selectedStormKey = opt.key;
      updateScenarioResult();
    });
    reapplyActiveButton(stormButtonsEl, selectedStormKey);
  }

  function updateScenarioResult(){
    updateGreying();
    if(selectedSlrInches === null || selectedStormKey === null){
      scenarioResultEl.textContent = "Select a sea level rise and storm surge amount to see the closest matching Total Water Level.";
      return;
    }
    const total = selectedSlrInches + stormInches(currentArea, selectedStormKey);
    const idx = nearestLevelIndex(total);
    setLevelIndex(idx);
    scenarioResultEl.textContent = `Closest matching Total Water Level: ${currentInches()}" above MHHW, using the ${STORM_SURGE_BY_AREA[currentArea].label} storm-surge baseline (simplified — doesn't include BCDC's per-scenario corrections).`;
  }

  function setArea(areaKey, auto){
    currentArea = areaKey;
    areaSelect.value = areaKey;
    areaAutoNote.textContent = auto
      ? `Auto-detected from your last click/search: ${STORM_SURGE_BY_AREA[areaKey].label}.`
      : "Manually selected — click the map or search an address to auto-detect again.";
    buildStormButtons();
    updateGreying();
    if(selectedSlrInches !== null && selectedStormKey !== null) updateScenarioResult();
  }

  areaSelect.addEventListener("change", () => setArea(areaSelect.value, false));

  applyAreaFromPoint = function(lat, lng){
    const county = findCountyAreaKey(lat, lng);
    setArea(county || "regional", true);
  };

  buildButtonGrid(slrButtonsEl, SLR_OPTIONS, opt => opt.inches, opt => { selectedSlrInches = opt.inches; updateScenarioResult(); });
  buildStormButtons();
  updateEquivalentScenarios();

  document.getElementById("hideAllBcdc").addEventListener("click", () => {
    bcdcCheckboxes.forEach(cb => {
      if(cb.checked){ cb.checked = false; cb.dispatchEvent(new Event("change")); }
    });
    const legalDeltaToggle = document.querySelector('[data-static-layer="legaldelta"]');
    if(legalDeltaToggle.checked){ legalDeltaToggle.checked = false; legalDeltaToggle.dispatchEvent(new Event("change")); }
    if(consequenceSelect.value){ consequenceSelect.value = ""; consequenceSelect.dispatchEvent(new Event("change")); }
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
    applyAreaFromPoint(latN, lonN);
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
