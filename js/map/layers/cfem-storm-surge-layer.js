import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { renderImageLegendBlock } from "../shared/legend.js";
import { buildButtonGrid } from "../shared/button-grid.js";

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

/** SLOSH-model hurricane storm surge, category 1 or 2, Southern California only; tiles-only, so legend-only, no click-to-inspect. */
export class CfemStormSurgeLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.getElementById("cfemSurgeToggle");
    this.buttonsEl = document.getElementById("cfemSurgeCategoryButtons");
    this.legendEl = document.getElementById("cfemSurgeLegend");
    this.category = 1;
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  currentUrl(){
    return `${CFEM_SURGE_BASE}/Storm_Surge_HazardMaps_Category${this.category}_v3/MapServer`;
  }

  buildLayer(){
    return L.esri.tiledMapLayer({
      url: this.currentUrl(),
      opacity: 0.7,
      pane: groupPane(this.map, "cfem"),
      attribution: CFEM_SURGE_ATTRIBUTION
    });
  }

  async updateLegend(){
    if(!this.isEnabled()){ this.legendEl.hidden = true; this.legendEl.innerHTML = ""; return; }
    const block = await renderImageLegendBlock(this.currentUrl(), CFEM_SURGE_LAYER_ID, `Storm Surge — Category ${this.category} Inundation Height`);
    this.legendEl.innerHTML = "";
    this.legendEl.appendChild(block);
    this.legendEl.hidden = false;
  }

  init(){
    this.applySwatch('[data-swatch="cfem-surge"]', CFEM_SURGE_COLOR, false);

    buildButtonGrid(this.buttonsEl, CFEM_SURGE_CATEGORIES, {
      label: cat => `Category ${cat}`,
      isActive: cat => cat === this.category,
      onPick: cat => {
        this.category = cat;
        this.refresh();
      }
    });

    this.toggleEl.addEventListener("change", () => this.refresh());
  }
}
