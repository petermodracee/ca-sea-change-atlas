(function(){
const MAX = 3;
const TD = window.ToolDetail;

let TOOLS = [];
let SCHEMA = [];
let MASTERS = {};
let selected = [];   // chosen tool ids; the table compares these
let focusSlot = null;  // header select to refocus after a re-render

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text != null) n.textContent = text;
  return n;
};

function idsFromUrl(){
  const raw = new URLSearchParams(location.search).get("tools") || "";
  const ids = [], unknown = [];
  raw.split(",").map(s => s.trim()).filter(Boolean).forEach(id => {
    if(ids.includes(id) || unknown.includes(id)) return;
    if(TOOLS.some(t => t.id === id)) ids.push(id); else unknown.push(id);
  });
  return { ids: ids.slice(0, MAX), unknown };
}

function syncUrl(){
  history.replaceState(null, "", location.pathname + (selected.length ? "?tools=" + selected.map(encodeURIComponent).join(",") : ""));
}

function statusTag(t){
  const implemented = t.implementationStatus === "implemented";
  const excluded = t.mapEligibility === "excluded";
  return el("span", "tag status " + (implemented ? "status-implemented" : excluded ? "status-excluded" : "status-not-implemented"),
    implemented ? "✓ Implemented in the map tool" : excluded ? "External tool only" : "Not implemented in the map tool");
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

// Rows for one section across all selected tools: [{label, cells:[value|null per tool]}].
function sectionRows(section, tools, resolved){
  if(section.kind === "tag-table"){
    return (MASTERS[section.tagField] || []).map(tag => ({
      label: tag,
      cells: resolved.map(r => r && r.tags.find(t => t.label === tag))
    }));
  }
  return section.rows.map(row => ({
    label: row.label,
    cells: tools.map(t => TD.resolveRow(t, row))
  })).filter(r => r.cells.some(Boolean));
}

function renderSection(section, tools){
  const resolved = tools.map(t => TD.resolveSection(t, section, MASTERS));
  if(!resolved.some(Boolean)) return null;   // nothing for any selected tool: omit the section
  const rows = sectionRows(section, tools, resolved);

  const details = el("details", "tool-detail-section");
  details.open = true;
  details.id = TD.slug(section.title);
  details.appendChild(el("summary", null, section.title));

  const table = el("table", "cmp-table");
  rows.forEach((r, ri) => {
    const tr = document.createElement("tr");
    const th = el("th", null, r.label);
    th.scope = "row";
    tr.appendChild(th);
    tools.forEach((t, ti) => {
      if(!resolved[ti]){
        // This tool has nothing in the section: one spanning cell keeps the columns aligned.
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

function toolSelect(label, value, slotIndex, taken, placeholder){
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", label);
  if(!value) sel.appendChild(new Option(placeholder, ""));
  TOOLS.forEach(t => {
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

  // Header cells: one per chosen tool, padded with empty pickers up to two.
  const cells = selected.slice();
  while(cells.length < 2) cells.push("");
  const grid = el("div", "cmp-head");
  grid.style.setProperty("--cmp-cols", cells.length);

  const corner = el("div", "cmp-head-corner");
  const back = el("a", "cmp-top", "Back to tool list");
  back.href = "sources.html";
  corner.appendChild(back);
  if(selected.length === 2){
    const add = toolSelect("Add a third tool", "", "add", selected, "+ Add a third tool");
    add.addEventListener("change", () => { if(add.value) setSelected(selected.concat(add.value), selected.length); });
    corner.appendChild(add);
  }
  grid.appendChild(corner);

  cells.forEach((id, i) => {
    const t = TOOLS.find(x => x.id === id);
    const cell = el("div", "cmp-head-tool");
    if(t) cell.appendChild(statusTag(t));
    const sel = toolSelect("Tool " + (i + 1), id, i, selected, "Choose a tool…");
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
      d.href = "tool/" + encodeURIComponent(t.id) + "/";
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
    msg.textContent = (note ? note + " " : "") + "Choose at least two tools to compare them.";
  } else {
    msg.textContent = note;
    const tools = selected.map(id => TOOLS.find(t => t.id === id));
    SCHEMA.forEach(section => {
      const d = renderSection(section, tools);
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
    const [tools, schema] = await Promise.all([
      fetch("data/tools.json").then(r => r.json()),
      fetch("data/toolDetailSchema.json").then(r => r.json())
    ]);
    TOOLS = tools.tools;
    SCHEMA = schema;
  } catch(e) {
    msg.textContent = "Couldn't load the tool data. Try reloading the page.";
    return;
  }
  MASTERS = TD.tagMasters(TOOLS, SCHEMA);
  const { ids, unknown } = idsFromUrl();
  selected = ids;
  render(unknown.length ? "Ignored unknown tool id" + (unknown.length > 1 ? "s" : "") + ": " + unknown.join(", ") + "." : "");
}

main();
})();
