# Decisions and findings

Things that are not obvious from reading the code: choices that were made deliberately, and assumptions about live services that turned out to be wrong. Each was confirmed directly against the service at the time (response headers, network traffic, real requests), so re-check before relying on one after a long gap; the services change. Licensing decisions are in [`LICENSING.md`](LICENSING.md).

## Site structure

### Two tools on separate pages
The map and the comparison grid answer different questions (what does this stretch of coast look like across models, versus which tool should I use), and the grid doesn't depend on anything the map computes. An earlier plan put them on one page with a click-a-point-to-see-matching-tools feature; it was dropped so the map could be its own focused page with room for a real layer panel. The landing page routes visitors and carries no logic; the About page holds the project history so it isn't repeated in every hero.

### A build step, on purpose
The site started as zero-build static HTML. Eleventy was adopted so each tool can have its own URL (`/compare/tool/<id>/`) with real per-page title, description and Open Graph tags, and so header/footer aren't hand-duplicated. Deploys stay automatic (GitHub Actions), but local development needs Node.

### Tool detail layout lives in a schema
The tool page and the compare page show the same sections, so the layout is data (`data/toolDetailSchema.json`) rather than markup in each template. The optional detail fields were added to `tools.json` at the same time, so entries can be filled in gradually: anything a tool doesn't have is simply absent from its page. The resolver is one small module in `js/` (loaded by Eleventy and by the browser) rather than in a separate `lib/` directory, because `js/` is already copied to the site. `keyFeatures` stays out of the schema because it is a headline list on the tool page, not a row to compare.

### Compare page: the URL is the state
`compare/side-by-side/?tools=<id>,<id>` holds the selection so a comparison can be bookmarked or shared, and it replaces the inline table that used to live on the tool list page. The tool pickers sit in the sticky column headings so a tool can be swapped from anywhere on a long page. A tool with nothing in a section shows "No data available" in its own column instead of the section vanishing, so the columns stay aligned; a section is dropped only when no selected tool has anything for it. The tool page makes the opposite choice for a single tool (empty sections disappear), because there is nothing to line up.

### Screenshots: small, credited, and fair use
Each tool page can show up to two screenshots so a reader gets a feel for a tool before clicking through. They are kept small (about 800px) because they are an at-a-glance aid, not a replacement for the tool, and each opens full size in a new tab. The project treats them as fair use (commentary, demonstration rather than a live copy, small, not a substitute), which is why comparison-only tools can have them too, and why each needs a credit, a capture date and, where stated, a copyright notice. They stay off the compare page to keep it a plain table, and they are not the page's social-preview image because a tool screenshot in a link preview would suggest the link goes to the tool rather than to this description.

### Routes nested by tool, source moved into `site/`
Adding a third tool (County Profiles, rebuilding NOAA's discontinued Coastal County Snapshots for California) turned the flat root namespace (`map.html`, `sources.html`, `compare.html`, `tool/<id>/`) into a naming problem: three tools' pages and a fourth `about.html` would keep landing at the same level with no grouping. Pages now nest under their tool (`/map/`, `/compare/`, `/compare/side-by-side/`, `/compare/tool/<id>/`, `/county-profiles/…`), and `/about/` holds only site-level history, author bio and licensing; each tool's own methodology moves to its own `about/` page (`/compare/about/` holds what used to be the About page's "About the sources" section). Old flat URLs 404 outright — the site had no external links to them yet, so this was the cheap moment to do it. Eleventy's `dir.input` moved from `.` to `site/`, separating hand-authored templates/JS/CSS/data from repo-level project files (docs, README, license text) and from the county-profiles build scripts and generated data archive that don't belong mixed into the same root-level directories.

### `/data/`'s passthrough copy is a JSON glob, not the whole directory
`site/data/index.njk` lives in the same folder as the JSON files it lists. A whole-directory `addPassthroughCopy({"site/data": "data"})` copies every file byte-for-byte regardless of extension, independent of Eleventy's own template rendering — confirmed by a probe `.njk` file landing in the output both raw (`.njk`) and rendered (`.html`). So the data directory is passed through with a `**/*.json` glob instead, which also means non-JSON files placed there (like `site/data/county-profiles/README.md`, a repo-facing scaffold note) are never served, which is the correct behavior for that file anyway.

### The route reorg broke two relative fetches the link audit missed
Moving a page from a root-level file to a nested directory (`/sources.html` → `/compare/`, `/map.html` → `/map/`) changes what a *relative* URL in its JS resolves against, one level deeper — `fetch("data/tools.json")` from `/compare/` requests `/compare/data/tools.json`, not `/data/tools.json`. The reorg's own link-integrity check only walked static `href`/`src` attributes in the rendered HTML; it never caught `site/js/sources.js`'s `fetch("data/tools.json")` or `site/js/map/layers/cosmos-layer.js`'s `COSMOS_LAYERS_URL = "data/cosmos-layers.json"`, both relative string literals inside JS, invisible to that check. Confirmed by loading the built site in a real headless browser under its actual `/ca-sea-change-atlas/` subpath — a plain local static server without that subpath produces a different, misleading set of 404s (every prefixed asset), so the check has to be done with the deploy path prefix as it actually is. Fixed to `"../data/..."` in both places. Any future move of a page to a different directory depth needs the same check: grep JS for relative-looking path literals, not just template `href`/`src`.

### `LICENSE-CONTENT.md` isn't served
It used to be passthrough-copied and linked from the licenses page as CC BY-SA 4.0's "full text," but it never contained the full text — it's a 43-line summary that itself links out to creativecommons.org for the real legal text. The licenses page now links straight to that legal text instead. `LICENSE-CONTENT.md` stays in the repo unpassed-through, since it's a GitHub-browsing convenience (GitHub auto-detects `LICENSE` for the code license; this is the equivalent declaration for the separately-licensed written content, for anyone reading the repo rather than the live site).

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

## Map: county boundaries and zoom-level overviews

These were added so County Profiles can link into the map with a county and layers already set. Each service was tested directly in October 2026.

### County boundaries: Census TIGERweb
Candidates were tested in the order of the brief. **Census TIGERweb State_County MapServer** (`tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer`) passed all four requirements, so Caltrans' `CHboundary/County_Boundaries` (it exists and has a 58-feature layer 0) was not evaluated further.

- **CORS:** responses echo the request `Origin` in `access-control-allow-origin` (checked with `http://localhost:8080` and `https://seachangeatlas.org`).
- **Draws at county zoom:** the county layers are banded by display scale (layers 1, 3, 5, 7, 9, 11 and 13 are one set; further sets start at layers 19, 37 and 55, the last of which carries 2020 census counts; the first set is the one used), so a plain `dynamicMapLayer` would switch geometry by scale and could not highlight one county. `/query` ignores those bands, so the map instead fetches all 58 California counties once as GeoJSON from layer 7 with `maxAllowableOffset` 0.001 degrees (58 features, 334 KB, about 1 s) and draws them as vectors. Smaller offsets cost more (0.0003 degrees on layer 1 was 736 KB); layer 13 at 0.01 was 61 KB but too coarse for a county-scale view.
- **Queryable by FIPS, with an extent:** `where=GEOID='06059'&returnExtentOnly=true&outSR=4326` returns Orange County as -118.148, 33.334 to -117.413, 33.948. The extent covers the county's offshore waters and islands (Los Angeles runs from 32.75 to 34.82 because it includes San Clemente Island), so the map does not use it for fitting: `CountyLayer.fit()` fits to the largest polygon part of the geometry it already fetched for the lines, which keeps Catalina, the Farallones and the Channel Islands from zooming the view out. The extent query was dropped. The boundaries are TIGER legal boundaries and run slightly into coastal water; a shoreline-clipped (cartographic) version was not found as a live service, so they are kept and labelled.
- **License:** Census Bureau data, public domain (17 U.S.C. §105). Its metadata states only "Source: U.S. Census Bureau".

The fallback table of county centres and zooms was therefore not needed and does not exist. Select values are 5-digit FIPS (state 06 plus county), matching TIGERweb's `GEOID`.

### Facility heat overview: leaflet.heat
USGS Structures allows 2,000 records per request, supports `resultOffset` paging and returns JSON, GeoJSON and PBF. A box around Los Angeles County returned (counts, re-measured) 151 hospitals, 521 fire/EMS stations, 146 police stations and 3,157 schools. JSON paging with `orderByFields=OBJECTID` was stable (schools: 2,000 then 1,157). Asking for `outFields=` (empty) still returned a `name` attribute, so the request asks for `OBJECTID` only and the code ignores attributes.

**Measured, Los Angeles County at its fitted zoom (8), desktop pane:** 7 requests (hospitals 1, fire/EMS 1, police 1, schools 4 pages), about 750 ms from first request to last response, 8,008 points in the padded view. A synchronous heat redraw of those points takes about 32 ms (it runs once per move, not per frame). Panning past the padded area refetches the same 7 requests; the old heat stays on screen until the new points replace it.

Heat styling (radius 7, blur 9, `max` 2.2, `maxZoom` 11, minimum opacity 0.3) was tuned by eye on Los Angeles at zoom 8 and 10: with leaflet.heat's defaults the basin saturated at zoom 8. Every facility has the same weight, so schools dominate.

**License correction:** the brief described leaflet.heat as MIT. Version 0.2.0's LICENSE file (and its bundled simpleheat) is BSD-2-Clause, copyright Vladimir Agafonkin; `credits.json` lists it as BSD-2-Clause. It is compatible with this project's license and needs only the notice kept.

leaflet.heat 0.2.0 has no `pane` option and its `onRemove` assumes the canvas is a child of the overlay pane, so `facility-overview-layer.js` subclasses it to put the canvas in the group pane (needed for the group's opacity slider, Hide and bring-to-front) and to guard against a pending animation frame firing after removal.

### FEMA overview below zoom 14: NOAA's tiled copy
Real `/tile/z/y/x` requests were made against `CFEM_FEMAFloodZones` (decoding each PNG and counting non-transparent pixels), zoom 8 to 14:

| Place | z9 | z10 | z11 | z12 |
|---|---|---|---|---|
| Orange coast (33.65, -117.95) | 3.3% | 7.8% | 11.8% | 6.1% |
| Orange inland (33.80, -117.85) | 8.7% | 31.5% | 45.8% | 18.8% |
| Los Angeles basin (34.00, -118.30) | 4.7% | 12.1% | 10.2% | 1.9% |
| Los Angeles coast (33.77, -118.20) | 4.7% | 12.1% | 21.7% | 32.0% |
| Lake County (39.00, -122.75) | 7.1% | 18.5% | 50.5% | 54.4% |

It renders at county zoom (confirmed on screen too: Orange County at zoom 10 and Lake County at zoom 9 show real flood-zone polygons). It was not compared polygon by polygon with the live NFHL. Two things to know:

- **Vintage:** the service has no date in its JSON or metadata XML (`CreaDate` 20230817 is the service's creation date). Its service description says the data are "a composite of best available National Flood Hazard Layer (NFHL) and digital Q3 data, as of April 2015", but the status line does not show it (it says "date unclear"), because the same description is wrong about coverage.
- **The same description says the service covers only Gulf of Mexico and Atlantic coastal counties.** That is stale text: tiles are plainly populated for California. The vintage claim could be just as stale for California, which is why no date is shown. Verify before relying on it.

Click-to-inspect stays on the live FEMA layer only (zoom 14 and up); the CFEM query is the stale county table described above. `cfemFemaToggle` in the CFEM group is unchanged. Not cached or copied.

### NOAA sea level rise over the Delta
Tile requests to `dc_slr/slr_2ft` and `slr_10ft`, same decoding method, with Fresno (Central Valley, far from the sea) as an empty control (0.0% opaque and a 190 B tile at zoom 10, at both heights; its zoom 13 tile could not be decoded):

| Point | 2 ft, z10 | 2 ft, z13 | 10 ft, z10 | 10 ft, z13 |
|---|---|---|---|---|
| Sacramento, river city (38.58, -121.50) | 0.3% | 0.3% | 8.6% | 3.9% |
| Sacramento County Delta, Isleton (38.16, -121.60) | 67.5% | 97.1% | 77.5% | 99.3% |
| San Joaquin, Stockton (37.95, -121.32) | 56.3% | 40.5% | 73.6% | 94.7% |
| San Joaquin Delta islands (37.85, -121.55) | 56.3% | 98.2% | 73.6% | 99.9% |
| Yolo, West Sacramento (38.58, -121.55) | 0.3% | 3.8% | 8.6% | 22.0% |
| Yolo Bypass (38.45, -121.60) | 24.4% | 1.8% | 45.0% | 88.0% |
| Yolo, Clarksburg (38.42, -121.52) | 24.4% | 57.7% | 45.0% | 94.5% |

Data is present over the Delta in all three counties, at both heights. The island tiles are nearly solid at zoom 13 (97 to 99.9%), while the city of Sacramento and West Sacramento are mostly clear at 2 ft. Whether the layer accounts for Delta levees was not checked, so those solid areas may be low-lying land that levees currently protect. County Profiles can offer NOAA SLR links for Sacramento, San Joaquin and Yolo, ideally with that caveat.

### NOAA SLR popup: read the tile, not the services' vector layer
The old popup identified vector layer 0 ("Low-lying Areas") and answered "Within low-lying area: Yes" or "Not within a low-lying area", which a click in the blue read as "not flooded". Tested at Alameda: identify on layer 0 returned the same polygon (OBJECTID 24) at open bay water, a low-lying green patch, and dry land, at 2 ft and 10 ft. Layer 0 holds 54 huge dissolved polygons (extent -171 to 146 degrees longitude), and a point query at a dry Alameda location also hit one, so it cannot say where the low-lying areas are. Identify on raster layer 1 (Depth) returned no result at any of those points. Neither service layer is usable for a point answer, so the popup now reads the one cached tile pixel under the click, as the Cal-Adapt and C-CAP layers do: bright green (85, 255, 0) is low-lying and not connected, any other opaque colour (the violet-blue to pale-cyan depth ramp) is connected flooding, transparent is neither. This gives no depth number; the depth is only in the colour (the legend says "deep to shallow"). The tile ramp includes open water such as the Bay, so the popup says so. Checked at Alameda at 2 ft and 10 ft on a green patch, on blue and on dry land.

### Link fixes found while testing
`NoaaSlrLayer.init()` set the slider to 3 ft after the permalink had restored it, so `noaaSlrSlider` in a link was silently ignored. The override is gone; `site/map/index.njk`'s `value="6"` is the default. A link carrying only `countySelect` (no `map=`) fits that county, and a link with `map=` leaves the view alone.

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
