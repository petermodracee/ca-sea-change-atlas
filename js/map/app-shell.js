/** Tracks the single "clicked/searched point" marker shared between the map-click handler and the search box. */
export function createMarkerState(){
  let marker = null;
  return {
    getMarker: () => marker,
    setMarker: m => { marker = m; }
  };
}

/** Creates the Leaflet map and its OpenStreetMap base tile layer. */
export function createMap(){
  const map = L.map("map", { scrollWheelZoom: true }).setView([37.2, -119.4], 6);
  window.map = map; // exposed for debugging/testing
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  return map;
}

/** Wires the click-to-inspect entry point: clicking the map drops the shared marker and opens the info popup. */
export function wireMapClick(map, infoPopup, markerState){
  map.on("click", e => {
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
