import { BaseLayer } from "../base-layer.js";

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
const NOAA_SLR_COLOR = "#2F6FA0";

export class NoaaSlrLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.getElementById("noaaSlrToggle");
    this.sliderEl = document.getElementById("noaaSlrSlider");
    this.valueEl = document.getElementById("noaaSlrValue");
    this.resultEl = document.getElementById("noaaSlrResult");
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  currentScenario(){
    return NOAA_SLR_SCENARIOS[Number(this.sliderEl.value)];
  }

  buildLayer(){
    return L.esri.tiledMapLayer({
      url: this.currentScenario().url,
      opacity: 0.75,
      attribution: NOAA_SLR_ATTRIBUTION
    });
  }

  refresh(){
    const scenario = this.currentScenario();
    this.valueEl.textContent = scenario.label;
    this.resultEl.textContent = `Showing: ${scenario.label} of sea level rise.`;
    super.refresh();
  }

  init(){
    this.applySwatch('[data-swatch="noaa-slr"]', NOAA_SLR_COLOR, false);
    this.sliderEl.min = 0;
    this.sliderEl.max = NOAA_SLR_SCENARIOS.length - 1;
    this.sliderEl.value = 6; // 3ft, matching the old dropdown's default

    this.toggleEl.addEventListener("change", () => this.refresh());
    this.sliderEl.addEventListener("input", () => this.refresh());

    const scenario = this.currentScenario();
    this.valueEl.textContent = scenario.label;
    this.resultEl.textContent = `Showing: ${scenario.label} of sea level rise.`;

    this.registerPopupProvider(latlng => this.identify(latlng));
  }

  identify(latlng){
    if(!this.isEnabled()) return Promise.resolve(null);
    const scenario = this.currentScenario();
    const label = `NOAA SLR Viewer — ${scenario.label}`;
    return new Promise(resolve => {
      L.esri.identifyFeatures({ url: scenario.url })
        .on(this.map)
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
  }
}
