/**
 * Simple in-memory cache for map-data requests, scoped to this page
 * session and shared across every live data source (BCDC's WMS server,
 * and the ArcGIS REST sources). None of these servers send a meaningful
 * Cache-Control/Expires header on tiles, GetFeatureInfo, or
 * identify/query responses (confirmed by inspecting each one's response
 * headers directly), so without this, revisiting the same tile or
 * clicking the same point twice re-triggers a full live render/query on
 * the source's server every time. This just avoids repeating an
 * identical request (same URL) more than once per session — it doesn't
 * survive a reload, and doesn't change what's shown, since none of these
 * sources' data changes mid-visit for a fixed scenario/layer selection.
 */
const sharedRequestCache = new Map(); // url -> Promise<result>

export function cachedFetch(url, transform){
  if(sharedRequestCache.has(url)) return sharedRequestCache.get(url);
  const promise = fetch(url).then(transform).catch(err => { sharedRequestCache.delete(url); throw err; });
  sharedRequestCache.set(url, promise);
  return promise;
}
