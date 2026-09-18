/**
 * Map page entry point — the one <script type="module"> the page loads.
 * Builds the map and every layer group in the same order the old
 * map.js's main() did, so registered click-to-inspect popup providers
 * (and thus popup section ordering) are unchanged.
 */
import { createInfoPopup } from "../info-popup.js";
import { createMap, createMarkerState, wireMapClick, initGroupCollapse, initGroupHide, initActiveIndicator } from "./app-shell.js";
import { wireSearch } from "./search.js";
import { loadRegionData, initRegionLayers } from "./layers/region-layer.js";
import { BcdcLegalDeltaLayer, BcdcFloodLayer } from "./layers/bcdc-flood-layer.js";
import { CosmosLayer } from "./layers/cosmos-layer.js";
import { NoaaSlrLayer } from "./layers/noaa-slr-layer.js";
import { NoaaHtfLayer } from "./layers/noaa-htf-layer.js";
import { FemaNfhlLayer } from "./layers/fema-nfhl-layer.js";
import { CfemCompositeLayer } from "./layers/cfem-composite-layer.js";

async function main(){
  const regionData = await loadRegionData();
  const map = createMap();
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

  wireSearch(map, markerState);
  initGroupCollapse();
  initGroupHide();
  initActiveIndicator();
}

main();
