# Map (`/map/`)

Leaflet, esri-leaflet and plain ES modules; no framework and no bundler. `site/js/map/index.js` is the only `<script type="module">` on the page (set by `mapModuleEntry` in `site/map/index.njk`). Panel markup is static HTML in `site/map/index.njk`; layer modules look up their controls by id at construction, so an id in `site/map/index.njk` and the module that reads it must change together.

## Modules

| Module | Role |
|---|---|
| `index.js` | Entry point. Order matters: read the permalink, apply panel state to the DOM, create the map, register loading indicators, then init every layer (which reads the panel controls), replay layer toggles, then the panel behaviors. Popup section order follows layer init order. |
| `app-shell.js` | Map creation, the map-click handler (drops the shared marker, opens the popup, defers to the measure tool), and panel behavior: group collapse, per-group Hide, "N on" badge, mobile bottom sheet. |
| `basemaps.js` | Basemap switcher (`L.control.layers`). Default is greyscale OpenFreeMap "Positron" rendered by MapLibre GL (loaded lazily, SRI-pinned), falling back to greyscale-filtered OSM tiles without WebGL. Also Humanitarian, standard OSM and Esri imagery. The chosen basemap is remembered in `localStorage` (`atlas.basemap`). |
| `base-layer.js` | `BaseLayer`: shared lifecycle (`init`, `isEnabled`, `buildLayer`, `refresh`, `updateLegend`) plus `applySwatch` and `registerPopupProvider`. |
| `layers/*.js` | One class per layer group (below). |
| `shared/panes.js` | One Leaflet pane per layer group: a z-order slot (panel "bring to front"), a CSS opacity (panel slider), and a loading state. Layers must pass `pane: groupPane(map, key)`. `GROUP_PANE_KEYS` is the closed list of keys. |
| `shared/request-cache.js` | `cachedFetch(url, transform)`: per-session, in-memory promise cache keyed by URL. |
| `shared/tile-layers.js` | `CachedWmsTileLayer` and `CachedXyzTileLayer`: fetch each tile through `cachedFetch` and hand a blob URL to the `<img>`. |
| `shared/identify-url.js` | Builds WMS GetFeatureInfo URLs (bbox and pixel math) for BCDC and CoSMoS. |
| `shared/legend.js` | Static swatch legends, image legends, and legends fetched from an ArcGIS `/legend` endpoint. |
| `shared/button-grid.js`, `dom.js`, `format.js` | Scenario button rows, swatch coloring, number formatting. |
| `shared/load-script.js` | `loadScript({src, integrity})`: injects an SRI-checked `<script>` for lazily loaded libraries (MapLibre, h5wasm). |
| `shared/zenodo-projections.js` | `loadCaliforniaProjections()`: range-reads one NetCDF file out of the task force's 298 MB Zenodo zip and parses it with h5wasm. See [`DECISIONS.md`](DECISIONS.md#nasa-interagency-sea-level-rise-scenario-tool-a-point-layer-built-from-the-zenodo-data). |
| `permalink.js` | URL-hash state (see below). |
| `controls.js` | Scale bar, locate button, distance-measure tool (sets `map.measureActive`). |
| `search.js` | Nominatim address search, California-biased, submit-only, with alternative matches listed. |
| `print.js` | Print/save-as-PDF: clones active groups, scenario values and legends from the live panel into a print sheet styled by the print block in `css/style.css`. |
| `../info-popup.js` | Tool-agnostic click-to-inspect popup, see below. |

## Layer groups

| Panel group | Class (file in `layers/`) | Pane key | Notes |
|---|---|---|---|
| BCDC Flood Explorer | `BcdcFloodLayer`, `BcdcLegalDeltaLayer` (`bcdc-flood-layer.js`) | `bcdc` | Live WMS. Total-water-level slider or scenario picker, impact layers, consequence picker. Regional storm-surge baseline only. Also exports the WMS URL and GML parser reused by ECC. |
| East Contra Costa | `BcdcEccLayer` (`bcdc-ecc-layer.js`) | `bcdcEcc` | Same BCDC WMS server and session cache; only layer names differ. |
| CoSMoS | `CosmosLayer` (`cosmos-layer.js`) | `cosmos` | Point Blue tile/WMS infrastructure, not ArcGIS. Region and topic dropdowns, SLR slider, storm-frequency picker. Templates in `site/data/cosmos-layers.json`. |
| Cal-Adapt | `CalAdaptSlrLayer` (`caladapt-slr-layer.js`) | `calAdapt` | Plain XYZ tiles from `api.cal-adapt.org`, one layer per regional mosaic, clipped to its footprint. |
| NOAA Sea Level Rise Viewer | `NoaaSlrLayer` (`noaa-slr-layer.js`), `NoaaHtfLayer` (`noaa-htf-layer.js`) | `noaaSlr` (SLR only) | SLR is one pre-cached tiled MapServer per half-foot scenario (`L.esri.tiledMapLayer`). High Tide Flooding stations are circle markers with a nearest-station popup; they sit in the same panel group but not in its pane. |
| Interagency Sea Level Scenarios | `NasaScenarioLayer` (`nasa-scenario-layer.js`) | `nasaSlr` | Point layer: 13 California tide gauges as labelled circle markers, with scenario (Low to High) and year (2020–2150) dropdowns. Values are median relative sea level rise above 2000, in feet. Popup shows every scenario at the selected year for the nearest gauge. Data is fetched on first toggle (about 7 MB: h5wasm plus the projection file). Not an area layer. |
| FEMA Flood Zones | `FemaNfhlLayer` (`fema-nfhl-layer.js`) | `fema` | Effective NFHL data only. |
| NOAA Coastal Flood Exposure Mapper | `CfemCompositeLayer` (`cfem-composite-layer.js`) constructs `CfemStormSurgeLayer` and three `CfemHazardLayer`s | `cfem` | Composite hazard overlap, hurricane storm surge, and CFEM's own High Tide Flooding, FEMA Flood Zones and Tsunami Run-up. The hazard layers have legends only. |
| Geo / demographic info | `initGeoInfoLayers` (`geo-info-layer.js`) | `geoPeople`, `geoFacilities`, `geoLand` | Context layers from EPA, CDC/ATSDR, USGS, NOAA C-CAP and Caltrans. People and Land sections are dropdowns (one layer at a time, `data-layer-select`); Facilities are checkboxes. Config-driven: each entry declares its service, legend and popup rows. |

Tool status (implemented, comparison-only) is in `site/data/tools.json`, not here. Note that one panel group can cover several tools (CFEM contains the storm-surge overlay, which also has its own tool entry), so the panel and the dataset are not one-to-one.

## Click-to-inspect

`info-popup.js` holds a list of *providers*: async `(latlng) => section | section[] | null`, where a section is `{title, rows: [{label, value}], note}`. A layer registers one with `registerPopupProvider` and returns `null` when it is off or has nothing to say; the popup merges whatever comes back. Providers own their own fetching. Techniques in use:

- WMS GetFeatureInfo (BCDC, ECC, CoSMoS), via `shared/identify-url.js`
- ArcGIS `query` (FEMA, HTF stations, geo layers) or `identify` (NOAA SLR, CFEM composite). `query` is used wherever it works: `identify` returned empty results against FEMA's service, and the CFEM composite is a raster that does not support `query`
- Reading the rendered tile pixel: Cal-Adapt (alpha channel, extent only), and the geo layers' `identifyTile` (NOAA land cover, matched against the legend colors)
- `identifyRoad`: Caltrans counts, drawn on state highway lines by nearest count along the route

CFEM's High Tide Flooding, FEMA Flood Zones and Tsunami layers deliberately have no popup; see [`DECISIONS.md`](DECISIONS.md).

## Request caching

BCDC, ECC and CoSMoS tiles and identify calls, the CFEM composite identify, and ArcGIS legend JSON go through `cachedFetch`, so revisiting a tile or clicking the same point twice doesn't repeat a slow live render. It is per page session only. Layers that don't use it: Cal-Adapt tiles (long `Cache-Control` and CORS `*`, so the browser cache is enough) and everything drawn by esri-leaflet's own tile and dynamic layers. Why it exists: [`DECISIONS.md`](DECISIONS.md#no-cache-headers-from-the-flood-servers).

## Permalink

`permalink.js` writes `#map=zoom/lat/lng&base=Name&on=key,key&v=key~value|key~value` with `history.replaceState`. It restores the view, basemap, checked layers, opacity sliders and the value controls listed in `VALUE_CONTROL_IDS`. Not covered: CoSMoS region/topic/scenario (its controls are populated from fetched data after init, hence `UNTRACKED_CHECKBOX_IDS` excludes its toggle) and the BCDC scenario button grids.

## Local configuration: CoSMoS

CoSMoS's layer catalog is not CORS-enabled for cross-origin fetches even though its tile/WMS server is, so `site/data/cosmos-layers.json` holds the URL and layer-name templates (verified against the live catalog). It is configuration, not data: every tile and WMS render still comes live from `geo.pointblue.org`.

## Library and plugin choices

Baseline: Leaflet 1.9.4 and esri-leaflet 3.1.0 plus the custom code above.

**Adopted**

| Feature | Choice | Why |
|---|---|---|
| Greyscale basemap | `maplibre-gl` (BSD-3) + `@maplibre/maplibre-gl-leaflet` (ISC) rendering OpenFreeMap "Positron" | Free, keyless, no request limits, open source. Lazy-loaded, with an OSM fallback. Stadia Alidade Smooth was rejected: non-commercial free tier, hard monthly cap, domain registration. |
| Basemap switcher, scale bar | Core `L.control.layers`, `L.control.scale` | Built in. |
| "Show my location" | `leaflet.locatecontrol` (MIT) | Handles permission, error and follow states. |

**Built in-house**

| Feature | Why not a plugin |
|---|---|
| Layer panel | Grouped sliders, tabs, legends and per-scenario controls exceed `L.control.layers` and grouped-layer plugins. |
| Opacity sliders | Native range inputs driving a per-group pane's CSS opacity. `Leaflet.Control.Opacity` adds a separate on-map control and would duplicate the panel; pane-level opacity also survives BCDC and CoSMoS rebuilding their layers on every slider change. |
| Permalink | `leaflet-hash` is unmaintained and only knows view state. |
| Distance measure | Available plugins are stale on Leaflet 1.9; about 80 lines integrate with click suppression. |
| Address search | Nominatim directly. `leaflet-control-geocoder` would only add unused providers, and Nominatim's policy forbids per-keystroke autocomplete. |
| Cached WMS/XYZ tiles | `shared/tile-layers.js`; no plugin equivalent. |
| Print | Print stylesheet plus `window.print()`. `leaflet-easyprint` rasterises via canvas and fails on cross-origin WMS without CORS. |

**Considered and dropped:** swipe/compare (`leaflet-side-by-side`, too much extra UI in a busy panel); esri-leaflet extras (`esri-leaflet-identify`, geocoder; `shared/identify-url.js` covers current needs).

## Adding a layer

1. **Licensing first.** Confirm the source is openly licensed ([`CONTRIBUTING.md`](../CONTRIBUTING.md#licensing-requirements)). If it isn't, it belongs on the comparison page only; mark it `mapEligibility: "excluded"` in `site/data/tools.json` and record why in [`LICENSING.md`](LICENSING.md).
2. **Layer class** in `site/js/map/layers/`, extending `BaseLayer`. Implement `buildLayer()` for a single sublayer, or override `refresh()` like BCDC and CoSMoS for several. Build layers with `pane: groupPane(map, "<key>")`.
3. **Pane key**: add it to `GROUP_PANE_KEYS` and the JSDoc union in `shared/panes.js`.
4. **Panel markup** in `site/map/index.njk`: a `.layer-group` with a collapsible title and body, an opacity slider carrying `data-pane="<key>"`, and controls whose ids the class reads.
5. **Init** it in `site/js/map/index.js` (order sets popup section order).
6. **Popup provider** via `registerPopupProvider` if the source supports a point query.
7. **Permalink**: add any new slider/select id to `VALUE_CONTROL_IDS` in `permalink.js`; checkboxes with an id are tracked automatically.
8. **Data and credits**: add or update the entry in `site/data/tools.json` ([`TOOLS.md`](TOOLS.md#adding-a-tool)) and an entry in `site/_data/credits.json`.
9. **Attribution**: set `attribution` on the Leaflet layer and add the credit to `footerAttribution` in `site/map/index.njk`.
10. Verify against the live service directly before trusting an assumption about it; see [`DECISIONS.md`](DECISIONS.md) for how that has gone wrong before.

## Known limitations

- No automated tests; verification is manual in the browser.
- Printing with the MapLibre vector basemap can come out blank in some browsers (WebGL canvases don't always print); switch to the standard OSM basemap first. Not verified across browsers.
- Nominatim and the OSM tile servers are usually blocked in network-sandboxed agent environments, so search can look broken there while working in a real browser. Read `search.js` rather than trusting a sandboxed run.
