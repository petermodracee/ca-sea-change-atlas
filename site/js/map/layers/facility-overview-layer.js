import { cachedFetch } from "../shared/request-cache.js";

// --- Critical facilities: heat overview ---------------------------------------
// At zoom 11 and closer the facilities are individual circle markers (geo-info-layer.js).
// Further out, this layer draws a density heat map instead, from the same four USGS Structures
// layers, queried live for the padded viewport (geometry only) and paged until the server stops
// reporting an exceeded transfer limit. Nothing is stored beyond the per-session request cache.
//   zoom >= FACILITY_MARKER_MIN_ZOOM                         markers only (this layer draws nothing)
//   FACILITY_HEAT_MIN_ZOOM <= zoom < FACILITY_MARKER_MIN_ZOOM  heat overview
//   zoom < FACILITY_HEAT_MIN_ZOOM                             status line only
export const FACILITY_MARKER_MIN_ZOOM = 11;
export const FACILITY_HEAT_MIN_ZOOM = 8;
const PAGE_SIZE = 2000; // the service's maxRecordCount
const MAX_PAGES_PER_LAYER = 6; // 12,000 facilities of one type; past this the overview is flagged as partial
const VIEW_PADDING = 0.25; // fraction of the viewport to load beyond each edge, so small pans don't refetch
export const FACILITY_HEAT_GRADIENT = { 0.2: "#FFF7BC", 0.45: "#FEC44F", 0.7: "#EC7014", 1: "#8C2D04" };
const HEAT_OPTIONS = { radius: 7, blur: 9, max: 2.2, maxZoom: FACILITY_MARKER_MIN_ZOOM, minOpacity: 0.3, gradient: FACILITY_HEAT_GRADIENT };

export const STATUS_ZOOM_IN = "Zoom in to see facilities";
const STATUS_PARTIAL = "So many facilities are in view that the overview is partial. Zoom in for complete data.";
const STATUS_FAILED = "Some facility data could not be loaded; pan or zoom to retry.";
const STATUS_NO_PLUGIN = "The heat overview could not load; zoom in to see facilities.";

/** `L.HeatLayer` (leaflet.heat) always appends its canvas to the overlay pane; this puts it in `options.pane` so group opacity, Hide and bring-to-front apply. */
function createHeatLayer(pane){
  if(!L.HeatLayer) return null;
  const PaneHeatLayer = L.HeatLayer.extend({
    onAdd(map){
      L.HeatLayer.prototype.onAdd.call(this, map);
      map.on("resize", this._reset, this); // a map that loaded at zero size (hidden tab) redraws once it has one
      this._canvas.setAttribute("aria-hidden", "true"); // a picture of density; the legend and status line carry the text
      map.getPane(this.options.pane).appendChild(this._canvas); // moves it out of the overlay pane
    },
    onRemove(map){
      this._canvas.remove();
      map.off("moveend", this._reset, this);
      map.off("resize", this._reset, this);
      if(map.options.zoomAnimation) map.off("zoomanim", this._animateZoom, this);
    },
    _redraw(){
      this._frame = null;
      // getImageData throws on a zero-size canvas (the map loaded in a hidden tab); the resize handler redraws later.
      if(this._map && this._canvas.width > 0 && this._canvas.height > 0) L.HeatLayer.prototype._redraw.call(this);
    }
  });
  return new PaneHeatLayer([], { ...HEAT_OPTIONS, pane });
}

/** Snaps a lat/lng box outward to half a tile at this zoom, so nearby viewports share cache keys. */
function snapBounds(bounds, zoom){
  const step = 180 / Math.pow(2, zoom);
  const down = v => Math.floor(v / step) * step;
  const up = v => Math.ceil(v / step) * step;
  const round = v => Number(v.toFixed(6));
  return { south: round(down(bounds.getSouth())), west: round(down(bounds.getWest())), north: round(up(bounds.getNorth())), east: round(up(bounds.getEast())) };
}

/** Parses one page into a compact [lat, lng, ...] array, so the session cache holds numbers rather than whole responses. */
async function parsePage(res){
  const json = await res.json();
  if(json.error || !json.features) throw new Error("Structures query failed");
  const coords = new Float32Array(json.features.length * 2);
  json.features.forEach((f, i) => { coords[2 * i] = f.geometry.y; coords[2 * i + 1] = f.geometry.x; });
  return { coords, exceeded: Boolean(json.exceededTransferLimit) };
}

/** Facility density heat map for zoom FACILITY_HEAT_MIN_ZOOM up to FACILITY_MARKER_MIN_ZOOM, with a status line below that. Add it next to the marker layers. */
export class FacilityOverviewLayer extends L.Layer {
  /**
   * @param {{pane: string, serviceUrl: string, layerIds: number[], onStatus: (text: string) => void}} options
   */
  constructor(options){
    super();
    this.options = { pane: options.pane };
    this.serviceUrl = options.serviceUrl;
    this.layerIds = options.layerIds;
    this.onStatus = options.onStatus;
    this.heat = null;
    this.loadedBounds = null;
    this.token = 0;
  }

  onAdd(map){
    this.heat = createHeatLayer(this.options.pane);
    if(this.heat) this.heat.addTo(map);
    map.on("moveend", this.update, this);
    this.update();
  }

  onRemove(map){
    map.off("moveend", this.update, this);
    this.cancel();
    if(this.heat) map.removeLayer(this.heat);
    this.heat = null;
    this.loadedBounds = null;
    this.onStatus("");
  }

  /** Invalidates any request in flight and clears the loading state. */
  cancel(){
    this.token++;
    if(this._loading){ this._loading = false; this.fire("load"); }
  }

  showPoints(latlngs){
    if(this.heat) this.heat.setLatLngs(latlngs);
  }

  update(){
    const zoom = this._map.getZoom();
    if(zoom >= FACILITY_MARKER_MIN_ZOOM || zoom < FACILITY_HEAT_MIN_ZOOM){
      this.cancel();
      this.showPoints([]);
      this.loadedBounds = null;
      this.onStatus(zoom < FACILITY_HEAT_MIN_ZOOM ? STATUS_ZOOM_IN : "");
      return;
    }
    if(!this.heat){ this.onStatus(STATUS_NO_PLUGIN); return; }
    const view = this._map.getBounds();
    if(this.loadedBounds && this.loadedBounds.contains(view)) return; // data for this area is already drawn
    this.load(snapBounds(view.pad(VIEW_PADDING), zoom));
  }

  async load(box){
    const token = ++this.token;
    this._loading = true;
    this.fire("loading");
    const results = await Promise.all(this.layerIds.map(id => this.fetchAll(id, box, token)));
    if(token !== this.token) return; // panned or zoomed again, or switched off, meanwhile
    this._loading = false;
    this.fire("load");
    const latlngs = [];
    results.forEach(({ coords }) => { for(let i = 0; i < coords.length; i += 2) latlngs.push([coords[i], coords[i + 1]]); });
    this.showPoints(latlngs);
    const failed = results.some(r => r.failed);
    const capped = results.some(r => r.capped);
    this.onStatus(failed ? STATUS_FAILED : capped ? STATUS_PARTIAL : "");
    this.loadedBounds = failed ? null : L.latLngBounds([box.south, box.west], [box.north, box.east]);
  }

  /** All facilities of one USGS Structures layer inside the box, paged with resultOffset. */
  async fetchAll(layerId, box, token){
    const chunks = [];
    let offset = 0, capped = false;
    try{
      for(let page = 0; ; page++){
        if(page === MAX_PAGES_PER_LAYER){ capped = true; break; }
        const result = await cachedFetch(this.pageUrl(layerId, box, offset), parsePage);
        if(token !== this.token) return { coords: new Float32Array(0) };
        chunks.push(result.coords);
        if(!result.exceeded) break;
        offset += PAGE_SIZE;
      }
    }catch(err){
      return { coords: new Float32Array(0), failed: true };
    }
    const coords = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    chunks.forEach(c => { coords.set(c, at); at += c.length; });
    return { coords, capped };
  }

  pageUrl(layerId, box, offset){
    const params = new URLSearchParams({
      f: "json", where: "1=1", geometry: `${box.west},${box.south},${box.east},${box.north}`,
      geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
      returnGeometry: "true", outFields: "OBJECTID", outSR: "4326", geometryPrecision: "4",
      orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: String(PAGE_SIZE)
    });
    return `${this.serviceUrl}/${layerId}/query?${params}`;
  }
}
