/**
 * Print / save-as-PDF support. The print stylesheet (style.css, "Print" block)
 * shows the map beside a "print sheet" of what's on the map: each active
 * layer group's name, scenario values, checked layers and legends, cloned from
 * the live panel just before printing. Attribution comes from the footer.
 */

// Must match the print CSS: map and legend column widths in px (landscape Letter, .4in margins).
const PRINT_MAP_WIDTH_PX = 700;
const PRINT_MAP_HEIGHT_PX = 590;

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

/**
 * Wires the toolbar Print button and the before/after-print hooks.
 * Leaflet only re-measures on window resize, and Chrome applies print CSS after
 * `beforeprint` fires — so the map's print size is set inline here (same px as
 * the print CSS), then the view is re-fitted to what was on screen.
 * @param {L.Map} map
 */
export function initPrint(map){
  const mapEl = document.getElementById("map");
  const details = document.querySelector(".site-footer-details");
  let wasOpen = false;
  let sheet = null;
  let screenBounds = null;

  window.addEventListener("beforeprint", () => {
    if(details){ wasOpen = details.open; details.open = true; }
    screenBounds = map.getBounds();
    sheet = buildPrintSheet();
    mapEl.after(sheet);
    mapEl.style.width = `${PRINT_MAP_WIDTH_PX}px`;
    mapEl.style.height = `${PRINT_MAP_HEIGHT_PX}px`;
    map.invalidateSize({ animate: false });
    map.fitBounds(screenBounds, { animate: false });
  });

  window.addEventListener("afterprint", () => {
    if(details) details.open = wasOpen;
    if(sheet){ sheet.remove(); sheet = null; }
    mapEl.style.width = "";
    mapEl.style.height = "";
    map.invalidateSize({ animate: false });
    if(screenBounds) map.fitBounds(screenBounds, { animate: false });
  });

  document.getElementById("printBtn").addEventListener("click", () => window.print());
}
