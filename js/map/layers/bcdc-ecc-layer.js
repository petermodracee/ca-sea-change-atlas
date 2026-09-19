import { BaseLayer } from "../base-layer.js";
import { cachedFetch } from "../shared/request-cache.js";
import { fmtNum } from "../shared/format.js";
import { renderSwatchLegendBlock } from "../shared/legend.js";
import { buildWmsIdentifyUrl } from "../shared/identify-url.js";
import { buildButtonGrid } from "../shared/button-grid.js";
import { BCDC_WMS_URL, buildBcdcWmsLayer, parseGmlFeatures } from "./bcdc-flood-layer.js";

// --- East Contra Costa Shoreline Flood Explorer (BCDC / SFEI) ---------------
// Confirmed directly against the live tool at eccexplorer.adaptingtorisingtides.org:
// its own `query.php?q=getConfig` returns the same `mapServerUrls.local` /
// `mapFilePath` as the Bay Shoreline Flood Explorer (mapserver.adaptingtorisingtides.org,
// bcdc.map), so this is the *same* WMS server and mapfile as BcdcFloodLayer —
// only the layer names differ (`ecc{inundation|overtopping|lowlying}{inches}`,
// with a `flood100` suffix for the 100-year storm variant). Layer names and
// the five SLR stops below were read from the tool's own build/slr.js and
// checked against the server's GetCapabilities; GetMap and GetFeatureInfo
// were both exercised against real flooded points. It therefore shares
// BCDC's WMS URL, tile cache, and GetFeatureInfo/GML parsing.
//
// Unlike the Bay tool this one has no consequence layers and no storm-surge
// scenario picker: just an SLR slider, a single on/off "100-year storm event"
// toggle, and the three flood layers.
const ECC_SLR_INCHES = [0, 12, 24, 36, 83];
const ECC_LAYER_TYPES = {
  inundation: { opacity: 0.72, color: "#2E6FA3" },
  overtopping: { opacity: 0.9, color: "#C0392B" },
  lowlying: { opacity: 0.6, color: "#5513C7", dashed: true }
};
// Legend content from the tool's own build/slr.js legend config (the low-lying
// hatch is purple here, unlike the Bay explorer's green).
const ECC_LEGENDS = {
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
    colors: ["#5513C7"],
    labels: ["Low-lying Area"],
    hatch: true
  }
};
const STORM_OPTIONS = [
  { key: "off", label: "Sea level rise only", storm: false },
  { key: "on", label: "+ 100-year storm", storm: true }
];

/** East Contra Costa group: SLR slider + 100-yr storm toggle driving three BCDC WMS layers, with identify providers for depth and overtopping. */
export class BcdcEccLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.layers = {}; // ECC_LAYER_TYPES id -> active Leaflet WMS layer, or absent
    this.checkboxes = document.querySelectorAll("[data-ecc-layer]");
    this.sliderEl = document.getElementById("eccSlider");
    this.valueEl = document.getElementById("eccSlrValue");
    this.stormButtonsEl = document.getElementById("eccStormButtons");
    this.resultEl = document.getElementById("eccResult");
    this.legendEl = document.getElementById("eccLegend");
    this.storm = false;
  }

  currentInches(){
    return ECC_SLR_INCHES[Number(this.sliderEl.value)];
  }

  /** WMS layer name for a layer type at the current scenario, e.g. `eccinundation36flood100`. */
  layerName(typeId){
    return `ecc${typeId}${this.currentInches()}${this.storm ? "flood100" : ""}`;
  }

  refreshLayer(typeId){
    if(this.layers[typeId]) this.map.removeLayer(this.layers[typeId]);
    this.layers[typeId] = buildBcdcWmsLayer(this.map, this.layerName(typeId), ECC_LAYER_TYPES[typeId].opacity, "bcdcEcc");
    this.layers[typeId].addTo(this.map);
  }

  scenarioText(){
    const inches = this.currentInches();
    const slr = inches === 0 ? "today's sea level" : `${inches}" of sea level rise`;
    return this.storm ? `Showing: 100-year storm event + ${slr}.` : `Showing: MHHW + ${slr}.`;
  }

  updateText(){
    this.valueEl.textContent = `${this.currentInches()}"`;
    this.resultEl.textContent = this.scenarioText();
  }

  refresh(){
    this.updateText();
    this.checkboxes.forEach(cb => { if(cb.checked) this.refreshLayer(cb.dataset.eccLayer); });
    this.updateLegend();
  }

  updateLegend(){
    const items = [];
    this.checkboxes.forEach(cb => { if(cb.checked) items.push(ECC_LEGENDS[cb.dataset.eccLayer]); });
    this.legendEl.innerHTML = "";
    this.legendEl.hidden = items.length === 0;
    items.forEach(item => this.legendEl.appendChild(renderSwatchLegendBlock(item)));
  }

  init(){
    Object.keys(ECC_LAYER_TYPES).forEach(typeId => {
      const t = ECC_LAYER_TYPES[typeId];
      this.applySwatch(`[data-swatch="ecc-${typeId}"]`, t.color, !!t.dashed);
    });

    this.sliderEl.min = 0;
    this.sliderEl.max = ECC_SLR_INCHES.length - 1;

    buildButtonGrid(this.stormButtonsEl, STORM_OPTIONS, {
      isActive: opt => opt.storm === this.storm,
      onPick: opt => { this.storm = opt.storm; this.refresh(); }
    });

    this.checkboxes.forEach(cb => {
      const typeId = cb.dataset.eccLayer;
      cb.addEventListener("change", () => {
        if(cb.checked){
          this.refreshLayer(typeId);
        } else if(this.layers[typeId]){
          this.map.removeLayer(this.layers[typeId]);
          delete this.layers[typeId];
        }
        this.updateLegend();
      });
    });
    this.sliderEl.addEventListener("input", () => this.refresh());

    this.updateText();
    this.updateLegend();

    this.registerPopupProvider(latlng => this.identifyInundation(latlng));
    this.registerPopupProvider(latlng => this.identifyOvertopping(latlng));
  }

  // Field names (value_0 = flood depth in inches, ot_ft = overtopping feet) come from the
  // tool's own click handler in build/slr.js — the same ones the Bay explorer uses.
  async fetchFeatures(layerName, latlng){
    const url = buildWmsIdentifyUrl(this.map, BCDC_WMS_URL, layerName, latlng);
    return cachedFetch(url, async res => parseGmlFeatures(await res.text(), layerName));
  }

  async identifyInundation(latlng){
    const cb = document.querySelector('[data-ecc-layer="inundation"]');
    if(!cb.checked) return null;
    const features = await this.fetchFeatures(this.layerName("inundation"), latlng);
    // An empty result can mean "not flooded" or "outside this tool's small extent"; the response can't tell them apart, so stay silent rather than claim either.
    if(!features.length) return null;
    const depthFt = Number(features[0].value_0) / 12;
    return { title: "East Contra Costa — Depth of Flooding", rows: [{ label: "Depth", value: `${fmtNum(depthFt, 2)} feet` }] };
  }

  async identifyOvertopping(latlng){
    const cb = document.querySelector('[data-ecc-layer="overtopping"]');
    if(!cb.checked) return null;
    const features = await this.fetchFeatures(this.layerName("overtopping"), latlng);
    if(!features.length) return null;
    return { title: "East Contra Costa — Shoreline Overtopping", rows: [{ label: "Overtopping Depth", value: `${fmtNum(features[0].ot_ft, 2)} feet` }] };
  }
}
