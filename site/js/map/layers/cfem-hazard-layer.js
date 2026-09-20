import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { setSwatch } from "../shared/dom.js";
import { renderImageLegendBlock } from "../shared/legend.js";

const CFEM_HAZARD_ATTRIBUTION = 'Hazard layer: <a href="https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html" target="_blank" rel="noopener">NOAA Office for Coastal Management, Coastal Flood Exposure Mapper</a>';

/**
 * Shared logic for CFEM's simple single-toggle hazard layers (High Tide
 * Flooding, FEMA Flood Zones, Tsunami) — each is a real, separate, tiled
 * MapServer with no usable click-to-inspect (see cfem-composite-layer.js's
 * header comment for why), just a live legend fetched from the service's
 * own /legend endpoint, same pattern as FEMA's main layer group.
 */
export class CfemHazardLayer extends BaseLayer {
  /**
   * @param {L.Map} map
   * @param {{registerProvider: Function}} infoPopup
   * @param {{toggleId: string, legendId: string, swatch: string, color: string, url: string, layerId: number, title: string}} config
   */
  constructor(map, infoPopup, config){
    super(map, infoPopup, config);
    this.toggleEl = document.getElementById(config.toggleId);
    this.legendEl = document.getElementById(config.legendId);
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  buildLayer(){
    return L.esri.tiledMapLayer({ url: this.config.url, opacity: 0.65, pane: groupPane(this.map, "cfem"), attribution: CFEM_HAZARD_ATTRIBUTION });
  }

  async updateLegend(){
    if(!this.isEnabled()){ this.legendEl.hidden = true; this.legendEl.innerHTML = ""; return; }
    const block = await renderImageLegendBlock(this.config.url, this.config.layerId, this.config.title);
    this.legendEl.innerHTML = "";
    this.legendEl.appendChild(block);
    this.legendEl.hidden = false;
  }

  init(){
    const swatchEl = document.querySelector(`[data-swatch="${this.config.swatch}"]`);
    if(swatchEl) setSwatch(swatchEl, this.config.color, false);
    this.toggleEl.addEventListener("change", () => this.refresh());
  }
}
