# Leaflet plugin review

Reviewed alongside the map UX pass (`feature/map-ux-pass`): would an existing
Leaflet plugin be a better implementation of something the map already does,
or of something planned? Current baseline is Leaflet 1.9.4 + esri-leaflet 3.1.0,
plus custom code in `js/map/`.

## Adopted

| Feature | Choice | Why |
|---|---|---|
| Greyscale basemap | `maplibre-gl` (BSD-3) + `@maplibre/maplibre-gl-leaflet` (ISC) rendering OpenFreeMap "Positron" | Free, keyless, no request limits, open source. Loaded lazily; falls back to greyscale-filtered OSM tiles without WebGL. Stadia Alidade Smooth was rejected: its free tier is non-commercial only with a hard 200k-credit monthly cap and needs domain registration. |
| Basemap switcher | Core `L.control.layers` | Built in; only used for basemaps. |
| Scale bar | Core `L.control.scale` | Built in. |
| "Show my location" | `leaflet.locatecontrol` (MIT) | Maintained, handles permission/error/follow states that are tedious to get right. |

## Built in-house (and why not a plugin)

| Feature | Why custom |
|---|---|
| Layer panel | Grouped sliders, tabs, legends, and per-scenario controls exceed what `L.control.layers` or grouped-layer plugins can host. |
| Opacity sliders | Native `<input type="range">` in the panel driving a per-group pane's CSS opacity. `Leaflet.Control.Opacity` adds a separate on-map control, is little-maintained, and would duplicate the grouped panel. Pane-level opacity also survives BCDC/CoSMoS rebuilding their layers on every slider change. |
| Permalink | `leaflet-hash` is unmaintained and only knows view state; we also need active layers, scenario sliders, opacity and basemap. |
| Distance measure | The available measure plugins (`leaflet-measure`) are stale on Leaflet 1.9 and pull in their own UI; ~80 lines covers what's needed and integrates with click-to-inspect suppression. |
| Address search | Nominatim directly. `leaflet-control-geocoder` would only add providers we don't use, and Nominatim's policy forbids per-keystroke autocomplete, so the plugin's main feature is off the table. |
| Cached WMS/XYZ tiles | `js/map/shared/tile-layers.js`; no plugin equivalent. |
| Print | Print stylesheet + `window.print()`. `leaflet-easyprint` rasterises tiles via canvas and fails on cross-origin WMS layers without CORS headers. |

## Considered and dropped

- **Swipe/compare** (`leaflet-side-by-side`): dropped as too much extra UI in an already busy layer panel.
- **esri-leaflet extras** (`esri-leaflet-identify`, geocoder): existing `shared/identify-url.js` covers current click-to-inspect needs.

## Planned layers

Cal-Adapt statewide SLR (planned) is plain WMS/XYZ and fits the existing
`CachedWmsTileLayer`/`CachedXyzTileLayer` + `BaseLayer` pattern; no plugin needed.
Wire it to a `groupPane(...)` key (see `js/map/shared/panes.js`) so it gets the
opacity, ordering and loading behavior for free.

## Known limitations

- Printing a page whose basemap is the MapLibre vector layer may come out blank in
  some browsers (WebGL canvases don't always print). If so, switch the basemap to
  Standard OSM before printing. Not verified across browsers.
- Permalinks don't capture CoSMoS region/topic/scenario or the BCDC scenario button
  grids; those controls are populated from fetched data after init.
