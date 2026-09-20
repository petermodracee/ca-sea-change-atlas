import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { CachedWmsTileLayer, CachedXyzTileLayer } from "../shared/tile-layers.js";
import { cachedFetch } from "../shared/request-cache.js";
import { buildWmsIdentifyUrl } from "../shared/identify-url.js";
import { buildButtonGrid } from "../shared/button-grid.js";

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
// same category as BCDC_WATER_LEVELS/NOAA_SLR_SCENARIOS elsewhere in this
// refactor, just larger and kept in its own JSON file — see that file's
// own header comment for the full provenance. Item `kind` is either
// `tilexyz` (a static pre-rendered XYZ tile pyramid — no backing query
// service, so not click-to-inspect-able) or `imagewms` (a GeoServer WMS
// layer — supports GetFeatureInfo, same mechanism as BCDC's).
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
const COSMOS_WMS_URL = "https://geo.pointblue.org/geoserver/ocof/wms";

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

/**
 * The CoSMoS Flood Explorer group: region/topic/SLR/storm/extra-variable
 * pickers driving 0+ simultaneous tile/WMS sublayers for the active topic.
 * Like BCDC, this manages a live collection (`this.cosmosLayers`) rather
 * than a single `this.layer`, so it overrides refresh-equivalent behavior
 * directly instead of using BaseLayer's buildLayer()/refresh().
 */
export class CosmosLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.cosmosLayers = []; // { layer, def, gsLayer, specLabel } for each sublayer currently on the map
    this.cosmosCollectionPromise = null;

    this.toggle = document.getElementById("cosmosToggle");
    this.regionSelect = document.getElementById("cosmosRegionSelect");
    this.topicSelect = document.getElementById("cosmosTopicSelect");
    this.extraControlsEl = document.getElementById("cosmosExtraControls");
    this.slrSlider = document.getElementById("cosmosSlrSlider");
    this.slrValueEl = document.getElementById("cosmosSlrValue");
    this.stormButtonsEl = document.getElementById("cosmosStormButtons");
    this.resultEl = document.getElementById("cosmosResult");
    this.legendEl = document.getElementById("cosmosLegend");
    this.clickHintEl = document.getElementById("cosmosClickHint");

    this.slrIndex = 0;
    this.stormValue = null;
    this.minMaxVariant = "max";
    this.extraState = {}; // hold/nourish/open/kvalue current values
  }

  isEnabled(){
    return this.toggle.checked;
  }

  getLayerDefs(){
    if(!this.cosmosCollectionPromise){
      this.cosmosCollectionPromise = fetch(COSMOS_LAYERS_URL).then(r => r.json()).then(json => json.layers);
    }
    return this.cosmosCollectionPromise;
  }

  currentRegion(){ return COSMOS_REGIONS[this.regionSelect.value]; }
  currentTopic(){ return this.currentRegion().topics.find(t => t.id === Number(this.topicSelect.value)); }

  populateTopics(){
    this.topicSelect.innerHTML = "";
    this.currentRegion().topics.forEach(t => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.title;
      this.topicSelect.appendChild(o);
    });
    this.topicSelect.value = this.currentRegion().topics[0].id;
  }

  populateSlr(){
    const slrs = this.currentRegion().slr;
    this.slrSlider.min = 0;
    this.slrSlider.max = slrs.length - 1;
    if(this.slrIndex >= slrs.length) this.slrIndex = 0;
    this.slrSlider.value = this.slrIndex;
    this.slrValueEl.textContent = `${slrs[this.slrIndex]} cm`;
  }

  populateStorm(){
    const storms = this.currentRegion().storm;
    if(!storms.find(s => s.value === this.stormValue)) this.stormValue = storms[0].value;
    buildButtonGrid(this.stormButtonsEl, storms, {
      clear: true,
      isActive: s => s.value === this.stormValue,
      isDisabled: () => storms.length === 1,
      onPick: s => {
        this.stormValue = s.value;
        this.refreshCosmosLayers();
      }
    });
  }

  populateExtraControls(){
    this.extraControlsEl.innerHTML = "";
    this.extraControlsEl.className = "extra-controls";
    const topic = this.currentTopic();
    this.updateClickHint(topic.id);
    const vars = topic.vars.filter(v => v !== "slr" && v !== "storm");
    if(topic.id === 3){
      const wrap = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this.minMaxVariant === "min";
      cb.addEventListener("change", () => { this.minMaxVariant = cb.checked ? "min" : "max"; this.refreshCosmosLayers(); });
      wrap.appendChild(cb);
      wrap.appendChild(document.createTextNode("Show minimum instead of maximum"));
      this.extraControlsEl.appendChild(wrap);
    }
    vars.forEach(v => {
      if(v === "hold"){
        if(!("hold" in this.extraState)) this.extraState.hold = true;
        const wrap = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = this.extraState.hold;
        cb.addEventListener("change", () => { this.extraState.hold = cb.checked; this.refreshCosmosLayers(); });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode("Hold the line (shoreline armoring)"));
        this.extraControlsEl.appendChild(wrap);
      } else if(v === "nourish"){
        if(!("nourish" in this.extraState)) this.extraState.nourish = false;
        const wrap = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = this.extraState.nourish;
        cb.addEventListener("change", () => { this.extraState.nourish = cb.checked; this.refreshCosmosLayers(); });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode("Beach nourishment"));
        this.extraControlsEl.appendChild(wrap);
      } else if(v === "open"){
        if(!("open" in this.extraState)) this.extraState.open = false;
        const wrap = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = this.extraState.open;
        cb.addEventListener("change", () => { this.extraState.open = cb.checked; this.refreshCosmosLayers(); });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode("Mouth open"));
        this.extraControlsEl.appendChild(wrap);
      } else if(v === "kvalue"){
        if(!("kvalue" in this.extraState)) this.extraState.kvalue = 1;
        const label = document.createElement("label");
        label.textContent = "Groundwater conductivity";
        const sel = document.createElement("select");
        COSMOS_KVALUES.forEach(k => {
          const o = document.createElement("option");
          o.value = k.value;
          o.textContent = k.label;
          if(k.value === this.extraState.kvalue) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", () => { this.extraState.kvalue = Number(sel.value); this.refreshCosmosLayers(); });
        this.extraControlsEl.appendChild(label);
        this.extraControlsEl.appendChild(sel);
      }
    });
  }

  currentWantVars(){
    const slrs = this.currentRegion().slr;
    const topic = this.currentTopic();
    const want = { slr: slrs[this.slrIndex] };
    topic.vars.forEach(v => {
      if(v === "storm") want.storm = this.stormValue;
      else if(v !== "slr") want[v] = this.extraState[v];
    });
    return want;
  }

  async refreshCosmosLayers(){
    this.cosmosLayers.forEach(({ layer }) => this.map.removeLayer(layer));
    this.cosmosLayers = [];
    if(!this.toggle.checked) return;

    const topic = this.currentTopic();
    const region = this.currentRegion();
    const want = this.currentWantVars();

    this.resultEl.textContent = `Loading: ${topic.title}, ${region.name}…`;
    const allDefs = await this.getLayerDefs();
    // Guard against a slower-resolving fetch landing after the user has
    // since changed the topic/region/scenario.
    if(!this.toggle.checked || this.currentTopic().id !== topic.id) return;

    let defs = allDefs.filter(d => d.topicId === topic.id);
    if(topic.id === 3) defs = defs.filter(d => d.variant === this.minMaxVariant);
    if(topic.id === 6) defs = defs.filter(d => d.variant === (this.extraState.hold ? "hold" : "no_hold"));
    if(topic.id === 18) defs = defs.filter(d => d.kvalue === this.extraState.kvalue);

    let matchedAny = false;
    defs.forEach(def => {
      const filled = fillCosmosTemplate(def, want);
      if(!filled) return;
      let layer;
      if(def.kind === "tilexyz"){
        layer = new CachedXyzTileLayer("https:" + filled, { opacity: 0.7, pane: groupPane(this.map, "cosmos"), attribution: COSMOS_TILE_ATTRIBUTION });
      } else if(def.kind === "imagewms"){
        layer = new CachedWmsTileLayer(COSMOS_WMS_URL, {
          layers: filled, styles: def.style || "", version: "1.1.1",
          format: "image/png", transparent: true, opacity: 0.7, pane: groupPane(this.map, "cosmos"),
          attribution: COSMOS_TILE_ATTRIBUTION
        });
      }
      if(layer){
        layer.addTo(this.map);
        this.cosmosLayers.push({ layer, def, gsLayer: def.kind === "imagewms" ? filled : null, specLabel: def.label });
        matchedAny = true;
      }
    });

    this.resultEl.textContent = matchedAny
      ? `Showing: ${topic.title}, ${region.name}, ${want.slr} cm SLR${"storm" in want ? `, ${region.storm.find(s => s.value === want.storm).label} storm` : ""}.`
      : `No modeled data available for this combination (${topic.title}, ${region.name}).`;

    this.updateCosmosLegend(defs);
  }

  // One real legend graphic per distinct active color scale, fetched live
  // from GeoServer (GetLegendGraphic) — CoSMoS has no fixed project color;
  // every topic renders with its own server-defined scale. Paired with
  // this layer's own label, since some of GeoServer's single-class
  // legends (e.g. Flood Extent, Wave Runup) render a bare color swatch
  // with no text baked into the graphic itself.
  updateCosmosLegend(defs){
    const byStyle = new Map();
    defs.forEach(d => { if(d.style && !byStyle.has(d.style)) byStyle.set(d.style, d.label); });
    this.legendEl.innerHTML = "";
    this.legendEl.hidden = byStyle.size === 0;
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
      this.legendEl.appendChild(block);
    });
  }

  async updateClickHint(topicId){
    const allDefs = await this.getLayerDefs();
    const hasIdentify = allDefs.some(d => d.topicId === topicId && d.kind === "imagewms");
    this.clickHintEl.textContent = hasIdentify
      ? "Click the map to see modeled values for the selected scenario, where available."
      : "Scales are shown below; click-to-inspect isn't available for this topic.";
  }

  init(){
    Object.keys(COSMOS_REGIONS).forEach(key => {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = COSMOS_REGIONS[key].name;
      this.regionSelect.appendChild(o);
    });
    this.regionSelect.value = "california_coast";

    this.regionSelect.addEventListener("change", () => {
      this.populateTopics();
      this.populateSlr();
      this.populateStorm();
      this.populateExtraControls();
      this.refreshCosmosLayers();
    });
    this.topicSelect.addEventListener("change", () => {
      this.populateExtraControls();
      this.refreshCosmosLayers();
    });
    this.slrSlider.addEventListener("input", () => {
      this.slrIndex = Number(this.slrSlider.value);
      this.slrValueEl.textContent = `${this.currentRegion().slr[this.slrIndex]} cm`;
      this.refreshCosmosLayers();
    });
    this.toggle.addEventListener("change", () => this.refreshCosmosLayers());

    this.populateTopics();
    this.populateSlr();
    this.populateStorm();
    this.populateExtraControls();

    this.registerPopupProvider(latlng => this.identify(latlng));
  }

  async identify(latlng){
    if(!this.toggle.checked || !this.cosmosLayers.length) return null;
    const wmsLayers = this.cosmosLayers.filter(l => l.gsLayer);
    if(!wmsLayers.length){
      return { title: "CoSMoS", note: "Click-to-inspect isn't available for this topic." };
    }
    const results = await Promise.all(wmsLayers.map(({ gsLayer, specLabel }) =>
      cachedFetch(buildWmsIdentifyUrl(this.map, COSMOS_WMS_URL, gsLayer, latlng, { version: "1.1.1", infoFormat: "application/json", featureCount: "1", styles: "" }), res => res.json())
        .then(json => ({ specLabel, features: (json && json.features) || [] }))
        .catch(() => ({ specLabel, features: [] }))
    ));
    const withData = results.find(r => r.features.length);
    if(!withData) return { title: "CoSMoS", note: "No modeled data at this point for the active layer(s)." };
    const props = withData.features[0].properties || {};
    const rows = Object.keys(props).slice(0, 6).map(k => ({ label: k, value: String(props[k]) }));
    return { title: `CoSMoS — ${withData.specLabel}`, rows: rows.length ? rows : [{ label: "Match", value: "Yes" }] };
  }
}
