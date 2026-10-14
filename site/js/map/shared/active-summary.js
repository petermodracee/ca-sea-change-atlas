/**
 * Summary of what's on, cloned from the live layer panel: for each active layer
 * group its name, scenario values, checked layers and legends. Shared by the
 * print sheet (print.js) and the on-map legend card (legend-card.js), so both
 * always say the same thing as the panel.
 */

/** Removes ids from a cloned subtree so the clone can't duplicate an id in the live panel. */
function stripIds(root){
  root.removeAttribute("id");
  root.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
}

/**
 * Builds the active-layer summary from the layer panel's current state.
 * @returns {DocumentFragment} One `<section>` per active group (empty when nothing is on).
 */
export function buildActiveSummary(){
  const fragment = document.createDocumentFragment();

  document.querySelectorAll(".layer-group.has-active").forEach(group => {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = group.querySelector(".layer-group-title span").textContent.trim();
    section.appendChild(heading);

    // Scenario values (e.g. "Sea Level Rise, 3 ft", "36"" total water level) so the summary says what was modelled.
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

    legends.forEach(legend => {
      const copy = legend.cloneNode(true);
      stripIds(copy);
      section.appendChild(copy);
    });
    fragment.appendChild(section);
  });
  return fragment;
}
