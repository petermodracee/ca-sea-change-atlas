import { initBasemaps } from "./basemaps.js";

/** Tracks the single "clicked/searched point" marker shared between the map-click handler and the search box. */
export function createMarkerState(){
  let marker = null;
  return {
    getMarker: () => marker,
    setMarker: m => { marker = m; }
  };
}

/**
 * Creates the Leaflet map and installs the basemap switcher (greyscale by default).
 * @param {{view?: {center: [number, number], zoom: number}|null, basemap?: string|null}} [initial] -
 *   view/basemap restored from a shared link.
 * @returns {{map: L.Map, getBasemap: () => string}}
 */
export function createMap({ view = null, basemap = null } = {}){
  // maxZoom is set explicitly because the greyscale vector basemap doesn't declare one to Leaflet.
  const map = L.map("map", { scrollWheelZoom: true, maxZoom: 18 }).setView(view ? view.center : [37.2, -119.4], view ? view.zoom : 6);
  window.map = map; // exposed for debugging/testing
  const getBasemap = initBasemaps(map, basemap);
  return { map, getBasemap };
}

/** Wires the click-to-inspect entry point: clicking the map drops the shared marker and opens the info popup. */
export function wireMapClick(map, infoPopup, markerState){
  map.on("click", e => {
    if(map.measureActive) return; // the measure tool owns map clicks while it's on
    const existing = markerState.getMarker();
    if(existing) map.removeLayer(existing);
    markerState.setMarker(L.marker([e.latlng.lat, e.latlng.lng]).addTo(map));
    infoPopup.showAt(e.latlng);
  });
}

/** Wires the expand/collapse behavior for each `.layer-group`'s collapsible body. */
export function initGroupCollapse(){
  document.querySelectorAll(".group-collapse-btn").forEach(btn => {
    const body = document.getElementById(btn.getAttribute("aria-controls"));
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
    });
  });
}

/**
 * Wires the toolbar Print button. The print stylesheet lays the map out at a fixed
 * page size, so Leaflet is told to re-measure before printing and again afterwards;
 * the footer's attribution <details> is opened so it lands on the page.
 * @param {L.Map} map
 */
export function initPrint(map){
  const details = document.querySelector(".site-footer-details");
  let wasOpen = false;
  window.addEventListener("beforeprint", () => {
    if(details){ wasOpen = details.open; details.open = true; }
    map.invalidateSize();
  });
  window.addEventListener("afterprint", () => {
    if(details) details.open = wasOpen;
    map.invalidateSize();
  });
  document.getElementById("printBtn").addEventListener("click", () => window.print());
}

/**
 * Wires each group's "Hide" button, plus the panel-level "Hide all" that presses them all: unchecks every checked box in the group's body
 * (dispatching `change` so the layer modules tear down their own overlays), then
 * fires a `layergroup:hide` event on the group so a layer can reset extra UI state.
 */
export function initGroupHide(){
  document.querySelectorAll(".layer-group .group-hide-btn").forEach(btn => {
    const group = btn.closest(".layer-group");
    btn.addEventListener("click", () => {
      group.querySelectorAll('.layer-group-body input[type="checkbox"]:checked').forEach(cb => {
        cb.checked = false;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      });
      group.dispatchEvent(new CustomEvent("layergroup:hide"));
    });
  });
  document.getElementById("hideAllLayers").addEventListener("click", () => {
    document.querySelectorAll(".layer-group .group-hide-btn:not(:disabled)").forEach(btn => btn.click());
  });
}

/**
 * Marks each layer group that has layers on: adds `.has-active` plus an "N on" badge to the
 * title row, so a collapsed group still shows it's active. Groups tagged `data-no-active`
 * (reference outlines that default on) are skipped. Hide buttons are disabled at zero.
 */
export function initActiveIndicator(){
  const groups = [...document.querySelectorAll(".layer-group:not([data-no-active])")];
  const update = group => {
    const count = group.querySelectorAll('.layer-group-body input[type="checkbox"]:checked').length;
    group.classList.toggle("has-active", count > 0);
    group.querySelector(".active-badge").textContent = `${count} on`;
    const hideBtn = group.querySelector(".group-hide-btn");
    if(hideBtn) hideBtn.disabled = count === 0;
    document.getElementById("hideAllLayers").disabled = !groups.some(g => g.classList.contains("has-active"));
  };
  groups.forEach(group => {
    const badge = document.createElement("span");
    badge.className = "active-badge";
    group.querySelector(".layer-group-title span").after(badge);
    group.addEventListener("change", () => update(group));
    update(group);
  });
}
