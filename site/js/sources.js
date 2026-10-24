const state = {
  process: new Set(),
  exposure: new Set(),
  flood: new Set(),
  compare: []
};

let RESOURCES = [];

async function loadResources(){
  const res = await fetch("../data/resources.json");
  const data = await res.json();
  RESOURCES = data.resources;
}

function uniqueSorted(key){
  const s = new Set();
  RESOURCES.forEach(t => t[key].forEach(v => s.add(v)));
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

function matches(resource){
  if(state.process.size && ![...state.process].every(p => resource.processes.includes(p))) return false;
  if(state.exposure.size && ![...state.exposure].every(e => resource.exposure.includes(e))) return false;
  if(state.flood.size && ![...state.flood].every(f => resource.floodInfo.includes(f))) return false;
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
  const visible = RESOURCES.filter(matches);
  document.getElementById("countLabel").textContent = visible.length + " of " + RESOURCES.length + " resources shown";
  document.getElementById("emptyMsg").style.display = visible.length ? "none" : "block";

  visible.forEach(resource => {
    const card = document.createElement("div");
    card.className = "card";

    const org = document.createElement("div");
    org.className = "org";
    org.textContent = resource.org;
    card.appendChild(org);

    const h3 = document.createElement("h3");
    h3.textContent = resource.name;
    card.appendChild(h3);

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = resource.description;
    card.appendChild(desc);

    const statusTag = document.createElement("span");
    const implemented = resource.implementationStatus === "implemented";
    const excluded = resource.mapEligibility === "excluded";
    statusTag.className = "tag status " + (implemented ? "status-implemented" : excluded ? "status-excluded" : "status-not-implemented");
    statusTag.textContent = implemented ? "✓ Implemented in the map tool" : excluded ? "External resource only" : "Not implemented in the map tool";
    card.appendChild(statusTag);

    const tags = document.createElement("div");
    tags.className = "tagrow";
    const scopeTag = document.createElement("span");
    scopeTag.className = "tag scope";
    scopeTag.textContent = resource.scopeLabel;
    tags.appendChild(scopeTag);
    resource.processes.slice(0,2).forEach(p => {
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
    yr.textContent = resource.released;
    foot.appendChild(yr);

    const actions = document.createElement("div");
    actions.className = "actions";

    const details = document.createElement("a");
    details.className = "linkbtn";
    details.href = "resource/" + resource.id + "/";
    details.textContent = "Details";
    actions.appendChild(details);

    if(resource.url){
      const a = document.createElement("a");
      a.className = "linkbtn";
      a.href = resource.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open resource ↗";
      actions.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.className = "nolink";
      span.textContent = "Link unverified";
      actions.appendChild(span);
    }

    const cmpBtn = document.createElement("button");
    cmpBtn.type = "button";
    const inCompare = state.compare.includes(resource.id);
    cmpBtn.className = "cmp-btn" + (inCompare ? " on" : "");
    cmpBtn.textContent = inCompare ? "✓ Comparing" : "Compare";
    cmpBtn.disabled = !inCompare && state.compare.length >= 3;
    cmpBtn.addEventListener("click", () => toggleCompare(resource.id));
    actions.appendChild(cmpBtn);

    foot.appendChild(actions);
    card.appendChild(foot);
    grid.appendChild(card);
  });

  renderCompareBar();
}

function renderCompareBar(){
  const bar = document.getElementById("compareBar");
  const slots = document.getElementById("slots");
  slots.innerHTML = "";
  if(!state.compare.length){ bar.style.display = "none"; return; }
  bar.style.display = "block";
  state.compare.forEach(id => {
    const resource = RESOURCES.find(t=>t.id===id);
    const slot = document.createElement("span");
    slot.className = "slot";
    const label = document.createElement("span");
    label.textContent = resource.name.length > 34 ? resource.name.slice(0,32)+"…" : resource.name;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.setAttribute("aria-label","Remove " + resource.name + " from comparison");
    btn.addEventListener("click", () => toggleCompare(id));
    slot.appendChild(label);
    slot.appendChild(btn);
    slots.appendChild(slot);
  });
  document.getElementById("compareLink").href = "side-by-side/?resources=" + state.compare.map(encodeURIComponent).join(",");
}

async function main(){
  await loadResources();
  buildFieldset("f-process", uniqueSorted("processes"), "process");
  buildFieldset("f-exposure", uniqueSorted("exposure"), "exposure");
  buildFieldset("f-flood", uniqueSorted("floodInfo"), "flood");
  render();
}

main();
