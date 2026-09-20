/**
 * One Leaflet pane per layer group, so a group's overlays share a single
 * z-order slot and a single CSS opacity. That lets the panel's opacity
 * slider work for every sublayer without each layer module tracking it,
 * even though BCDC/CoSMoS rebuild their layers on every slider change.
 */

// Panes stack in this order (bottom to top); bringGroupToFront() reorders it. All sit above the basemap pane (150) and Leaflet's tilePane (200).
const GROUP_PANE_KEYS = ["geoLand", "geoPeople", "geoFacilities", "noaaSlr", "fema", "cfem", "calAdapt", "cosmos", "bcdc", "bcdcEcc", "nasaSlr"];
const FIRST_Z_INDEX = 210;

/**
 * Returns the name of a layer group's pane, creating it on first use.
 * Pass the result as the `pane` option when building that group's layers.
 * @param {L.Map} map
 * @param {"geoLand"|"geoPeople"|"geoFacilities"|"noaaSlr"|"fema"|"cfem"|"calAdapt"|"cosmos"|"bcdc"|"bcdcEcc"|"nasaSlr"} key - layer group key.
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
 * while the group has layers on, via CSS). Groups are found through their opacity sliders' pane keys;
 * a group with several sliders (Geo / demographic info) moves all its panes, keeping their order.
 * @param {L.Map} map
 */
export function initLayerOrder(map){
  document.querySelectorAll(".layer-group").forEach(group => {
    const sliders = [...group.querySelectorAll("input.group-opacity")];
    if(!sliders.length) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "group-front-btn";
    button.textContent = "▲";
    button.title = "Bring this group's layers to the front";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => {
      sliders.map(slider => slider.dataset.pane)
        .sort((a, b) => GROUP_PANE_KEYS.indexOf(a) - GROUP_PANE_KEYS.indexOf(b))
        .forEach(key => bringGroupToFront(map, key));
    });
    group.querySelector(".group-hide-btn").before(button);
  });
}

/**
 * Shows a small spinner on a layer group's title while any of its layers is
 * fetching tiles/images. Tile and Esri layers fire `loading`/`load`; layers are
 * created and destroyed constantly, so listeners are attached as each is added.
 * @param {L.Map} map
 */
export function initLoadingIndicators(map){
  const groups = new Map(); // pane key -> .layer-group element
  document.querySelectorAll("input.group-opacity").forEach(slider => {
    groups.set(`group-${slider.dataset.pane}`, slider.closest(".layer-group"));
  });
  const loading = new Map([...groups.keys()].map(pane => [pane, new Set()])); // pane -> layers currently loading

  const sync = pane => groups.get(pane).classList.toggle("is-loading", loading.get(pane).size > 0);

  map.on("layeradd", e => {
    const layer = e.layer;
    const pane = layer.options && layer.options.pane;
    if(!loading.has(pane)) return;
    layer.on("loading", () => { loading.get(pane).add(layer); sync(pane); });
    layer.on("load", () => { loading.get(pane).delete(layer); sync(pane); });
    // `layeradd` fires after the layer's first `loading`, so pick that one up from Leaflet's own flag (no public getter exists).
    if(layer._loading){ loading.get(pane).add(layer); sync(pane); }
  });
  map.on("layerremove", e => {
    const pane = e.layer.options && e.layer.options.pane;
    if(!loading.has(pane)) return;
    loading.get(pane).delete(e.layer);
    sync(pane);
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
