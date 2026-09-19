/**
 * Shareable map state in the URL hash: view, basemap, which layers are on,
 * and the slider/dropdown values that define a flood scenario. Written with
 * history.replaceState so it doesn't pollute back-button history.
 *
 * Hash format: #map=zoom/lat/lng&base=Name&on=key,key&v=key~value|key~value
 *
 * Not covered: CoSMoS region/topic/scenario (its controls are populated from
 * fetched data after init) and the BCDC scenario button grids.
 */

// Controls whose value is restored: static in map.njk, so they exist (and are read by the layer modules) at init.
const VALUE_CONTROL_IDS = ["floodLevel", "noaaSlrSlider", "consequenceSelect"];
const WRITE_DELAY_MS = 300;
// Layer toggles left out of links because the state they depend on isn't restorable (see header comment).
const UNTRACKED_CHECKBOX_IDS = new Set(["cosmosToggle"]);

/** Stable key for a layer checkbox, or null if it isn't one we track. */
function checkboxKey(el){
  if(UNTRACKED_CHECKBOX_IDS.has(el.id)) return null;
  if(el.id) return `id:${el.id}`;
  if(el.dataset.layer) return `l:${el.dataset.layer}`;
  if(el.dataset.bcdcLayer) return `b:${el.dataset.bcdcLayer}`;
  if(el.dataset.staticLayer) return `s:${el.dataset.staticLayer}`;
  return null;
}

/** All layer-panel checkboxes we track, as [key, element] pairs. */
function trackedCheckboxes(){
  return [...document.querySelectorAll('.layer-panel input[type="checkbox"]')]
    .map(el => [checkboxKey(el), el])
    .filter(([key]) => key);
}

/** All value controls (fixed sliders/selects plus opacity sliders), as [key, element] pairs. */
function trackedValueControls(){
  const fixed = VALUE_CONTROL_IDS.map(id => [`id:${id}`, document.getElementById(id)]);
  const opacity = [...document.querySelectorAll("input.group-opacity")].map(el => [`op:${el.dataset.pane}`, el]);
  return [...fixed, ...opacity].filter(([, el]) => el);
}

/**
 * Parses the current URL hash.
 * @returns {{view: {center: [number, number], zoom: number}|null, basemap: string|null,
 *   on: Set<string>|null, values: Map<string, string>}}
 */
export function readPermalink(){
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  let view = null;
  const parts = (params.get("map") || "").split("/").map(Number);
  if(parts.length === 3 && parts.every(Number.isFinite)) view = { zoom: parts[0], center: [parts[1], parts[2]] };

  const values = new Map();
  (params.get("v") || "").split("|").forEach(pair => {
    const [key, ...rest] = pair.split("~");
    if(key && rest.length) values.set(key, rest.join("~"));
  });

  return {
    view,
    basemap: params.get("base"),
    on: params.has("on") ? new Set(params.get("on").split(",").filter(Boolean)) : null,
    values
  };
}

/**
 * Applies the checkbox/slider/select part of a parsed permalink to the DOM.
 * Must run before the layer modules' init(), which read these controls' initial state.
 */
export function applyPanelState(state){
  if(state.on){
    trackedCheckboxes().forEach(([key, el]) => { el.checked = state.on.has(key); });
  }
  trackedValueControls().forEach(([key, el]) => {
    if(state.values.has(key)) el.value = state.values.get(key);
  });
}

/**
 * Re-fires `change` on restored layer toggles so each layer module draws its overlay.
 * Layer modules don't render initially-checked toggles on their own (all default off),
 * so this must run after every layer's init(). Coverage outlines (`l:` keys) already draw at init.
 */
export function replayLayerToggles(state){
  if(!state.on) return;
  trackedCheckboxes().forEach(([key, el]) => {
    if(el.checked && !key.startsWith("l:")) el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const consequence = document.getElementById("consequenceSelect");
  if(consequence && consequence.value) consequence.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Builds the hash string for the map's current state. */
function buildHash(map, getBasemap){
  const c = map.getCenter();
  const params = new URLSearchParams();
  params.set("map", `${map.getZoom()}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`);
  const base = getBasemap();
  if(base) params.set("base", base);
  params.set("on", trackedCheckboxes().filter(([, el]) => el.checked).map(([key]) => key).join(","));
  params.set("v", trackedValueControls().map(([key, el]) => `${key}~${el.value}`).join("|"));
  return `#${params.toString()}`;
}

/**
 * Keeps the URL hash in sync with the map and wires the "Copy link" button.
 * @param {L.Map} map
 * @param {() => string|null} getBasemap - returns the currently selected basemap's name.
 */
export function initPermalink(map, getBasemap){
  let timer = null;
  const write = () => {
    clearTimeout(timer);
    timer = setTimeout(() => history.replaceState(null, "", buildHash(map, getBasemap)), WRITE_DELAY_MS);
  };
  const panel = document.querySelector(".layer-panel");
  map.on("moveend baselayerchange", write);
  panel.addEventListener("change", write);
  panel.addEventListener("input", write);
  write();

  const button = document.getElementById("copyLinkBtn");
  if(!button) return;
  button.addEventListener("click", async () => {
    history.replaceState(null, "", buildHash(map, getBasemap));
    try {
      await navigator.clipboard.writeText(location.href);
      button.textContent = "Link copied";
    } catch(err){
      window.prompt("Copy this link:", location.href); // clipboard blocked (e.g. non-secure context)
    }
    setTimeout(() => { button.textContent = "Copy link"; }, 2000);
  });
}
