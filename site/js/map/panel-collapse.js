/**
 * Collapsible layer panel (desktop widths only; below 768px the panel is the
 * bottom sheet from app-shell.js and this module changes nothing there).
 *
 * Collapsed: the panel column is hidden (it stays in the DOM, since the layer
 * modules and permalink read its controls), the map takes the full width, and a
 * Leaflet control in the top-right corner shows a "Layers" button that reopens
 * the panel plus a legend card. The card is built from the same active-layer
 * summary as the print sheet and follows the panel as layers change.
 *
 * The collapsed/open choice is a per-browser viewing preference kept in
 * localStorage, deliberately not in the permalink hash. The embed starts
 * collapsed and neither reads nor writes storage.
 */
import { buildActiveSummary } from "./shared/active-summary.js";

const STORAGE_KEY = "atlas.panelCollapsed";
const REFRESH_DELAY_MS = 120;
// Space kept free below the card for the attribution and scale bar.
const CARD_BOTTOM_RESERVE_PX = 190;
// Embeds narrower than this start with the legend card as a pill.
const EMBED_CARD_OPEN_MIN_WIDTH_PX = 600;

function readStored(){
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch(err){ return false; /* storage blocked: default open */ }
}

function writeStored(collapsed){
  try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch(err){ /* not critical */ }
}

function makeButton(className, text){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = text;
  return btn;
}

/**
 * @param {L.Map} map
 * @param {{embed?: boolean, locked?: boolean}} [options] - `embed`: start collapsed and skip
 *   localStorage; `locked`: no Layers button, so viewers can't reopen the panel.
 */
export function initPanelCollapse(map, { embed = false, locked = false } = {}){
  const layout = document.querySelector(".map-layout");
  const panel = document.getElementById("layerPanel");
  const collapseBtn = document.getElementById("collapsePanelBtn");
  if(!layout || !panel) return;

  const layersBtn = makeButton("legend-layers-btn", "Layers");
  layersBtn.setAttribute("aria-controls", "layerPanel");
  layersBtn.hidden = locked;

  const card = document.createElement("div");
  card.className = "legend-card";
  card.hidden = true;
  const pill = makeButton("legend-pill", "Legend");
  pill.setAttribute("aria-expanded", "true");
  const cardBody = document.createElement("div");
  cardBody.className = "legend-card-body";
  card.append(pill, cardBody);

  const Control = L.Control.extend({
    options: { position: "topright" },
    onAdd(){
      const container = L.DomUtil.create("div", "legend-control");
      container.append(layersBtn, card);
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });
  const control = new Control().addTo(map);
  const controlEl = control.getContainer();

  let collapsed = embed ? true : readStored();

  const fitCard = () => {
    cardBody.style.maxHeight = `${Math.max(120, map.getSize().y - CARD_BOTTOM_RESERVE_PX)}px`;
  };
  map.on("resize", fitCard);
  fitCard();

  const setCardOpen = open => {
    pill.setAttribute("aria-expanded", String(open));
    cardBody.hidden = !open;
    card.classList.toggle("is-pill", !open);
  };
  setCardOpen(!embed || map.getSize().x >= EMBED_CARD_OPEN_MIN_WIDTH_PX);
  pill.addEventListener("click", () => setCardOpen(cardBody.hidden));

  const refreshCard = () => {
    const summary = buildActiveSummary();
    cardBody.replaceChildren(summary);
    card.hidden = !cardBody.childElementCount;
  };
  let timer = null;
  const scheduleRefresh = () => {
    clearTimeout(timer);
    timer = setTimeout(refreshCard, REFRESH_DELAY_MS);
  };
  // The panel's own change/input events cover user edits; the observer covers what they miss
  // (legends that render after a fetch, "N on" badges, scenario labels set from code).
  panel.addEventListener("change", scheduleRefresh);
  panel.addEventListener("input", scheduleRefresh);
  new MutationObserver(scheduleRefresh).observe(panel, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden"] });
  refreshCard();

  const apply = (value, { persist = false, moveFocus = false } = {}) => {
    collapsed = value;
    layout.classList.toggle("panel-collapsed", collapsed);
    layersBtn.setAttribute("aria-expanded", String(!collapsed));
    if(collapseBtn) collapseBtn.setAttribute("aria-expanded", String(!collapsed));
    map.invalidateSize({ animate: false });
    if(persist && !embed) writeStored(collapsed);
    if(moveFocus) (collapsed ? layersBtn : collapseBtn)?.focus();
  };
  apply(collapsed);

  collapseBtn?.addEventListener("click", () => apply(true, { persist: true, moveFocus: true }));
  layersBtn.addEventListener("click", () => apply(false, { persist: true, moveFocus: true }));

  // The control only shows while the panel is collapsed (and in the embed, which also uses it
  // beside the mobile bottom sheet); CSS handles the narrow-screen cases.
  controlEl.classList.toggle("is-embed", embed);
}
