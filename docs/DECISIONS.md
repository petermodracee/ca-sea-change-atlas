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

## Behavior

### Nominatim: submit only
Search runs on submit, never per keystroke, because Nominatim's usage policy forbids autocomplete. Results are biased to a California viewbox and limited to the US.
