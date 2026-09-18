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

/**
 * Wires each group's "Hide" button: unchecks every checked box in the group's body
 * (dispatching `change` so the layer modules tear down their own overlays), then
 * fires a `layergroup:hide` event on the group so a layer can reset extra UI state.
 */
export function initGroupHide(){
  document.querySelectorAll(".group-hide-btn").forEach(btn => {
    const group = btn.closest(".layer-group");
    btn.addEventListener("click", () => {
      group.querySelectorAll('.layer-group-body input[type="checkbox"]:checked').forEach(cb => {
        cb.checked = false;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      });
      group.dispatchEvent(new CustomEvent("layergroup:hide"));
    });
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
  };
  groups.forEach(group => {
    const badge = document.createElement("span");
    badge.className = "active-badge";
    group.querySelector(".layer-group-title span").after(badge);
    group.addEventListener("change", () => update(group));
    update(group);
  });
}
