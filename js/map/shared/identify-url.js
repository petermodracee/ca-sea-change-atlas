/**
 * Builds a WMS GetFeatureInfo request URL for a point click, shared by
 * BCDC's and CoSMoS's WMS servers. Both need the same bbox/pixel math
 * (map size, current bounds projected to EPSG:3857, and the clicked
 * point in container pixels) but differ in a few request-parameter
 * conventions between their WMS versions, so those differences are
 * passed in rather than hard-coded.
 *
 * @param {L.Map} map
 * @param {string} baseUrl - WMS endpoint, including any fixed query params (e.g. BCDC's `?map=...`).
 * @param {string} layerName - value used for both LAYERS and QUERY_LAYERS.
 * @param {L.LatLng} latlng - the clicked point.
 * @param {object} [opts]
 * @param {string} [opts.version="1.3.0"] - WMS version; 1.3.0 uses CRS/I/J, 1.1.1 uses SRS/X/Y.
 * @param {string} [opts.infoFormat="application/vnd.ogc.gml"] - INFO_FORMAT value.
 * @param {string} [opts.featureCount="5"] - FEATURE_COUNT value.
 * @param {string} [opts.styles] - STYLES value, only sent when provided (1.1.1 servers expect it).
 * @returns {string}
 */
export function buildWmsIdentifyUrl(map, baseUrl, layerName, latlng, opts = {}){
  const {
    version = "1.3.0",
    infoFormat = "application/vnd.ogc.gml",
    featureCount = "5",
    styles
  } = opts;

  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const point = map.latLngToContainerPoint(latlng);
  const bbox = `${sw.x},${sw.y},${ne.x},${ne.y}`;
  const width = String(Math.round(size.x));
  const height = String(Math.round(size.y));

  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: version, REQUEST: "GetFeatureInfo",
    LAYERS: layerName, QUERY_LAYERS: layerName,
    WIDTH: width, HEIGHT: height,
    INFO_FORMAT: infoFormat, FEATURE_COUNT: featureCount
  });
  if(styles !== undefined) params.set("STYLES", styles);

  if(version === "1.3.0"){
    params.set("CRS", "EPSG:3857");
    params.set("BBOX", bbox);
    params.set("I", String(Math.round(point.x)));
    params.set("J", String(Math.round(point.y)));
  } else {
    params.set("SRS", "EPSG:3857");
    params.set("BBOX", bbox);
    params.set("X", String(Math.round(point.x)));
    params.set("Y", String(Math.round(point.y)));
  }

  const joiner = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${joiner}${params.toString()}`;
}
