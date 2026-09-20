import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { CachedWmsTileLayer } from "../shared/tile-layers.js";
import { cachedFetch } from "../shared/request-cache.js";
import { fmtNum } from "../shared/format.js";
import { renderSwatchLegendBlock } from "../shared/legend.js";
import { buildWmsIdentifyUrl } from "../shared/identify-url.js";
import { buildButtonGrid } from "../shared/button-grid.js";

export const BCDC_WMS_URL = "https://mapserver.adaptingtorisingtides.org/cgi-bin/mapserv?map=/opt/slrviewer/mapfiles/bcdc.map";
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
  recreation: { label: "Visitation (Photo User Days per county)", colors: ["#42A858", "#348F58", "#2B6647"], labels: ["Low", "Medium", "High"] },
  tidalhabitat: { label: "Tidal Marsh Impacted (Acres per county)", colors: ["#42A858", "#348F58", "#2B6647"], labels: ["0 - 2,548", "2,548 - 4,448", "4,448 - 12,787"] },
  housing: { label: "Housing (Residential Units (2010) per census block group)", colors: ["#109ECD", "#1C889D", "#06597C"], labels: ["1 - 84", "85 - 334", "335 - 6,331"] },
  jobs: { label: "Jobs (Job Spaces (2010) per census block group)", colors: ["#109ECD", "#1C889D", "#06597C"], labels: ["1 - 45", "46 - 479", "480 - 6,379"] },
  vulcom_social: { label: "Socially Vulnerable Housing (Residential Units (2010) per census block group)", colors: ["#828DC3", "#6A6D90", "#404459"], labels: ["1 - 440", "441 - 2,350", "2,351 - 6,379"] },
  vulcom_contam: { label: "Contamination-Vulnerable Housing (Residential Units (2010) per census block group)", colors: ["#828DC3", "#6A6D90", "#404459"], labels: ["0 - 78", "79 - 293", "294 - 6,379"] }
};

// Consequence-indicator layers from ART Bay Area's regional analysis.
// All of these only exist for the 10 non-zero water levels
// (BCDC_WATER_LEVELS minus 0) — there's no "at 0 inches" consequence layer.
//
// BCDC's transportation consequence layers (highway vehicle/truck, rail) are
// deliberately not listed: their WMS layers return empty tiles and no
// features from BCDC's live server, so they can't be shown.
const CONSEQUENCE_LAYERS = {
  "recreation": { prefix: "consequence_recreation_" },
  "tidalhabitat": { prefix: "consequence_tidalhabitat_" },
  "housing": { prefix: "consequence_housing_" },
  "jobs": { prefix: "consequence_jobs_" },
  "vulcom_social": { prefix: "consequence_vulcom_social_" },
  "vulcom_contam": { prefix: "consequence_vulcom_contam_" }
};

export function buildBcdcWmsLayer(map, layerName, opacity, paneKey = "bcdc"){
  return new CachedWmsTileLayer(BCDC_WMS_URL, {
    layers: layerName,
    version: "1.3.0",
    format: "image/png",
    transparent: true,
    opacity: opacity,
    pane: groupPane(map, paneKey),
    attribution: 'Flood data: <a href="https://explorer.adaptingtorisingtides.org/" target="_blank" rel="noopener">BCDC Adapting to Rising Tides</a>'
  });
}

// --- BCDC GetFeatureInfo (click-to-inspect) -------------------------------
//
// Field names below (value_0, ot_ft, twl{N}_acres, etc.) come straight from
// BCDC's own build/slr.js click-render module, fetched and read directly —
// the WMS server's GetFeatureInfo has no documented schema of its own.

export function parseGmlFeatures(xmlText, layerName){
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
  recreation: features => parseTwlFieldInfo(features, "sum", "Photo User Days", 1),
  tidalhabitat: features => parseTwlFieldInfo(features, "acres", "Acres", 0),
  housing: features => parseTwlFieldInfo(features, "res_units_2010", "Residential Units (2010)", 0),
  jobs: features => parseTwlFieldInfo(features, "job_spaces_2010", "Job Spaces (2010)", 0),
  vulcom_social: features => parseVulcomInfo(features, "socvlnrank"),
  vulcom_contam: features => parseVulcomInfo(features, "contamrank")
};

/** The static Legal Delta boundary overlay — always the same WMS layer, no water-level dependency. */
export class BcdcLegalDeltaLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.querySelector('[data-static-layer="legaldelta"]');
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  buildLayer(){
    return buildBcdcWmsLayer(this.map, "legaldelta", 0.9);
  }

  init(){
    this.applySwatch('[data-swatch="legaldelta"]', LEGAL_DELTA_COLOR, true);
    this.toggleEl.addEventListener("change", () => this.refresh());
  }
}

/**
 * BCDC's "Bay Shoreline Flood Explorer": the water-level slider/scenario
 * picker, the three depth/overtopping/low-lying WMS layers it drives, and
 * the consequence-category layer, all sharing one "current water level"
 * state. Manages several simultaneous sublayers (`this.bcdcLayers`) rather
 * than the single `this.layer` BaseLayer assumes by default, so it
 * overrides the toggle-driven refresh methods directly instead of using
 * buildLayer()/refresh().
 */
export class BcdcFloodLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.bcdcLayers = {}; // BCDC_LAYER_TYPES id -> active Leaflet WMS layer, or absent
    this.consequenceLayer = null;

    this.levelSlider = document.getElementById("floodLevel");
    this.levelValue = document.getElementById("floodLevelValue");
    this.modeTabs = document.querySelectorAll(".mode-tab");
    this.modeLevel = document.getElementById("modeLevel");
    this.modeScenario = document.getElementById("modeScenario");
    this.slrButtonsEl = document.getElementById("slrButtons");
    this.stormButtonsEl = document.getElementById("stormButtons");
    this.scenarioResultEl = document.getElementById("scenarioResult");
    this.equivCaptionEl = document.getElementById("equivCaption");
    this.equivScenariosEl = document.getElementById("equivScenarios");
    this.bcdcCheckboxes = document.querySelectorAll("[data-bcdc-layer]");
    this.impactTabs = document.querySelectorAll(".impact-tab");
    this.impactFlooding = document.getElementById("impactFlooding");
    this.impactConsequence = document.getElementById("impactConsequence");
    this.consequenceSelect = document.getElementById("consequenceSelect");
    this.consequenceNoteEl = document.getElementById("consequenceNote");
    this.bcdcLegendEl = document.getElementById("bcdcLegend");

    this.currentLevelIndex = Number(this.levelSlider.value);
    this.selectedSlrInches = null;
    this.selectedStormInches = null;
  }

  currentInches(){
    return BCDC_WATER_LEVELS[this.currentLevelIndex];
  }

  refreshLayer(typeId){
    const t = BCDC_LAYER_TYPES[typeId];
    if(this.bcdcLayers[typeId]) this.map.removeLayer(this.bcdcLayers[typeId]);
    this.bcdcLayers[typeId] = buildBcdcWmsLayer(this.map, `${t.prefix}${this.currentInches()}`, t.opacity);
    this.bcdcLayers[typeId].addTo(this.map);
  }

  refreshConsequenceLayer(){
    const key = this.consequenceSelect.value;
    if(this.consequenceLayer){ this.map.removeLayer(this.consequenceLayer); this.consequenceLayer = null; }
    this.consequenceNoteEl.textContent = "";
    if(!key) return;
    const def = CONSEQUENCE_LAYERS[key];
    if(this.currentInches() === 0){
      this.consequenceNoteEl.textContent = "No consequence layer at 0\" — pick a non-zero water level to see this category.";
      return;
    }
    const layerName = `${def.prefix}${this.currentInches()}`;
    this.consequenceLayer = buildBcdcWmsLayer(this.map, layerName, 0.85);
    this.consequenceLayer.addTo(this.map);
  }

  refreshAllChecked(){
    this.bcdcCheckboxes.forEach(cb => { if(cb.checked) this.refreshLayer(cb.dataset.bcdcLayer); });
    this.refreshConsequenceLayer();
    this.renderBcdcLegend();
  }

  renderBcdcLegend(){
    const items = [];
    this.bcdcCheckboxes.forEach(cb => { if(cb.checked) items.push(LAYER_LEGENDS[cb.dataset.bcdcLayer]); });
    const consKey = this.consequenceSelect.value;
    if(consKey) items.push(CONSEQUENCE_LEGENDS[consKey]);

    this.bcdcLegendEl.innerHTML = "";
    this.bcdcLegendEl.hidden = items.length === 0;
    items.forEach(item => {
      this.bcdcLegendEl.appendChild(renderSwatchLegendBlock(item));
    });
  }

  setLevelIndex(idx){
    this.currentLevelIndex = idx;
    this.levelSlider.value = idx;
    this.levelValue.textContent = `${this.currentInches()}"`;
    this.refreshAllChecked();
    this.updateEquivalentScenarios();
  }

  // Combos within BCDC's own ±3" binning tolerance count as "matching."
  isWithinTolerance(sum){
    return Math.abs(sum - BCDC_WATER_LEVELS[nearestLevelIndex(sum)]) <= 3;
  }

  updateEquivalentScenarios(){
    const twl = this.currentInches();
    this.equivCaptionEl.textContent = "This level represents similar flooding under these Sea Level Rise + Storm Surge combinations (SF Bay region, regional):";
    const rows = [];
    SLR_OPTIONS.forEach(s => {
      STORM_SURGE_OPTIONS.forEach(g => {
        const sum = s.inches + g.inches;
        if(Math.abs(sum - twl) <= 3) rows.push({ slr: s.label, storm: g.label, sum });
      });
    });
    rows.sort((a, b) => a.sum - b.sum || (b.storm === "No Storm Surge" ? -1 : 0));

    this.equivScenariosEl.innerHTML = "";
    if(!rows.length){
      this.equivScenariosEl.innerHTML = '<p class="equiv-note">No combination matches this level within the usual ±3" tolerance.</p>';
      return;
    }
    const head = document.createElement("div");
    head.className = "equiv-row equiv-head";
    head.innerHTML = "<span>Sea Level Rise</span><span>Storm Surge</span>";
    this.equivScenariosEl.appendChild(head);
    rows.forEach(r => {
      const row = document.createElement("div");
      row.className = "equiv-row";
      row.innerHTML = `<span>${r.slr}</span><span>${r.storm}</span>`;
      this.equivScenariosEl.appendChild(row);
    });
  }

  updateGreying(){
    this.stormButtonsEl.querySelectorAll(".scenario-btn").forEach(b => {
      const disabled = this.selectedSlrInches !== null && !this.isWithinTolerance(this.selectedSlrInches + Number(b.dataset.inches));
      b.disabled = disabled;
    });
    this.slrButtonsEl.querySelectorAll(".scenario-btn").forEach(b => {
      const disabled = this.selectedStormInches !== null && !this.isWithinTolerance(Number(b.dataset.inches) + this.selectedStormInches);
      b.disabled = disabled;
    });
  }

  updateScenarioResult(){
    this.updateGreying();
    if(this.selectedSlrInches === null || this.selectedStormInches === null){
      this.scenarioResultEl.textContent = "Select a sea level rise and storm surge amount to see the closest matching Total Water Level.";
      return;
    }
    const idx = nearestLevelIndex(this.selectedSlrInches + this.selectedStormInches);
    this.setLevelIndex(idx);
    this.scenarioResultEl.textContent = `Closest matching Total Water Level: ${this.currentInches()}" above MHHW (regional approximation — BCDC's own tool uses county-specific storm-tide data).`;
  }

  init(){
    Object.keys(BCDC_LAYER_TYPES).forEach(typeId => {
      const t = BCDC_LAYER_TYPES[typeId];
      this.applySwatch(`[data-swatch="bcdc-${typeId}"]`, t.color, !!t.dashed);
    });

    this.modeTabs.forEach(btn => {
      btn.addEventListener("click", () => {
        this.modeTabs.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const scenario = btn.dataset.mode === "scenario";
        this.modeLevel.hidden = scenario;
        this.modeScenario.hidden = !scenario;
      });
    });

    buildButtonGrid(this.slrButtonsEl, SLR_OPTIONS, {
      dataset: opt => ({ inches: opt.inches }),
      onPick: opt => { this.selectedSlrInches = opt.inches; this.updateScenarioResult(); }
    });
    buildButtonGrid(this.stormButtonsEl, STORM_SURGE_OPTIONS, {
      dataset: opt => ({ inches: opt.inches }),
      onPick: opt => { this.selectedStormInches = opt.inches; this.updateScenarioResult(); }
    });
    this.updateEquivalentScenarios();

    this.levelValue.textContent = `${this.currentInches()}"`;

    this.impactTabs.forEach(btn => {
      btn.addEventListener("click", () => {
        this.impactTabs.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const consequence = btn.dataset.impact === "consequence";
        this.impactFlooding.hidden = consequence;
        this.impactConsequence.hidden = !consequence;
      });
    });

    this.consequenceSelect.addEventListener("change", () => {
      this.refreshConsequenceLayer();
      this.renderBcdcLegend();
    });

    this.bcdcCheckboxes.forEach(cb => {
      const typeId = cb.dataset.bcdcLayer;
      cb.addEventListener("change", () => {
        if(cb.checked){
          this.refreshLayer(typeId);
        } else if(this.bcdcLayers[typeId]){
          this.map.removeLayer(this.bcdcLayers[typeId]);
          delete this.bcdcLayers[typeId];
        }
        this.renderBcdcLegend();
      });
    });

    this.levelSlider.addEventListener("input", () => this.setLevelIndex(Number(this.levelSlider.value)));

    this.renderBcdcLegend();

    // Checkboxes are unchecked by the generic group Hide button; the scenario dropdown isn't a checkbox, so reset it here.
    document.getElementById("bcdcGroupBody").closest(".layer-group").addEventListener("layergroup:hide", () => {
      if(this.consequenceSelect.value){ this.consequenceSelect.value = ""; this.consequenceSelect.dispatchEvent(new Event("change")); }
    });

    this.registerPopupProvider(latlng => this.identifyInundation(latlng));
    this.registerPopupProvider(latlng => this.identifyOvertopping(latlng));
    this.registerPopupProvider(latlng => this.identifyConsequence(latlng));
  }

  async fetchBcdcFeatures(layerName, latlng){
    const url = buildWmsIdentifyUrl(this.map, BCDC_WMS_URL, layerName, latlng);
    return cachedFetch(url, async res => parseGmlFeatures(await res.text(), layerName));
  }

  async identifyInundation(latlng){
    const cb = document.querySelector('[data-bcdc-layer="inundation"]');
    if(!cb.checked) return null;
    const features = await this.fetchBcdcFeatures(`inundation${this.currentInches()}`, latlng);
    if(!features.length) return { title: "Depth of Flooding", note: `Not flooded at ${this.currentInches()}" above MHHW at this point.` };
    const depthFt = Number(features[0].value_0) / 12;
    return { title: "Depth of Flooding", rows: [{ label: "Depth", value: `${fmtNum(depthFt, 2)} feet` }] };
  }

  async identifyOvertopping(latlng){
    const cb = document.querySelector('[data-bcdc-layer="overtopping"]');
    if(!cb.checked) return null;
    const features = await this.fetchBcdcFeatures(`overtopping${this.currentInches()}`, latlng);
    if(!features.length) return { title: "Shoreline Overtopping", note: `No overtopping predicted at ${this.currentInches()}" above MHHW at this point.` };
    const f = features[0];
    const rows = [{ label: "Overtopping Depth", value: `${fmtNum(f.ot_ft, 2)} feet` }];
    if(f["class"]) rows.push({ label: "Shoreline Type", value: f["class"] });
    return { title: "Shoreline Overtopping", rows };
  }

  async identifyConsequence(latlng){
    const key = this.consequenceSelect.value;
    if(!key) return null;
    const def = CONSEQUENCE_LAYERS[key];
    if(this.currentInches() === 0){
      return { title: CONSEQUENCE_LEGENDS[key].label, note: 'No consequence layer at 0" above MHHW.' };
    }
    const layerName = `${def.prefix}${this.currentInches()}`;
    const features = await this.fetchBcdcFeatures(layerName, latlng);
    const parsed = CONSEQUENCE_INFO_PARSERS[key](features);
    return parsed || { title: CONSEQUENCE_LEGENDS[key].label, note: "No data at this point." };
  }
}
