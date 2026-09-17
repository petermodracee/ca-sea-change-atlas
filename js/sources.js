const state = {
  process: new Set(),
  exposure: new Set(),
  flood: new Set(),
  compare: []
};

let TOOLS = [];

async function loadTools(){
  const res = await fetch("data/tools.json");
  const data = await res.json();
  TOOLS = data.tools;
}

function uniqueSorted(key){
  const s = new Set();
  TOOLS.forEach(t => t[key].forEach(v => s.add(v)));
  return Array.from(s).sort();
}

function buildFieldset(id, items, groupKey){
  const fs = document.getElementById(id);
  items.forEach(val => {
    const wrap = document.createElement("label");
    wrap.className = "chk";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = val;
    cb.addEventListener("change", () => {
      if(cb.checked) state[groupKey].add(val); else state[groupKey].delete(val);
      render();
    });
    const span = document.createElement("span");
    span.textContent = val;
    wrap.appendChild(cb);
    wrap.appendChild(span);
    fs.appendChild(wrap);
  });
}

document.getElementById("clearBtn").addEventListener("click", () => {
  ["process","exposure","flood"].forEach(k => state[k].clear());
  document.querySelectorAll('.filters input[type="checkbox"]').forEach(cb => cb.checked = false);
  render();
});

function matches(tool){
  if(state.process.size && ![...state.process].every(p => tool.processes.includes(p))) return false;
  if(state.exposure.size && ![...state.exposure].every(e => tool.exposure.includes(e))) return false;
  if(state.flood.size && ![...state.flood].every(f => tool.floodInfo.includes(f))) return false;
  return true;
}

function toggleCompare(id){
  const idx = state.compare.indexOf(id);
  if(idx >= 0){ state.compare.splice(idx,1); }
  else if(state.compare.length < 3){ state.compare.push(id); }
  render();
}

function render(){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const visible = TOOLS.filter(matches);
  document.getElementById("countLabel").textContent = visible.length + " of " + TOOLS.length + " tools shown";
  document.getElementById("emptyMsg").style.display = visible.length ? "none" : "block";

  visible.forEach(tool => {
    const card = document.createElement("div");
    card.className = "card";

    const org = document.createElement("div");
    org.className = "org";
    org.textContent = tool.org;
    card.appendChild(org);

    const h3 = document.createElement("h3");
    h3.textContent = tool.name;
    card.appendChild(h3);

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = tool.description;
    card.appendChild(desc);

    const statusTag = document.createElement("span");
    const implemented = tool.implementationStatus === "implemented";
    statusTag.className = "tag status " + (implemented ? "status-implemented" : "status-not-implemented");
    statusTag.textContent = implemented ? "✓ Implemented on this map" : "Not implemented on this map";
    card.appendChild(statusTag);

    const tags = document.createElement("div");
    tags.className = "tagrow";
    const scopeTag = document.createElement("span");
    scopeTag.className = "tag scope";
    scopeTag.textContent = tool.scopeLabel;
    tags.appendChild(scopeTag);
    tool.processes.slice(0,2).forEach(p => {
      const t = document.createElement("span");
      t.className = "tag";
      t.textContent = p;
      tags.appendChild(t);
    });
    card.appendChild(tags);

    const foot = document.createElement("div");
    foot.className = "card-foot";
    const yr = document.createElement("span");
    yr.className = "yr";
    yr.textContent = tool.released;
    foot.appendChild(yr);

    const actions = document.createElement("div");
    actions.className = "actions";

    const details = document.createElement("a");
    details.className = "linkbtn";
    details.href = "/ca-sea-change-atlas/tool/" + tool.id + "/";
    details.textContent = "Details";
    actions.appendChild(details);

    if(tool.url){
      const a = document.createElement("a");
      a.className = "linkbtn";
      a.href = tool.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open tool ↗";
      actions.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.className = "nolink";
      span.textContent = "Link unverified";
      actions.appendChild(span);
    }

    const cmpBtn = document.createElement("button");
    cmpBtn.type = "button";
    const inCompare = state.compare.includes(tool.id);
    cmpBtn.className = "cmp-btn" + (inCompare ? " on" : "");
    cmpBtn.textContent = inCompare ? "✓ Comparing" : "Compare";
    cmpBtn.disabled = !inCompare && state.compare.length >= 3;
    cmpBtn.addEventListener("click", () => toggleCompare(tool.id));
    actions.appendChild(cmpBtn);

    foot.appendChild(actions);
    card.appendChild(foot);
    grid.appendChild(card);
  });

  renderCompareBar();
  renderComparisonTable();
}

function renderCompareBar(){
  const bar = document.getElementById("compareBar");
  const slots = document.getElementById("slots");
  slots.innerHTML = "";
  if(!state.compare.length){ bar.style.display = "none"; return; }
  bar.style.display = "block";
  state.compare.forEach(id => {
    const tool = TOOLS.find(t=>t.id===id);
    const slot = document.createElement("span");
    slot.className = "slot";
    const label = document.createElement("span");
    label.textContent = tool.name.length > 34 ? tool.name.slice(0,32)+"…" : tool.name;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.setAttribute("aria-label","Remove " + tool.name + " from comparison");
    btn.addEventListener("click", () => toggleCompare(id));
    slot.appendChild(label);
    slot.appendChild(btn);
    slots.appendChild(slot);
  });
  document.getElementById("scrollToCompare").onclick = () => {
    document.getElementById("comparison").scrollIntoView({behavior:"smooth", block:"start"});
  };
}

function listCell(items){
  if(!items || !items.length) return "—";
  const ul = document.createElement("ul");
  items.forEach(i => {
    const li = document.createElement("li");
    li.textContent = i;
    ul.appendChild(li);
  });
  return ul;
}

function renderComparisonTable(){
  const wrap = document.getElementById("comparison");
  const table = document.getElementById("cmpTable");
  table.innerHTML = "";
  if(state.compare.length < 2){ wrap.style.display = "none"; return; }
  wrap.style.display = "block";

  const tools = state.compare.map(id => TOOLS.find(t=>t.id===id));
  const rows = [
    ["Implemented on this map", t => t.implementationStatus === "implemented" ? "✓ Implemented" : "Not implemented"],
    ["Organization", t => t.org],
    ["Geographic scope", t => t.scopeLabel],
    ["Released", t => t.released],
    ["Description", t => t.description],
    ["Shoreline processes", t => listCell(t.processes)],
    ["Exposure analysis", t => listCell(t.exposure)],
    ["Projected flood info", t => listCell(t.floodInfo)],
    ["Reports & data", t => t.reportsData],
    ["Sea-level-rise model", t => t.slrModel],
    ["Strengths", t => listCell(t.strengths)],
    ["Limitations", t => listCell(t.limitations)],
    ["Link", t => t.url]
  ];

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.className = "rowlabel-head";
  trh.appendChild(th0);
  tools.forEach(t => {
    const th = document.createElement("th");
    th.textContent = t.name;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(([label, fn]) => {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.className = "rowlabel";
    tdLabel.textContent = label;
    tr.appendChild(tdLabel);
    tools.forEach(t => {
      const td = document.createElement("td");
      if(label === "Link"){
        if(t.url){
          const a = document.createElement("a");
          a.href = t.url; a.target = "_blank"; a.rel = "noopener";
          a.textContent = "Open tool ↗";
          td.appendChild(a);
        } else {
          td.textContent = "Link unverified";
        }
      } else {
        const val = fn(t);
        if(val instanceof Node) td.appendChild(val);
        else td.textContent = val;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

async function main(){
  await loadTools();
  buildFieldset("f-process", uniqueSorted("processes"), "process");
  buildFieldset("f-exposure", uniqueSorted("exposure"), "exposure");
  buildFieldset("f-flood", uniqueSorted("floodInfo"), "flood");
  render();
}

main();
