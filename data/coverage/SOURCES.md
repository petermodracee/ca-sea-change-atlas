# Coverage region boundary data

`tools.json` references these `coverageRegion` ids. Geometry now exists for
all four regions — see `ATTRIBUTION.md` for full license/provenance detail.
This file records where it actually came from and why, for future upkeep.

## Actual source used

census.gov and eric.clst.org (originally suggested below) were unreachable
from the environment that built this data. Boundaries were instead pulled
from the **Plotly `datasets` repository**
(`plotly/datasets/geojson-counties-fips.json`, MIT licensed), which bundles
US county polygons originally derived from Census TIGER data. See
`ATTRIBUTION.md` for the full license text and required credit.

## bay-area-counties
The 9 Bay Area counties: Alameda, Contra Costa, Marin, Napa, San Francisco,
San Mateo, Santa Clara, Solano, Sonoma. Filtered from the Plotly counties
file by California FIPS codes (001, 013, 041, 055, 075, 081, 085, 095, 097),
simplified with `mapshaper`.

## east-contra-costa
No standard boundary exists for "eastern" Contra Costa specifically, and no
BCDC/SFEI study-area shapefile was found, so `east-contra-costa.geojson` is
a **hand-drawn approximation** enclosing Antioch, Pittsburg, Oakley,
Brentwood, and the Bethel Island area. Flagged as approximate via
`_meta.approximate` on its feature — revisit if BCDC/SFEI ever publish an
authoritative study-area boundary.

## california-state
Derived by **dissolving all 58 California county polygons** from the same
Plotly counties file into a single outline (rather than sourcing a second,
separately-licensed statewide boundary file), then simplified with
`mapshaper`.
Used for both the true statewide tools (Cal-Adapt, CoSMoS, CREST) and,
in a visually distinct style, the national tools whose actual extent is
the whole US coastline — see BRIEF.md for why those are simplified to
"California" here rather than drawn as full US coverage.

## orange-county
Single-county boundary, same Plotly/Census-derived source as
bay-area-counties, filtered to Orange County (FIPS 059). Could be narrowed
further to the Newport Bay watershed if a finer boundary turns up later,
since FloodRISE's real study area is much smaller than the whole county —
county-level is a reasonable first cut.

## Flood-depth overlay (live, not stored here)
The optional "BCDC flood-depth overlay" toggle on the map is **not** a file in
this repo — it's a Leaflet WMS layer pointed live at BCDC's own map server
(`mapserver.adaptingtorisingtides.org`, discovered via the config endpoint
behind https://explorer.adaptingtorisingtides.org/download). It requests the
`inundation{N}` layers for N in [0, 12, 24, 36, 48, 52, 66, 77, 84, 96, 108]
(inches of Total Water Level above MHHW), matching the 10-scenario slider on
BCDC's own site. See `js/app.js` (`BCDC_WMS_URL`, `buildFloodLayer`).
This is a deliberate exception to BRIEF.md's "don't reproduce actual
flood-risk data" non-goal — decided directly with the project owner, since
BCDC exposes this as a live, embeddable service rather than requiring us to
host a copy. If that WMS endpoint ever goes away or changes its layer names,
the toggle will silently show blank tiles; there's no local fallback data.

## General notes
- Each region is its own small GeoJSON file under this folder so
  individual regions can be swapped out or refined independently.
- All geometry was simplified with `mapshaper` before committing to keep
  load time reasonable at the zoom levels this tool uses.
