# Coverage region boundary data

`tools.json` references these `coverageRegion` ids. None of the actual
geometry exists yet — this file is a starting point for sourcing it, not a
guarantee any of these links are still exactly where described.

## bay-area-counties
The 9 Bay Area counties: Alameda, Contra Costa, Marin, Napa, San Francisco,
San Mateo, Santa Clara, Solano, Sonoma.
- US Census TIGER/Line county boundaries (public domain, reliable):
  https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html
- Simplified GeoJSON already cut into individual states/counties (easier
  starting point than raw TIGER shapefiles):
  https://eric.clst.org/tech/usgeojson/
- Filter to California county FIPS codes for the 9 counties above.

## east-contra-costa
No standard boundary exists for "eastern" Contra Costa specifically — this
will likely need a hand-drawn or approximated polygon (e.g. cities of
Antioch, Pittsburg, Oakley, Brentwood, and the Bethel Island area) unless
BCDC/SFEI published their own study-area boundary. Worth checking BCDC's
ART program page or SFEI's project page for a downloadable study-area
shapefile before hand-drawing one.

## california-state
- US Census cartographic boundary files (state level), or the same
  eric.clst.org GeoJSON source above, filtered to California.
- Used for both the true statewide tools (Cal-Adapt, CoSMoS, CREST) and,
  in a visually distinct style, the national tools whose actual extent is
  the whole US coastline — see BRIEF.md for why those are simplified to
  "California" here rather than drawn as full US coverage.

## orange-county
Single-county boundary, same TIGER/Census source as bay-area-counties,
filtered to Orange County, CA. Consider narrowing further to the Newport
Bay watershed if a finer boundary is easy to find, since FloodRISE's real
study area is much smaller than the whole county — but county-level is a
reasonable first cut.

## General notes
- Keep each region as its own small GeoJSON file under this folder
  (e.g. `bay-area-counties.geojson`) rather than one giant file, so
  individual regions can be swapped out or refined independently.
- Simplify geometry (e.g. with mapshaper.org or `topojson-simplify`)
  before committing — full-resolution TIGER boundaries are much larger
  than a map like this needs and will slow down load time for no visual
  benefit at the zoom levels this tool uses.
