# Sea the Future (recreated)

An unofficial recreation of California's discontinued "Sea the Future"
tool — a comparison guide to sea-level-rise and coastal-flooding
visualization tools, meant to help someone pick which of the 12 tools
actually applies to their patch of coastline.

## Status

Two-page version: `index.html` is a map-first page — a Leaflet map with
each tool's coverage area as a checkable layer in a right-side panel (like
ArcGIS Online's Layers widget), a live BCDC Bay Shoreline Flood Explorer
overlay (Total Water Level slider or a "choose a scenario" SLR + storm
surge picker, depth-of-flooding/overtopping/low-lying/legal-delta layer
toggles, and a consequence-indicator picker), and address search.
`sources.html` is the tool comparison — the filterable 12-tool grid and
compare-up-to-three table from the original prototype. See `BRIEF.md` for
the full project brief and definition of done.

This is a deliberate split from BRIEF.md's original single-page vision
(map with the filter/grid/compare UI stacked underneath it), decided
directly with the project owner: keeping the map as its own focused page
made more room for a proper layer panel, and the tool grid/filters/compare
table work fine as a fully separate page since they don't depend on
anything the map computes (there's no more click-a-point-to-see-matching-
tools feature — coverage is something you inspect visually on the map by
toggling layers instead).

## Implementation status

"Implemented" here means the map page (`index.html`) actually renders that
tool's own flood/hazard data as a layer — not just that it's listed as one
of the 12 tools on `sources.html`. Only the ART Bay Shoreline Flood
Explorer has real data wired up so far (its live BCDC WMS layer, added
directly to the map's layer panel); the other 11 are cataloged on
`sources.html` for comparison but don't yet contribute a data layer to the
map. Each tool's card and comparison-table row on `sources.html` shows
this same status.

| Tool | Org | Status |
|---|---|---|
| Adapting to Rising Tides: Bay Shoreline Flood Explorer | BCDC / SFEI | ✅ Implemented |
| East Contra Costa Shoreline Flood Explorer | BCDC / SFEI | Not implemented |
| Sea Level Rise – Coastal Inundation Scenarios (Cal-Adapt) | Cal-Adapt | Not implemented |
| Coastal Risk Screening Tool | Climate Central | Not implemented |
| Surging Seas Risk Finder | Climate Central | Not implemented |
| Coastal Resilience Evaluation and Siting Tool (CREST) | NFWF, with partners | Not implemented |
| Coastal Flood Exposure Mapper | NOAA Office for Coastal Management | Not implemented |
| Sea Level Rise Viewer | NOAA Office for Coastal Management | Not implemented |
| Our Coast, Our Future / CoSMoS | Point Blue / USGS | Not implemented |
| Coastal Resilience Mapping Portal | The Nature Conservancy | Not implemented |
| FloodRISE | UC Irvine | Not implemented |
| Hazard Exposure Reporting and Analytics (HERA) | USGS | Not implemented |

## Layout

- `BRIEF.md` — the project brief: goals, map interaction spec, data
  model, constraints, definition of done.
- `index.html`, `js/map.js` — the map page: Leaflet + OSM base map, each
  coverage region and the BCDC flood-depth WMS overlay as a checkable
  layer in the right-side panel, and address search (Nominatim).
- `sources.html`, `js/sources.js` — the tool comparison page: the
  filterable 12-tool grid and compare-up-to-three table.
- `css/style.css` — shared stylesheet for both pages.
- `data/tools.json` — the 12-tool dataset (descriptions, scope, links,
  strengths/limitations, etc.), with a `coverageRegion` field on each
  tool pointing at a region id (used only for documentation now — the map
  page's layer panel is built directly from the region ids, not by
  cross-referencing tools.json).
- `data/coverage/*.geojson` — boundary geometry for each `coverageRegion`
  id (Bay Area counties, East Contra Costa, California state outline,
  Orange County). See `data/coverage/SOURCES.md` for where each came from,
  including the live BCDC WMS flood-depth layer, and
  `data/coverage/ATTRIBUTION.md` for the required license credit.
- `reference/sea-the-future-prototype.html` — the original single-file
  prototype with the filter-and-compare UI (no map). Kept for reference;
  its comparison-table logic and visual style were carried into
  `sources.html` above.

## Running locally

No build step:

```
python3 -m http.server
```

then open `http://localhost:8000`.

## Licenses & attribution

Everything the two pages load, beyond this project's own code:

- **[Leaflet](https://leafletjs.com/)** (BSD-2-Clause) — the map library
  itself, loaded from the `unpkg.com` CDN in `index.html` at the pinned
  version (`leaflet@1.9.4`) with a Subresource Integrity hash.
- **[OpenStreetMap](https://www.openstreetmap.org/copyright)** contributors
  (ODbL) — the base map tile imagery.
- **[OpenStreetMap Nominatim](https://nominatim.org/)** — address search
  and geocoding.
- **[Plotly `datasets` repository](https://github.com/plotly/datasets)**
  (`geojson-counties-fips.json`), © Plotly Technologies Inc., **MIT
  License** — coverage-region boundaries (`data/coverage/*.geojson`,
  except `east-contra-costa.geojson`, which is a hand-drawn approximation
  and original content, not derived from the above). That file's county
  boundaries originate from U.S. Census Bureau TIGER data (public domain).
  This project filtered it to the relevant counties and dissolved
  California's counties into the state outline used for
  statewide/national-tool layers — see `data/coverage/SOURCES.md` for
  details and `data/coverage/ATTRIBUTION.md` for the full MIT license
  text.
- **[BCDC's Adapting to Rising Tides Bay Shoreline Flood
  Explorer](https://explorer.adaptingtorisingtides.org/)** — the optional
  flood-depth overlay on the map page is loaded live from BCDC's own WMS
  map server, not hosted or modified by this project. Planning-level only;
  see [their disclaimer](https://explorer.adaptingtorisingtides.org/about/a-disclaimer)
  before relying on it. See `data/coverage/SOURCES.md` for how the overlay
  is wired up.

Attribution is also shown directly on the deployed map (`index.html`'s
bottom attribution strip and Leaflet's own attribution control).

## Deploying

GitHub Pages, serving from the repo root. No build step or server-side
code required.

## Source

Reconstructed from the tool's original public spec:
https://www.adaptationclearinghouse.org/resources/california-e-sea-the-future-e-tool.html
The original platform is offline; this project isn't affiliated with the
California State Coastal Conservancy or NOAA.
