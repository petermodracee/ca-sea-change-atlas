const REGION_FILES = {
  "bay-area-counties": "data/coverage/bay-area-counties.geojson",
  "east-contra-costa": "data/coverage/east-contra-costa.geojson",
  "california-state": "data/coverage/california-state.geojson",
  "orange-county": "data/coverage/orange-county.geojson"
};

const NATIONAL_SCOPE = "national";

const BCDC_WMS_URL = "https://mapserver.adaptingtorisingtides.org/cgi-bin/mapserv?map=/opt/slrviewer/mapfiles/bcdc.map";
const BCDC_WATER_LEVELS = [0, 12, 24, 36, 48, 52, 66, 77, 84, 96, 108]; // inches above MHHW, matches BCDC's own "Total Water Level" slider
let floodLayer = null;

const state = {
  process: new Set(),
  exposure: new Set(),
  flood: new Set(),
  compare: [],
  locationToolIds: null,   // null = no point picked yet; Set otherwise
  locationLabel: null
};

let TOOLS = [];
let regionData = {};       // regionId -> FeatureCollection
let map, marker;

async function loadData(){
  const [toolsRes, ...regionResArr] = await Promise.all([
    fetch("data/tools.json").then(r => r.json()),
    ...Object.values(REGION_FILES).map(f => fetch(f).then(r => r.json()))
  ]);
  TOOLS = toolsRes.tools;
  const regionIds = Object.keys(REGION_FILES);
  regionIds.forEach((id, i) => { regionData[id] = regionResArr[i]; });
}

function initMap(){
  map = L.map("map", { scrollWheelZoom: true }).setView([37.2, -119.4], 6);
  window.map = map; // exposed for debugging/testing
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const bayStyle = { color: "#1F7A6C", weight: 1.5, fillColor: "#1F7A6C", fillOpacity: 0.18 };
  const eccStyle = { color: "#1F7A6C", weight: 1.5, dashArray: "4,4", fillColor: "#1F7A6C", fillOpacity: 0.12 };
  const statewideStyle = { color: "#1B3A4B", weight: 2, fillColor: "#1B3A4B", fillOpacity: 0.05 };
  const nationalStyle = { color: "#1B3A4B", weight: 1.5, dashArray: "6,5", fillColor: "#1B3A4B", fillOpacity: 0 };
  const orangeStyle = { color: "#AE4A2C", weight: 1.5, fillColor: "#AE4A2C", fillOpacity: 0.18 };

  L.geoJSON(regionData["bay-area-counties"], { style: bayStyle }).addTo(map);
  L.geoJSON(regionData["east-contra-costa"], { style: eccStyle }).addTo(map);
  L.geoJSON(regionData["california-state"], { style: statewideStyle }).addTo(map);
  L.geoJSON(regionData["california-state"], { style: nationalStyle }).addTo(map);
  L.geoJSON(regionData["orange-county"], { style: orangeStyle }).addTo(map);

  renderLegend([
    { swatch: bayStyle.color, label: "Bay Area counties (BCDC ART, East CC Flood Explorer)" },
    { swatch: eccStyle.color, label: "East Contra Costa study area (approximate)", dashed: true },
    { swatch: statewideStyle.color, label: "California statewide tools (Cal-Adapt, CoSMoS, CREST)" },
    { swatch: nationalStyle.color, label: "National tools — CA portion shown (dashed)", dashed: true },
    { swatch: orangeStyle.color, label: "Orange County / Newport Bay (FloodRISE)" },
    { swatch: "#2E6FA3", label: "BCDC flood-depth overlay (toggle above map), darker = deeper" }
  ]);

  map.on("click", e => handlePoint(e.latlng.lat, e.latlng.lng, null));
}

function buildFloodLayer(waterLevelIn){
  return L.tileLayer.wms(BCDC_WMS_URL, {
    layers: `inundation${waterLevelIn}`,
    version: "1.3.0",
    format: "image/png",
    transparent: true,
    opacity: 0.72,
    attribution: 'Flood depth: <a href="https://explorer.adaptingtorisingtides.org/" target="_blank" rel="noopener">BCDC Adapting to Rising Tides</a>'
  });
}

function initFloodOverlay(){
  const toggle = document.getElementById("floodToggle");
  const levelWrap = document.getElementById("overlayLevelWrap");
  const levelSlider = document.getElementById("floodLevel");
  const levelValue = document.getElementById("floodLevelValue");

  const currentInches = () => BCDC_WATER_LEVELS[Number(levelSlider.value)];
  const updateLevelLabel = () => { levelValue.textContent = `${currentInches()}"`; };
  updateLevelLabel();

  toggle.addEventListener("change", () => {
    levelWrap.hidden = !toggle.checked;
    if(toggle.checked){
      floodLayer = buildFloodLayer(currentInches());
      floodLayer.addTo(map);
    } else if(floodLayer){
      map.removeLayer(floodLayer);
      floodLayer = null;
    }
  });

  levelSlider.addEventListener("input", () => {
    updateLevelLabel();
    if(floodLayer){
      map.removeLayer(floodLayer);
      floodLayer = buildFloodLayer(currentInches());
      floodLayer.addTo(map);
    }
  });
}

function renderLegend(items){
  const el = document.getElementById("legend");
  el.innerHTML = "";
  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = item.dashed
      ? `repeating-linear-gradient(90deg, ${item.swatch} 0 6px, transparent 6px 10px)`
      : item.swatch;
    const label = document.createElement("span");
    label.textContent = item.label;
    row.appendChild(sw);
    row.appendChild(label);
    el.appendChild(row);
  });
}

function regionContainsPoint(regionId, lat, lng){
  const fc = regionData[regionId];
  if(!fc) return false;
  const pt = turf.point([lng, lat]);
  return fc.features.some(f => {
    try{ return turf.booleanPointInPolygon(pt, f); }
    catch(e){ return false; }
  });
}

function handlePoint(lat, lng, label){
  if(marker) map.removeLayer(marker);
  marker = L.marker([lat, lng]).addTo(map);

  const matchedRegions = Object.keys(REGION_FILES).filter(id => regionContainsPoint(id, lat, lng));
  const matchedToolIds = new Set(
    TOOLS.filter(t => matchedRegions.includes(t.coverageRegion)).map(t => t.id)
  );

  state.locationToolIds = matchedToolIds;
  state.locationLabel = label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  render();
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
    handlePoint(latN, lonN, display_name);
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

function uniqueSorted(key){
  const s = new Set();
  TOOLS.forEach(t => t[key].forEach(v => s.add(v)));
  return Array.from(s).sort();
}

function buildFieldset(id, items, groupKey){
  const fs = document.getElementById(id);
  items.forEach(val => {
    const wrap = document.createElement("label");
    wrap.className = "chk";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = val;
    cb.addEventListener("change", () => {
      if(cb.checked) state[groupKey].add(val); else state[groupKey].delete(val);
      render();
    });
    const span = document.createElement("span");
    span.textContent = val;
    wrap.appendChild(cb);
    wrap.appendChild(span);
    fs.appendChild(wrap);
  });
}

document.getElementById("clearBtn").addEventListener("click", () => {
  ["process","exposure","flood"].forEach(k => state[k].clear());
  document.querySelectorAll('.filters input[type="checkbox"]').forEach(cb => cb.checked = false);
  render();
});

function matches(tool){
  if(state.locationToolIds !== null && !state.locationToolIds.has(tool.id)) return false;
  if(state.process.size && ![...state.process].every(p => tool.processes.includes(p))) return false;
  if(state.exposure.size && ![...state.exposure].every(e => tool.exposure.includes(e))) return false;
  if(state.flood.size && ![...state.flood].every(f => tool.floodInfo.includes(f))) return false;
  return true;
}

function toggleCompare(id){
  const idx = state.compare.indexOf(id);
  if(idx >= 0){ state.compare.splice(idx,1); }
  else if(state.compare.length < 3){ state.compare.push(id); }
  render();
}

function renderLocationSummary(){
  const el = document.getElementById("locationSummary");
  if(state.locationToolIds === null){
    el.classList.remove("has-point");
    el.textContent = "Click anywhere on the map, or search an address above, to see which tools cover that location.";
    return;
  }
  el.classList.add("has-point");
  const n = state.locationToolIds.size;
  el.innerHTML = `<strong>${n} of ${TOOLS.length} tools</strong> cover this location (${state.locationLabel}). Use the filters to narrow further, or <a href="#" id="clearLocationLink">clear the location</a> to see all tools.`;
  const link = document.getElementById("clearLocationLink");
  if(link){
    link.addEventListener("click", e => {
      e.preventDefault();
      state.locationToolIds = null;
      state.locationLabel = null;
      if(marker){ map.removeLayer(marker); marker = null; }
      render();
    });
  }
}

function render(){
  renderLocationSummary();

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const visible = TOOLS.filter(matches);
  document.getElementById("countLabel").textContent = visible.length + " of " + TOOLS.length + " tools shown";
  document.getElementById("emptyMsg").style.display = visible.length ? "none" : "block";

  visible.forEach(tool => {
    const card = document.createElement("div");
    card.className = "card";

    const org = document.createElement("div");
    org.className = "org";
    org.textContent = tool.org;
    card.appendChild(org);

    const h3 = document.createElement("h3");
    h3.textContent = tool.name;
    card.appendChild(h3);

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = tool.description;
    card.appendChild(desc);

    const tags = document.createElement("div");
    tags.className = "tagrow";
    const scopeTag = document.createElement("span");
    scopeTag.className = "tag scope";
    scopeTag.textContent = tool.scopeLabel;
    tags.appendChild(scopeTag);
    tool.processes.slice(0,2).forEach(p => {
      const t = document.createElement("span");
      t.className = "tag";
      t.textContent = p;
      tags.appendChild(t);
    });
    card.appendChild(tags);

    const foot = document.createElement("div");
    foot.className = "card-foot";
    const yr = document.createElement("span");
    yr.className = "yr";
    yr.textContent = tool.released;
    foot.appendChild(yr);

    const actions = document.createElement("div");
    actions.className = "actions";

    if(tool.url){
      const a = document.createElement("a");
      a.className = "linkbtn";
      a.href = tool.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open tool ↗";
      actions.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.className = "nolink";
      span.textContent = "Link unverified";
      actions.appendChild(span);
    }

    const cmpBtn = document.createElement("button");
    cmpBtn.type = "button";
    const inCompare = state.compare.includes(tool.id);
    cmpBtn.className = "cmp-btn" + (inCompare ? " on" : "");
    cmpBtn.textContent = inCompare ? "✓ Comparing" : "Compare";
    cmpBtn.disabled = !inCompare && state.compare.length >= 3;
    cmpBtn.addEventListener("click", () => toggleCompare(tool.id));
    actions.appendChild(cmpBtn);

    foot.appendChild(actions);
    card.appendChild(foot);
    grid.appendChild(card);
  });

  renderCompareBar();
  renderComparisonTable();
}

function renderCompareBar(){
  const bar = document.getElementById("compareBar");
  const slots = document.getElementById("slots");
  slots.innerHTML = "";
  if(!state.compare.length){ bar.style.display = "none"; return; }
  bar.style.display = "block";
  state.compare.forEach(id => {
    const tool = TOOLS.find(t=>t.id===id);
    const slot = document.createElement("span");
    slot.className = "slot";
    const label = document.createElement("span");
    label.textContent = tool.name.length > 34 ? tool.name.slice(0,32)+"…" : tool.name;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.setAttribute("aria-label","Remove " + tool.name + " from comparison");
    btn.addEventListener("click", () => toggleCompare(id));
    slot.appendChild(label);
    slot.appendChild(btn);
    slots.appendChild(slot);
  });
  document.getElementById("scrollToCompare").onclick = () => {
    document.getElementById("comparison").scrollIntoView({behavior:"smooth", block:"start"});
  };
}

function listCell(items){
  if(!items || !items.length) return "—";
  const ul = document.createElement("ul");
  items.forEach(i => {
    const li = document.createElement("li");
    li.textContent = i;
    ul.appendChild(li);
  });
  return ul;
}

function renderComparisonTable(){
  const wrap = document.getElementById("comparison");
  const table = document.getElementById("cmpTable");
  table.innerHTML = "";
  if(state.compare.length < 2){ wrap.style.display = "none"; return; }
  wrap.style.display = "block";

  const tools = state.compare.map(id => TOOLS.find(t=>t.id===id));
  const rows = [
    ["Organization", t => t.org],
    ["Geographic scope", t => t.scopeLabel],
    ["Released", t => t.released],
    ["Description", t => t.description],
    ["Shoreline processes", t => listCell(t.processes)],
    ["Exposure analysis", t => listCell(t.exposure)],
    ["Projected flood info", t => listCell(t.floodInfo)],
    ["Reports & data", t => t.reportsData],
    ["Sea-level-rise model", t => t.slrModel],
    ["Strengths", t => listCell(t.strengths)],
    ["Limitations", t => listCell(t.limitations)],
    ["Link", t => t.url]
  ];

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.className = "rowlabel-head";
  trh.appendChild(th0);
  tools.forEach(t => {
    const th = document.createElement("th");
    th.textContent = t.name;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(([label, fn]) => {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.className = "rowlabel";
    tdLabel.textContent = label;
    tr.appendChild(tdLabel);
    tools.forEach(t => {
      const td = document.createElement("td");
      if(label === "Link"){
        if(t.url){
          const a = document.createElement("a");
          a.href = t.url; a.target = "_blank"; a.rel = "noopener";
          a.textContent = "Open tool ↗";
          td.appendChild(a);
        } else {
          td.textContent = "Link unverified";
        }
      } else {
        const val = fn(t);
        if(val instanceof Node) td.appendChild(val);
        else td.textContent = val;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

async function main(){
  await loadData();
  initMap();
  initFloodOverlay();
  buildFieldset("f-process", uniqueSorted("processes"), "process");
  buildFieldset("f-exposure", uniqueSorted("exposure"), "exposure");
  buildFieldset("f-flood", uniqueSorted("floodInfo"), "flood");
  render();
}

main();
