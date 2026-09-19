/**
 * Print / save-as-PDF support. The print stylesheet (style.css, "Print" block)
 * shows the map beside a "print sheet" of what's on the map: each active
 * layer group's name, scenario values, checked layers and legends, cloned from
 * the live panel just before printing. Attribution comes from the footer.
 */

// Must match the print CSS: map and legend column widths in px (landscape Letter, .4in margins).
const PRINT_MAP_WIDTH_PX = 700;
const PRINT_MAP_HEIGHT_PX = 610;
const SETTLE_POLL_MS = 400;
const SETTLE_TIMEOUT_MS = 12000;

/** Builds the print sheet element from the layer panel's current state. */
function buildPrintSheet(){
  const sheet = document.createElement("aside");
  sheet.id = "printSheet";

  const title = document.createElement("h2");
  title.textContent = "CA Sea Change Atlas";
  const date = document.createElement("p");
  date.className = "print-date";
  date.textContent = `Printed ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}. Unofficial planning-level tool.`;
  sheet.append(title, date);

  document.querySelectorAll(".layer-group.has-active").forEach(group => {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = group.querySelector(".layer-group-title span").textContent.trim();
    section.appendChild(heading);

    // Scenario values (e.g. "Sea Level Rise, 3 ft", "36"" total water level) so the printout says what was modelled.
    group.querySelectorAll(".scenario-label:has(span[id]), .level-row .overlay-level-value").forEach(el => {
      const line = document.createElement("p");
      line.className = "print-scenario";
      line.textContent = el.classList.contains("overlay-level-value") ? `Total water level: ${el.textContent}` : el.textContent.trim();
      section.appendChild(line);
    });

    const legends = [...group.querySelectorAll(".bcdc-legend:not([hidden])")];
    // A layer whose legend already carries its name doesn't need a second line in the checklist.
    const legendTitles = new Set(legends.flatMap(l => [...l.querySelectorAll(".legend-block-title")].map(t => t.textContent.trim())));
    const list = document.createElement("ul");
    group.querySelectorAll('.layer-group-body input[type="checkbox"]:checked').forEach(cb => {
      const name = cb.closest("label").textContent.trim();
      if(legendTitles.has(name)) return;
      const item = document.createElement("li");
      item.textContent = name;
      list.appendChild(item);
    });
    if(list.children.length) section.appendChild(list);

    legends.forEach(legend => section.appendChild(legend.cloneNode(true)));
    sheet.appendChild(section);
  });
  return sheet;
}

/** Whether every tile, image overlay and vector basemap on the map has finished loading. */
function mapIsSettled(map){
  if(document.querySelector(".layer-group.is-loading, .leaflet-tile-loading")) return false;
  return !Object.values(map._layers).some(layer => typeof layer.getMaplibreMap === "function" && layer.getMaplibreMap() && !layer.getMaplibreMap().loaded());
}

/** Resolves once the map has settled, or after SETTLE_TIMEOUT_MS so a stuck layer can't block printing. */
function whenSettled(map){
  return new Promise(resolve => {
    const started = Date.now();
    const check = () => {
      if(mapIsSettled(map) || Date.now() - started > SETTLE_TIMEOUT_MS) resolve();
      else setTimeout(check, SETTLE_POLL_MS);
    };
    setTimeout(check, SETTLE_POLL_MS); // give freshly-resized layers a beat to start requesting tiles
  });
}

/**
 * Wires the toolbar Print button and the before/after-print hooks.
 *
 * The map is resized to its print size (inline px, matching the print CSS) *before*
 * the print dialog opens. Button path: resize, wait for tiles to finish loading at the
 * new size, then print — resizing during `beforeprint` isn't enough because the new
 * tiles arrive after the print snapshot. File-menu path: `beforeprint` does the resize but
 * can't wait, so tiles at the edges may be missing. Ctrl/Cmd+P is intercepted and sent down the button path.
 * The map keeps the on-screen center and zoom, so it looks like what was on screen, cropped to page shape.
 * @param {L.Map} map
 */
export function initPrint(map){
  const mapEl = document.getElementById("map");
  const button = document.getElementById("printBtn");
  const statusEl = document.getElementById("searchStatus");
  const details = document.querySelector(".site-footer-details");
  let sheet = null;
  let saved = null; // {center, zoom, detailsOpen} from before print mode

  const enterPrintMode = () => {
    if(sheet) return;
    saved = { center: map.getCenter(), zoom: map.getZoom(), detailsOpen: details ? details.open : false };
    if(details) details.open = true;
    sheet = buildPrintSheet();
    mapEl.after(sheet);
    mapEl.style.width = `${PRINT_MAP_WIDTH_PX}px`;
    mapEl.style.height = `${PRINT_MAP_HEIGHT_PX}px`;
    map.invalidateSize({ animate: false });
    map.setView(saved.center, saved.zoom, { animate: false });
  };

  const exitPrintMode = () => {
    if(!sheet) return;
    sheet.remove();
    sheet = null;
    mapEl.style.width = "";
    mapEl.style.height = "";
    if(details) details.open = saved.detailsOpen;
    map.invalidateSize({ animate: false });
    map.setView(saved.center, saved.zoom, { animate: false });
  };

  window.addEventListener("beforeprint", enterPrintMode);
  window.addEventListener("afterprint", exitPrintMode);

  const printWhenReady = async () => {
    if(button.disabled) return; // already preparing
    button.disabled = true;
    statusEl.textContent = "Preparing print view…";
    enterPrintMode();
    await whenSettled(map);
    statusEl.textContent = "";
    button.disabled = false;
    window.print(); // afterprint restores the screen layout
  };

  button.addEventListener("click", printWhenReady);

  // Route Ctrl/Cmd+P through the same wait-for-tiles path as the button.
  document.addEventListener("keydown", e => {
    if((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p"){
      e.preventDefault();
      printWhenReady();
    }
  });
}
