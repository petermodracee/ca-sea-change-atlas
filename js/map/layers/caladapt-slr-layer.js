import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { renderSwatchLegendBlock } from "../shared/legend.js";

// --- Cal-Adapt: Sea Level Rise – Coastal Inundation Scenarios (SLR-CIS) ------
// Confirmed directly against the live tool (cmip5.cal-adapt.org/tools/slr-coastal-inundation/,
// its network traffic and its own JS chunk). It is NOT an ArcGIS REST service and
// does NOT call CNRA's gis.cnra.ca.gov `CSMW_Sea_Level_Rise` MapServer — that
// service is a separate, older (Third Assessment-era, ESA/PWA) dataset, so it
// isn't used here. The tool draws pre-rendered XYZ raster tiles from Cal-Adapt's
// own API, `https://api.cal-adapt.org/tiles/{slug}/{z}/{x}/{y}.png?style=...`,
// where each `slug` is one "rstore" (raster mosaic) from the API's
// `/api/rstores/` listing (72 in total; the tool's own metadata calls confirm the
// naming below). Two independent models, exactly as the real tool shows them
// together with a per-model checklist, so this is one combined layer group:
//   - CoSMoS: eight regional mosaics (`cosmosflooding_{period}_{scenario}_mosaic_{region}`)
//   - CalFloD3D-TFS: three 5 m regional mosaics (LA, SD, SF Bay) plus one 50 m statewide mosaic
// `period` is 2020-2040 or 2080-2100 and `scenario` is min / med / max, the
// same three-way pickers the tool has. Tile colors come from the tool's own
// `rsgreen` (CoSMoS) and `rsblue` (CalFloD3D-TFS) styles; the depth-colormap
// default style isn't a documented scale, so it isn't offered.
//
// Caching: unlike BCDC's server, these tiles come back with
// `Cache-Control: max-age=31536000` and `Access-Control-Allow-Origin: *`
// (confirmed on the response headers), so the browser's own HTTP cache already
// does what the shared per-session cache does for BCDC/Esri sources — this
// module deliberately doesn't route tiles through `cachedFetch`.
//
// Tiles outside a mosaic's footprint return 404, so each tile layer is clipped to
// its mosaic's lat/lng bounds (the union of that region's footprint across all
// scenarios, from each rstore's `geom`).
const TILE_BASE = "https://api.cal-adapt.org/tiles";
const MAX_NATIVE_ZOOM = 18; // tiles verified present through z18
const ATTRIBUTION = 'Flood data: <a href="https://cmip5.cal-adapt.org/tools/slr-coastal-inundation/" target="_blank" rel="noopener">Cal-Adapt SLR–Coastal Inundation Scenarios</a> (CoSMoS &amp; CalFloD3D-TFS)';
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Regional mosaic footprints as [south, west, north, east].
const MODELS = {
  cosmos: {
    label: "CoSMoS", style: "rsgreen", color: "#5DFA25",
    regions: [
      { id: "ci", bounds: [32.743, -120.475, 34.137, -118.229] },
      { id: "la", bounds: [33.267, -118.996, 34.14, -117.523] },
      { id: "mt", bounds: [35.76, -122.361, 37.138, -121.306] },
      { id: "nc", bounds: [37.811, -124.135, 40.006, -122.329] },
      { id: "sb", bounds: [33.902, -120.775, 35.085, -118.882] },
      { id: "sd", bounds: [32.495, -117.707, 33.45, -116.977] },
      { id: "sf", bounds: [36.888, -123.633, 38.864, -121.164] },
      { id: "sl", bounds: [34.973, -121.434, 35.81, -120.552] }
    ],
    slug: (period, scenario, region) => `cosmosflooding_${period}_${scenario}_mosaic_${region.id}`
  },
  calflod5m: {
    label: "CalFloD3D-TFS (5 m)", style: "rsblue", color: "#25C7FA",
    regions: [
      { id: "la", bounds: [33.698, -118.305, 33.843, -118.112] },
      { id: "sd", bounds: [32.645, -117.3, 32.814, -117.124] },
      { id: "sf", bounds: [37.566, -122.436, 38.083, -122.02] }
    ],
    slug: (period, scenario, region) => `calflod3dtfs_5m_${period}_${scenario}_mosaic_${region.id}`
  },
  calflod50m: {
    label: "CalFloD3D-TFS (50 m)", style: "rsblue", color: "#25C7FA",
    regions: [{ id: "ca", bounds: [32.499, -124.529, 42.055, -116.658] }],
    slug: (period, scenario) => `calflod3dtfs_50m_${period}_${scenario}_mosaic`
  }
};
const PERIODS = { "2020-2040": "2020–2040", "2080-2100": "2080–2100" };
const SCENARIOS = { min: "minimum", med: "median", max: "maximum" };

/** The XYZ tile (x, y) containing a lat/lng at zoom z, plus the pixel offset inside that 256px tile. */
function tileAt(latlng, z){
  const p = L.CRS.EPSG3857.latLngToPoint(latlng, z);
  const x = Math.floor(p.x / 256), y = Math.floor(p.y / 256);
  return { x, y, px: Math.floor(p.x - x * 256), py: Math.floor(p.y - y * 256) };
}

/**
 * The Cal-Adapt SLR-CIS group: a checklist of the tool's three model layers
 * (they can be shown together to see where the models agree), plus its time
 * period and flood-scenario pickers. Manages several tile layers at once (one
 * per regional mosaic of each checked model), grouped in a single L.layerGroup
 * as `this.layer`. Click-to-inspect samples the rendered tile's alpha channel,
 * since the service exposes no per-point value query.
 */
export class CalAdaptSlrLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.modelEls = document.querySelectorAll("[data-caladapt-model]");
    this.periodEl = document.getElementById("caladaptPeriod");
    this.scenarioEl = document.getElementById("caladaptScenario");
    this.resultEl = document.getElementById("caladaptResult");
    this.legendEl = document.getElementById("caladaptLegend");
  }

  isEnabled(){
    return this.checkedModels().length > 0;
  }

  checkedModels(){
    return [...this.modelEls].filter(cb => cb.checked).map(cb => cb.dataset.caladaptModel);
  }

  tileUrl(modelId, region, z, x, y){
    const m = MODELS[modelId];
    return `${TILE_BASE}/${m.slug(this.periodEl.value, this.scenarioEl.value, region)}/${z}/${x}/${y}.png?style=${m.style}`;
  }

  buildLayer(){
    const group = L.layerGroup();
    this.checkedModels().forEach(modelId => {
      const m = MODELS[modelId];
      m.regions.forEach(region => {
        const slug = m.slug(this.periodEl.value, this.scenarioEl.value, region);
        group.addLayer(L.tileLayer(`${TILE_BASE}/${slug}/{z}/{x}/{y}.png?style=${m.style}`, {
          bounds: L.latLngBounds([region.bounds[0], region.bounds[1]], [region.bounds[2], region.bounds[3]]),
          maxNativeZoom: MAX_NATIVE_ZOOM,
          opacity: 0.75,
          errorTileUrl: TRANSPARENT_PIXEL, // a tile inside the bounding box but outside the mosaic's real footprint 404s
          pane: groupPane(this.map, "calAdapt"),
          attribution: ATTRIBUTION
        }));
      });
    });
    return group;
  }

  refresh(){
    this.resultEl.textContent = `Showing: ${SCENARIOS[this.scenarioEl.value]} flood scenario for ${PERIODS[this.periodEl.value]}, near-100-year storm.`;
    super.refresh();
  }

  updateLegend(){
    this.legendEl.innerHTML = "";
    const models = this.checkedModels();
    this.legendEl.hidden = models.length === 0;
    if(!models.length) return;
    this.legendEl.appendChild(renderSwatchLegendBlock({
      label: "Modeled flood extent",
      colors: models.map(id => MODELS[id].color),
      labels: models.map(id => MODELS[id].label)
    }));
  }

  init(){
    Object.entries(MODELS).forEach(([id, m]) => this.applySwatch(`[data-swatch="caladapt-${id}"]`, m.color, false));
    this.modelEls.forEach(cb => cb.addEventListener("change", () => this.refresh()));
    this.periodEl.addEventListener("change", () => this.refresh());
    this.scenarioEl.addEventListener("change", () => this.refresh());
    this.resultEl.textContent = `Showing: ${SCENARIOS[this.scenarioEl.value]} flood scenario for ${PERIODS[this.periodEl.value]}, near-100-year storm.`;
    this.updateLegend();
    this.registerPopupProvider(latlng => this.identify(latlng));
  }

  /** Alpha of the rendered tile pixel under `latlng`, or null if the mosaic doesn't cover it (404). */
  async sampleTile(modelId, region, latlng){
    const z = Math.min(Math.round(this.map.getZoom()), MAX_NATIVE_ZOOM);
    const t = tileAt(latlng, z);
    const res = await fetch(this.tileUrl(modelId, region, z, t.x, t.y));
    if(!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(t.px, t.py, 1, 1).data[3];
  }

  async identify(latlng){
    const models = this.checkedModels();
    if(!models.length) return null;
    const rows = [];
    for(const modelId of models){
      const m = MODELS[modelId];
      const regions = m.regions.filter(r => L.latLngBounds([r.bounds[0], r.bounds[1]], [r.bounds[2], r.bounds[3]]).contains(latlng));
      if(!regions.length) continue; // outside this model's coverage: say nothing about it
      const alphas = (await Promise.all(regions.map(r => this.sampleTile(modelId, r, latlng).catch(() => null)))).filter(a => a !== null);
      if(!alphas.length) continue;
      rows.push({ label: m.label, value: alphas.some(a => a > 0) ? "In modeled flood extent" : "Not in modeled flood extent" });
    }
    if(!rows.length) return null;
    return {
      title: `Cal-Adapt SLR-CIS — ${SCENARIOS[this.scenarioEl.value]}, ${PERIODS[this.periodEl.value]}`,
      rows,
      note: "Extent only — the service offers no per-point depth value."
    };
  }
}
