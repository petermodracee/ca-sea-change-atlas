/**
 * One Leaflet pane per layer group, so a group's overlays share a single
 * z-order slot and a single CSS opacity. That lets the panel's opacity
 * slider work for every sublayer without each layer module tracking it,
 * even though BCDC/CoSMoS rebuild their layers on every slider change.
 */

// Panes stack in this order (bottom to top). All sit above the basemap pane (150) and Leaflet's tilePane (200).
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
