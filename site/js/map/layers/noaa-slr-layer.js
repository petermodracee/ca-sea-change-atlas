import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { renderImageLegendBlock } from "../shared/legend.js";
import { tilePixel } from "../shared/tile-pixel.js";

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
const NOAA_SLR_MAX_NATIVE_ZOOM = 19; // the tile cache's last level
// Low-lying areas not connected to the ocean are drawn solid bright green (85, 255, 0); connected flooding is
// a violet-blue (deep) to pale cyan (shallow) ramp; anything else is transparent. The popup reads the tile pixel.
const isLowLyingGreen = ({ r, g, b }) => g > 200 && r < 140 && b < 80;

/** One `L.esri.tiledMapLayer` scenario at a time, swapped by the SLR-amount slider; also registers a low-lying-area identify popup provider. */
export class NoaaSlrLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.getElementById("noaaSlrToggle");
    this.sliderEl = document.getElementById("noaaSlrSlider");
    this.valueEl = document.getElementById("noaaSlrValue");
    this.resultEl = document.getElementById("noaaSlrResult");
    this.legendEl = document.getElementById("noaaSlrLegend");
  }

  /** Legend for the current scenario's service: the green low-lying areas (layer 0) and the depth ramp (layer 1). */
  async updateLegend(){
    if(!this.isEnabled()){ this.legendEl.hidden = true; this.legendEl.innerHTML = ""; return; }
    const { url } = this.currentScenario();
    const [lowLying, depth] = await Promise.all([
      renderImageLegendBlock(url, 0, "", ["Low-lying areas (not connected to the ocean)"]),
      renderImageLegendBlock(url, 1, "", ["Flood depth, deep to shallow"])
    ]).catch(() => []);
    if(!this.isEnabled() || url !== this.currentScenario().url) return; // toggled off or slid on while the legend loaded
    if(!lowLying){ this.legendEl.hidden = true; return; }
    this.legendEl.innerHTML = "";
    this.legendEl.append(lowLying, depth);
    this.legendEl.hidden = false;
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
      pane: groupPane(this.map, "noaaSlr"),
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
    // No default is set here: index.njk's value="6" (3 ft) is the default, and a shared link may already have restored another value.

    this.toggleEl.addEventListener("change", () => this.refresh());
    this.sliderEl.addEventListener("input", () => this.refresh());

    const scenario = this.currentScenario();
    this.valueEl.textContent = scenario.label;
    this.resultEl.textContent = `Showing: ${scenario.label} of sea level rise.`;

    this.registerPopupProvider(latlng => this.identify(latlng));
  }

  /**
   * Click-to-inspect by reading the rendered tile pixel under the click. The services' vector layer 0 can't be
   * used (its polygons are huge dissolved shapes that contain dry land too) and identify on the depth raster
   * returns nothing; see docs/DECISIONS.md.
   */
  async identify(latlng){
    if(!this.isEnabled()) return null;
    const scenario = this.currentScenario();
    const title = `NOAA SLR Viewer — ${scenario.label}`;
    const z = Math.min(this.map.getZoom(), NOAA_SLR_MAX_NATIVE_ZOOM);
    const point = this.map.project(latlng, z);
    const x = Math.floor(point.x / 256), y = Math.floor(point.y / 256);
    const pixel = await tilePixel(`${scenario.url}/tile/${z}/${y}/${x}`, Math.floor(point.x - x * 256), Math.floor(point.y - y * 256));
    if(!pixel) return null;
    if(pixel.a < 16) return { title, note: "Not mapped as flooded or low-lying at this sea level." };
    if(isLowLyingGreen(pixel)) return { title, note: "Low-lying area (green), not connected to the ocean at this sea level." };
    return { title, note: "Flooded at this sea level (blue): connected to the ocean. This includes open water such as the Bay. Darker violet is deeper." };
  }
}
