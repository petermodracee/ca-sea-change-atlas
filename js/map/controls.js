/**
 * Small map controls that aren't layers: scale bar, "show my location"
 * (leaflet.locatecontrol, loaded in base.njk) and a distance-measure tool.
 */

const METERS_PER_MILE = 1609.344;

/** Formats a length in meters as "1.23 km (0.76 mi)". */
function formatDistance(meters){
  return `${(meters / 1000).toFixed(2)} km (${(meters / METERS_PER_MILE).toFixed(2)} mi)`;
}

/**
 * Click-to-measure control: while active, map clicks add vertices to a
 * polyline and a tooltip on the last vertex shows the running length.
 * Sets `map.measureActive` so the click-to-inspect popup stays quiet
 * (see wireMapClick in app-shell.js). Esc or a second click on the button clears it.
 */
const MeasureControl = L.Control.extend({
  options: { position: "topleft" },

  onAdd(map){
    this._map = map;
    this._points = [];
    this._layer = L.layerGroup();

    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control-measure");
    const button = L.DomUtil.create("a", "", container);
    button.href = "#";
    button.role = "button";
    button.title = "Measure distance (click points on the map, Esc to finish)";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = '<span aria-hidden="true">&#128207;</span>';
    this._button = button;

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(button, "click", e => {
      L.DomEvent.preventDefault(e);
      this._setActive(!map.measureActive);
    });
    return container;
  },

  _setActive(active){
    const map = this._map;
    map.measureActive = active;
    this._button.classList.toggle("active", active);
    map.getContainer().classList.toggle("measuring", active);
    if(active){
      this._layer.addTo(map);
      map.on("click", this._onClick, this);
      L.DomEvent.on(document, "keydown", this._onKey, this);
    } else {
      map.off("click", this._onClick, this);
      L.DomEvent.off(document, "keydown", this._onKey, this);
      this._layer.clearLayers();
      map.removeLayer(this._layer);
      this._points = [];
    }
  },

  _onKey(e){
    if(e.key === "Escape") this._setActive(false);
  },

  _onClick(e){
    this._points.push(e.latlng);
    this._layer.clearLayers();
    L.polyline(this._points, { color: "#AE4A2C", weight: 3, dashArray: "6,4", interactive: false }).addTo(this._layer);
    this._points.forEach(p => L.circleMarker(p, { radius: 4, color: "#AE4A2C", fillOpacity: 1, interactive: false }).addTo(this._layer));

    let total = 0;
    for(let i = 1; i < this._points.length; i++) total += this._points[i - 1].distanceTo(this._points[i]);
    L.tooltip({ permanent: true, direction: "right", offset: [8, 0] })
      .setLatLng(e.latlng)
      .setContent(this._points.length > 1 ? formatDistance(total) : "Start")
      .addTo(this._layer);
  }
});

/** Adds the scale bar, locate button and measure tool to the map. */
export function initControls(map){
  L.control.scale({ position: "bottomleft", maxWidth: 140 }).addTo(map);
  new MeasureControl().addTo(map);
  if(L.control.locate){
    L.control.locate({
      position: "topleft",
      strings: { title: "Show my location" },
      locateOptions: { maxZoom: 14 }
    }).addTo(map);
  }
}
