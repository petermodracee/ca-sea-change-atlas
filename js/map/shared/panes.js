/**
 * One Leaflet pane per layer group, so a group's overlays share a single
 * z-order slot and a single CSS opacity. That lets the panel's opacity
 * slider work for every sublayer without each layer module tracking it,
 * even though BCDC/CoSMoS rebuild their layers on every slider change.
 */

// Panes stack in this order (bottom to top); bringGroupToFront() reorders it. All sit above the basemap pane (150) and Leaflet's tilePane (200).
const GROUP_PANE_KEYS = ["noaaSlr", "fema", "cfem", "cosmos", "bcdc"];
const FIRST_Z_INDEX = 210;

/**
 * Returns the name of a layer group's pane, creating it on first use.
 * Pass the result as the `pane` option when building that group's layers.
 * @param {L.Map} map
 * @param {"noaaSlr"|"fema"|"cfem"|"cosmos"|"bcdc"} key - layer group key.
 * @returns {string}
 */
export function groupPane(map, key){
  const name = `group-${key}`;
  if(!map.getPane(name)){
    const index = GROUP_PANE_KEYS.indexOf(key);
    if(index < 0) throw new Error(`Unknown layer group pane: ${key}`);
    map.createPane(name).style.zIndex = FIRST_Z_INDEX + index;
  }
  return name;
}

/**
 * Moves a layer group's pane above all the others.
 * @param {L.Map} map
 * @param {string} key - layer group key.
 */
export function bringGroupToFront(map, key){
  GROUP_PANE_KEYS.splice(GROUP_PANE_KEYS.indexOf(key), 1);
  GROUP_PANE_KEYS.push(key);
  GROUP_PANE_KEYS.forEach((k, i) => {
    const pane = map.getPane(`group-${k}`);
    if(pane) pane.style.zIndex = FIRST_Z_INDEX + i;
  });
}

/**
 * Adds a "bring to front" button to each layer group's title row (shown only
 * while the group has layers on, via CSS). Groups are found through their opacity slider's pane key.
 * @param {L.Map} map
 */
export function initLayerOrder(map){
  document.querySelectorAll(".layer-group").forEach(group => {
    const slider = group.querySelector("input.group-opacity");
    if(!slider) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "group-front-btn";
    button.textContent = "▲";
    button.title = "Bring this group's layers to the front";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => bringGroupToFront(map, slider.dataset.pane));
    group.querySelector(".group-hide-btn").before(button);
  });
}

/**
 * Wires each `input.group-opacity[data-pane]` range slider in the layer
 * panel to the CSS opacity of that group's pane (slider value is a percentage).
 * @param {L.Map} map
 */
export function initOpacitySliders(map){
  document.querySelectorAll("input.group-opacity").forEach(slider => {
    const pane = map.getPane(groupPane(map, slider.dataset.pane));
    const output = slider.parentElement.querySelector(".opacity-value");
    const apply = () => {
      pane.style.opacity = String(Number(slider.value) / 100);
      if(output) output.textContent = `${slider.value}%`;
    };
    slider.addEventListener("input", apply);
    apply();
  });
}
