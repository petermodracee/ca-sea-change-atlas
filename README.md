# CA Sea Change Atlas

An unofficial successor to California's discontinued "Sea the Future"
tool — a map of, and comparison guide to, sea-level-rise and coastal-
flooding visualization tools, meant to help someone pick which of the 12
tools actually applies to their patch of coastline, and see real flood
data for the ones that are open to reuse. (Working name through most of
this project's development: "Sea the Future." Renamed once the project
became a real pairing of a map and a reference/comparison tool — see the
page split described below. "Sea the Future" itself refers only to
the original, now-defunct agency tool this project draws on.)

## Status

Built with [Eleventy](https://www.11ty.dev/) (11ty): a landing page, a
map page, a tool-comparison page, an About page, and one generated page
per tool, all sharing one header/footer via Eleventy includes instead of
duplicated HTML. `index.html` is a short landing page explaining the map
and comparison tool and linking to each, since they answer different
questions and aren't a duplicate of the same information, plus a short
pointer to `about.html` for the project's history. `map.html` is the
map-first page — a Leaflet map with each tool's coverage area as a
checkable layer in a right-side panel (like ArcGIS Online's Layers
widget, with collapsible group sections), a live BCDC Bay Shoreline Flood
Explorer overlay (a Total Water Level slider or a "choose a scenario" SLR
+ storm-surge picker — mirroring BCDC's own "One Map, Many Futures" panel
— plus depth-of-flooding/overtopping/low-lying/legal-delta layer toggles
and a consequence-indicator picker), plus four more live layers added
via [esri-leaflet](https://github.com/Esri/esri-leaflet) (USGS CoSMoS
with its own Average/20-yr-storm/100-yr-storm + SLR-in-cm scenario
picker, NOAA's Sea Level Rise Viewer with a half-foot-increment scenario
dropdown, FEMA's National Flood Hazard Layer showing effective flood
zones only, and NOAA's Coastal Flood Exposure Mapper composite hazard
layer), address search, and a click-to-inspect popup showing real
values (depth, acreage, traffic counts, flood zone, hazard overlap,
etc., queried live from each source's own server) for whichever layers
are checked at the clicked point. `sources.html` is the tool comparison —
the filterable 12-tool grid and compare-up-to-three table from the
original prototype, with each card linking to a real, generated detail
page at `/tool/<id>/` (see "Per-tool pages" below). `about.html` carries
the "Sea the Future" background story that used to be duplicated across
the other pages' hero banners. See `BRIEF.md` for the full project brief
and definition of done.

The scenario picker briefly grew a per-county storm-surge baseline
(auto-detected from where you click) on top of BCDC's own regional
average, plus an equivalent-combinations table and greyed-out invalid
combos computed against whichever baseline was active. The county part
was removed — regional-only was judged good enough and not worth the
added complexity — but the picker itself, the equivalent-combinations
table, and the greying all stayed, now computed against BCDC's single
regional storm-surge baseline only. The click-to-inspect popup (below)
is the complementary, fully-precise way to see the real value BCDC's
server actually reports at a specific point, when that matters more than
the picker's convenience.

BCDC's server sends no `Cache-Control`/`Expires` on either tiles or
GetFeatureInfo responses (confirmed by inspecting the response headers
directly) — so `js/map.js` keeps its own in-memory, per-session cache
keyed by request URL, so re-panning to a spot already viewed or clicking
the same point twice doesn't repeat a live ~450ms server render. The four
ArcGIS REST sources added later send equally unhelpful cache headers
(checked directly the same way), so the click-to-inspect providers that
issue their own identify/query requests share this same cache rather
than each reimplementing it.

CoSMoS and FEMA's click-to-inspect providers use a direct spatial
`query` request rather than the ArcGIS `identify` operation — `identify`
returned empty results against FEMA's service in testing even though the
same point queried correctly via `query`, so `query` is used consistently
for both point-in-polygon lookups. NOAA's Sea Level Rise Viewer and the
CFEM composite layer's raster values do use `identify` (the composite
layer, being a raster, doesn't support `query` at all — it returns an
error).

Three consequence categories — vehicle traffic, truck traffic, and rail —
are disabled with an explanatory note rather than silently showing
nothing: BCDC's live server returns zero features for all three across
multiple real highway/rail locations and a bbox spanning the whole Bay,
while every other consequence category queried the same way returns real
data. That's a gap in BCDC's own published data, confirmed directly, not
a request-format issue on this project's side.

The map/comparison split (map and grid on separate pages, rather than
stacked on one page with a click-a-point-to-see-matching-tools feature)
was decided directly with the project owner: keeping the map as its own
focused page made more room for a proper layer panel, and the tool
grid/filters/compare table work fine as a fully separate page since they
don't depend on anything the map computes. The landing page, the About
page, and per-tool pages were all later additions on top of that split —
see `BRIEF.md`'s architecture section for why each is its own page.

## Per-tool pages

Each entry in `data/tools.json` gets its own generated page at
`/tool/<id>/` (`tool.njk` templates over the dataset at build time), with
a real per-tool `<title>`, meta description, and Open Graph tags — so a
link to a specific tool actually previews and indexes as that tool, not
as the generic comparison page. `sources.html`'s tool cards link to these
pages via a "Details" link alongside the existing external "Open tool"
link.

## Map-layer scope

Not all 12 tools' data can be reproduced on the map — some are legally
off-limits, some just aren't wired up yet. "Implemented" below means
`map.html` actually renders that tool's own flood/hazard data as a live
layer, not just that it's listed on `sources.html`.

Five tools have real data wired up now: BCDC's Bay Shoreline Flood
Explorer (live WMS), plus USGS CoSMoS, NOAA's Sea Level Rise Viewer,
NOAA's Coastal Flood Exposure Mapper, and FEMA's National Flood Hazard
Layer (all four added directly to the map's layer panel via
[esri-leaflet](https://github.com/Esri/esri-leaflet), since they're
ArcGIS REST services rather than WMS like BCDC). The other 7 are
cataloged on `sources.html` for comparison. One more (Cal-Adapt/CNRA) is
confirmed legal and is the real next-up item for map work; two are
likely feasible but unverified; two are pending an actual licensing
answer; and three are **permanently** comparison-only because their own
Terms of Use confirm they prohibit exactly this kind of overlay. See
`BRIEF.md`'s "Map-layer scope" and "Licensing per source" sections for
the full breakdown and the specific clauses behind each category — that
distinction (never vs. not-yet) is the important one for anyone picking
up map work next.

CFEM's implementation covers its composite hazard-overlap layer only —
its separate Tsunami service doesn't actually render usable California
data (verified directly; see `BRIEF.md`'s "Corrections from the tier-1
map-layer pass"), so it isn't wired up.

| Tool | Org | Status | Map eligibility |
|---|---|---|---|
| Adapting to Rising Tides: Bay Shoreline Flood Explorer | BCDC / SFEI | ✅ Implemented | — |
| Our Coast, Our Future / CoSMoS | Point Blue / USGS | ✅ Implemented | — |
| Sea Level Rise Viewer | NOAA Office for Coastal Management | ✅ Implemented | — |
| Coastal Flood Exposure Mapper | NOAA Office for Coastal Management | ✅ Implemented (composite layer only) | — |
| National Flood Hazard Layer | FEMA | ✅ Implemented | — |
| Sea Level Rise – Coastal Inundation Scenarios (Cal-Adapt) | Cal-Adapt | Not implemented | Confirmed open — next up |
| East Contra Costa Shoreline Flood Explorer | BCDC / SFEI | Not implemented | Likely feasible, unverified |
| Hazard Exposure Reporting and Analytics (HERA) | USGS | Not implemented | Likely feasible, unverified |
| FloodRISE | UC Irvine | Not implemented | Pending license check (TODO) |
| Coastal Resilience Evaluation and Siting Tool (CREST) | NFWF, with partners | Not implemented | Pending license check (TODO) |
| Coastal Risk Screening Tool | Climate Central | Not implemented | **Permanently comparison-only** |
| Surging Seas Risk Finder | Climate Central | Not implemented | **Permanently comparison-only** |
| Coastal Resilience Mapping Portal | The Nature Conservancy | Not implemented | **Permanently comparison-only** |

## Layout

- `BRIEF.md` — the project brief: goals, map interaction spec, data
  model, constraints, definition of done.
- `.eleventy.js` — Eleventy config: template formats, passthrough copies
  for `css/`, `js/`, `data/`, `reference/`, and the root `.md`/`LICENSE`
  files, and the GitHub Pages `pathPrefix`.
- `_includes/base.njk` — the shared HTML skeleton (fonts, stylesheet,
  per-page title/meta/OG tags) wrapping every page's content between
  `_includes/header.njk` (brand + nav, current page marked via each
  page's `nav` front-matter key) and `_includes/footer.njk` (shared
  link row + disclaimer, plus each page's own `footerAttribution`
  front-matter value).
- `_data/tools.js` — re-exports `data/tools.json`'s `tools` array as
  Eleventy global data, so the same file backs both the client-side
  `fetch("data/tools.json")` in `js/sources.js` and `tool.njk`'s
  build-time pagination. `_data/site.js` holds the deployed site URL used
  for Open Graph tags.
- `index.njk` — the landing page: a short explanation of the two tools
  below, linking out to each, plus a one-line pointer to `about.html`.
- `map.njk`, `js/map.js` — the map page: Leaflet + OSM base map, each
  coverage region and the BCDC flood-depth WMS overlay as a checkable
  layer in the right-side panel, and address search (Nominatim).
- `js/info-popup.js` — a small, tool-agnostic click-to-inspect popup:
  register a provider function per data layer (`(latlng) => section |
  null`), and it renders whatever providers return into one combined
  Leaflet popup. `js/map.js`'s BCDC providers are the only ones today, but
  nothing about this file is BCDC-specific — a future map/tool on this
  page registers its own providers without touching it.
- `sources.njk`, `js/sources.js` — the tool comparison page: the
  filterable 12-tool grid and compare-up-to-three table.
- `about.njk` — the project's history: what "Sea the Future" was, why
  this project is two tools instead of one, and the "not affiliated"
  disclaimer in full.
- `tool.njk` — paginated over `_data/tools.js`, one generated page per
  tool at `/tool/<id>/` with real per-tool title/meta/OG tags.
- `css/style.css` — shared stylesheet for every page.
- `img/preview-map.png`, `img/preview-sources.png` — screenshot
  thumbnails shown on the landing page's two cards, and the default
  `og:image`/`twitter:image` for every page that doesn't set its own
  `ogImage` front-matter value. Not auto-generated; update these manually
  (a real screenshot of `map.html`/`sources.html`) whenever their layout
  changes significantly. The landing page degrades gracefully (image
  just doesn't render) if either file is missing.
- `img/favicon.svg` — the site favicon, referenced from `_includes/base.njk`.
- `robots.txt`, `sitemap.njk` — `sitemap.njk` generates `sitemap.xml` at
  build time from every page Eleventy knows about (including all 12 tool
  pages, via `addAllPagesToCollections` in `tool.njk`'s pagination
  config); `robots.txt` points crawlers at it.
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
  prototype with the filter-and-compare UI (no map). Kept for reference,
  untouched by the Eleventy build; its comparison-table logic and visual
  style were carried into `sources.njk` above.
- `.github/workflows/deploy.yml` — builds with Eleventy and deploys to
  GitHub Pages on every push to `main`.

## Running locally

Requires Node.js:

```
npm install
npm run serve
```

Eleventy's dev server serves the site under the same path prefix
(`/ca-sea-change-atlas/`) it deploys under, so open
`http://localhost:8080/ca-sea-change-atlas/`. `npm run build` produces a
one-off build in `_site/` without the dev server.

## Licenses & attribution

Everything the three pages load, beyond this project's own code:

- **[Leaflet](https://leafletjs.com/)** (BSD-2-Clause) — the map library
  itself, loaded from the `unpkg.com` CDN in `map.html` at the pinned
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
- **[esri-leaflet](https://github.com/Esri/esri-leaflet)** (Apache-2.0) —
  the ArcGIS REST client library used for the four sources below, loaded
  from the `unpkg.com` CDN in `map.html` at a pinned version
  (`esri-leaflet@3.1.0`) with a Subresource Integrity hash, same pattern
  as Leaflet itself.
- **[USGS CoSMoS / Our Coast, Our
  Future](https://www.usgs.gov/centers/pcmsc/science/coastal-storm-modeling-system-cosmos)**
  — the optional flood-extent overlay is loaded live from USGS's own
  ArcGIS FeatureServer, not hosted or modified by this project. USGS data
  is U.S. public domain; credited as a courtesy.
- **[NOAA Sea Level Rise Viewer](https://coast.noaa.gov/slr/)** — the
  optional sea-level-rise overlay is loaded live from NOAA's own ArcGIS
  MapServer family (one service per scenario), not hosted or modified by
  this project. NOAA data is U.S. public domain, and NOAA's Digital Coast
  program is separately required by its authorizing legislation to keep
  this data freely available; credited as a courtesy.
- **[FEMA National Flood Hazard
  Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer)** —
  the optional flood-zone overlay (effective data only) is loaded live
  from FEMA's own ArcGIS MapServer, not hosted or modified by this
  project. U.S. public domain, per FEMA's own NFHL metadata (which asks
  only for a courtesy acknowledgement, not a specific license); credited
  prominently in the map's attribution strip. Preliminary/pending FEMA
  map updates aren't shown — see the caveat in the layer panel itself.
- **[NOAA Coastal Flood Exposure
  Mapper](https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html)**
  — the optional hazard-overlap overlay (California composite layer
  only) is loaded live from NOAA's own ArcGIS MapServer, not hosted or
  modified by this project. Same public-domain footing as NOAA's Sea
  Level Rise Viewer above; credited as a courtesy.

Attribution is also shown directly on the deployed map (`map.html`'s
bottom attribution strip and Leaflet's own attribution control).

## Deploying

`.github/workflows/deploy.yml` builds the site with Eleventy and deploys
the `_site/` output to GitHub Pages automatically on every push to
`main` — no manual build or deploy step. The repo's Pages source is set
to "GitHub Actions" (not "Deploy from a branch").

## Source

Reconstructed from the original tool's public spec:
https://www.adaptationclearinghouse.org/resources/california-e-sea-the-future-e-tool.html
The original platform is offline; this project isn't affiliated with the
California State Coastal Conservancy or NOAA.
