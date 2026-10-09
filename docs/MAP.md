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
| `shared/legend.js` | Static swatch legends, gradient (colour ramp) legends, image legends, and legends fetched from an ArcGIS `/legend` endpoint. |
| `shared/button-grid.js`, `dom.js`, `format.js` | Scenario button rows, swatch coloring, number formatting. |
| `shared/load-script.js` | `loadScript({src, integrity})`: injects an SRI-checked `<script>` for lazily loaded libraries (MapLibre, h5wasm). |
| `shared/zenodo-projections.js` | `loadCaliforniaProjections()`: range-reads one NetCDF file out of the task force's 298 MB Zenodo zip and parses it with h5wasm. See [`DECISIONS.md`](DECISIONS.md#nasa-interagency-sea-level-rise-scenario-tool-a-point-layer-built-from-the-zenodo-data). |
| `permalink.js` | URL-hash state (see below). Exports `VALUE_CONTROL_IDS` so Node tooling can import the list. |
| `controls.js` | Scale bar, locate button, distance-measure tool (sets `map.measureActive`). |
| `search.js` | Nominatim address search, California-biased, submit-only, with alternative matches listed. |
| `print.js` | Print/save-as-PDF: clones active groups, scenario values and legends from the live panel into a print sheet styled by the print block in `css/style.css`. |
| `../info-popup.js` | Tool-agnostic click-to-inspect popup, see below. |

## Layer groups

| Panel group | Class (file in `layers/`) | Pane key | Notes |
|---|---|---|---|
| County boundaries | `CountyLayer` (`county-layer.js`) | `county` | County lines from Census TIGERweb (statewide, one live query, generalized to about 100 m), each drawn as a pale halo under a dark stroke; the selected county is heavier. Also the "Zoom to county" select, which fits the map to a live extent query. Its pane is on top of the others by default. See [County fit](#county-fit). |
| BCDC Flood Explorer | `BcdcFloodLayer`, `BcdcLegalDeltaLayer` (`bcdc-flood-layer.js`) | `bcdc` | Live WMS. Total-water-level slider or scenario picker, impact layers, consequence picker. Regional storm-surge baseline only. Also exports the WMS URL and GML parser reused by ECC. |
| East Contra Costa | `BcdcEccLayer` (`bcdc-ecc-layer.js`) | `bcdcEcc` | Same BCDC WMS server and session cache; only layer names differ. |
| CoSMoS | `CosmosLayer` (`cosmos-layer.js`) | `cosmos` | Point Blue tile/WMS infrastructure, not ArcGIS. Region and topic dropdowns, SLR slider, storm-frequency picker. Templates in `site/data/cosmos-layers.json`. |
| Cal-Adapt | `CalAdaptSlrLayer` (`caladapt-slr-layer.js`) | `calAdapt` | Plain XYZ tiles from `api.cal-adapt.org`, one layer per regional mosaic, clipped to its footprint. |
| NOAA Sea Level Rise Viewer | `NoaaSlrLayer` (`noaa-slr-layer.js`), `NoaaHtfLayer` (`noaa-htf-layer.js`) | `noaaSlr` (SLR only) | SLR is one pre-cached tiled MapServer per half-foot scenario (`L.esri.tiledMapLayer`). Its legend shows layer 0 (green, low-lying areas not connected to the ocean) and layer 1 (blue depth ramp) for the current scenario. The popup reads the rendered tile pixel and says flooded (blue, connected), low-lying (green) or neither. High Tide Flooding stations are circle markers with a nearest-station popup; they sit in the same panel group but not in its pane. |
| Interagency Sea Level Scenarios | `NasaScenarioLayer` (`nasa-scenario-layer.js`) | `nasaSlr` | Point layer: 13 California tide gauges as labelled circle markers, with scenario (Low to High) and year (2020–2150) dropdowns. Values are median relative sea level rise above 2000, in feet. Popup shows every scenario at the selected year for the nearest gauge. Data is fetched on first toggle (about 7 MB: h5wasm plus the projection file). Not an area layer. |
| FEMA Flood Zones | `FemaNfhlLayer` (`fema-nfhl-layer.js`) | `fema` | Zoom 14 and closer: FEMA's live effective NFHL data only, with click-to-inspect. Below 14: NOAA's tiled copy of FEMA flood zones (the service behind the CFEM group's own FEMA toggle) as an overview, with a status line, its own legend and no popup. The layer swaps on `zoomend`. |
| NOAA Coastal Flood Exposure Mapper | `CfemCompositeLayer` (`cfem-composite-layer.js`) constructs `CfemStormSurgeLayer` and three `CfemHazardLayer`s | `cfem` | Composite hazard overlap, hurricane storm surge, and CFEM's own High Tide Flooding, FEMA Flood Zones and Tsunami Run-up. The hazard layers have legends only. |
| Geo / demographic info | `initGeoInfoLayers` (`geo-info-layer.js`) | `geoPeople`, `geoFacilities`, `geoLand` | Context layers from EPA, CDC/ATSDR, USGS, NOAA C-CAP and Caltrans. People and Land sections are dropdowns (one layer at a time, `data-layer-select`); Facilities are checkboxes; Critical facilities add a heat overview below zoom 11 (see [Facility heat overview](#facility-heat-overview)). Config-driven: each entry declares its service, legend and popup rows. |

Tool status (implemented, comparison-only) is in `site/data/tools.json`, not here. Note that one panel group can cover several tools (CFEM contains the storm-surge overlay, which also has its own tool entry), so the panel and the dataset are not one-to-one.

## Click-to-inspect

`info-popup.js` holds a list of *providers*: async `(latlng) => section | section[] | null`, where a section is `{title, rows: [{label, value}], note}`. A layer registers one with `registerPopupProvider` and returns `null` when it is off or has nothing to say; the popup merges whatever comes back. Providers own their own fetching. Techniques in use:

- WMS GetFeatureInfo (BCDC, ECC, CoSMoS), via `shared/identify-url.js`
- ArcGIS `query` (FEMA, HTF stations, geo layers) or `identify` (NOAA SLR, CFEM composite). `query` is used wherever it works: `identify` returned empty results against FEMA's service, and the CFEM composite is a raster that does not support `query`
- Reading the rendered tile pixel: Cal-Adapt (alpha channel, extent only), and the geo layers' `identifyTile` (NOAA land cover, matched against the legend colors)
- `identifyRoad`: Caltrans counts, drawn on state highway lines by nearest count along the route

CFEM's High Tide Flooding, FEMA Flood Zones and Tsunami layers deliberately have no popup; see [`DECISIONS.md`](DECISIONS.md).

## Facility heat overview

Critical facilities are circle markers from zoom 11 (`FACILITY_MARKER_MIN_ZOOM`). A whole-county view would otherwise show nothing, so `FacilityOverviewLayer` (`facility-overview-layer.js`) sits in the same `geoFacilities` layer group and draws a density heat map further out. Same checkbox (`geoFacilities`); there is no extra permalink control.

| Zoom | Shows |
|---|---|
| 11 and above | Circle markers (esri-leaflet `featureLayer`s, as before). The popup provider answers. |
| 8 up to 11 (`FACILITY_HEAT_MIN_ZOOM`) | Heat overview. The popup provider returns nothing. |
| Below 8 | Status line "Zoom in to see facilities" under the checkbox (`#geoFacilitiesResult`). |

Data: the four USGS Structures layers (49 hospitals, 51 fire/EMS, 53 police, 58 schools), geometry only, for the viewport padded by 25% and snapped outward to half a tile at the current zoom. Each layer is paged with `resultOffset` (2,000 per page, ordered by OBJECTID) until the server stops reporting `exceededTransferLimit`, to at most 6 pages per layer; if the cap is hit the status line says the overview is partial. Pages go through `cachedFetch` (key: layer, snapped box, offset) and are stored as compact coordinate arrays, per session only. A token discards results from a superseded pan or zoom, as `TrafficRoadLayer` does, and no refetch happens while the loaded box still contains the view.

Drawing: `leaflet.heat` always appends its canvas to the overlay pane, so `createHeatLayer` subclasses it to put the canvas in `groupPane(map, "geoFacilities")`. That is what makes the group's opacity slider, Hide and bring-to-front work on it. The layer fires `loading`/`load`, so the group's spinner shows. The legend adds a gradient entry, "Facility density, low to high; schools, hospitals, fire/EMS, police". Every facility counts equally, so schools (about 20 times the number of hospitals in Los Angeles County) dominate the density.

## County fit

`CountyLayer` fetches the statewide county polygons once per page session from TIGERweb (layer 7, `maxAllowableOffset` 0.001 degrees, about 330 KB) and draws them when `countyToggle` is checked. Choosing a county in `countySelect` calls `fitBounds` (20 px padding) on the bounds of the county's largest polygon part, taken from that same fetched geometry (no extra request, nothing stored). Islands are still drawn in the outline but don't widen the fit: without this, Los Angeles (Catalina, San Clemente), San Francisco (Farallones), Ventura and Santa Barbara (Channel Islands) zoomed out to include them. Los Angeles fits at zoom 8 on a 1280x650 window and 9 on 1920x1080, so the facility heat overview shows. The lines are TIGER legal boundaries, which extend slightly into coastal water; shoreline-clipped versions aren't available as a live service, so the layer is labelled "County boundaries (legal, may include coastal water)".

At load, a link with a county but no `map=` view fits to that county; a link with `map=` keeps its view. The select does not turn the lines on, and Hide (which unchecks the lines) leaves the select alone, so a link still carries the county.

## Request caching

BCDC, ECC and CoSMoS tiles and identify calls, the CFEM composite identify, and ArcGIS legend JSON go through `cachedFetch`, so revisiting a tile or clicking the same point twice doesn't repeat a slow live render. It is per page session only. Layers that don't use it: Cal-Adapt tiles (long `Cache-Control` and CORS `*`, so the browser cache is enough) and everything drawn by esri-leaflet's own tile and dynamic layers. Why it exists: [`DECISIONS.md`](DECISIONS.md#no-cache-headers-from-the-flood-servers).

## Permalink

`permalink.js` writes `#map=zoom/lat/lng&base=Name&on=key,key&v=key~value|key~value` with `history.replaceState`. It restores the view, basemap, checked layers, opacity sliders and the value controls listed in `VALUE_CONTROL_IDS` (an exported constant, importable from Node with `import { VALUE_CONTROL_IDS } from "./site/js/map/permalink.js"`; Node 22 and later prints a one-time module-type warning because `package.json` has no `"type"`). Checkbox keys are `id:<checkboxId>`; value controls are `id:<controlId>~<value>`. A link may omit `map=` when it carries `id:countySelect` (see [County fit](#county-fit)). Not covered: CoSMoS region/topic/scenario (its controls are populated from fetched data after init, hence `UNTRACKED_CHECKBOX_IDS` excludes its toggle) and the BCDC scenario button grids.

## Linkable control ids

County Profiles generates map links from these ids and values. **Renaming or removing any of them breaks County Profiles links.** Change them together with the generator.

| Control | Id | Hash key | Values |
|---|---|---|---|
| County lines | `countyToggle` (checkbox) | `on=id:countyToggle` | on or off |
| Zoom to county | `countySelect` | `v=id:countySelect~<FIPS>` | 5-digit FIPS, `06001` (Alameda) to `06115` (Yuba), odd county numbers only; empty is none |
| NOAA sea level rise | `noaaSlrToggle` (checkbox), `noaaSlrSlider` | `on=id:noaaSlrToggle`, `v=id:noaaSlrSlider~<n>` | index 0 to 20 = feet x 2 (`4` is 2 ft, `20` is 10 ft) |
| FEMA flood zones | `femaToggle` (checkbox) | `on=id:femaToggle` | on or off; overview below zoom 14, live NFHL from 14 |
| People layer | `geoPeopleSelect` | `v=id:geoPeopleSelect~<value>` | `geoPopDensity`, `geoJobsDensity`, `geoPoverty`, `geoElderly`; empty is none |
| Land layer | `geoLandSelect` | `v=id:geoLandSelect~<value>` | `geoDeveloped`, `geoNatural`, `geoDevChange`, `geoWetlandPotential`; empty is none |
| Critical facilities | `geoFacilities` (checkbox) | `on=id:geoFacilities` | on or off; heat overview below zoom 11 |

`on=` replaces all tracked checkbox state, so list every layer that should be on. Example, Orange County with 2 ft of sea level rise, population density and county lines: `#on=id:noaaSlrToggle,id:countyToggle&v=id:noaaSlrSlider~4|id:geoPeopleSelect~geoPopDensity|id:countySelect~06059`.

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
| Facility density overview | `leaflet.heat` 0.2.0 (BSD-2-Clause, SRI-pinned in `site/_includes/base.njk`) | Tiny canvas heat map; the pane option it lacks is added by a short subclass. Markers or clusters would be unreadable at county zoom with thousands of points. |

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
7. **Permalink**: add any new slider/select id to `VALUE_CONTROL_IDS` in `permalink.js` (and to [Linkable control ids](#linkable-control-ids) if County Profiles should link to it); checkboxes with an id are tracked automatically.
8. **Data and credits**: add or update the entry in `site/data/tools.json` ([`TOOLS.md`](TOOLS.md#adding-a-tool)) and an entry in `site/_data/credits.json`.
9. **Attribution**: set `attribution` on the Leaflet layer and add the credit to `footerAttribution` in `site/map/index.njk`.
10. Verify against the live service directly before trusting an assumption about it; see [`DECISIONS.md`](DECISIONS.md) for how that has gone wrong before.

## Known limitations

- No automated tests; verification is manual in the browser.
- Printing with the MapLibre vector basemap can come out blank in some browsers (WebGL canvases don't always print); switch to the standard OSM basemap first. Not verified across browsers.
- Nominatim and the OSM tile servers are usually blocked in network-sandboxed agent environments, so search can look broken there while working in a real browser. Read `search.js` rather than trusting a sandboxed run.
