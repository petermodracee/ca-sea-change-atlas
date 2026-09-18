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
- Our Coast, Our Future / CoSMoS (USGS) — **not ArcGIS REST**, despite
  the original assumption (see "Corrections" below): live tile/WMS
  layers from Point Blue Conservation Science's own infrastructure
  (`geo.pointblue.org`), matching the real "Our Coast, Our Future" tool's
  own Explore Scenarios panel — a Scenario Region dropdown (California
  Coast/Russian River/Los Peñasquitos Lagoon), a Scenario Topic dropdown
  (up to 8 topics per region: Flooding, Flood Duration, Min/Max Flooding,
  Wave Height, Current Velocity, Cliff Retreat, Shoreline Position,
  Groundwater), a left-right Sea Level Rise slider, and a Storm Frequency
  picker (None/Annual/20-yr/100-yr, region-dependent). Done.
- NOAA Sea Level Rise Viewer — live esri-leaflet DynamicMapLayer, done.
- NOAA Coastal Flood Exposure Mapper — composite hazard-overlap layer
  (esri-leaflet DynamicMapLayer, popup includes the real overlapping-
  hazard count), plus a full pass at matching the real tool's own layer
  set: hurricane storm surge (NOAA/NWS/NHC SLOSH data via a separate
  ArcGIS Online service, Category 1–2 only, Southern California only),
  High Tide Flooding, FEMA Flood Zones, and Tsunami Run-up — CFEM's own
  versions of each, each a real separate tiled MapServer, each with a
  live legend but no click-to-inspect (see "Corrections" below for why).
  Sea Level Rise isn't duplicated here — CFEM has no dedicated SLR
  service of its own; its rendering is the same underlying `dc_slr` data
  this map already shows in its own NOAA Sea Level Rise Viewer group.
  Great Lakes Water Levels doesn't apply to California. CFEM's other
  nine "exposure" layers (Societal/Infrastructure/Ecosystem Exposure —
  Population Density, Poverty, Elderly, Employees, Development,
  Critical Facilities, Development Changes, Pollution Sources, Natural
  Areas and Open Space) are deliberately not wired up — see "CFEM
  exposure layers, not implemented" below for why and what's actually
  in each.
- FEMA National Flood Hazard Layer — a new addition, not previously on
  this list (see Licensing below) — live esri-leaflet DynamicMapLayer,
  "Flood Hazard Zones" sublayer only, effective data only.

**Confirmed legal, not yet wired up — the real next-up list for map work:**
- Cal-Adapt / CNRA statewide SLR data

This is a public ArcGIS REST/MapServer or FeatureServer endpoint — see
the Licensing section below for why it's clear to use.

### Corrections from the tier-1 map-layer pass

Several things about the tier-1 pass diverged from what was assumed
going in, confirmed directly rather than worked around silently:

- **CoSMoS isn't an ArcGIS REST service at all.** The initial plan (and
  first implementation pass) used a Caltrans-hosted ArcGIS FeatureServer
  mirror (`CoSMoS_SLR`), which is real and live but only covers one
  topic (Flooding) for one region (California Coast) with reduced
  granularity (9 SLR stops instead of the real tool's 12, no "Annual"
  storm frequency). A later revision pass, asked to match the real
  "Our Coast, Our Future" tool's own UI (region/topic dropdowns, more
  SLR stops, Annual storm frequency), required tracing that tool's own
  network traffic directly — which showed it's actually backed by Point
  Blue Conservation Science's own GeoServer/tile infrastructure
  (`geo.pointblue.org`), not ArcGIS. CoSMoS was rebuilt on that real
  backend instead (see js/map.js's CoSMoS section and
  `data/cosmos-layers.json` for the full detail). esri-leaflet remains
  in use for the other three sources (NOAA SLR Viewer, FEMA NFHL, NOAA
  CFEM), which genuinely are ArcGIS REST.
- **CoSMoS cliff-erosion service doesn't exist** at the Caltrans-mirror
  URL originally assumed
  (`gisdata.dot.ca.gov/.../HQstatewide/DEA_Cliff_Erosion/MapServer`,
  404). Moot after the above — Cliff Retreat is now wired up directly
  against Point Blue's real infrastructure instead.
- **CFEM's real composite sublayer is `CA_FloodComposite`**, not
  `CA_FloodComposite_int` as originally assumed — confirmed via the
  service's own layer list. Code/docs use the real name.
- **CFEM's Tsunami service was wrongly concluded broken, then corrected.**
  An earlier pass tested `CFEM_Tsunami` by exporting an image over the
  Bay Area (`dynamicMapLayer`/`/export`) and saw a flat background,
  concluding it had no real California data. That test was invalid: the
  service is `singleFusedMapCache: true` (a pre-cached tiled MapServer),
  and `/export` doesn't reliably reflect what a fused cache actually
  serves — the exact same bug class as the NOAA SLR Viewer's
  `dynamicMapLayer` issue fixed elsewhere in this project. Real
  `/tile/z/y/x` requests confirmed substantial content over the Bay
  Area. Now wired up. The same re-check found `CFEM_HighTideFlooding`
  and `CFEM_FEMAFloodZones` are equally real, separate, working tiled
  services (each with its own distinct legend from what this map's
  other layer groups show) — also now wired up. None of the three
  support useful click-to-inspect: their `/query` endpoint returns the
  same leftover county-eligibility attribute table regardless of which
  one is queried, disconnected from what the tile cache actually
  renders — confirmed directly against real coastal points.

### CFEM exposure layers, not implemented

Beyond its hazard layers, CFEM also has three "exposure" categories —
Societal, Infrastructure, and Ecosystem — that show who and what is
exposed to flood hazards, not the hazards themselves. Deliberately not
wired up, per direct instruction — this site is scoped to
sea-level-rise/flood-hazard tools specifically, not general exposure or
vulnerability mapping. Sourcing turned out mixed, confirmed against
NOAA's own published data-sources table
(`coast.noaa.gov/data/digitalcoast/pdf/flood-exposure-data.pdf`), worth
recording in case this gets revisited:

- **Population Density, Poverty, Elderly** — U.S. Census Bureau (2020
  Census / American Community Survey), not NOAA.
- **Employees** — sourced from Esri Business Analyst, a **licensed
  product**; NOAA's own documentation states this underlying data "are
  not publicly available." This one can't be wired up regardless of
  scope, same category of exclusion as the Climate Central/TNC sources
  under "Licensing per source" below.
- **Critical Facilities** — USGS (The National Map structures dataset),
  not NOAA.
- **Pollution Sources** — EPA (Facility Registry Service), not NOAA.
- **Development, Development Changes, Natural Areas and Open Space** —
  NOAA's own Coastal Change Analysis Program (C-CAP) land cover product.
  These three genuinely are NOAA data, unlike the rest of this list —
  worth knowing if this scope decision is ever revisited, since "all of
  CFEM's exposure layers are third-party" isn't quite accurate.

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
  USGS's own information policy. The map's CoSMoS layer is actually
  served through Point Blue Conservation Science's own infrastructure
  (`geo.pointblue.org`), not USGS's directly — Point Blue asks only for
  a courtesy citation (confirmed against their own "suggested citations"
  document, no redistribution restriction stated), same non-mandatory
  footing as the rest of this bullet.
- **FEMA (National Flood Hazard Layer, implemented)** — same public-domain
  footing as NOAA/USGS above: U.S. federal government data under 17
  U.S.C. §105. Verified directly against FEMA's own NFHL metadata
  (`hazards.fema.gov/filedownload/metadata/NFHL/NFHL_metadata.xml`) —
  its use constraint reads "Acknowledgement of FEMA would be appreciated
  in products derived from these data" and its access constraint is
  "None." **This is a correction from this pass's initial assumption**
  that NFHL is CC-BY 3.0 and that attribution is a hard legal
  requirement — that claim traces to a third-party Data Basin mirror of
  this same service applying Data Basin's own platform-wide CC-BY 3.0
  license to their copy, not a term FEMA itself imposes on the original
  data. FEMA is still credited prominently in the map's attribution
  strip regardless, as good practice, just not because it's legally
  mandated the way BCDC/Caltrans's CC-BY-SA terms are.
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
  Subresource Integrity hash (already done for `map.njk`). Same pattern
  for esri-leaflet (added for the tier-1 ArcGIS REST sources) — CDN,
  pinned version, SRI hash.
- Stay usable on mobile.

## Non-goals

- Don't attempt to overlay any permanently-comparison-only tool's actual
  data — that's a permissions problem, not a technical one to solve
  around.
- Don't try to precisely reproduce any tool's cartographic styling —
  render real data, but legend/symbology can be simplified.
- No accounts, no saved sessions.

## Definition of done for the next map-layer pass

1. ✅ **Done (tier-1 pass):** three of the four "confirmed legal, not yet
   wired up" tools (NOAA SLR Viewer, NOAA CFEM, CoSMoS) plus FEMA NFHL
   (a new addition) are added to the map page's layer panel as real
   overlays, following the same pattern BCDC's layer already
   established (live fetch from each source's own server — esri-leaflet
   for the three genuine ArcGIS REST sources, hand-rolled tile/WMS
   fetching for CoSMoS's Point Blue infrastructure — no local copy of
   the flood data, attribution shown on the page). Cal-Adapt/CNRA
   remains the one
   item still not wired up.
2. ✅ **Done:** README.md's Implementation status table is updated to
   reflect it.
3. Still open: either the FloodRISE or CREST TODO above is resolved one
   way or the other, and `sources.njk`'s row for that tool is updated
   accordingly if the answer is "yes, add it as a map layer too."
4. Still open: Cal-Adapt/CNRA is the one remaining "confirmed legal, not
   yet wired up" tool from the original four — next candidate for a
   future map-layer pass.
