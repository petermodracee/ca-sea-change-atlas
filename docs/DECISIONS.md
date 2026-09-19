# Decisions and findings

Things that are not obvious from reading the code: choices that were made deliberately, and assumptions about live services that turned out to be wrong. Each was confirmed directly against the service at the time (response headers, network traffic, real requests), so re-check before relying on one after a long gap; the services change. Licensing decisions are in [`LICENSING.md`](LICENSING.md).

## Site structure

### Two tools on separate pages
The map and the comparison grid answer different questions (what does this stretch of coast look like across models, versus which tool should I use), and the grid doesn't depend on anything the map computes. An earlier plan put them on one page with a click-a-point-to-see-matching-tools feature; it was dropped so the map could be its own focused page with room for a real layer panel. The landing page routes visitors and carries no logic; the About page holds the project history so it isn't repeated in every hero.

### A build step, on purpose
The site started as zero-build static HTML. Eleventy was adopted so each tool can have its own URL (`/tool/<id>/`) with real per-page title, description and Open Graph tags, and so header/footer aren't hand-duplicated. Deploys stay automatic (GitHub Actions), but local development needs Node.

## Data services

### CoSMoS is not an ArcGIS service
The first implementation used a Caltrans-hosted ArcGIS mirror (`CoSMoS_SLR`), which covers one topic for one region at reduced granularity (9 SLR stops instead of 12, no "Annual" storm frequency). Matching the real Our Coast, Our Future tool required tracing its network traffic, which showed it runs on Point Blue Conservation Science's GeoServer and tile infrastructure (`geo.pointblue.org`). CoSMoS was rebuilt on that. Its layer catalog isn't CORS-enabled, so the URL and layer-name templates live in `data/cosmos-layers.json`. The Caltrans-hosted cliff-erosion service originally assumed for Cliff Retreat doesn't exist (404); Point Blue serves it.

### `/export` lies about pre-cached tiled services
`dynamicMapLayer` (`/export`) doesn't reliably reflect what a `singleFusedMapCache: true` service actually serves. It rendered NOAA's Sea Level Rise Viewer as a solid box across the tile extent, and made CFEM's Tsunami service look empty over California, which led to a wrong "no usable data" conclusion. Real `/tile/z/y/x` requests showed both are fine. Rule: for a fused-cache service use `L.esri.tiledMapLayer` and test with tile requests. NOAA SLR uses `tiledMapLayer`; CFEM's High Tide Flooding, FEMA Flood Zones and Tsunami layers are separate, real tiled services.

### CFEM hazard layers have no click-to-inspect
For CFEM's High Tide Flooding, FEMA Flood Zones and Tsunami services, `/query` returns the same leftover county-eligibility table regardless of which service is queried, disconnected from what the tile cache renders (checked at real coastal points). They get a live legend only.

### CFEM composite: real sublayer name, raster identify
The composite's California sublayer is `CA_FloodComposite` (id 42), not `CA_FloodComposite_int`. It is a raster, so ArcGIS `/query` fails on it and click-to-inspect uses `/identify`, which returns the overlapping-hazard count and description.

### `query` over `identify` where possible
FEMA's `identify` returned empty results at points where `query` worked, so point lookups use `query`. `identify` remains where the layer is a raster (CFEM composite) or the tool's own pattern (NOAA SLR).

### CFEM storm surge coverage
The hurricane storm-surge overlay comes from a separate ArcGIS Online hosted service published by NOAA's National Hurricane Center Storm Surge Unit (SLOSH data), found by tracing CFEM's own traffic. It has no mapped coverage for higher categories or the rest of California: only Category 1–2, Southern California only.

### High Tide Flooding as stations, not an area layer
NOAA's area-based Flood Frequency layer (`dc_slr/Flood_Frequency`) requires an ArcGIS token this project can't obtain. The public alternative is `dc_slr/Point_Layers` sublayer 1: NOAA CO-OPS tide-gauge stations with minor/moderate/major flood thresholds. It is deliberately not tied to the SLR slider, because those thresholds are today's, not a scenario. (CFEM's own tiled High Tide Flooding layer is separate and is also on the map.) A comment in `noaa-htf-layer.js` calling `CFEM_HighTideFlooding` "essentially empty" predates the tiled-cache finding above and shouldn't be taken as current.

### Cal-Adapt is its own tile API
The Cal-Adapt tool draws pre-rendered XYZ tiles from `api.cal-adapt.org/tiles/{slug}/{z}/{x}/{y}.png` (72 mosaics: CoSMoS by region, CalFloD3D-TFS at 5 m and 50 m, two periods, min/median/max). It does not call CNRA's `CSMW_Sea_Level_Rise` MapServer, which is an older, Third-Assessment-era dataset. There is no per-point value service, so click-to-inspect reads the rendered tile's alpha and reports extent only.

### East Contra Costa reuses BCDC's server
Its config (`query.php?q=getConfig`) returns the same WMS server and mapfile as the Bay explorer, so it reuses that URL, cache and GML parsing; only the layer names differ.

### BCDC transportation consequence layers are left out
Vehicle traffic, truck traffic and rail return empty tiles and zero features across multiple real highway and rail locations and a bbox spanning the Bay, while every other consequence category returns data. It is a gap in BCDC's published data, not a request-format problem. The consequence picker points users to BCDC's own tool. (Caltrans traffic counts are available as a separate geo layer.)

### BCDC scenario picker uses one regional storm-surge baseline
A per-county baseline (auto-detected from the click) was tried on top of BCDC's regional average and removed as not worth the complexity. The picker, its equivalent-combinations table and the greying of invalid combinations use BCDC's regional baseline only. Click-to-inspect is the fully precise way to see what BCDC reports at a point.

### No cache headers from the flood servers
BCDC's server sends no `Cache-Control` or `Expires` on tiles or GetFeatureInfo, and the other live sources are similarly unhelpful (checked from response headers). `shared/request-cache.js` keeps a per-session cache keyed by URL so a repeated tile or click doesn't repeat a roughly 450 ms server render. Cal-Adapt's tiles send a one-year `Cache-Control`, so they skip it.

## Practitioner-survey resources

Four resources from the practitioner survey (Figure 19.3, 2023 CA Coastal Adaptation Needs Assessment) were scoped but never added or excluded. Each was checked against the live service, September 2026. Licensing for the comparison-only ones is in [`LICENSING.md`](LICENSING.md).

### NOAA Coastal Inundation Dashboard: comparison-only
Station-based (200+ NOAA tide gauges): real-time and forecast water levels. NOAA's own page says its sea-level-rise mapping comes from the Sea Level Rise Viewer, which is on the map. The CO-OPS Metadata API (`api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/<id>/floodlevels.json`) is public and CORS-open, but the map already shows CO-OPS flood thresholds (see High Tide Flooding above). Redundant, so `mapEligibility: "excluded"`. Whether the Dashboard's and the map's thresholds match for every California station was not compared.

### NOAA Coastal County Snapshots: comparison-only
County reports (flood exposure, ocean jobs, wetland benefits) with charts and maps, built from FEMA, Census, BLS and C-CAP data. NOAA states the datasets are no longer updated. It is per-county reports, not a queryable map service, and no endpoint was found (individual snapshot pages were not inspected). Its flood inputs are already mapped. Excluded.

### NASA Interagency Sea Level Rise Scenario Tool: a point layer built from the Zenodo data
The tool is live: a map of U.S. tide-gauge points (13 in California) with a decade picker and a Low-to-High scenario picker, and a full projection per gauge. Points rather than flood extents still count as map-like, the same as the High Tide Flooding stations. Curl and fetch tools get 404s on its page URLs (bot filtering); a real browser loads them.

The tool's own feed (`sealevel.nasa.gov/taskforce-passthru/?markers=true` and `?psmsl_id=<n>`) works but sends no CORS header, is undocumented and states no license, so a static site can't use it. The layer instead reads the task force's published data on Zenodo (record 6067895, version 1.1, CC BY 4.0). Zenodo allows cross-origin requests with `Range` (206 responses), so the browser fetches the zip's directory (last 70 KB) and then only `Results/TR_local_projections.nc` (3.3 MB compressed, NetCDF4/HDF5), inflates it with `DecompressionStream` and reads it with h5wasm (`iife` build, SRI-pinned, about 4 MB, loaded on first toggle). That keeps the rule that map data loads live from the publisher and is never copied into the repo. `Content-Length` isn't exposed cross-origin, so the zip size is pinned in `zenodo-projections.js` with the record version.

File layout, confirmed: `rsl_total_<Low|IntLow|Int|IntHigh|High>[percentile 17/50/83][year 1900–2150][gauge]` in millimetres relative to 2000, plus `PSMSL_id`, `lat`, `lon` (0–360 in some rows, normalised), `tg` (name). Its 13 California gauges match the tool's marker feed by PSMSL id.

**The numbers do not match NASA's tool.** Port San Luis, High, median: 2150 is 3577 mm (11.74 ft) in Zenodo and 3436 mm (11.27 ft) in the tool; 2020 is 70.5 vs 58.3 mm. Versions 1.0 and 1.1 of the record agree with each other. Both use the same baseline (year 2000: the record's own code re-baselines to the trajectory at 2000, and the tool page says the same), so this is not a baseline shift. The gap is gauge-specific: San Francisco is within a few mm to 39 mm; Crescent City is about +280 mm at 2150; San Diego is about −66 to −96 mm. The cause was not found. Neither source states a newer data date, and v1.1 (Feb 2022) is the newest Zenodo version. The layer is therefore labelled as the report's Zenodo data, with a note that values can differ from NASA's tool. Revisit if NASA or NOAA publishes a newer dataset or explains the difference.

Cost: about 7 MB on first toggle (h5wasm plus the projection file), once per page load.

The National Sea Level Explorer (`earth.gov/sealevel/us/`) is a related tool from the same task force; the original was still live at the time of writing.

### Coastal Hazards System (CHS): left out entirely
USACE ERDC's probabilistic storm-hazard system covers the Atlantic, Gulf, Great Lakes and Puerto Rico/USVI; its Studies page lists nothing for California. A September 2025 ERDC technical note (CHETN-I-105) applies CHS storm-selection methods to Washington, Oregon and California, but as a methods evaluation that names what a West Coast CHS would still need. The maintainers confirmed by logging into the CHS web tool (government login required) that California is not included. It also reports storm water levels at points, not sea-level-rise flood extent. No `tools.json` entry, since a card for a tool that can't answer a California question is noise. Revisit if a West Coast CHS study is published.

## Behavior

### Nominatim: submit only
Search runs on submit, never per keystroke, because Nominatim's usage policy forbids autocomplete. Results are biased to a California viewbox and limited to the US.
