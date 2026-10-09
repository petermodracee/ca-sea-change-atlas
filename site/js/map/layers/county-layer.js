import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { cachedFetch } from "../shared/request-cache.js";

// --- County boundaries -------------------------------------------------------
// Census TIGERweb State_County MapServer (public domain, CORS-open; see docs/DECISIONS.md).
// The county sublayers are banded by display scale (1, 3, 5, 7, ... 13, each with its own
// generalization). Layer 7 holds the geometry that suits a regional view, and /query
// ignores a layer's display-scale band, so one statewide query serves every zoom.
// The boundary geometry, which also gives the zoom-to bounds, is fetched live; nothing is stored here.
const TIGERWEB_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer";
const COUNTY_LAYER_ID = 7;
const CALIFORNIA_STATE_FIPS = "06";
const GENERALIZE_DEGREES = 0.001; // about 100 m; keeps the statewide response near 330 KB
const FIT_PADDING_PX = 20;
const TIGERWEB_ATTRIBUTION = 'County boundaries: <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html" target="_blank" rel="noopener">U.S. Census Bureau TIGERweb</a>';
export const COUNTY_COLOR = "#7A4F2B";

// Each line is drawn twice, a pale halo under a dark stroke, so it reads on the greyscale,
// street and imagery basemaps and under or over the flood colours.
const OTHER_STYLE = { halo: { color: "#fff", weight: 3.5, opacity: 0.75 }, line: { color: "#5B4636", weight: 1, opacity: 0.8 } };
const SELECTED_STYLE = { halo: { color: "#fff", weight: 7.5, opacity: 0.9 }, line: { color: "#3E2410", weight: 3.5, opacity: 1 } };

const query = params => `${TIGERWEB_URL}/${COUNTY_LAYER_ID}/query?${new URLSearchParams({ f: "json", outSR: "4326", ...params })}`;

/** Planar area of a ring of [lng, lat] points (shoelace); only used to rank a county's parts against each other. */
function ringArea(ring){
  let sum = 0;
  for(let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum) / 2;
}

/** Leaflet bounds of the largest part of a Polygon or MultiPolygon, so offshore islands don't zoom the fit out. */
function largestPartBounds(geometry){
  const parts = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const outer = parts.map(part => part[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];
  return L.latLngBounds(outer.map(([lng, lat]) => [lat, lng]));
}

/** The county boundary lines, plus the "Zoom to county" select that fits the map to a county's mainland. */
export class CountyLayer extends BaseLayer {
  /**
   * @param {L.Map} map
   * @param {object} infoPopup
   * @param {{view: object|null}} permalink - the parsed link; a county with no `map=` view fits the map at load.
   */
  constructor(map, infoPopup, permalink){
    super(map, infoPopup);
    this.permalink = permalink;
    this.toggleEl = document.getElementById("countyToggle");
    this.selectEl = document.getElementById("countySelect");
    this.resultEl = document.getElementById("countyResult");
    this.features = null; // statewide GeoJSON features, fetched once per page session
    this.fitToken = 0;
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  selectedFips(){
    return this.selectEl.value;
  }

  /** Fetches the statewide county polygons (memoized per session). */
  loadFeatures(){
    const url = query({
      where: `STATE='${CALIFORNIA_STATE_FIPS}'`, outFields: "GEOID", returnGeometry: "true",
      maxAllowableOffset: String(GENERALIZE_DEGREES), geometryPrecision: "4", f: "geojson"
    });
    return cachedFetch(url, res => res.json()).then(fc => {
      if(!fc.features || !fc.features.length) throw new Error("No counties returned");
      return fc.features;
    });
  }

  buildLayer(){
    const group = L.layerGroup();
    group.options = { pane: groupPane(this.map, "county") }; // lets the loading indicator track this group
    group.getAttribution = () => TIGERWEB_ATTRIBUTION;
    this.loadFeatures().then(features => {
      if(this.layer !== group) return; // toggled off, or rebuilt, while loading
      this.resultEl.textContent = "";
      this.draw(group, features);
    }).catch(() => {
      if(this.layer === group) this.resultEl.textContent = "Couldn't load county boundaries from the Census Bureau.";
    });
    group.on("add", () => { group._loading = true; group.fire("loading"); });
    return group;
  }

  /** Draws every county thin, then the selected one (if any) strong, each as halo plus stroke. */
  draw(group, features){
    const pane = groupPane(this.map, "county");
    const fips = this.selectedFips();
    const isSelected = f => f.properties.GEOID === fips;
    const add = (filter, style) => group.addLayer(L.geoJSON(features, { filter, pane, interactive: false, style: () => ({ ...style, fill: false }) }));
    const others = f => !isSelected(f);
    add(others, OTHER_STYLE.halo);
    add(others, OTHER_STYLE.line);
    if(fips){
      add(isSelected, SELECTED_STYLE.halo);
      add(isSelected, SELECTED_STYLE.line);
    }
    group._loading = false;
    group.fire("load");
  }

  /** Re-draws the lines after the selected county changes. */
  restyle(){
    if(!this.layer) return;
    this.loadFeatures().then(features => {
      if(!this.layer) return;
      this.layer.clearLayers();
      this.draw(this.layer, features);
    }).catch(() => {});
  }

  /** Fits the map to the mainland (largest polygon part) of a county, from the geometry already fetched for the lines. */
  async fit(fips, { animate = true } = {}){
    const token = ++this.fitToken;
    try{
      const features = await this.loadFeatures();
      if(token !== this.fitToken) return; // a newer choice superseded this one
      const feature = features.find(f => f.properties.GEOID === fips);
      if(!feature) throw new Error("County not found");
      this.resultEl.textContent = "";
      this.map.fitBounds(largestPartBounds(feature.geometry), { padding: [FIT_PADDING_PX, FIT_PADDING_PX], animate });
    }catch(err){
      if(token === this.fitToken) this.resultEl.textContent = "Couldn't load that county's outline from the Census Bureau.";
    }
  }

  init(){
    this.applySwatch('[data-swatch="county"]', COUNTY_COLOR, false);
    this.toggleEl.addEventListener("change", () => this.refresh());
    this.selectEl.addEventListener("change", () => {
      if(this.selectedFips()) this.fit(this.selectedFips());
      this.restyle();
    });
    // A link carrying a county but no map view means "show me this county"; an explicit view wins.
    if(this.selectedFips() && !this.permalink.view) this.fit(this.selectedFips(), { animate: false });
  }
}
