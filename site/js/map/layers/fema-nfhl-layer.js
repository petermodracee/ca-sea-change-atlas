import { BaseLayer } from "../base-layer.js";
import { groupPane } from "../shared/panes.js";
import { fmtNum } from "../shared/format.js";
import { renderImageLegendBlock } from "../shared/legend.js";
import { CFEM_FEMA_URL, CFEM_FEMA_LAYER_ID } from "./cfem-composite-layer.js";

// --- FEMA National Flood Hazard Layer ---------------------------------------
// Restricted to sublayer 28 ("Flood Hazard Zones") only, not the full 30+
// sublayer composite NFHL service — this is the one that distinguishes
// Zone AE/Zone X etc. (confirmed via direct REST introspection: unique-value
// renderer on FLD_ZONE/ZONE_SUBTY, fields include SFHA_TF/STATIC_BFE).
// This is "effective" flood data (FEMA's default, current-adopted maps) —
// FEMA's preliminary/pending map updates are a separate NFHL sublayer this
// project deliberately doesn't show, per the task's insurance-rating caveat.
//
// Licensing note: FEMA's own NFHL metadata (hazards.fema.gov's metadata XML)
// states use constraints as "Acknowledgement of FEMA would be appreciated in
// products derived from these data" and access constraints "None" — i.e.
// standard U.S. federal public-domain data with a courtesy request, same
// footing as the NOAA/USGS sources above. A CC-BY 3.0 label appears on a
// third-party Data Basin mirror of this same service, but that's Data
// Basin's own platform-wide license on their copy, not a term FEMA itself
// imposes — see docs/LICENSING.md for the citation trail. FEMA is still credited
// prominently below regardless, as good practice.
const FEMA_NFHL_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const FEMA_NFHL_ZONES_LAYER_ID = 28;
const FEMA_NFHL_COLOR = "#C0392B";
const FEMA_NFHL_ATTRIBUTION = 'Flood zones: <a href="https://www.fema.gov/flood-maps/national-flood-hazard-layer" target="_blank" rel="noopener">FEMA National Flood Hazard Layer</a>';
// Layer 28 has its own server-side minScale (36,111.9, confirmed directly
// against its metadata) — FEMA just doesn't render/query these zone
// polygons when zoomed out past roughly a neighborhood view. Confirmed
// empirically (fetching real export tiles and checking pixel content):
// fully transparent through zoom 13 at Bay Area latitudes, real content
// from zoom 14 on. Toggling the layer on while zoomed out further than
// this produces a real request that legitimately renders nothing — not
// a bug. Below that zoom the checkbox draws NOAA's tiled copy instead (see below).
const FEMA_NFHL_MIN_ZOOM = 14;
// Below that zoom the checkbox shows NOAA's tiled copy of FEMA flood zones (the service the CFEM
// group's "FEMA Flood Zones" toggle uses) as an overview. Its service description says April 2015 but is wrong
// about coverage, so no date is shown (docs/DECISIONS.md); the live layer takes over at FEMA_NFHL_MIN_ZOOM.
const OVERVIEW_ATTRIBUTION = 'Overview: <a href="https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html" target="_blank" rel="noopener">NOAA Coastal Flood Exposure Mapper</a>, a copy of FEMA flood zones';
const OVERVIEW_STATUS = "Overview from NOAA's copy of FEMA flood zones (date unclear). Zoom in to neighborhood level for FEMA's current effective map.";

/**
 * The FEMA Flood Zones checkbox: NOAA's tiled copy of the zones below FEMA_NFHL_MIN_ZOOM, FEMA's live
 * effective Flood Hazard Zones sublayer from there up, with the legend following whichever is showing
 * and a zone-query identify popup provider that only answers on the live layer.
 */
export class FemaNfhlLayer extends BaseLayer {
  constructor(map, infoPopup){
    super(map, infoPopup);
    this.toggleEl = document.getElementById("femaToggle");
    this.resultEl = document.getElementById("femaResult");
    this.legendEl = document.getElementById("femaLegend");
  }

  isEnabled(){
    return this.toggleEl.checked;
  }

  /** True when the live FEMA layer, not the NOAA overview, is the one to show at the current zoom. */
  showsLive(){
    return this.map.getZoom() >= FEMA_NFHL_MIN_ZOOM;
  }

  buildLayer(){
    const pane = groupPane(this.map, "fema");
    this.layerIsLive = this.showsLive();
    return this.layerIsLive
      ? L.esri.dynamicMapLayer({ url: FEMA_NFHL_URL, layers: [FEMA_NFHL_ZONES_LAYER_ID], opacity: 0.6, pane, attribution: FEMA_NFHL_ATTRIBUTION })
      : L.esri.tiledMapLayer({ url: CFEM_FEMA_URL, opacity: 0.6, pane, attribution: OVERVIEW_ATTRIBUTION });
  }

  async updateLegend(){
    if(!this.isEnabled()){ this.legendEl.hidden = true; this.legendEl.innerHTML = ""; return; }
    const live = this.showsLive();
    const block = live
      ? await renderImageLegendBlock(FEMA_NFHL_URL, FEMA_NFHL_ZONES_LAYER_ID, "Flood Hazard Zones")
      : await renderImageLegendBlock(CFEM_FEMA_URL, CFEM_FEMA_LAYER_ID, "FEMA Flood Zones (NOAA's copy, date unclear)");
    if(!this.isEnabled() || live !== this.showsLive()) return; // toggled or zoomed across the hand-off while the legend loaded
    this.legendEl.innerHTML = "";
    this.legendEl.appendChild(block);
    this.legendEl.hidden = false;
  }

  updateStatus(){
    this.resultEl.textContent = this.isEnabled() && !this.showsLive() ? OVERVIEW_STATUS : "";
  }

  /** Swaps between the overview and the live layer when the zoom crosses FEMA_NFHL_MIN_ZOOM. */
  handOff(){
    if(!this.isEnabled() || !this.layer || this.layerIsLive === this.showsLive()) return;
    this.refresh();
    this.updateStatus();
  }

  init(){
    this.applySwatch('[data-swatch="fema"]', FEMA_NFHL_COLOR, false);
    this.toggleEl.addEventListener("change", () => { this.refresh(); this.updateStatus(); });
    this.map.on("zoomend", () => this.handOff());
    this.registerPopupProvider(latlng => this.identify(latlng));
  }

  identify(latlng){
    // Only the live layer is clickable: the NOAA copy's query returns a stale county table (docs/DECISIONS.md).
    if(!this.isEnabled() || !this.showsLive()) return Promise.resolve(null);
    return new Promise(resolve => {
      L.esri.query({ url: `${FEMA_NFHL_URL}/${FEMA_NFHL_ZONES_LAYER_ID}` })
        .contains(latlng)
        .run((error, featureCollection) => {
          if(error){ resolve(null); return; }
          if(!featureCollection || !featureCollection.features.length){
            resolve({ title: "FEMA Flood Zone", note: "No flood zone mapped at this point." });
            return;
          }
          const f = featureCollection.features[0].properties;
          const rows = [{ label: "Flood Zone", value: f.FLD_ZONE || "—" }];
          if(f.ZONE_SUBTY) rows.push({ label: "Zone Subtype", value: f.ZONE_SUBTY });
          rows.push({ label: "Special Flood Hazard Area", value: f.SFHA_TF === "T" ? "Yes" : "No" });
          if(typeof f.STATIC_BFE === "number" && f.STATIC_BFE > -9999){
            rows.push({ label: "Base Flood Elevation", value: `${fmtNum(f.STATIC_BFE, 1)} ft` });
          }
          resolve({ title: "FEMA Flood Zone", rows });
        });
    });
  }
}
