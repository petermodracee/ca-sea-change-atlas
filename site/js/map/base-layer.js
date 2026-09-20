/**
 * Common lifecycle for a single map "layer group" as shown in the layer
 * panel: a checkbox (or similar toggle) that adds/removes one Leaflet
 * layer, optionally with a legend and/or a click-to-inspect popup
 * provider.
 *
 * Most layer groups on this map have exactly one active Leaflet layer at
 * a time (NOAA SLR/HTF, FEMA, CFEM, regions, ...) and fit the default
 * refresh()/enable()/disable() lifecycle below as-is: buildLayer() is the
 * only thing a subclass must implement.
 *
 * A couple of layer groups (BCDC, CoSMoS) manage several sublayers at
 * once instead of one `this.layer` — those subclasses override refresh()
 * entirely and keep their own collection field instead of using
 * buildLayer()/this.layer. That's an intentional, documented exception
 * to the default shape here, not a workaround.
 */
import { setSwatch } from "./shared/dom.js";

export class BaseLayer {
  /**
   * @param {L.Map} map - the shared Leaflet map instance.
   * @param {{registerProvider: Function}} infoPopup - shared click-to-inspect
   *   popup controller from info-popup.js.
   * @param {object} [config] - subclass-specific static config (URLs, colors, ...).
   */
  constructor(map, infoPopup, config = {}){
    this.map = map;
    this.infoPopup = infoPopup;
    this.config = config;
    this.layer = null; // the single active Leaflet layer, for single-sublayer subclasses
  }

  /**
   * Wire up DOM listeners and any initial state. Subclasses call
   * this.refresh() themselves wherever an initial-state render is needed
   * (checkbox already checked on load, etc.) — init() doesn't assume that
   * for every subclass.
   */
  init(){}

  /** Whether this layer group's toggle is currently "on". Default: no toggle, always off. */
  isEnabled(){
    return false;
  }

  /**
   * Build and return a new Leaflet layer instance for the current state.
   * Must be implemented by single-sublayer subclasses; not used by
   * subclasses that override refresh() directly.
   * @returns {L.Layer}
   */
  buildLayer(){
    throw new Error("buildLayer() must be implemented by BaseLayer subclasses that use the default refresh()");
  }

  /**
   * Default single-sublayer lifecycle: tear down the old layer (if any),
   * and if the toggle is on, build and add a new one. Subclasses managing
   * multiple sublayers (BCDC, CoSMoS) override this instead of buildLayer().
   */
  refresh(){
    if(this.layer){
      this.map.removeLayer(this.layer);
      this.layer = null;
    }
    if(!this.isEnabled()){
      this.updateLegend();
      return;
    }
    this.layer = this.buildLayer();
    this.layer.addTo(this.map);
    this.updateLegend();
  }

  /** Colors a legend swatch element in the layer panel. */
  applySwatch(selector, color, dashed){
    const el = document.querySelector(selector);
    if(el) setSwatch(el, color, dashed);
  }

  /** Registers a click-to-inspect popup provider with the shared info popup. */
  registerPopupProvider(fn){
    this.infoPopup.registerProvider(fn);
  }

  /** Optional hook: update this layer group's legend UI. No-op by default. */
  updateLegend(){}
}
