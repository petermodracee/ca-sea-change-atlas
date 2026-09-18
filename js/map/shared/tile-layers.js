import { cachedFetch } from "./request-cache.js";

/**
 * Leaflet's own tile layers just set <img src> directly, which can't be
 * routed through our cache — so these fetch each tile once (cached by
 * URL) and hand the resulting blob to the <img> themselves. One variant
 * per Leaflet base class: WMS (BCDC, CoSMoS's WMS-backed topics) and plain
 * XYZ (CoSMoS's static pre-rendered tile topics).
 */
export const CachedWmsTileLayer = L.TileLayer.WMS.extend({
  createTile: function(coords, done){
    const img = document.createElement("img");
    const url = this.getTileUrl(coords);
    cachedFetch(url, res => res.blob().then(blob => URL.createObjectURL(blob)))
      .then(objectUrl => { img.src = objectUrl; done(null, img); })
      .catch(err => done(err, img));
    return img;
  }
});

export const CachedXyzTileLayer = L.TileLayer.extend({
  createTile: function(coords, done){
    const img = document.createElement("img");
    const url = this.getTileUrl(coords);
    cachedFetch(url, res => res.blob().then(blob => URL.createObjectURL(blob)))
      .then(objectUrl => { img.src = objectUrl; done(null, img); })
      .catch(err => done(err, img));
    return img;
  }
});
