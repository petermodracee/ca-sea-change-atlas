(function(){
const MAX = 3;
const TD = window.ResourceDetail;

let RESOURCES = [];
let SCHEMA = [];
let MASTERS = {};
let selected = [];   // chosen resource ids; the table compares these
let focusSlot = null;  // header select to refocus after a re-render

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text != null) n.textContent = text;
  return n;
};

function idsFromUrl(){
  const raw = new URLSearchParams(location.search).get("resources") || "";
  const ids = [], unknown = [];
  raw.split(",").map(s => s.trim()).filter(Boolean).forEach(id => {
    if(ids.includes(id) || unknown.includes(id)) return;
    if(RESOURCES.some(t => t.id === id)) ids.push(id); else unknown.push(id);
  });
  return { ids: ids.slice(0, MAX), unknown };
}

function syncUrl(){
  history.replaceState(null, "", location.pathname + (selected.length ? "?resources=" + selected.map(encodeURIComponent).join(",") : ""));
}

function statusTag(t){
  const implemented = t.implementationStatus === "implemented";
  const excluded = t.mapEligibility === "excluded";
  return el("span", "tag status " + (implemented ? "status-implemented" : excluded ? "status-excluded" : "status-not-implemented"),
    implemented ? "✓ Implemented in the map tool" : excluded ? "External resource only" : "Not implemented in the map tool");
}

function fillValue(td, v){
  if(v.kind === "list"){
    const ul = document.createElement("ul");
    v.items.forEach(i => ul.appendChild(el("li", null, i)));
    td.appendChild(ul);
  } else if(v.kind === "link"){
    const a = el("a", null, v.href);
    a.href = v.href; a.target = "_blank"; a.rel = "noopener";
    td.appendChild(a);
  } else {
    td.textContent = v.text;
  }
}

function fillCell(td, cell){
  if(!cell){ td.textContent = "—"; return; }
  if("yes" in cell){
    if(cell.yes){
      td.appendChild(el("strong", null, "Yes"));
      if(cell.detail) td.appendChild(document.createTextNode(" — " + cell.detail));
    } else {
      td.textContent = "No";
    }
    return;
  }
  fillValue(td, cell);
}

// Rows for one section across all selected resources: [{label, cells:[value|null per resource]}].
function sectionRows(section, resources, resolved){
  if(section.kind === "tag-table"){
    return (MASTERS[section.tagField] || []).map(tag => ({
      label: tag,
      cells: resolved.map(r => r && r.tags.find(t => t.label === tag))
    }));
  }
  return section.rows.map(row => ({
    label: row.label,
    cells: resources.map(t => TD.resolveRow(t, row))
  })).filter(r => r.cells.some(Boolean));
}

function renderSection(section, resources){
  const resolved = resources.map(t => TD.resolveSection(t, section, MASTERS));
  if(!resolved.some(Boolean)) return null;   // nothing for any selected resource: omit the section
  const rows = sectionRows(section, resources, resolved);

  const details = el("details", "resource-detail-section");
  details.open = true;
  details.id = TD.slug(section.title);
  details.appendChild(el("summary", null, section.title));

  const table = el("table", "cmp-table");
  rows.forEach((r, ri) => {
    const tr = document.createElement("tr");
    const th = el("th", null, r.label);
    th.scope = "row";
    tr.appendChild(th);
    resources.forEach((t, ti) => {
      if(!resolved[ti]){
        // This resource has nothing in the section: one spanning cell keeps the columns aligned.
        if(ri === 0){
          const td = el("td", "cmp-none", "No data available");
          td.rowSpan = rows.length;
          tr.appendChild(td);
        }
        return;
      }
      const td = document.createElement("td");
      fillCell(td, r.cells[ti]);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  details.appendChild(table);
  return details;
}

function resourceSelect(label, value, slotIndex, taken, placeholder){
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", label);
  if(!value) sel.appendChild(new Option(placeholder, ""));
  RESOURCES.forEach(t => {
    const o = new Option(t.name, t.id);
    o.disabled = taken.includes(t.id) && t.id !== value;
    sel.appendChild(o);
  });
  sel.value = value || "";
  sel.dataset.slot = slotIndex;
  return sel;
}

function setSelected(next, slot){
  selected = next;
  focusSlot = slot;
  syncUrl();
  render("");
}

function render(note){
  const msg = document.getElementById("cmpMsg");
  const head = document.getElementById("cmpHead");
  const sections = document.getElementById("cmpSections");
  const scrollY = window.scrollY;
  head.innerHTML = "";
  sections.innerHTML = "";

  // Header cells: one per chosen resource, padded with empty pickers up to two.
  const cells = selected.slice();
  while(cells.length < 2) cells.push("");
  const grid = el("div", "cmp-head");
  grid.style.setProperty("--cmp-cols", cells.length);

  const corner = el("div", "cmp-head-corner");
  const back = el("a", "cmp-top", "Back to resource list");
  back.href = "../";
  corner.appendChild(back);
  if(selected.length === 2){
    const add = resourceSelect("Add a third resource", "", "add", selected, "+ Add a third resource");
    add.addEventListener("change", () => { if(add.value) setSelected(selected.concat(add.value), selected.length); });
    corner.appendChild(add);
  }
  grid.appendChild(corner);

  cells.forEach((id, i) => {
    const t = RESOURCES.find(x => x.id === id);
    const cell = el("div", "cmp-head-resource");
    if(t) cell.appendChild(statusTag(t));
    const sel = resourceSelect("Resource " + (i + 1), id, i, selected, "Choose a resource…");
    sel.addEventListener("change", () => {
      if(!sel.value) return;
      const next = selected.slice();
      next[i] = sel.value;
      setSelected(next, i);
    });
    cell.appendChild(sel);
    if(t){
      const org = el("div", "org", t.org);
      org.title = t.org;
      cell.appendChild(org);
      const links = el("div", "cmp-head-links");
      const d = el("a", "linkbtn", "Details");
      d.href = "../resource/" + encodeURIComponent(t.id) + "/";
      links.appendChild(d);
      if(selected.length > 2){
        const rm = el("button", "linkbtn", "Remove");
        rm.type = "button";
        rm.setAttribute("aria-label", "Remove " + t.name + " from comparison");
        rm.addEventListener("click", () => setSelected(selected.filter(x => x !== id), null));
        links.appendChild(rm);
      }
      cell.appendChild(links);
    }
    grid.appendChild(cell);
  });
  head.appendChild(grid);

  if(selected.length < 2){
    msg.textContent = (note ? note + " " : "") + "Choose at least two resources to compare them.";
  } else {
    msg.textContent = note;
    const resources = selected.map(id => RESOURCES.find(t => t.id === id));
    SCHEMA.forEach(section => {
      const d = renderSection(section, resources);
      if(d) sections.appendChild(d);
    });
  }

  // Rebuilding the page must not move the reader: restore scroll, then refocus the changed picker.
  window.scrollTo({ top: scrollY, behavior: "instant" });
  if(focusSlot != null){
    const f = grid.querySelector('select[data-slot="' + focusSlot + '"]');
    if(f) f.focus({ preventScroll: true });
    focusSlot = null;
  }
}

async function main(){
  const msg = document.getElementById("cmpMsg");
  try {
    const [resources, schema] = await Promise.all([
      fetch("../../data/resources.json").then(r => r.json()),
      fetch("../../data/resourceDetailSchema.json").then(r => r.json())
    ]);
    RESOURCES = resources.resources;
    SCHEMA = schema;
  } catch(e) {
    msg.textContent = "Couldn't load the resource data. Try reloading the page.";
    return;
  }
  MASTERS = TD.tagMasters(RESOURCES, SCHEMA);
  const { ids, unknown } = idsFromUrl();
  selected = ids;
  render(unknown.length ? "Ignored unknown resource id" + (unknown.length > 1 ? "s" : "") + ": " + unknown.join(", ") + "." : "");
}

main();
})();
