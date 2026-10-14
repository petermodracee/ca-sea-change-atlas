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
// The counties County Profiles covers (NOAA Coastal County Snapshots' California list). Only these are fetched and drawn.
// Keep in step with the County Profiles spine and with the options in site/_includes/map-panel.njk: County Profiles links set the select.
export const PROFILE_COUNTY_FIPS = ["06001", "06013", "06015", "06023", "06033", "06037", "06041", "06045", "06053", "06055", "06059", "06067", "06069", "06073", "06075", "06077", "06079", "06081", "06083", "06085", "06087", "06095", "06097", "06101", "06105", "06111", "06113"];
const GENERALIZE_DEGREES = 0.001; // about 100 m; keeps the statewide response near 330 KB
const FIT_PADDING_PX = 20;
const TIGERWEB_ATTRIBUTION = 'County boundaries: <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html" target="_blank" rel="noopener">U.S. Census Bureau TIGERweb</a>';
export const COUNTY_COLOR = "#7A4F2B";

// Each line is drawn twice, a pale halo under a dark stroke, so it reads on the greyscale,
// street and imagery basemaps and under or over the flood colours.
const OTHER_STYLE = { halo: { color: "#fff", weight: 3.5, opacity: 0.75 }, line: { color: "#5B4636", weight: 1, opacity: 0.8 } };
const SELECTED_STYLE = { halo: { color: "#fff", weight: 7.5, opacity: 0.9 }, line: { color: "#3E2410", weight: 3.5, opacity: 1 } };

const query = params => `${TIGERWEB_URL}/${COUNTY_LAYER_ID}/query?${new URLSearchParams({ f: "json", outSR: "4326", ...params })}`;

/** Resolves once the map container has a non-zero size (it has none when the page loads in a hidden or background tab). */
function whenSized(map){
  const sized = () => { const size = map.getSize(); return size.x > 0 && size.y > 0; };
  if(sized()) return Promise.resolve();
  return new Promise(resolve => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if(!sized()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(map.getContainer());
  });
}

/** Whether [lng, lat] is inside a GeoJSON Polygon's rings (outer ring minus holes), by ray casting. */
function inPolygon(lng, lat, rings){
  let inside = false;
  rings.forEach(ring => {
    for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
  });
  return inside;
}

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

/** The County Profiles county boundary lines, plus the "Highlight county" select that highlights a county and fits the map to its mainland. */
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
        this.fitToken = 0;
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  selectedFips(){
    return this.selectEl.value;
  }

  /** Fetches the 27 profile counties' polygons (memoized per session). */
  loadFeatures(){
    const url = query({
      where: `GEOID IN (${PROFILE_COUNTY_FIPS.map(f => `'${f}'`).join(",")})`, outFields: "GEOID,NAME", returnGeometry: "true",
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
      await whenSized(this.map); // fitBounds on a zero-size map would pick the maximum zoom
      if(token !== this.fitToken) return;
      const feature = features.find(f => f.properties.GEOID === fips);
      if(!feature) throw new Error("County not found");
      this.resultEl.textContent = "";
      this.map.fitBounds(largestPartBounds(feature.geometry), { padding: [FIT_PADDING_PX, FIT_PADDING_PX], animate });
    }catch(err){
      if(token === this.fitToken) this.resultEl.textContent = "Couldn't load that county's outline from the Census Bureau.";
    }
  }

  /** Click popup section naming the county under the click, from the polygons already loaded for the lines. */
  async identify(latlng){
    if(!this.isEnabled()) return null;
    const features = await this.loadFeatures().catch(() => null);
    if(!features) return null;
    const hit = features.find(f => {
      const parts = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      return parts.some(rings => inPolygon(latlng.lng, latlng.lat, rings));
    });
    return hit ? { title: "County (Census boundary)", rows: [{ label: "Name", value: hit.properties.NAME }] } : null;
  }

  init(){
    this.registerPopupProvider(latlng => this.identify(latlng)); // registered first, so this is the popup's first section
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
