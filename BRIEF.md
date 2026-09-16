# Sea the Future — map recreation

## Background

"Sea the Future" was a decision-support tool built by the California State
Coastal Conservancy and NOAA's Office for Coastal Management to help
planners compare 12 sea-level-rise and coastal-flooding visualization tools
(BCDC's Flood Explorers, Cal-Adapt, Climate Central, NOAA's own viewers,
USGS/CoSMoS, TNC, UC Irvine's FloodRISE, and USGS HERA). It shut down when
funding ran out; the live site now 404s. Original spec:
https://www.adaptationclearinghouse.org/resources/california-e-sea-the-future-e-tool.html

A first pass already exists as a single self-contained HTML page
(`reference/sea-the-future-prototype.html` in this repo) with a filter
panel (geographic scope, shoreline processes, exposure analysis, projected
flood info) and a side-by-side comparison table for up to three tools. It
has no map — filtering is checkbox-only. `data/tools.json` is the same
12-tool dataset pulled out of that prototype into its own file.

## What this version should add

The missing piece is spatial: the original tool's core value was probably
"show me what applies to my location," not just "let me tick boxes." Build
that.

- A base map (Leaflet + OpenStreetMap tiles, no API key required) as the
  primary interface, not a bolt-on next to the card grid.
- Each tool has a coverage area, rendered as a polygon/outline layer:
  - Bay Area tools (BCDC ART Bay Shoreline Flood Explorer, East Contra
    Costa Flood Explorer) → San Francisco Bay Area county outlines.
  - Statewide tools (Cal-Adapt SLR-CIS, CoSMoS/Our Coast Our Future,
    NFWF CREST) → California state outline.
  - The Southern California tool (FloodRISE) → Orange County / Newport Bay
    area.
  - National tools (Climate Central x2, both NOAA viewers, TNC, USGS HERA)
    → treat as "covers anywhere in California," shown as the state outline
    in a visually distinct style (dashed or lighter) from the
    California-specific tools, since they're broader than California but
    the audience only cares about the CA portion.
- Clicking a point on the map, or searching/geocoding an address (Nominatim
  is fine, same no-key constraint), should highlight and list which tools'
  coverage areas include that point — this is the main interaction.
- Keep the existing filter fieldsets (shoreline processes, exposure
  analysis, projected flood info) as a secondary refinement on top of the
  location result, not a replacement for it.
- Keep the compare-up-to-three side-by-side table from the prototype —
  it's a separate, working feature and shouldn't be rebuilt from scratch.
- Preserve the "this is an unofficial recreation, verify before relying on
  it" framing from the prototype's hero/footer. Don't drop that disclaimer.

## Data you'll need to source

`data/tools.json` already has the 12 tools with their descriptive fields.
It does NOT yet have real geometry. You'll need to add boundary data,
likely as separate GeoJSON files under `data/coverage/` (one file per
distinct region: Bay Area counties, CA state outline, Orange County) rather
than embedding coordinates in tools.json — keep tools.json referencing a
region id (e.g. `"coverageRegion": "bay-area-counties"`) that maps to a
file. See `data/coverage/SOURCES.md` for where to pull real boundary data
from.

## Tech constraints

- Static site only — no backend, no build step required to run it (a
  build step is fine if GitHub Pages can serve the output, e.g. via a
  `gh-pages` branch or `docs/` folder, but don't introduce one unless it's
  actually earning its keep).
- Leaflet for the map. Load it from a CDN, no bundler needed, unless you
  have a good reason to introduce npm tooling.
- Should run by just opening `index.html` locally (or `python3 -m http.server`)
  with no install step, and deploy to GitHub Pages with no server-side code.
- Keep it usable on mobile — the original prototype is responsive down to
  narrow viewports; don't regress that.

## Non-goals for this pass

- Don't try to reproduce the actual flood-risk data from any of these 12
  tools — this project compares *which tool to use*, it doesn't reimplement
  any of them.
- Don't worry about user accounts, saved searches, or anything stateful
  beyond the current session.

## Definition of done for a first cut

1. Map loads centered on California with all coverage regions visible as
   distinct, legible layers.
2. Clicking anywhere on the map (or searching an address) shows the
   subset of the 12 tools whose coverage includes that point.
3. The shoreline-process / exposure / flood-info filters still narrow that
   list further.
4. Selecting up to 3 tools from the filtered list produces the same kind
   of side-by-side comparison table the prototype has.
5. Deployed and reachable at a GitHub Pages URL.
