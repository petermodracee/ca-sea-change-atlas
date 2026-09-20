import { BaseLayer } from "../base-layer.js";

// --- NOAA High Tide Flooding stations ---------------------------------------
// The real area-based "High Tide Flooding" / flood-frequency layer NOAA's
// own SLR Viewer shows (`dc_slr/Flood_Frequency`) requires an ArcGIS
// token this project has no way to obtain (confirmed directly — the
// service returns "Token Required" even on every public mirror
// subdomain). The one publicly reachable service with "High Tide
// Flooding" in its name (`FloodExposureMapper/CFEM_HighTideFlooding`) is
// essentially empty — confirmed directly: only 2 features total in the
// whole layer, neither in California, neither even a coastal county.
// `dc_slr/Point_Layers` sublayer 1 ("High Tide Flooding Stations") is the
// real, public, substantive alternative: NOAA CO-OPS tide-gauge stations
// with their minor/moderate/major flood thresholds (confirmed 12
// California stations). It's point data, not an area layer, and
// deliberately not tied to the SLR amount slider — these thresholds are
// today's, not a future scenario.
const NOAA_HTF_URL = "https://coast.noaa.gov/arcgis/rest/services/dc_slr/Point_Layers/MapServer";
const NOAA_HTF_LAYER_ID = 1;
const NOAA_HTF_COLOR = "#E8A33D";
const NOAA_HTF_ATTRIBUTION = 'High tide flooding stations: <a href="https://coast.noaa.gov/slr/" target="_blank" rel="noopener">NOAA Office for Coastal Management</a>';

/** NOAA CO-OPS tide-gauge stations as circle markers, with a nearest-station identify popup provider. */
export class NoaaHtfLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.getElementById("noaaHtfToggle");
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  buildLayer(){
    return L.esri.featureLayer({
      url: `${NOAA_HTF_URL}/${NOAA_HTF_LAYER_ID}`,
      pointToLayer: (geojson, latlng) => L.circleMarker(latlng, {
        radius: 6, color: "#7A5417", weight: 1.5, fillColor: NOAA_HTF_COLOR, fillOpacity: 0.9
      }),
      attribution: NOAA_HTF_ATTRIBUTION
    });
  }

  init(){
    this.applySwatch('[data-swatch="noaa-htf"]', NOAA_HTF_COLOR, false);
    this.toggleEl.addEventListener("change", () => this.refresh());
    this.registerPopupProvider(latlng => this.identify(latlng));
  }

  identify(latlng){
    if(!this.isEnabled()) return Promise.resolve(null);
    return new Promise(resolve => {
      L.esri.query({ url: `${NOAA_HTF_URL}/${NOAA_HTF_LAYER_ID}` })
        .nearby(latlng, 80000) // stations are sparse (~12 for the whole CA coast)
        .run((error, featureCollection) => {
          if(error){ resolve(null); return; }
          if(!featureCollection || !featureCollection.features.length){
            resolve({ title: "High Tide Flooding", note: "No tide station within 80 km of this point." });
            return;
          }
          // .nearby() bounds the query by radius but doesn't guarantee
          // nearest-first order (confirmed directly — it returned a
          // station 44km away over one <5km away), so pick the true
          // minimum client-side across whatever it returned.
          let feature = null, minDist = Infinity;
          featureCollection.features.forEach(f => {
            const [lng, lat] = f.geometry.coordinates;
            const d = latlng.distanceTo(L.latLng(lat, lng));
            if(d < minDist){ minDist = d; feature = f; }
          });
          const f = feature.properties;
          const distanceKm = (minDist / 1000).toFixed(0);
          resolve({
            title: `High Tide Flooding — nearest station: ${f.Station_Name}`,
            rows: [
              { label: "Distance from clicked point", value: `${distanceKm} km` },
              { label: "Minor flooding threshold", value: `${f.minor_ft} ft above MHHW` },
              { label: "Moderate flooding threshold", value: `${f.moderate_ft} ft above MHHW` },
              { label: "Major flooding threshold", value: `${f.major_ft} ft above MHHW` }
            ]
          });
        });
    });
  }
}
