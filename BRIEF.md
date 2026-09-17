# CA Sea Change Atlas — project brief

(Working name through most of this project's history: "Sea the Future
map recreation." Renamed to CA Sea Change Atlas once the project became
a real pairing of a map and a reference/comparison tool — see README.md
for why. "Sea the Future" refers only to the original, discontinued
agency tool this project draws on, not to this project itself.)

## Background

This project recreates the function of "Sea the Future," a decision-
support tool built by the California State Coastal Conservancy and
NOAA's Office for Coastal Management to help planners compare 12
sea-level-rise and coastal-flooding visualization tools. It shut down
when funding ran out; the live site now 404s. Original spec:
https://www.adaptationclearinghouse.org/resources/california-e-sea-the-future-e-tool.html

## Current architecture (decided, not a proposal)

Multiple pages, not one — the map/comparison split was a deliberate move
away from an earlier single-page plan, decided directly with the project
owner. The site is built with Eleventy (11ty): a shared header/footer via
includes, plus one generated page per tool, rather than one page per
concern hand-duplicating chrome:

- **`index.njk`** — a short landing page. It explains that this project
  is two tools, not one, and links to each. It exists because the map
  and the comparison grid answer genuinely different questions (a
  specific-place mapping tool vs. a which-tool-should-I-use comparison
  tool) — they aren't the same information duplicated, so neither page
  should have to double as the entry point for the other.
- **`map.njk`** — the map. Leaflet + OSM base map, a right-side layer
  panel (coverage-region outlines plus any tool that has a real data
  overlay wired up), address search, and a click-to-inspect popup that
  queries live values from whichever data layers are active. See
  README.md's "Status" section for the full current feature list — it's
  more developed than this brief anticipated (a real BCDC total-water-
  level scenario picker, live WMS queries, per-session caching, etc.)
  and README.md is the accurate source for exactly what's built.
- **`sources.njk`** — the reference/comparison side. The filterable
  12-tool grid and compare-up-to-three table, inherited from the original
  single-file prototype, each card linking to that tool's own generated
  detail page.
- **`about.njk`** — the project history (what "Sea the Future" was, why
  this project split into two tools, the full "not affiliated"
  disclaimer). Exists so that history doesn't have to be duplicated
  across every other page's intro copy.
- **`tool.njk`** — paginated over `data/tools.json` at build time, one
  real static page per tool at `/tool/<id>/`, each with its own
  `<title>`/meta description/Open Graph tags for real link previews and
  search indexing — see "Tech constraints" below for why this required
  adopting a build step.

The map page does **not** try to be a "click here to see which tools
apply" index — that was the old single-page plan's approach. Coverage is
something you inspect visually on the map by toggling layers.
`sources.njk` is a separate, self-contained comparison tool that
doesn't depend on anything the map computes. The landing page carries no
logic of its own; it exists purely to route a first-time visitor to the
tool they actually want.

## Map-layer scope: only some of the 12 tools will ever get a map layer

This is the important scoping decision for anyone picking up map work:
**most of the 12 tools are staying comparison-only, permanently, by
design — not because they haven't been gotten to yet.** Only tools with
a confirmed-legal path to real overlay data are map-layer candidates.

**Implemented:**
- BCDC Bay Shoreline Flood Explorer — live WMS overlay, done.

**Confirmed legal, not yet wired up — the real next-up list for map work:**
- NOAA Sea Level Rise Viewer
- NOAA Coastal Flood Exposure Mapper
- Cal-Adapt / CNRA statewide SLR data
- Our Coast, Our Future / CoSMoS (USGS)

All four are public ArcGIS REST/MapServer or FeatureServer endpoints — see
the Licensing section below for exactly why each is clear to use.

**Likely feasible, not yet verified — worth a look before committing to
comparison-only:**
- East Contra Costa Shoreline Flood Explorer (probably shares BCDC's own
  Caltrans-hosted infrastructure)
- USGS HERA (probably reuses CoSMoS/USGS data already confirmed open)

**Pending an actual licensing answer — see TODO below — comparison-only
until resolved:**
- FloodRISE (UC Irvine)
- CREST (NFWF)

**Permanently comparison-only — confirmed legally off-limits for a map
overlay, don't revisit this without new information:**
- Climate Central's Coastal Risk Screening Tool
- Climate Central's Surging Seas Risk Finder
- The Nature Conservancy's Coastal Resilience Mapping Portal

These three stay on `sources.njk` only. Do not attempt to fetch, proxy,
or embed their live data as a map layer — see Licensing below for the
specific clauses that rule it out.

## Licensing per source (why the scope above is what it is)

- **NOAA** (Sea Level Rise Viewer, Coastal Flood Exposure Mapper) — U.S.
  federal government data is public domain under 17 U.S.C. §105. NOAA's
  Digital Coast program is additionally required by its authorizing
  legislation to keep program data "fully and freely available." Safe to
  use directly; credit NOAA as a courtesy, not a legal requirement.
- **USGS** (CoSMoS / Our Coast Our Future, and HERA's underlying data) —
  same footing: USGS-produced data is explicitly U.S. public domain per
  USGS's own information policy.
- **BCDC (already implemented) and Cal-Adapt/CNRA** — both are mirrored
  through the Caltrans open data portal, licensed **CC-BY-SA**. Usable,
  with real obligations: attribute Caltrans/BCDC/CNRA, and if the
  *dataset itself* (not just this app) is redistributed in modified form,
  it needs to stay share-alike licensed too. Displaying it as a live map
  layer, as BCDC's is now, is fine either way.
- **Climate Central (both tools) — confirmed off limits.** Their Terms of
  Use (climatecentral.org/what-we-do/legal) explicitly states: "Any bulk
  downloading is prohibited. In addition, use of any automated system or
  software... to extract any data from this website for any purpose
  ('screen scraping') is prohibited." Their flood-risk maps are
  separately flagged as not for reuse outside their own context.
- **TNC — confirmed off limits.** Their Terms of Use
  (coastalresilience.org/terms-of-use) restricts reuse to personal,
  non-commercial single copies and explicitly prohibits "mirror[ing] any
  Content contained in this Website or any other server." TNC's own
  public ArcGIS REST server (`services2.coastalresilience.org`) carries
  "The Nature Conservancy reserves all rights in data provided" directly
  in its layer metadata — so even where a TNC service is technically
  reachable, it explicitly doesn't grant reuse rights.

## TODO — resolve before FloodRISE or CREST can become map layers

Both tools are live and technically probably reachable, but neither has
a confirmed reuse license. Don't add either as a map overlay until one of
these resolves it:

- [ ] **FloodRISE**: check whether the ArcGIS Online items carry a
  publisher-set `licenseInfo` field — fetch
  `arcgis.com/sharing/rest/content/items/<id>?f=json` for each of the
  three viewer IDs (Newport Beach: `4570d7dbfb674aac9887a20eea9c0c4f`,
  Tijuana River Valley: `1d3fe4654858432aad4ca324b6e819ea`, Goat Canyon:
  `a9eff25442434888b5007919cb92c6d7`) and look for a populated
  `licenseInfo`. If nothing's there, email UC Irvine's Blum Center
  (`blumcenter@uci.edu`) directly and ask for permission — UCI's default
  site license is "all rights reserved," so silence means no.
- [ ] **CREST**: click all the way through the actual Launch → Download
  Data flow on resilientcoasts.org with a real browser (this needs JS
  execution an API-only check can't do) and read whatever license or
  metadata file comes bundled with the download — federal-partner GIS
  downloads usually include one even when the website itself doesn't post
  terms. No general Terms of Use was found for either `nfwf.org` or
  `resilientcoasts.org`, so if the download itself has nothing either,
  email NFWF directly rather than assuming either permission or
  prohibition.

## Tech constraints

- Still a static site with no backend or server-side code — but no
  longer zero-build. Built with Eleventy (11ty) and deployed by GitHub
  Actions (`.github/workflows/deploy.yml`) automatically on push to
  `main`, so there's no manual build/deploy step for the maintainer, but
  local development now requires Node.js (`npm install`, `npm run
  serve`). This constraint was deliberately relaxed to get real,
  generated per-tool URLs (`/tool/<id>/`) with real per-page metadata for
  SEO and link previews — see "Current architecture" above.
- Leaflet for the map, loaded from a CDN with a pinned version and
  Subresource Integrity hash (already done for `map.njk`).
- Stay usable on mobile.

## Non-goals

- Don't attempt to overlay any permanently-comparison-only tool's actual
  data — that's a permissions problem, not a technical one to solve
  around.
- Don't try to precisely reproduce any tool's cartographic styling —
  render real data, but legend/symbology can be simplified.
- No accounts, no saved sessions.

## Definition of done for the next map-layer pass

1. At least one of the four "confirmed legal, not yet wired up" tools
   (NOAA SLR Viewer, NOAA CFEM, Cal-Adapt/CNRA, CoSMoS) is added to the
   map page's layer panel as a real overlay, following the same pattern
   BCDC's layer already established (live WMS/REST fetch, no local
   copy of the data, attribution shown on the page).
2. README.md's Implementation status table is updated to reflect it.
3. Either the FloodRISE or CREST TODO above is resolved one way or the
   other, and `sources.njk`'s row for that tool is updated accordingly
   if the answer is "yes, add it as a map layer too."
