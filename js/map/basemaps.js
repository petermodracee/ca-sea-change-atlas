/**
 * Basemap selection: a greyscale default (OpenFreeMap "Positron") so the many
 * colourful overlays stand out, plus Humanitarian, standard OSM and satellite
 * options behind a core L.control.layers switcher. The user's pick is remembered.
 */

const STORAGE_KEY = "atlas.basemap";
const BASEMAP_PANE = "basemapPane"; // below Leaflet's tilePane (200) so overlays always sit above any basemap
const DEFAULT_BASEMAP = "Greyscale";

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const OPENFREEMAP_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const POSITRON_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Pinned, SRI-checked MapLibre GL JS (UMD build) + its Leaflet adapter. Loaded lazily, only when the greyscale basemap is used.
const MAPLIBRE_JS = {
  src: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js",
  integrity: "sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp"
};
const MAPLIBRE_CSS = {
  href: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css",
  integrity: "sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK"
};
const MAPLIBRE_LEAFLET_JS = {
  src: "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js",
  integrity: "sha384-tXYNKOHx4T02jMP7YYCtBxPIv1B5gaA5mcVPBzqMp6d7VzWzxJgI2aWF/nJLrQdS"
};

/** Injects a <script> and resolves once it has loaded. */
function loadScript({ src, integrity }){
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.integrity = integrity;
    el.crossOrigin = "";
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

/** Injects a stylesheet <link> (no need to wait for it). */
function loadStyle({ href, integrity }){
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = href;
  el.integrity = integrity;
  el.crossOrigin = "";
  document.head.appendChild(el);
}

let maplibrePromise = null;
/** Loads MapLibre GL + the Leaflet adapter once; later calls reuse the same promise. */
function loadMaplibre(){
  if(!maplibrePromise){
    maplibrePromise = (async () => {
      const canvas = document.createElement("canvas");
      if(!(canvas.getContext("webgl2") || canvas.getContext("webgl"))) throw new Error("WebGL unavailable");
      loadStyle(MAPLIBRE_CSS);
      await loadScript(MAPLIBRE_JS);
      await loadScript(MAPLIBRE_LEAFLET_JS);
    })();
    maplibrePromise.catch(() => { maplibrePromise = null; });
  }
  return maplibrePromise;
}

/** Standard OSM raster tiles, optionally desaturated via CSS (used as the greyscale fallback). */
function osmTileLayer(extraOptions = {}){
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, pane: BASEMAP_PANE, attribution: OSM_ATTRIBUTION, ...extraOptions
  });
}

/**
 * Greyscale basemap: OpenFreeMap Positron vector tiles rendered by MapLibre GL.
 * If WebGL, the scripts, or the style fetch fail, it falls back to OSM tiles
 * with a CSS greyscale filter so the map stays usable and muted.
 */
const GreyscaleBasemap = L.Layer.extend({
  onAdd(map){
    this._active = true;
    this._build(map);
  },

  onRemove(map){
    this._active = false;
    if(this._inner){ map.removeLayer(this._inner); this._inner = null; }
    map.attributionControl.removeAttribution(OPENFREEMAP_ATTRIBUTION);
  },

  async _build(map){
    let inner, isVector = false;
    try {
      await loadMaplibre();
      const response = await fetch(POSITRON_STYLE_URL);
      if(!response.ok) throw new Error(`Style request failed: ${response.status}`);
      // Passing the parsed style (not the URL) means a bad style is caught here instead of failing silently later.
      // Attribution is added to Leaflet's control by hand: the adapter only reads it from the style after Leaflet has already rendered the control.
      inner = L.maplibreGL({ style: await response.json(), pane: BASEMAP_PANE, attributionControl: false });
      isVector = true;
    } catch(err){
      console.warn("Greyscale vector basemap unavailable, using greyscale OSM tiles:", err);
      inner = osmTileLayer({ className: "basemap-grayscale" });
    }
    if(!this._active){ return; } // the user switched basemaps while we were loading
    this._inner = inner.addTo(map);
    if(isVector) map.attributionControl.addAttribution(OPENFREEMAP_ATTRIBUTION);
  }
});

/**
 * Adds the basemap switcher and the default basemap to the map.
 * Call once, before any overlay is added.
 */
export function initBasemaps(map){
  map.createPane(BASEMAP_PANE).style.zIndex = 150;

  const basemaps = {
    "Greyscale": new GreyscaleBasemap(),
    "Humanitarian": L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 19, pane: BASEMAP_PANE,
      attribution: OSM_ATTRIBUTION + ', Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noopener">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank" rel="noopener">OpenStreetMap France</a>'
    }),
    "Standard OSM": osmTileLayer(),
    "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, pane: BASEMAP_PANE,
      attribution: 'Imagery &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community'
    })
  };

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch(err){ /* storage blocked — use the default */ }
  const initial = basemaps[saved] ? saved : DEFAULT_BASEMAP;

  basemaps[initial].addTo(map);
  L.control.layers(basemaps, null, { position: "topright", collapsed: true }).addTo(map);

  map.on("baselayerchange", e => {
    try { localStorage.setItem(STORAGE_KEY, e.name); } catch(err){ /* not critical */ }
  });
}
