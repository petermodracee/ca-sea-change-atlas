import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { fmtNum } from "../shared/format.js";
import { SCENARIOS, loadCaliforniaProjections } from "../shared/zenodo-projections.js";

// --- Interagency Sea Level Rise Scenarios at tide gauges --------------------
// Point layer recreating NASA's Interagency Sea Level Rise Scenario Tool for
// California's tide gauges. Data: the task force's 2022 Technical Report
// projections on Zenodo (CC BY 4.0), read live, see shared/zenodo-projections.js.
// Values are relative sea level in feet above the year-2000 level. They come
// from the report's published data and can differ from what NASA's tool shows.
const MM_PER_FOOT = 304.8;
const MARKER_COLOR = "#2B6CB0";
const CLICK_RADIUS_M = 80000;
const ATTRIBUTION = 'Sea level scenarios: <a href="https://zenodo.org/records/6067895" target="_blank" rel="noopener">Interagency Sea Level Rise Task Force (2022 Technical Report data)</a>';

const feet = mm => mm / MM_PER_FOOT;
const fmtFeet = mm => `${fmtNum(feet(mm), 1)} ft`;

/** Tide gauges as labelled circle markers showing the selected scenario's rise at the selected year, with a nearest-gauge popup. */
export class NasaScenarioLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.getElementById("nasaSlrToggle");
    this.scenarioEl = document.getElementById("nasaSlrScenario");
    this.yearEl = document.getElementById("nasaSlrYear");
    this.resultEl = document.getElementById("nasaSlrResult");
    this.groupEl = this.toggleEl.closest(".layer-group");
    this.data = null;
    this.requestId = 0;
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  init(){
    this.applySwatch('[data-swatch="nasa-slr"]', MARKER_COLOR, false);
    this.toggleEl.addEventListener("change", () => this.refresh());
    [this.scenarioEl, this.yearEl].forEach(el => el.addEventListener("change", () => this.refresh()));
    this.registerPopupProvider(latlng => this.identify(latlng));
  }

  selection(){
    return { scenario: this.scenarioEl.value, yearIndex: this.data.years.indexOf(Number(this.yearEl.value)) };
  }

  /** Refreshes asynchronously: the first call downloads the projections; a stale call (toggled off or changed meanwhile) is dropped. */
  async refresh(){
    const requestId = ++this.requestId;
    if(this.layer){
      this.map.removeLayer(this.layer);
      this.layer = null;
    }
    if(!this.isEnabled()){
      this.setStatus("", false);
      return;
    }
    if(!this.data){
      this.setStatus("Loading tide-gauge projections…", true);
      try {
        const data = await loadCaliforniaProjections();
        if(requestId !== this.requestId) return;
        this.data = data;
      } catch(error){
        if(requestId !== this.requestId) return;
        this.setStatus("Couldn't load the projection data. Turn the layer off and on to retry.", false);
        return;
      }
    }
    this.setStatus("", false);
    this.layer = this.buildLayer();
    this.layer.addTo(this.map);
    this.updateLegend();
  }

  buildLayer(){
    const { scenario, yearIndex } = this.selection();
    const pane = groupPane(this.map, "nasaSlr");
    const markers = this.data.gauges.map(gauge => {
      const [, median] = gauge.total[scenario][yearIndex];
      const marker = L.circleMarker([gauge.lat, gauge.lng], {
        pane, radius: 7, color: "#1A365D", weight: 1.5, fillColor: MARKER_COLOR, fillOpacity: 0.9, attribution: ATTRIBUTION
      });
      marker.bindTooltip(fmtFeet(median), { permanent: true, direction: "right", offset: [8, 0], className: "nasa-slr-label" });
      return marker;
    });
    return L.layerGroup(markers, { attribution: ATTRIBUTION });
  }

  updateLegend(){
    if(!this.data || !this.isEnabled()){
      this.resultEl.textContent = "";
      return;
    }
    const { scenario } = this.selection();
    const label = SCENARIOS.find(s => s.key === scenario).label;
    this.resultEl.textContent = `Median relative sea level rise at each tide gauge by ${this.yearEl.value}, ${label} scenario, above the year-2000 level.`;
  }

  setStatus(text, loading){
    this.resultEl.textContent = text;
    this.groupEl.classList.toggle("is-loading", loading);
  }

  identify(latlng){
    if(!this.isEnabled() || !this.layer || !this.data) return Promise.resolve(null);
    let nearest = null, minDist = Infinity;
    this.data.gauges.forEach(gauge => {
      const d = latlng.distanceTo(L.latLng(gauge.lat, gauge.lng));
      if(d < minDist){ minDist = d; nearest = gauge; }
    });
    if(!nearest || minDist > CLICK_RADIUS_M){
      return Promise.resolve({ title: "Sea level scenarios", note: "No tide gauge within 80 km of this point." });
    }
    const { scenario, yearIndex } = this.selection();
    const year = this.data.years[yearIndex];
    const range = ([low, median, high]) => `${fmtFeet(median)} (${fmtNum(feet(low), 1)}–${fmtNum(feet(high), 1)})`;
    return Promise.resolve({
      title: `Sea level scenarios, nearest tide gauge: ${nearest.name}`,
      rows: [
        { label: "Distance from clicked point", value: `${fmtNum(minDist / 1000, 0)} km` },
        ...SCENARIOS.map(s => ({
          label: `${s.label}${s.key === scenario ? " (selected)" : ""}, ${year}`,
          value: range(nearest.total[s.key][yearIndex])
        }))
      ],
      note: "Relative sea level rise above the year-2000 level, median with the 17th–83rd percentile range, from the 2022 Interagency Sea Level Rise Technical Report. A value at a tide gauge, not a flood extent, and it can differ from NASA's scenario tool."
    });
  }
}
