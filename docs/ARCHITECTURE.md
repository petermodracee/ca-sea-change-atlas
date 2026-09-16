# Architecture

How the map-based Sea the Future recreation works, so the next person (or
agent) touching this codebase doesn't have to re-derive it by reading
every file from scratch. See `BRIEF.md` for *why* this exists and the
product requirements; this doc is about *how* it's built.

## Overview

Static site, no build step, no backend. `index.html` loads Leaflet (map
rendering), Turf.js (point-in-polygon geometry), and one plain-JS file
(`js/app.js`, no framework, no modules) from a CDN and local files. The
visual system (fonts, color tokens, card/table layout) is carried over
almost verbatim from `reference/sea-the-future-prototype.html`, split out
into `css/style.css` so it can be shared between the hero/filters/compare
UI and the new map chrome.

Everything runs client-side. `js/app.js`'s `main()` is the entry point:
load data → build the map → build the filter checkboxes → do an initial
render. There's no router, no state persistence — reloading the page
resets everything.

## File map

| File | Responsibility |
|---|---|
| `index.html` | Page shell: hero/disclaimer, map panel + search form, filters aside, results grid, compare bar, comparison table, footer. Loads Leaflet/Turf from CDN. |
| `js/app.js` | All application logic: data loading, map layers, location lookup, filters, compare table. See below. |
| `css/style.css` | All styling, including the map/legend/search chrome added for this version. |
| `data/tools.json` | The 12-tool dataset. Each tool has a `coverageRegion` field (`bay-area-counties`, `east-contra-costa`, `california-state`, or `orange-county`). |
| `data/coverage/*.geojson` | One `FeatureCollection` per `coverageRegion` id — the actual polygon(s) for that region. |
| `data/coverage/SOURCES.md` | Where each coverage file's geometry came from and why. |
| `data/coverage/ATTRIBUTION.md` | Required license text/credit for the boundary data (MIT, Plotly `datasets` repo). Read this before touching or re-sourcing any `data/coverage/*.geojson` file. |
| `reference/sea-the-future-prototype.html` | The original filter/compare-only prototype. Its checkbox-filter and comparison-table logic were ported into `js/app.js` largely unchanged; kept around as a reference, not loaded by `index.html`. |

## Data model

`data/tools.json` doesn't embed geometry. Instead each tool has a
`coverageRegion` string id, and `data/coverage/<id>.geojson` holds the
actual polygon(s) for that id. `js/app.js` joins the two at runtime:

```js
const REGION_FILES = {
  "bay-area-counties": "data/coverage/bay-area-counties.geojson",
  "east-contra-costa": "data/coverage/east-contra-costa.geojson",
  "california-state": "data/coverage/california-state.geojson",
  "orange-county": "data/coverage/orange-county.geojson"
};
```

`loadData()` fetches `tools.json` and all four region files in parallel
and populates `TOOLS` (array) and `regionData` (`regionId -> FeatureCollection`).

**Why `california-state` covers two different tool scopes.** Per
`BRIEF.md`, both the true statewide tools (Cal-Adapt, CoSMoS, CREST) *and*
the national tools (Climate Central x2, both NOAA viewers, TNC, USGS
HERA) are treated as "covers California" for this recreation, since the
audience only cares about the CA portion of the national tools' coverage.
Both groups' `coverageRegion` is `california-state` — there's only one
geometry file. The visual distinction between "statewide" and "national"
lives entirely in `initMap()` (two differently-styled Leaflet layers
drawn from the same GeoJSON, see below), not in the data.

**Data provenance.** `bay-area-counties.geojson`, `orange-county.geojson`,
and `california-state.geojson` are all derived from a single MIT-licensed
source (the Plotly `datasets` repo's Census-TIGER-derived counties file);
`california-state.geojson` specifically is a dissolve of all 58 CA county
polygons from that same file rather than a second source.
`east-contra-costa.geojson` is a hand-drawn approximation — no
authoritative study-area boundary exists for it. Full detail and the
required license text are in `data/coverage/SOURCES.md` and
`data/coverage/ATTRIBUTION.md` — don't duplicate that text elsewhere, and
update those two files (not just the geojson) if the geometry is ever
re-sourced.

## Map layer rendering (`initMap()`)

Five `L.geoJSON` layers are added to the map, each with its own inline
style object (no external stylesheet for map styling — kept in JS so
style and legend entries stay in sync):

- `bay-area-counties` — solid teal fill/outline.
- `east-contra-costa` — dashed teal outline (visually flags it as the
  approximate one).
- `california-state` drawn **twice**: once solid navy (`statewideStyle`,
  represents Cal-Adapt/CoSMoS/CREST) and once dashed navy with no fill
  (`nationalStyle`, represents the 6 national tools' CA-only portion).
  Same geometry, two layers, stacked.
- `orange-county` — solid rust fill/outline.

`renderLegend()` builds the on-page legend from the same style objects
passed to the layers, so legend swatches can't drift out of sync with
what's actually drawn (dashed swatches use a CSS `repeating-linear-gradient`
to visually match the Leaflet `dashArray`).

Base tiles are plain OSM raster tiles (`{s}.tile.openstreetmap.org`), no
API key. Map click is wired directly in `initMap()`:
`map.on("click", e => handlePoint(e.latlng.lat, e.latlng.lng, null))`.

## Location lookup

Two functions do all the work:

- **`regionContainsPoint(regionId, lat, lng)`** — builds a `turf.point`
  and checks it against every feature in that region's FeatureCollection
  with `turf.booleanPointInPolygon`, returning true on first match. This
  runs once per region (4 calls), not once per tool.
- **`handlePoint(lat, lng, label)`** — drops/moves the marker, filters
  `REGION_FILES`'s keys down to the regions that contain the point, then
  filters `TOOLS` to those whose `coverageRegion` is in that matched set.
  The resulting id set is stored as `state.locationToolIds`, and
  `state.locationLabel` gets either the passed-in label (from search) or
  a formatted lat/lng (from a raw map click). Calls `render()` at the end.

`state.locationToolIds` starts `null`, which `matches()` (below) treats
as "no location filter yet, show everything." Clicking "clear the
location" in `renderLocationSummary()` resets it back to `null` and
removes the marker.

**Gotcha if you touch the coverage geojson:** point-in-polygon accuracy
is only as good as the polygon detail. An earlier draft of this data
over-simplified the boundary files (`mapshaper -simplify 8%`, which
*keeps* 8% of points — far too aggressive for county-scale coastlines) and
silently broke matching near the coast (e.g. Oakland stopped matching
Alameda County). If you re-simplify, verify with a direct
`turf.booleanPointInPolygon` check against a few known-interior points
before trusting it, not just a visual glance at the polygon shape.

## Search (`geocode()`)

Plain client-side fetch to Nominatim
(`nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=...`),
no key, no proxy. On a hit it recenters the map, calls `handlePoint()`
with the geocoded lat/lng and the result's `display_name` as the label,
and updates the `#searchStatus` line. On a miss or network error it shows
an inline status message instead of throwing.

This cannot be exercised from a network-sandboxed agent environment —
`nominatim.openstreetmap.org` (and the OSM tile server) are typically
blocked by such sandboxes' egress policy, which will make search look
"broken" during automated testing even though the code path is correct.
It works normally in an actual browser once deployed. If you need to
verify it changed correctly without a live browser, read `geocode()`
directly rather than trusting an in-sandbox test run.

## Filters and compare

Ported from `reference/sea-the-future-prototype.html` with one change:
the base list `matches()` filters is now the location-filtered subset
instead of the full 12.

```js
function matches(tool){
  if(state.locationToolIds !== null && !state.locationToolIds.has(tool.id)) return false;
  if(state.process.size && ![...state.process].every(p => tool.processes.includes(p))) return false;
  if(state.exposure.size && ![...state.exposure].every(e => tool.exposure.includes(e))) return false;
  if(state.flood.size && ![...state.flood].every(f => tool.floodInfo.includes(f))) return false;
  return true;
}
```

Location is checked first and is exclusive (an unmatched tool never
reaches the checkbox checks); the three checkbox groups (`process`,
`exposure`, `flood`) are each AND-of-selected-values-must-all-be-present,
matching the prototype's original semantics. Note the prototype also had
a `scope` checkbox fieldset; that was dropped in this version because
location clicking now does that job directly (see `BRIEF.md`'s "keep
filters as secondary refinement" requirement) — don't reintroduce it
without checking whether it's actually still wanted.

`toggleCompare()` / `state.compare` (array, max 3) and
`renderCompareBar()` / `renderComparisonTable()` are effectively
unchanged from the prototype — same row list, same up-to-3 cap, same
"only render the table once 2+ selected" behavior.

`render()` is the single re-render entry point, called after every state
mutation (filter checkbox change, map click, search, compare toggle,
clear buttons). It's a full re-render (clears and rebuilds the grid,
compare bar, and table each time) — there's no diffing, which is fine at
this data scale (12 tools) but worth knowing if this ever grows.

## Known limitations / things to revisit

- `east-contra-costa.geojson` is a hand-drawn approximation, not sourced
  from an authoritative boundary — see `data/coverage/SOURCES.md`.
- The 6 "national" tools are rendered as one shared dashed layer over the
  California outline rather than their true (whole-US) extent, per
  `BRIEF.md`'s explicit simplification for this audience.
- `orange-county.geojson` is the full county, not narrowed to the Newport
  Bay watershed that FloodRISE actually models — `SOURCES.md` flags this
  as a possible future refinement.
- No automated tests. Verification so far has been manual/Playwright-driven
  browser checks (map renders, click-to-locate resolves the right tool
  subset, filters narrow correctly, compare table populates) — there's no
  regression suite guarding this behavior.
