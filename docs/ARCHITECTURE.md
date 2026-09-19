# Architecture

> **Note:** the sections below describe the original single-file `js/app.js`
> prototype and are partly stale. The map page (`map.html`) now lives in
> `js/map/` and is documented in the next section.

## Map page (`js/map/`)

`js/map/index.js` is the only `<script type="module">` on the map page. It
builds the map and each layer group, then wires the panel behavior.

| Module | Role |
|---|---|
| `index.js` | Entry point: reads the permalink, creates the map, inits every layer, then the panel behaviors. Order matters: permalink DOM state is applied before layers init; loading indicators are registered before any layer is added. |
| `app-shell.js` | Map creation, click-to-inspect wiring, and panel behavior: collapse, per-group/global Hide, active indicator, print, mobile bottom sheet. |
| `basemaps.js` | Basemap switcher; greyscale OpenFreeMap default rendered with MapLibre (lazy, SRI-pinned) with a greyscale-OSM fallback. |
| `base-layer.js`, `layers/*.js` | One class per layer group (`BaseLayer` lifecycle). Each builds its Leaflet layers into its group's pane. |
| `shared/panes.js` | One Leaflet pane per layer group: gives each group a z-order slot (bring-to-front), a CSS opacity (panel slider) and a loading state. Layers must pass `pane: groupPane(map, key)`. |
| `permalink.js` | URL-hash state: view, basemap, active layers, scenario sliders, opacity. |
| `controls.js` | Scale bar, locate button, distance-measure tool. |
| `search.js` | Nominatim address search (submit-only) with alternative matches. |

Panel markup lives in `map.njk`; each `.layer-group` has a title row (collapse,
title, "N on" badge, bring-to-front, Hide) and a body. Groups with an opacity
slider carry `data-pane="<key>"`, which is what links the panel to the pane. The
Geo / demographic info group has three (`geoPeople`, `geoFacilities`, `geoLand`), one per
section. Its People and Land sections are dropdowns (one layer at a time; `data-layer-select`)
rather than checkboxes. Popups come from `identify` (ArcGIS query), `identifyTile` (NOAA land
cover, read off the tile pixel against the legend) or `identifyRoad` (Caltrans counts drawn on
state highway lines).

Two layer groups don't follow the ArcGIS/esri-leaflet pattern. `layers/bcdc-ecc-layer.js`
(East Contra Costa) reuses BCDC's WMS URL, `buildBcdcWmsLayer` and GML parsing (same server as the
Bay explorer, so it goes through the shared per-session cache). `layers/caladapt-slr-layer.js`
(Cal-Adapt SLR-CIS) draws plain XYZ tiles from `api.cal-adapt.org/tiles/`, one tile layer per
regional mosaic clipped to its footprint; those tiles carry a one-year `Cache-Control` and CORS
`*`, so they deliberately skip the session cache, and its identify reads the rendered tile's alpha
(the service has no per-point value query).

See `docs/PLUGIN-REVIEW.md` for which plugins are used and why others weren't.


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
| `data/tools.json` | The tool dataset (descriptions, scope, links, strengths/limitations). |
| `reference/sea-the-future-prototype.html` | The original filter/compare-only prototype. Its checkbox-filter and comparison-table logic were ported into `js/app.js` largely unchanged; kept around as a reference, not loaded by `index.html`. |

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
instead of the full list.

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
this data scale (15 tools) but worth knowing if this ever grows.

## Known limitations / things to revisit

- No automated tests. Verification so far has been manual/Playwright-driven
  browser checks (map renders, click-to-locate resolves the right tool
  subset, filters narrow correctly, compare table populates) — there's no
  regression suite guarding this behavior.
