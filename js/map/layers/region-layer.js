import { BaseLayer } from "../base-layer.js";
import { setSwatch } from "../shared/dom.js";

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

/** Fetches all coverage-area GeoJSON files once, up front. */
export async function loadRegionData(){
  const regionIds = Object.keys(REGION_FILES);
  const results = await Promise.all(regionIds.map(id => fetch(REGION_FILES[id]).then(r => r.json())));
  const regionData = {};
  regionIds.forEach((id, i) => { regionData[id] = results[i]; });
  return regionData;
}

/**
 * A "tool coverage area" region shown as a styled GeoJSON polygon —
 * simplest layer group on the map: static local data, checkbox toggle,
 * no popup, no legend beyond its panel swatch.
 */
export class RegionLayer extends BaseLayer {
  /**
   * @param {L.Map} map
   * @param {{registerProvider: Function}} infoPopup
   * @param {{layerId: string, geojson: object}} config
   */
  constructor(map, infoPopup, config){
    super(map, infoPopup, config);
    this.toggleEl = document.querySelector(`.layer-item input[data-layer="${config.layerId}"]`);
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  buildLayer(){
    const style = REGION_STYLES[this.config.layerId];
    return L.geoJSON(this.config.geojson, { style });
  }

  init(){
    const style = REGION_STYLES[this.config.layerId];
    this.applySwatch(`[data-swatch="${this.config.layerId}"]`, style.color, !!style.dashed);
    this.toggleEl.addEventListener("change", () => this.refresh());
    this.refresh();
  }
}

/** Instantiates and initializes one RegionLayer per configured region, keyed by panel layer id. */
export function initRegionLayers(map, infoPopup, regionData){
  return Object.keys(REGION_STYLES).map(layerId => {
    const geomKey = REGION_GEOMETRY_SOURCE[layerId];
    const layer = new RegionLayer(map, infoPopup, { layerId, geojson: regionData[geomKey] });
    layer.init();
    return layer;
  });
}
