# Sea the Future (recreated)

An unofficial recreation of California's discontinued "Sea the Future"
tool — a comparison guide to sea-level-rise and coastal-flooding
visualization tools, meant to help someone pick which of the 12 tools
actually applies to their patch of coastline.

## Status

Map-based version implemented: `index.html` loads a Leaflet map with
coverage-area polygons for all 12 tools, click-or-search-to-locate finds
which tools cover a point, the shoreline-process/exposure/flood-info
filters narrow that further, and the compare-up-to-three table from the
prototype is carried over. See `BRIEF.md` for the full project brief and
definition of done.

## Layout

- `BRIEF.md` — the project brief: goals, map interaction spec, data
  model, constraints, definition of done.
- `index.html`, `css/style.css`, `js/app.js` — the map-based app: Leaflet
  + OSM base map, coverage-region layers, point-in-polygon lookup (via
  Turf.js), address search (Nominatim), filters, and the compare table.
- `data/tools.json` — the 12-tool dataset (descriptions, scope, links,
  strengths/limitations, etc.), with a `coverageRegion` field on each
  tool pointing at a region id.
- `data/coverage/*.geojson` — boundary geometry for each `coverageRegion`
  id (Bay Area counties, East Contra Costa, California state outline,
  Orange County). See `data/coverage/SOURCES.md` for where each came from
  and `data/coverage/ATTRIBUTION.md` for the required license credit.
- `reference/sea-the-future-prototype.html` — the original single-file
  prototype with the filter-and-compare UI (no map). Kept for reference;
  its comparison-table logic and visual style were carried into the real
  app above.

## Running locally

No build step:

```
python3 -m http.server
```

then open `http://localhost:8000`.

## Data sources & attribution

Coverage-region boundaries (`data/coverage/*.geojson`, except
`east-contra-costa.geojson`) are derived from the
[Plotly `datasets` repository](https://github.com/plotly/datasets)
(`geojson-counties-fips.json`), © Plotly Technologies Inc., **MIT
License**. That file's county boundaries originate from U.S. Census
Bureau TIGER data (public domain). This project filtered it to the
relevant counties and dissolved California's counties into the state
outline used for statewide/national-tool layers — see
`data/coverage/SOURCES.md` for details and `data/coverage/ATTRIBUTION.md`
for the full MIT license text. Attribution is also shown directly on the
deployed map and in its footer.

`east-contra-costa.geojson` is a hand-drawn approximation (no
authoritative boundary was found) and is original content, not derived
from the above.

Base map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors. Address search via
[OpenStreetMap Nominatim](https://nominatim.org/).

## Deploying

GitHub Pages, serving from the repo root. No build step or server-side
code required.

## Source

Reconstructed from the tool's original public spec:
https://www.adaptationclearinghouse.org/resources/california-e-sea-the-future-e-tool.html
The original platform is offline; this project isn't affiliated with the
California State Coastal Conservancy or NOAA.
