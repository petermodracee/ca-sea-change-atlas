/**
 * Embed-only behavior for /map/embed/ (body class `map-embed`). The page uses the same entry
 * point, panel markup and layer modules as /map/; index.js checks `isEmbed()` and calls
 * `initEmbed()` rather than forking.
 *
 * `?panel=locked` (query string; the hash holds map state) hides the "Layers" button, so viewers
 * can't change layers. Click-to-inspect stays on either way.
 */

/** Whether this page is the embed. */
export function isEmbed(){
  return document.body.classList.contains("map-embed");
}

/** Whether the embed was loaded with `?panel=locked`. */
export function isPanelLocked(){
  return new URLSearchParams(location.search).get("panel") === "locked";
}

/** Marks the body so CSS can hide the bottom-sheet handle and panel at narrow widths when locked. */
export function applyEmbedBodyState(){
  if(isPanelLocked()) document.body.classList.add("map-embed-locked");
}

/**
 * Wheel zoom stays off until the user clicks the map and goes off again when the pointer leaves,
 * so the host page scrolls normally past the frame.
 */
function initScrollZoomGuard(map){
  map.scrollWheelZoom.disable();
  const container = map.getContainer();
  // Clicks on the map's own controls (Layers, Legend, zoom) don't count as clicking the map.
  container.addEventListener("click", e => {
    if(!e.target.closest(".leaflet-control")) map.scrollWheelZoom.enable();
  });
  container.addEventListener("mouseleave", () => map.scrollWheelZoom.disable());
}

/** Adds "Sources" (the licenses and credits page) to Leaflet's corner attribution control. */
function addSourcesLink(map){
  const sources = '<a href="/about/licenses/" target="_blank" rel="noopener">Sources</a>';
  map.attributionControl.setPrefix(`<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a> | ${sources}`);
}

/**
 * Keeps the bar's "Open full map" link pointing at /map/ with the embed's current hash, so the
 * reader lands on the same view and layers. The hash is written (debounced) as the map moves, so it is
 * flushed first; the link is refreshed on every way a browser can follow it (hover, focus, click,
 * middle-click, context menu).
 * @param {{flush: () => void}} permalink
 */
function wireFullMapLink(permalink){
  const link = document.getElementById("embedFullMapLink");
  if(!link) return;
  const base = link.getAttribute("href").split("#")[0];
  const refresh = () => {
    permalink.flush();
    link.setAttribute("href", `${base}${location.hash}`);
  };
  ["pointerenter", "focus", "click", "auxclick", "contextmenu"].forEach(type => link.addEventListener(type, refresh));
  refresh();
}

/**
 * @param {L.Map} map
 * @param {{flush: () => void}} permalink - from `initPermalink`.
 */
export function initEmbed(map, permalink){
  initScrollZoomGuard(map);
  addSourcesLink(map);
  wireFullMapLink(permalink);
}
