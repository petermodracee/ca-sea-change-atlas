/**
 * Map page entry point — the one <script type="module"> the page loads.
 * Builds the map and every layer group in the same order the old
 * map.js's main() did, so registered click-to-inspect popup providers
 * (and thus popup section ordering) are unchanged.
 */
import { createInfoPopup } from "../info-popup.js";
import { createMap, createMarkerState, wireMapClick, initGroupCollapse, initGroupHide, initActiveIndicator, initBottomSheet } from "./app-shell.js";
import { initOpacitySliders, initLayerOrder, initLoadingIndicators } from "./shared/panes.js";
import { readPermalink, applyPanelState, replayLayerToggles, initPermalink } from "./permalink.js";
import { initPrint } from "./print.js";
import { initControls } from "./controls.js";
import { wireSearch } from "./search.js";
import { loadRegionData, initRegionLayers } from "./layers/region-layer.js";
import { BcdcLegalDeltaLayer, BcdcFloodLayer } from "./layers/bcdc-flood-layer.js";
import { CosmosLayer } from "./layers/cosmos-layer.js";
import { NoaaSlrLayer } from "./layers/noaa-slr-layer.js";
import { NoaaHtfLayer } from "./layers/noaa-htf-layer.js";
import { FemaNfhlLayer } from "./layers/fema-nfhl-layer.js";
import { CfemCompositeLayer } from "./layers/cfem-composite-layer.js";

async function main(){
  const permalink = readPermalink();
  applyPanelState(permalink); // before layer init(), which reads the panel controls
  const regionData = await loadRegionData();
  const { map, getBasemap } = createMap(permalink);
  initLoadingIndicators(map); // before any layer is added, so every layer's loading events are seen
  const infoPopup = createInfoPopup(map);
  const markerState = createMarkerState();
  wireMapClick(map, infoPopup, markerState);

  initRegionLayers(map, infoPopup, regionData);
  new BcdcLegalDeltaLayer(map, infoPopup).init();
  new BcdcFloodLayer(map, infoPopup).init();
  new CosmosLayer(map, infoPopup).init();
  new NoaaSlrLayer(map, infoPopup).init();
  new NoaaHtfLayer(map, infoPopup).init();
  new FemaNfhlLayer(map, infoPopup).init();
  new CfemCompositeLayer(map, infoPopup).init(); // also sets up its CFEM hazard + storm-surge sublayers

  replayLayerToggles(permalink);
  initControls(map);
  initPermalink(map, getBasemap);
  wireSearch(map, markerState);
  initGroupCollapse();
  initPrint(map);
  initBottomSheet(map);
  initGroupHide();
  initOpacitySliders(map);
  initLayerOrder(map);
  initActiveIndicator();
}

main();
