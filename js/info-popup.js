// Generic click-to-inspect popup, not specific to any one map/tool.
//
// A "provider" is an async function (latlng) => section | section[] | null.
// A section looks like { title, rows: [{label, value}], note }. Providers
// own their own data-fetching and decide whether they have anything to say
// about a given point (return null if not); this module only owns turning
// whatever sections come back into one combined Leaflet popup. Any future
// map/tool on this page can register its own providers without touching
// this file.
export function createInfoPopup(map){
  const providers = [];
  let popup = null;
  let requestId = 0;

  function registerProvider(fn){
    providers.push(fn);
  }

  function renderSections(sections){
    const wrap = document.createElement("div");
    wrap.className = "info-popup";
    sections.forEach(section => {
      const block = document.createElement("div");
      block.className = "info-popup-section";
      if(section.title){
        const h = document.createElement("h4");
        h.textContent = section.title;
        block.appendChild(h);
      }
      (section.rows || []).forEach(row => {
        const r = document.createElement("div");
        r.className = "info-popup-row";
        const label = document.createElement("span");
        label.className = "info-popup-label";
        label.textContent = row.label;
        const value = document.createElement("span");
        value.className = "info-popup-value";
        value.textContent = row.value;
        r.appendChild(label);
        r.appendChild(value);
        block.appendChild(r);
      });
      if(section.note){
        const n = document.createElement("div");
        n.className = "info-popup-note";
        n.textContent = section.note;
        block.appendChild(n);
      }
      wrap.appendChild(block);
    });
    return wrap;
  }

  async function showAt(latlng){
    if(popup){ map.closePopup(popup); popup = null; }
    if(!providers.length) return;

    const thisRequest = ++requestId;
    const loading = L.popup({ maxWidth: 300 })
      .setLatLng(latlng)
      .setContent('<div class="info-popup info-popup-loading">Loading…</div>')
      .openOn(map);
    popup = loading;

    const results = await Promise.all(providers.map(p => {
      try{ return Promise.resolve(p(latlng)).catch(() => null); }
      catch(e){ return Promise.resolve(null); }
    }));
    if(thisRequest !== requestId) return; // a newer click superseded this one

    const sections = results.filter(Boolean).flat();
    map.closePopup(loading);
    if(!sections.length){ popup = null; return; }
    popup = L.popup({ maxWidth: 300 })
      .setLatLng(latlng)
      .setContent(renderSections(sections))
      .openOn(map);
  }

  return { registerProvider, showAt };
}
