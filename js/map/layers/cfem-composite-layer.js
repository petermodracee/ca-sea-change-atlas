import { BaseLayer } from "../base-layer.js";
import { cachedFetch } from "../shared/request-cache.js";
import { CfemHazardLayer } from "./cfem-hazard-layer.js";
import { CfemStormSurgeLayer } from "./cfem-storm-surge-layer.js";

// --- NOAA Coastal Flood Exposure Mapper --------------------------------------
// The composite "how many hazards overlap here" layer, restricted to its
// California sublayer. The real, confirmed sublayer name is
// `CA_FloodComposite` (id 42) — not `CA_FloodComposite_int`, which doesn't
// exist on this service; confirmed directly via the service's own layer
// list. It's a raster layer (esri-leaflet/ArcGIS's ordinary vector `/query`
// endpoint doesn't work against it — "Invalid or missing input parameters"
// — but its `/identify` operation does, returning a HAZ_NUM code and a
// plain-English DESCRPTN string listing which hazards overlap, e.g. "FEMA
// Zones... & Sea Level Rise... & Tsunami Run Up Zone"), so click-to-inspect
// below hand-builds an identify request the same way BCDC's GetFeatureInfo
// does, rather than going through esri-leaflet's query helpers.
const CFEM_COMPOSITE_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_CoastalFloodHazardComposite/MapServer";
const CFEM_COMPOSITE_LAYER_ID = 42;
const CFEM_COLOR = "#B26A00";
const CFEM_ATTRIBUTION = 'Hazard overlap: <a href="https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html" target="_blank" rel="noopener">NOAA Office for Coastal Management, Coastal Flood Exposure Mapper</a>';

// The real CFEM tool (coast.noaa.gov/floodexposure) exposes several more
// hazard layers beyond the composite: High Tide Flooding, FEMA Flood
// Zones, Tsunami, Storm Surge, Sea Level Rise, Great Lakes Water Levels.
// This is a comparison site, so "another layer group already shows
// roughly this hazard" isn't a reason to skip one of CFEM's own — its
// version may use different data, resolution, or classification, and
// that's exactly the kind of thing worth being able to compare. So all
// of these are wired up except:
//   - Sea Level Rise: CFEM has no dedicated SLR service of its own (its
//     folder listing has none), and toggling it in the live app visually
//     matches the same `dc_slr` low-lying-areas rendering already used by
//     this map's separate NOAA Sea Level Rise Viewer group — same
//     underlying NOAA data, not an independent CFEM rendering, so
//     duplicating it wouldn't add real comparison value.
//   - Great Lakes Water Levels: doesn't apply to California.
//
// An earlier pass concluded CFEM_Tsunami was broken for California
// (based on its renderer only classifying 2 Alabama FIPS codes, and an
// `/export`-based image test showing a flat background). That was
// wrong: CFEM_Tsunami is a `singleFusedMapCache: true` tiled service —
// same bug class as the NOAA SLR `dynamicMapLayer` issue fixed
// elsewhere in this codebase — `/export` against a fused cache doesn't
// reliably reflect what the cache actually serves. Real `/tile/z/y/x`
// requests confirmed substantial real content over the Bay Area.
// CFEM_HighTideFlooding and CFEM_FEMAFloodZones are the same story:
// both are separate, real, working tiled services (confirmed the same
// way), each with its own distinct legend from what this map's other
// layer groups show.
//
// None of these three support useful click-to-inspect despite their
// services advertising Query capability: `/query` against each one
// returns the exact same leftover county-eligibility attribute table
// (FIPSSTCO, WatershedCounty, etc.) rather than the actual rendered
// classification — confirmed directly against real coastal points. The
// vector "Feature Layer" schema these services expose is disconnected
// from what their tile cache actually renders. So, like CoSMoS's
// tile-only topics, these get a live legend but no popup provider.
const CFEM_HTF_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_HighTideFlooding/MapServer";
const CFEM_HTF_LAYER_ID = 0;
const CFEM_FEMA_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_FEMAFloodZones/MapServer";
const CFEM_FEMA_LAYER_ID = 1;
const CFEM_TSUNAMI_URL = "https://coast.noaa.gov/arcgis/rest/services/FloodExposureMapper/CFEM_Tsunami/MapServer";
const CFEM_TSUNAMI_LAYER_ID = 0;

function cfemIdentifyUrl(map, latlng){
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const params = new URLSearchParams({
    f: "json",
    geometry: `${latlng.lng},${latlng.lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: `visible:${CFEM_COMPOSITE_LAYER_ID}`,
    tolerance: "3",
    mapExtent: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    imageDisplay: `${Math.round(size.x)},${Math.round(size.y)},96`,
    returnGeometry: "false"
  });
  return `${CFEM_COMPOSITE_URL}/identify?${params.toString()}`;
}

export class CfemCompositeLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.getElementById("cfemToggle");
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  buildLayer(){
    return L.esri.dynamicMapLayer({
      url: CFEM_COMPOSITE_URL,
      layers: [CFEM_COMPOSITE_LAYER_ID],
      opacity: 0.65,
      attribution: CFEM_ATTRIBUTION
    });
  }

  init(){
    this.applySwatch('[data-swatch="cfem"]', CFEM_COLOR, false);
    this.toggleEl.addEventListener("change", () => this.refresh());
    this.registerPopupProvider(latlng => this.identify(latlng));

    // The three simple hazard layers and storm surge are separate,
    // independently-toggled layer groups in the panel, but they're all
    // part of CFEM, so they're instantiated alongside the composite layer.
    new CfemStormSurgeLayer(this.map, this.infoPopup).init();
    new CfemHazardLayer(this.map, this.infoPopup, {
      toggleId: "cfemHtfToggle", legendId: "cfemHtfLegend", swatch: "cfem-htf",
      color: "#2E86AB", url: CFEM_HTF_URL, layerId: CFEM_HTF_LAYER_ID, title: "High Tide Flooding (CFEM)"
    }).init();
    new CfemHazardLayer(this.map, this.infoPopup, {
      toggleId: "cfemFemaToggle", legendId: "cfemFemaLegend", swatch: "cfem-fema",
      color: "#C0392B", url: CFEM_FEMA_URL, layerId: CFEM_FEMA_LAYER_ID, title: "FEMA Flood Zones (CFEM)"
    }).init();
    new CfemHazardLayer(this.map, this.infoPopup, {
      toggleId: "cfemTsunamiToggle", legendId: "cfemTsunamiLegend", swatch: "cfem-tsunami",
      color: "#8C2D8C", url: CFEM_TSUNAMI_URL, layerId: CFEM_TSUNAMI_LAYER_ID, title: "Tsunami Run-up (CFEM)"
    }).init();
  }

  async identify(latlng){
    if(!this.isEnabled()) return null;
    const url = cfemIdentifyUrl(this.map, latlng);
    const json = await cachedFetch(url, res => res.json());
    const result = json.results && json.results[0];
    if(!result || !result.attributes){
      return { title: "NOAA Coastal Flood Exposure", note: "No mapped hazard overlap at this point." };
    }
    const desc = result.attributes["Raster.DESCRPTN"];
    const count = result.attributes["Raster.HAZ_NUM"];
    if(!desc){
      return { title: "NOAA Coastal Flood Exposure", note: "No mapped hazard overlap at this point." };
    }
    const rows = [];
    if(count) rows.push({ label: "Number of overlapping hazards", value: count });
    rows.push({ label: "Overlapping hazards", value: desc });
    return { title: "NOAA Coastal Flood Exposure", rows };
  }
}
