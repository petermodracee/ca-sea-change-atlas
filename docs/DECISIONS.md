# Decisions and findings

Things that are not obvious from reading the code: choices that were made deliberately, and assumptions about live services that turned out to be wrong. Each was confirmed directly against the service at the time (response headers, network traffic, real requests), so re-check before relying on one after a long gap; the services change. Licensing decisions are in [`LICENSING.md`](LICENSING.md).

## Site structure

### Two tools on separate pages
The map and the comparison grid answer different questions (what does this stretch of coast look like across models, versus which tool should I use), and the grid doesn't depend on anything the map computes. An earlier plan put them on one page with a click-a-point-to-see-matching-tools feature; it was dropped so the map could be its own focused page with room for a real layer panel. The landing page routes visitors and carries no logic; the About page holds the project history so it isn't repeated in every hero.

### A build step, on purpose
The site started as zero-build static HTML. Eleventy was adopted so each tool can have its own URL (`/compare/tool/<id>/`) with real per-page title, description and Open Graph tags, and so header/footer aren't hand-duplicated. Deploys stay automatic (GitHub Actions), but local development needs Node.

### Tool detail layout lives in a schema
The tool page and the compare page show the same sections, so the layout is data (`data/toolDetailSchema.json`) rather than markup in each template. The optional detail fields were added to `tools.json` at the same time, so entries can be filled in gradually: anything a tool doesn't have is simply absent from its page. The resolver is one small module in `js/` (loaded by Eleventy and by the browser) rather than in a separate `lib/` directory, because `js/` is already copied to the site. `keyFeatures` stays out of the schema because it is a headline list on the tool page, not a row to compare.

### Compare page: the URL is the state
`compare/side-by-side/?tools=<id>,<id>` holds the selection so a comparison can be bookmarked or shared, and it replaces the inline table that used to live on the tool list page. The tool pickers sit in the sticky column headings so a tool can be swapped from anywhere on a long page. A tool with nothing in a section shows "No data available" in its own column instead of the section vanishing, so the columns stay aligned; a section is dropped only when no selected tool has anything for it. The tool page makes the opposite choice for a single tool (empty sections disappear), because there is nothing to line up.

### Screenshots: small, credited, and fair use
Each tool page can show up to two screenshots so a reader gets a feel for a tool before clicking through. They are kept small (about 800px) because they are an at-a-glance aid, not a replacement for the tool, and each opens full size in a new tab. The project treats them as fair use (commentary, demonstration rather than a live copy, small, not a substitute), which is why comparison-only tools can have them too, and why each needs a credit, a capture date and, where stated, a copyright notice. They stay off the compare page to keep it a plain table, and they are not the page's social-preview image because a tool screenshot in a link preview would suggest the link goes to the tool rather than to this description.

### Routes nested by tool, source moved into `site/`
Adding a third tool (County Profiles, rebuilding NOAA's discontinued Coastal County Snapshots for California) turned the flat root namespace (`map.html`, `sources.html`, `compare.html`, `tool/<id>/`) into a naming problem: three tools' pages and a fourth `about.html` would keep landing at the same level with no grouping. Pages now nest under their tool (`/map/`, `/compare/`, `/compare/side-by-side/`, `/compare/tool/<id>/`, `/county-profiles/…`), and `/about/` holds only site-level history, author bio and licensing; each tool's own methodology moves to its own `about/` page (`/compare/about/` holds what used to be the About page's "About the sources" section). Old flat URLs 404 outright — the site had no external links to them yet, so this was the cheap moment to do it. Eleventy's `dir.input` moved from `.` to `site/`, separating hand-authored templates/JS/CSS/data from repo-level project files (docs, README, license text) and from the county-profiles build scripts and generated data archive that don't belong mixed into the same root-level directories.

### `/data/`'s passthrough copy is a JSON glob, not the whole directory
`site/data/index.njk` lives in the same folder as the JSON files it lists. A whole-directory `addPassthroughCopy({"site/data": "data"})` copies every file byte-for-byte regardless of extension, independent of Eleventy's own template rendering — confirmed by a probe `.njk` file landing in the output both raw (`.njk`) and rendered (`.html`). So the data directory is passed through with a `**/*.json` glob instead, which also means non-JSON files placed there (like `site/data/county-profiles/README.md`, a repo-facing scaffold note) are never served, which is the correct behavior for that file anyway. Phase 2 found that a `**/*.json` glob also *flattens*: `county-profiles/latest/06059.json` landed at `/data/06059.json`, so the real snapshot never reached the path the pages link to. The glob is now top-level only (`*.json`) and `.eleventy.js` copies `site/data/county-profiles/latest/` as a directory, which holds pipeline JSON and nothing else.

### The route reorg broke two relative fetches the link audit missed
Moving a page from a root-level file to a nested directory (`/sources.html` → `/compare/`, `/map.html` → `/map/`) changes what a *relative* URL in its JS resolves against, one level deeper — `fetch("data/tools.json")` from `/compare/` requests `/compare/data/tools.json`, not `/data/tools.json`. The reorg's own link-integrity check only walked static `href`/`src` attributes in the rendered HTML; it never caught `site/js/sources.js`'s `fetch("data/tools.json")` or `site/js/map/layers/cosmos-layer.js`'s `COSMOS_LAYERS_URL = "data/cosmos-layers.json"`, both relative string literals inside JS, invisible to that check. Confirmed by loading the built site in a real headless browser under its actual `/ca-sea-change-atlas/` subpath — a plain local static server without that subpath produces a different, misleading set of 404s (every prefixed asset), so the check has to be done with the deploy path prefix as it actually is. Fixed to `"../data/..."` in both places. Any future move of a page to a different directory depth needs the same check: grep JS for relative-looking path literals, not just template `href`/`src`.

### `LICENSE-CONTENT.md` isn't served
It used to be passthrough-copied and linked from the licenses page as CC BY-SA 4.0's "full text," but it never contained the full text — it's a 43-line summary that itself links out to creativecommons.org for the real legal text. The licenses page now links straight to that legal text instead. `LICENSE-CONTENT.md` stays in the repo unpassed-through, since it's a GitHub-browsing convenience (GitHub auto-detects `LICENSE` for the code license; this is the equivalent declaration for the separately-licensed written content, for anyone reading the repo rather than the live site).

## Data services

### CoSMoS is not an ArcGIS service
The first implementation used a Caltrans-hosted ArcGIS mirror (`CoSMoS_SLR`), which covers one topic for one region at reduced granularity (9 SLR stops instead of 12, no "Annual" storm frequency). Matching the real Our Coast, Our Future tool required tracing its network traffic, which showed it runs on Point Blue Conservation Science's GeoServer and tile infrastructure (`geo.pointblue.org`). CoSMoS was rebuilt on that. Its layer catalog isn't CORS-enabled, so the URL and layer-name templates live in `data/cosmos-layers.json`. The Caltrans-hosted cliff-erosion service originally assumed for Cliff Retreat doesn't exist (404); Point Blue serves it.

### `/export` lies about pre-cached tiled services
`dynamicMapLayer` (`/export`) doesn't reliably reflect what a `singleFusedMapCache: true` service actually serves. It rendered NOAA's Sea Level Rise Viewer as a solid box across the tile extent, and made CFEM's Tsunami service look empty over California, which led to a wrong "no usable data" conclusion. Real `/tile/z/y/x` requests showed both are fine. Rule: for a fused-cache service use `L.esri.tiledMapLayer` and test with tile requests. NOAA SLR uses `tiledMapLayer`; CFEM's High Tide Flooding, FEMA Flood Zones and Tsunami layers are separate, real tiled services.

### CFEM hazard layers have no click-to-inspect
For CFEM's High Tide Flooding, FEMA Flood Zones and Tsunami services, `/query` returns the same leftover county-eligibility table regardless of which service is queried, disconnected from what the tile cache renders (checked at real coastal points). They get a live legend only.

### CFEM composite: real sublayer name, raster identify
The composite's California sublayer is `CA_FloodComposite` (id 42), not `CA_FloodComposite_int`. It is a raster, so ArcGIS `/query` fails on it and click-to-inspect uses `/identify`, which returns the overlapping-hazard count and description.

### `query` over `identify` where possible
FEMA's `identify` returned empty results at points where `query` worked, so point lookups use `query`. `identify` remains where the layer is a raster (CFEM composite) or the tool's own pattern (NOAA SLR).

### CFEM storm surge coverage
The hurricane storm-surge overlay comes from a separate ArcGIS Online hosted service published by NOAA's National Hurricane Center Storm Surge Unit (SLOSH data), found by tracing CFEM's own traffic. It has no mapped coverage for higher categories or the rest of California: only Category 1–2, Southern California only.

### High Tide Flooding as stations, not an area layer
NOAA's area-based Flood Frequency layer (`dc_slr/Flood_Frequency`) requires an ArcGIS token this project can't obtain. The public alternative is `dc_slr/Point_Layers` sublayer 1: NOAA CO-OPS tide-gauge stations with minor/moderate/major flood thresholds. It is deliberately not tied to the SLR slider, because those thresholds are today's, not a scenario. (CFEM's own tiled High Tide Flooding layer is separate and is also on the map.) A comment in `noaa-htf-layer.js` calling `CFEM_HighTideFlooding` "essentially empty" predates the tiled-cache finding above and shouldn't be taken as current.

### Cal-Adapt is its own tile API
The Cal-Adapt tool draws pre-rendered XYZ tiles from `api.cal-adapt.org/tiles/{slug}/{z}/{x}/{y}.png` (72 mosaics: CoSMoS by region, CalFloD3D-TFS at 5 m and 50 m, two periods, min/median/max). It does not call CNRA's `CSMW_Sea_Level_Rise` MapServer, which is an older, Third-Assessment-era dataset. There is no per-point value service, so click-to-inspect reads the rendered tile's alpha and reports extent only.

### East Contra Costa reuses BCDC's server
Its config (`query.php?q=getConfig`) returns the same WMS server and mapfile as the Bay explorer, so it reuses that URL, cache and GML parsing; only the layer names differ.

### BCDC transportation consequence layers are left out
Vehicle traffic, truck traffic and rail return empty tiles and zero features across multiple real highway and rail locations and a bbox spanning the Bay, while every other consequence category returns data. It is a gap in BCDC's published data, not a request-format problem. The consequence picker points users to BCDC's own tool. (Caltrans traffic counts are available as a separate geo layer.)

### BCDC scenario picker uses one regional storm-surge baseline
A per-county baseline (auto-detected from the click) was tried on top of BCDC's regional average and removed as not worth the complexity. The picker, its equivalent-combinations table and the greying of invalid combinations use BCDC's regional baseline only. Click-to-inspect is the fully precise way to see what BCDC reports at a point.

### No cache headers from the flood servers
BCDC's server sends no `Cache-Control` or `Expires` on tiles or GetFeatureInfo, and the other live sources are similarly unhelpful (checked from response headers). `shared/request-cache.js` keeps a per-session cache keyed by URL so a repeated tile or click doesn't repeat a roughly 450 ms server render. Cal-Adapt's tiles send a one-year `Cache-Control`, so they skip it.

## Practitioner-survey resources

Four resources from the practitioner survey (Figure 19.3, 2023 CA Coastal Adaptation Needs Assessment) were scoped but never added or excluded. Each was checked against the live service, September 2026. Licensing for the comparison-only ones is in [`LICENSING.md`](LICENSING.md).

### NOAA Coastal Inundation Dashboard: comparison-only
Station-based (200+ NOAA tide gauges): real-time and forecast water levels. NOAA's own page says its sea-level-rise mapping comes from the Sea Level Rise Viewer, which is on the map. The CO-OPS Metadata API (`api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/<id>/floodlevels.json`) is public and CORS-open, but the map already shows CO-OPS flood thresholds (see High Tide Flooding above). Redundant, so `mapEligibility: "excluded"`. Whether the Dashboard's and the map's thresholds match for every California station was not compared.

### NOAA Coastal County Snapshots: comparison-only
County reports (flood exposure, ocean jobs, wetland benefits) with charts and maps, built from FEMA, Census, BLS and C-CAP data. NOAA states the datasets are no longer updated. It is per-county reports, not a queryable map service, and no endpoint was found (individual snapshot pages were not inspected). Its flood inputs are already mapped. Excluded.

### NASA Interagency Sea Level Rise Scenario Tool: a point layer built from the Zenodo data
The tool is live: a map of U.S. tide-gauge points (13 in California) with a decade picker and a Low-to-High scenario picker, and a full projection per gauge. Points rather than flood extents still count as map-like, the same as the High Tide Flooding stations. Curl and fetch tools get 404s on its page URLs (bot filtering); a real browser loads them.

The tool's own feed (`sealevel.nasa.gov/taskforce-passthru/?markers=true` and `?psmsl_id=<n>`) works but sends no CORS header, is undocumented and states no license, so a static site can't use it. The layer instead reads the task force's published data on Zenodo (record 6067895, version 1.1, CC BY 4.0). Zenodo allows cross-origin requests with `Range` (206 responses), so the browser fetches the zip's directory (last 70 KB) and then only `Results/TR_local_projections.nc` (3.3 MB compressed, NetCDF4/HDF5), inflates it with `DecompressionStream` and reads it with h5wasm (`iife` build, SRI-pinned, about 4 MB, loaded on first toggle). That keeps the rule that map data loads live from the publisher and is never copied into the repo. `Content-Length` isn't exposed cross-origin, so the zip size is pinned in `zenodo-projections.js` with the record version.

File layout, confirmed: `rsl_total_<Low|IntLow|Int|IntHigh|High>[percentile 17/50/83][year 1900–2150][gauge]` in millimetres relative to 2000, plus `PSMSL_id`, `lat`, `lon` (0–360 in some rows, normalised), `tg` (name). Its 13 California gauges match the tool's marker feed by PSMSL id.

**The numbers do not match NASA's tool.** Port San Luis, High, median: 2150 is 3577 mm (11.74 ft) in Zenodo and 3436 mm (11.27 ft) in the tool; 2020 is 70.5 vs 58.3 mm. Versions 1.0 and 1.1 of the record agree with each other. Both use the same baseline (year 2000: the record's own code re-baselines to the trajectory at 2000, and the tool page says the same), so this is not a baseline shift. The gap is gauge-specific: San Francisco is within a few mm to 39 mm; Crescent City is about +280 mm at 2150; San Diego is about −66 to −96 mm. The cause was not found. Neither source states a newer data date, and v1.1 (Feb 2022) is the newest Zenodo version. The layer is therefore labelled as the report's Zenodo data, with a note that values can differ from NASA's tool. Revisit if NASA or NOAA publishes a newer dataset or explains the difference.

Cost: about 7 MB on first toggle (h5wasm plus the projection file), once per page load.

The National Sea Level Explorer (`earth.gov/sealevel/us/`) is a related tool from the same task force; the original was still live at the time of writing.

### Coastal Hazards System (CHS): left out entirely
USACE ERDC's probabilistic storm-hazard system covers the Atlantic, Gulf, Great Lakes and Puerto Rico/USVI; its Studies page lists nothing for California. A September 2025 ERDC technical note (CHETN-I-105) applies CHS storm-selection methods to Washington, Oregon and California, but as a methods evaluation that names what a West Coast CHS would still need. The maintainers confirmed by logging into the CHS web tool (government login required) that California is not included. It also reports storm water levels at points, not sea-level-rise flood extent. No `tools.json` entry, since a card for a tool that can't answer a California question is noise. Revisit if a West Coast CHS study is published.

## County Profiles

### County Profiles store derived data in the repo
County Profiles is the first CASCA tool to keep data in the repository, against the standing rule that map data loads live from the publisher and is never copied in (the Zenodo layer above streams by range request for exactly that reason). It has to: a profile's headline figures are spatial intersections between datasets held on different servers (FEMA's floodplain, Census jobs and population, USGS structures), and that cannot be computed in a browser at page load. FEMA's server has never heard of LODES.

The stored JSON is a derived product, not a cache: computed statistics plus vintage metadata, a new work rather than a copy of anyone's data. Nothing is stored that a page could have fetched live. The other reason to build rather than fetch is consistency: a live Census total against a built in-floodplain figure would make a ratio across two vintages, drifting silently, so both halves of every ratio come from one snapshot.

The inset map planned for a late phase is a sharper departure: simplified hazard extents are a derivative copy of FEMA and NOAA geometry. The inputs are public domain, so nothing is in question legally, but it will need its own entry here rather than looking like an oversight. The schema already reserves a `geometry` field for it. Phase 1 stores no geometry and no real data at all; its fixtures are invented and flagged.

### Zero and unavailable are different states
A county with 0 medical facilities in its floodplain has an answer; a county with no data has a gap. The schema keeps them apart (`available: true` with a value of 0, versus `available: false` with a reason from a closed set), the validator rejects a null inside an available section, and the page renders them differently. Details: [`COUNTY-PROFILES.md`](COUNTY-PROFILES.md#data-model).

### Fixtures live outside `latest/`
Phase 1's placeholder snapshots are in `site/_data/countyProfileFixtures/`, not `site/data/county-profiles/latest/`. Phase 5's snapshot-on-change diffs a new build against `latest/`, and that directory's git history is the archive's backstop, so it must hold pipeline output only: a hand-written file there would be diffed as if it were a real snapshot and could be archived as one. Templates read `latest/` when a snapshot exists and fall back to a fixture only otherwise; the validator requires `"fixture": true` on a fixture and forbids it on a real snapshot.

### One workflow for refresh, commit, build and deploy
The quarterly refresh is a single workflow (`county-profiles.yml`) with the deploy inside it, not a data workflow that commits to `main` and lets `deploy.yml` deploy on the push. A push made with the default `GITHUB_TOKEN` does not trigger other workflows, so that split would commit data and never deploy it. The alternatives (a personal access token, or `workflow_run`) add a secret or a second moving part for no gain.

### Snapshot on change, with an age cap on the gate
A dated snapshot is minted only when a county's content differs from `latest/`; `snapshot`, `generated` and the per-source `retrieved` / `verified` stamps are excluded from the comparison, so a run that finds the same numbers changes stamps in `latest/` and mints nothing. The `EFF_DATE` gate covers NFHL only; ACS, LODES, OpenFEMA and ENOW have no cheap revision probe, so a county is also recomputed when its last computation is over 200 days old. Snapshot-on-change keeps that recompute from minting anything when nothing moved.

### Correction notices are separate data, not edits
A published dated snapshot is never edited, so a correction is a new snapshot plus a notice in `site/_data/countyProfileCorrections.json` that the old snapshot's dated pages render. The old JSON and figures stay byte-identical, which `check-archive.js` enforces against git.

### Marine jobs at risk is removed
NOAA's marine economy snapshot counted marine businesses in the floodplain and under 6 ft of sea level rise. That needs business locations, which are licensed data and excluded, and the open replacement does not reach it: LEHD LODES job counts are published by 2-digit NAICS industry, while ENOW's marine sectors are defined at up to 6 digits, so no open source isolates marine jobs by location. The section is removed rather than approximated, and the reason is stated on `/county-profiles/about/`. The total-economy jobs at risk section stays, because LODES covers all industries.

### NOAA's 2/4/6/8/10 ft increments, not half-foot layers
An earlier draft computed exposure at NOAA's half-foot inundation layers. Exposure is now reported at NOAA's own 2, 4, 6, 8 and 10 ft sets, the increments NOAA Coastal County Snapshots samples. The timing table is what ties them to the California guidance: it gives the year each increment is reached per scenario at the county's gauge, so nothing needs to be rounded to a nearby half-foot layer or to a scenario's nominal height, and the figures line up with the maps a reader can open on NOAA's viewer.

### Timing by linear interpolation
The year an increment is reached is found by linear interpolation between Appendix F's decades, starting from 0 ft in 2000, rounded to the year, shown as "after 2150" past the end of the table. It matches NOAA's published San Francisco table (2022 report, to 2100) to within a year, and the build asserts the San Francisco table so the method cannot drift. It uses the median projection, so it says when an increment is reached in the middle of the range, not the earliest it could be. Each county reads one gauge (see "One gauge per county, no straddle note").

### SLR horizons: 2050 and 2100, three scenarios, flagged outside the map's range
The timing slide's third view charts the projected rise at the county's gauge in 2050 and 2100 for Intermediate, Intermediate-High and High only; Low and Intermediate-Low are not surfaced, since offering them invites planning against scenarios the state does not recommend. The two years are the pair in most California adaptation documents and Local Coastal Program updates. Earlier versions put a 2050/2100 table under the chart (it overflowed San Mateo's viewport) and then marked the two years on the slider chart itself; both were replaced by a separate chart-only view so the slider chart stays about increments. All thirteen Appendix F decades go in each snapshot and the whole table is on the about page. NOAA's inundation layers cover 1 to 10 ft, so near-term values (Crescent City 2050 Intermediate is 0.4 ft) have no layer and the High scenario passes the top late in the century (San Francisco 10.8 ft in 2140, North Spit 12.8 ft in 2150): such a figure is stated and marked, never silently shown as if the map could show it. The 1 ft floor follows NOAA's own lowest layer, although the exposure charts start at 2 ft. The transcribed Appendix F file was reconciled value by value against the Coastal Commission's adopted-guidance PDF (910 of 910 match; Port San Luis and Santa Barbara are identical in the PDF too).

### One gauge per county, no straddle note
Counties with two shoreline regimes briefly carried a second (alternate) gauge, and the build computed a "straddle" note when the two gauges' timing tables differed by five years or more (only San Mateo, against San Francisco and Alameda, ever did). That was removed: each county has one authoritative gauge, so a reader never has to choose between two sets of projections or read a note about another gauge's table. The alternates (Santa Monica for Los Angeles, San Francisco for Sonoma and Marin, Alameda for San Mateo) and their scaffolding are gone. San Mateo's authoritative gauge changed from San Francisco to Alameda: its South Bay shore is the regime where the two gauges differed (Alameda runs 0.3 to 0.4 ft below San Francisco by 2100), and the assignment is an editorial call. Sonoma and Marin stay on Point Reyes; Los Angeles stays on Los Angeles. Santa Monica is no longer in the spine.

### Rings only for a single share of a single whole
Every other section that once rendered as a ring (or a row of mini-rings) now renders as bars or columns: absolute stacked bars for flood critical facilities (inside/outside, by type) and SLR natural landscapes (one bar per increment); vertical grouped columns for SLR people-at-risk and critical-facilities (counts by increment, only the highest column labelled); 100%-stacked bars for economic diversity (four measures sharing one sector order); a dot plot for wages. A ring reads well for one share; a grid of them stopped scaling once a section needed several measures across five increments, or four measures across eleven sectors — a bar or column reads magnitude and lets values be compared directly, which a ring's area cannot. Every bar/column shares one style (24px max thickness, 4px rounded data end, square baseline, 2px gaps between stacked segments) so the eye doesn't have to re-learn the convention per section.

### One page per topic, not one page per county
The county profile split into four topic decks (`/county-profiles/county/<id>/<topic>/`) instead of staying one long page. NOAA's own tool ships four separate snapshots for the same underlying reason: one page with everything runs to 15–20 sections, too long to present, to print sensibly, or to cite precisely (a citation naming "the Orange County profile" can't say which topic a figure came from). Per-topic pages give each topic its own citation, its own PDF path (a later phase) and its own presentable deck, at the cost of a click between topics — which the top bar's tabs make cheap. The county landing page is what NOAA's tool doesn't have: a single per-county page that still exists, but only to route into topics and show each one's headline figure.

### The callout is `{figure, caption}`, not one sentence
A section's callout used to be a single sentence with the number embedded in the middle. It is now a big, separate figure with a caption beside it (matching NOAA's own "Fast Fact" card convention), because the figure is the thing a reader scans for, and burying it mid-sentence made every section read at the same weight. Splitting it also sharpens the repeat-only-what's-new rule: the figure is checked against exactly what the chart draws as a visible label, not against its accessible table (which necessarily mirrors every value and would make the rule unsatisfiable).

### Chart/Table switch pulled back to the timing chart only
An earlier pass gave every chart-bearing section a `role="group"` Chart/Table toggle rather than a `<details>` element, reasoning that a switch presents both views as equally first-class, unlike `<details>`, which hides the table behind a disclosure. In review this proved to be overreach: NOAA itself only ever offers both a table and a graph for "When Is the Time to Act?" — everywhere else NOAA is chart-only. The switch is now unique to the timing chart; every other chart stands alone, with its accessible table reachable only via an `sr-only` heading before a plain `<table>`, never a visible control. A `<table>` under `table-layout:auto` (the default) does not honour a `width:1px` visually-hidden rule — it keeps its content's minimum width regardless — so the sr-only pattern needs `table-layout:fixed` on top of the usual clip technique, or the "hidden" table still forces horizontal scroll on its ancestor.

The timing chart's own switch toggles a CSS class (`.cpd-pane-hidden`, via `visibility:hidden`) instead of the `hidden` attribute, because both its Chart and Table panes now share one CSS Grid cell (`grid-area:1/1`) so the grid sizes to whichever view is taller; `hidden` would remove the inactive pane from layout entirely and defeat that. `.hidden`-as-a-DOM-property does not reliably toggle the `hidden` *attribute* on an SVG `<g>` in every environment (SVG elements don't universally support the `HTMLOrSVGElement.hidden` IDL reflection the way `<div>`/`<p>` do) — the increment picker's crossing-state groups use `setAttribute("hidden", "")`/`removeAttribute("hidden")` for that reason, not `element.hidden = …`.

That fix alone was not enough: setting the `hidden` *attribute* on an SVG element doesn't hide it either, because SVG has no UA stylesheet rule equivalent to HTML's `[hidden]{display:none}`. The only rule in scope was `.cp [hidden]{display:none !important}`, left over from the pre-deck `.cp`-prefixed pages and never applying inside `.cpd-page`. The result was every increment's threshold line, label and crossing dots rendering at once regardless of which button was pressed — changing the attribute correctly but with nothing to act on it. Fixed with a single generic rule, `svg [hidden]{display:none}`, next to the chart styles rather than under `.cp`, so it covers every SVG in the deck (and the same SLR grouped-columns per-increment labels added afterward) rather than needing a bespoke rule per chart.

### A single-hue ramp for ordinal series
Sea level rise increments and OPC scenarios are ordinal (each one further along a scale than the last), so they use one teal ramp, light to dark, rather than the categorical palette used for economic sectors. A categorical palette implies the values are different kinds of things; a ramp implies they're the same kind of thing at increasing magnitude, which is what "2 ft, 4 ft, 6 ft…" and "Intermediate, Intermediate-High, High" actually are. The three scenarios use the ramp's 1st, 3rd and 5th steps rather than three adjacent ones, so Intermediate and High stay visually distinct even before a reader has decoded the legend.

### Wages as a dot plot, not grouped bars
Average wage by sector, for county/coastal-California/coastal-U.S., moved from 33 grouped bars (11 sectors × 3 series) to a dot plot: one row per sector, one dot per series, joined by a thin line spanning the row's real values. Eleven sectors of three-wide bar groups became visually noisy at deck scale; a dot plot reads the same three-way comparison per row without the bars' repeated horizontal mass, and the connecting line makes a sector's spread (and a suppressed value's absence) legible at a glance.

### "Methodology version," not "method version," in the UI
The JSON field stays `method` (an internal, terse name), but every reader-facing surface — the deck's About slide, the landing page's data-as-of line — says "Methodology version N." "Method" alone reads as jargon; "methodology version" says what it actually is: which revision of the computation produced this page.

### A withheld sector is left out of the 100%-stack, not drawn as a placeholder — and the denominator rule that goes with it
Superseded: an earlier pass gave a withheld sector a hatched, labelled placeholder holding a small fixed share of the bar, reasoning that a missing segment would read as "this sector doesn't exist" rather than "a number exists here and is being withheld." In review this created a real bug, not just a stylistic one: reserving that placeholder share meant every *real* segment's percentage was quietly deflated to make room for it (`scale = (100 - reserved) / 100`), so the chart's own Employment bar could show 80.4% for the same sector the callout above, computed a different way, called 83.7%. Two numbers for the same fact on the same slide is worse than a plain gap.

The fix is one denominator rule, applied everywhere: a share is always of the sectors actually known for that measure, a withheld one excluded — never a total that pretends to include an unknown value. A withheld sector has no value to give it a width, so it isn't drawn at all (no placeholder, no reserved share); the real sectors scale to fill 100% among themselves, using the exact same present-sectors total the callout's own percentage divides by. The sector is still named — in the section's footnote ("* X is withheld…; shares shown are of the remaining sectors"), not on the chart — and still listed as "withheld" in the accessible table, so nothing about its existence is hidden, only its share of a chart it can't honestly appear on.

### End-of-bar labels show one key figure; the rest live in the tooltip
Horizontal bars (`bars`, `stackedBars`) now draw exactly one visible value at the end of each bar — NOAA's own end-of-bar convention — instead of the full per-segment breakdown. Which figure is "key" is a per-chart decision made by `section-models.js`, since only it knows what the chart is for: Homes at Risk shows an abbreviated dollar amount (`compact()`, matching the axis ticks); critical facilities shows the share inside the floodplain (`pct(inside, inside+outside)`); land cover shows the natural share (wetland + upland ÷ total), recolouring the natural classes for emphasis and "Other" to a muted neutral so the chart itself argues the same point as the label. The exact numbers stay available: every segment keeps its own tooltip (or `<title>` on the sparser charts) and the accessible table is unchanged.

Land cover's key label is the same metric as its callout for the lowest increment, by construction — both are "natural share of this row's total" — so, like SLR People at Risk's headcount above, it is deliberately excluded from the repeat-guard's `shown` list rather than triggering a false "callout repeats the chart" build failure.

Diverse Economies applies the same one-figure principle to its 100%-stacked bars: only the headline sector (the one named in the big number) is coloured and labelled inline; every other sector renders as one of two alternating neutral shades and is identified by name in the legend and the tooltip. Eight cycling categorical colours across up to 11 sectors made every bar equally loud; recolouring around "the one sector this section is about" matches the callout's own framing.

Removing a chart's own `.nice()`-rounded domain (so a bar's fullest value reaches the plot's real edge, not a domain padded up to the next round number) meant the end-of-bar label now needs guaranteed room past that edge — `stackedBars`' right margin grew from 8px to 46px after the fullest bar's label was found rendering past the SVG's own viewBox and disappearing.

### Horizontal bars and the dot plot: labels in a left column, not stacked above each row
Row labels for `bars`, `stackedBars` and `dots` used to sit on their own line above each bar/dot row, pushing the chart's usable height up and wasting the row's own left margin. They now sit right-aligned in a left column sized to the longest label (a rough per-character width estimate at build time — there's no canvas to measure real text against) with the bars/dots starting just to its right, matching a standard horizontal-bar-chart layout and roughly halving the vertical space each row needs.

### NOAA's own repeated paragraphs are kept, not paraphrased apart
Tracing NOAA's live tool section by section turned up more of the pattern the spec's "Homes at Risk"/"A Better Future is a Greener Future" bug describes: NOAA's "Being Underwater Is Not a Good Business Plan" carries the identical paragraph in both the flood and sea-level-rise topics, and its "Total Jobs" section carries the identical self-employed/fishermen paragraph in both the total and marine economy topics. Unlike the original bug, these are not a chart/prose mismatch — the sections are structurally identical (same kind of figure, same argument), so the repeat is NOAA's own editorial choice, not an accident. They are kept verbatim rather than invented apart, since inventing new body copy not sourced from NOAA would cost more accuracy than the repetition costs clarity. The one bug actually present — natural features duplicating Homes at Risk's property-tax paragraph — is fixed by giving flood natural features NOAA's own distinct screen-view paragraph about development trends.

### A withheld stat is body text, not a big number
`.is-withheld` used to only recolour and italicise a suppressed value, leaving it at the same giant serif size as a real figure — a stat that doesn't exist read as visually equal in weight to one that does. It now drops to body-text size for both the `.cp-stats`/`.cp-equation` display types, reads "Withheld*" with the asterisk on that specific value (not just in a shared footnote symbol), and the footnote itself names which stat(s) are withheld ("* GDP is withheld…") instead of a generic "one or more values" disclaimer — computed per section from whichever items/parts are actually suppressed, so it never needs hand-maintaining per topic.

### Two CSS selector bugs that shipped invisible: axis text and legend swatches
Two chart-styling rules were written against markup that didn't match what the templates actually emit, and both failed silently rather than erroring: `.cpd-axis text` never matched because `cpd-axis` is the class on the `<text>` element itself, not a descendant of it — every axis label rendered in the browser's default black instead of the muted ink-soft token. And `.cpd-swatch` (the class every deck legend's swatch `<span>` actually carries) had no sizing rule at all — only the legend-*background* colour rules existed, scoped to each series' own class — so every legend swatch rendered at its default 0×0 and simply didn't appear. Neither broke the build or threw a console error; both needed a human comparing the rendered page against the markup to catch.

### A way back to the main site from the deck
The topic deck is an app shell with its own fixed top bar and no header or footer of its own (`body.cpd-page` hides the site header/footer entirely), which meant a reader who landed on a topic page directly had no link back to the rest of seachangeatlas.org short of editing the URL. The top bar now opens with the CASCA logo (linking to the site root) and a divider before the county crumb, and the crumb's "County Profiles" line is itself a link to the index — both reusing the site header's existing asset and route rather than adding a new one. Below 600px the logo stays and the wordmark text drops, matching how the rest of the top bar degrades at that width.

### SLR People at Risk: an increment picker for the column labels, not just the highest one
The grouped-columns chart used to label only the highest increment's column, always — a reader could not see the exposure figure for any other increment without opening the accessible table. Every column for every increment was already drawn (only the *label* was conditional), so the fix adds the same increment-picker UI as the timing chart and toggles which increment's set of labels is visible via `[hidden]` on the label `<text>`s, without touching the columns themselves. Deliberately scoped to SLR People at Risk only, not to Flooded Facilities' grouped columns — the reviewed request was specific to "residents," and duplicating the picker onto every grouped-columns chart wasn't asked for.

Still open, not resolved this round: the 65+ and poverty-line series are much smaller than Population and read as nearly flat on a shared axis. Two alternatives were sketched (each group as a % of its own total, matching the ring convention; or small multiples with each group on its own axis) but neither is implemented — see the review notes for the mockups and trade-offs.

(Flooded Facilities did get an increment picker in the following round, but as a different chart shape entirely — see "Flooded Facilities becomes a stacked bar, not grouped columns" below — not by reusing this one.)

### Flooded Facilities becomes a stacked bar, not grouped columns
Grouped columns compare increments to each other within one facility type, but the real question NOAA's own pattern asks is "how much of this type is exposed, out of how many total" — and the totals vary by two orders of magnitude between types (799 schools, 36 medical facilities in one county), which a shared column-height axis obscures for anything but the largest type. Converted to `stackedByIncrement`: one horizontal bar per facility type, split into "exposed at the selected increment" (coloured) and "not yet exposed" (muted, the rest of that type), so the type's real total is always visible as the bar's own length regardless of how small the exposed share is. Left-column labels (the type names) follow the same rule as every other horizontal bar, needed here more than usual since "Medical facilities" is far longer than "Schools." An increment picker identical in UI to People at Risk's drives which increment's split shows, but the underlying chart and geometry (`stackedByIncrement` vs `groupedColumns`) are different filters — the picker toggles whole precomputed `<g>` states per row (matching the timing chart's approach) rather than just a label's visibility, because here the increment changes where the segments themselves split, not just which number is printed.

### Chart viewBox width now matches the panel, not an arbitrary round number
Every chart used to draw in a viewBox 420–600 units wide, then get stretched or squeezed to fit a panel that — at deck scale — is rendered several times that width. Combined with a `max-height:44vh` cap on `.cpd-chart svg`, this was a real bug, not just a style nit: `width:100%;height:auto` computes the "auto" height from the SVG's own aspect ratio, and when a narrow-aspect viewBox (drawn for something more like a printed figure) gets assigned a much wider box, `preserveAspectRatio`'s default (`xMidYMid meet`) scales the whole drawing down to whatever dimension is more constraining and centres it — here, the height cap — leaving visible side gutters and text that renders far smaller than its nominal font-size suggests. The fix has two parts that only work together: every chart now draws in a viewBox close to 1000 units wide (roughly matching the panel's real rendered width, so the scale factor stays near 1:1) with its height set from content — row count for the bar-style charts, ~0.4 of the width for the column/line ones — and `.cpd-chart svg` no longer carries any `max-height` at all, since there's nothing left for it to protect against once the aspect ratio itself is right. Font sizes and stroke widths throughout `template-helpers.mjs` and the `.cpd-*` chart classes in `style.css` roughly doubled to match, chosen so on-screen text clears 14px at the narrowest panel width the deck is verified at (~700px, a 1400px viewport).

That "~0.4 of the width" ratio for column/line charts was itself only a starting point, and shipped as a literal shared constant (`W=1000, H=400`) between `groupedColumns` and `slrCurves` — the SLR People at Risk review comment came back twice asking for a shorter chart with bigger text before this was caught. A 3-group, 5-column-per-group chart and a 150-year-span line chart don't need the same vertical room or the same type scale just because they're both "not a bar-style chart"; `groupedColumns` now has its own ratio (1000x280, later 1000x300 to make room for a value-label row above the plot) and a `.cpd-col-chart` CSS class bumping its axis/value text further than the shared default, and `slrCurves` has its own 1000x320 with its own margins (its right margin was once sized for the "Intermediate-High" end label; the scenario names later moved to a legend below the chart and the plot took that width back). The lesson generalises: a shared ratio or shared type scale is a reasonable default, but a chart with a real reason to differ (row/group count, label length) should get its own numbers rather than inheriting one tuned for a different chart's proportions.

The wages dot plot got the opposite adjustment: at up to 11 sectors its natural height ran taller than the panel at 1400px and below, clipping at the bottom rather than letterboxing (there was nothing to letterbox — the height was genuinely too much content for the space). Rather than shrink font size to compensate, `dotPlot()`'s own row height was tightened and `.cpd-chart-dotplot svg` keeps a `max-height` (52vh) as a second line of defence — the one deliberate exception to the "no max-height" rule above, because here the alternative (scrolling or clipping inside a slide) is worse than a little letterboxing on an unusually tall county's sector list.

### Diverse Economies switches from hand-drawn icons to Material Symbols
An earlier pass drew the 17 sector icons as original line-art specifically to avoid taking on an icon-library dependency for a purely decorative aid. In review this was overruled: hand-drawn icons at this scale (17 of them, redrawn by eye) don't hold up next to a real icon set's consistency, and the project already takes on other permissively-licensed build-time dependencies for exactly this kind of asset (the Google Fonts served locally, Leaflet, esri-leaflet). Switched to `@material-symbols/svg-400` (Apache-2.0, Google's own Material Symbols set), pulling the real outlined/filled SVGs at build time via `fs.readFileSync` — never hand-copied path data, never fetched at runtime — and crediting it in `site/_data/credits.json` like every other library.

No icon in Material Symbols (or, as far as this search went, in any other general-purpose UI icon set) is a literal glyph for "oil and gas extraction" or "mining" — the closest available concepts are all either a generic landscape/terrain glyph or something narrowly literal like a single oil drum. `oil_barrel` was picked for the marine "Offshore mineral resources" sector (a literal enough match: a barrel is the oil-and-gas trade's own generic figure), and `landscape` for the general-economy "Natural resources and mining" sector (broader, but reads as "extraction from the land" better than reaching for a dollar sign or a generic factory glyph, both of which are already used elsewhere in the mapping). Two-concept sector names picked whichever half had a more visually distinctive icon available: "Education and health services" → `school` (a school building reads clearly at 22px; there is no single icon for "school + hospital" and a caduceus/cross-only icon would misread as a health-only sector). The headline sector's icon uses the same glyph's FILL-axis-on variant (`<icon>-fill.svg`) rather than a different icon, so "this is the one the big number is about" reads as an emphasis change, not a category change.

### Increment pickers become one vertical slider
The timing chart, People at Risk and Flooded Facilities each had a row of five `2 ft … 10 ft` buttons above the chart. They're now one shared NOAA-style vertical `<input type="range">` to the chart's right, stepping only through the five increments, so the control sits where NOAA's own tool puts it and reads as one continuous scale rather than five unrelated buttons. A native range input keeps keyboard and screen-reader support for free; `aria-valuetext` and an `<output>` (whose implicit status role announces changes) give "6 ft" rather than a bare "6". Each chart's own `select(ft)` is unchanged — only its trigger moved.

Two layout findings. `-webkit-appearance:slider-vertical`, the older native-vertical approach, is no longer honoured by Chrome (tested in Chrome 152: it renders a small horizontal slider), so the slider uses `writing-mode:vertical-lr; direction:rtl`. And the thumb only sits centred on the track if the input is as wide as the thumb: an 8px input with a 22px thumb drew visibly off-centre, so the input takes the thumb's width and the 8px track is a centred background strip. The first version also let the slider stretch to the row's height; the row is several flex levels below a flex-grow chain up to the slide, so the slider grew to the slide's leftover height (~900px) rather than the chart's. A fixed-height track fixed that, but sat beside the chart rather than on it: its bottom lined up with the chart's box (legend included), not the x-axis. The track now spans exactly the plot area. Each chart passes its plot area's top and bottom as fractions of its viewBox width, and the row is a CSS size container, so the SVG's rendered scale is known in CSS and the offsets hold at any width. The slider's contents are absolutely positioned, so it contributes no height and can't feed back into the row's.

### SLR People at Risk: mute the unselected columns, labels above the plot
With every increment's column in its own ramp colour, the slider's selection didn't show in the columns at all, and each value label sat inside its column's cap — so switching increments left two sets of labels overlapping on neighbouring columns of different heights. Now only the selected increment's columns keep their ramp colour and the rest share one muted tone, and the value labels sit in one fixed row above the plot area in full-contrast ink, readable whatever the column's height. The on-fill label colour tokens (`--onfill-ramp-*`) went with the in-column labels.

### Timing chart: no doubled label, scenarios in a legend
Every increment drew a muted threshold line and "N ft" label, and the selected one drew a bold twin 3px above it, so the selected label always appeared twice. The selected increment's muted twin is now hidden while it's selected. The scenario names moved from labels at the curves' ends into a legend below the chart, matching every other chart's series legend; the right margin that held them went back to the plot.

### Wages: text labels in a fixed-width column
The dot plot's row labels briefly became sector icons, to fix a label column sized to the longest sector name ("Trade, transportation, and utilities") that left short names stranded in empty space. In review the icons were too hard to read at a glance, so the rows are text again, but the column stayed fixed-width: long names split over two lines at whichever word break keeps the longer line shortest. The chart also gets a visible gridline at each x-axis tick; the shared 1px gridline all but disappeared at this chart's rendered scale.

### Total Jobs: no equation when self-employed is withheld
"Employed + Self-employed = Total" with the middle term withheld made the "total" a copy of "employed" beside an unknown addend: arithmetic that looks complete and isn't. When self-employed is withheld, the section drops the equation for a plain line stating the employed count and that self-employed is withheld. The callout (the leading self-employed sector) is computed from per-sector figures and is unaffected.

### Phase 2 reconciliation: Orange County against NOAA's published snapshot
The Phase 2 gate: if the intersect method is wrong it is wrong the same way for all 27 counties. NOAA's published Orange County figures were read from its snapshot API (`coast.noaa.gov/snapshots/api/currentFlood/06059.json` and `futureFlood/`), and each is set beside the computed one below. Expect differences that are not errors: NOAA's snapshot is built on older data (ACS 2014–2018, USGS structures 2020, flood zones and SLR extents of unstated "various dates"), and its own FAQ says demographics were "analyzed at the block group level and aggregated up to the county level". The computed figures use the ACS 2020–2024, USGS structures refreshed July 2026, NFHL panels effective 2009-12-03 to 2019-03-21, and block-level intersects apportioned by areal share (see the next decision). The figures below are the published, areal-apportioned ones; the block-point figures are recorded beside them in the run's diagnostics report.

**Flood hazard (SFHA)**

| Figure | Computed | NOAA | Verdict |
|---|---|---|---|
| Population, county total | 3,165,820 | 3,164,182 | Matches (0.05%); the block-group sum equals the published county ACS estimate exactly |
| Population in floodplain | 123,002 (3.9%) | 151,754 (4.8%) | **Differs (19% lower), explained below** |
| Aged 65+ in floodplain | 21,106 of 514,824 (4.1%) | 22,186 of 440,488 (5.0%) | Close (5% lower) in count; the county 65+ total itself rose 17% (ACS vintage), so the share is lower |
| Below poverty in floodplain | 12,621 of 296,883 (4.3%) | 16,740 of 359,503 (4.7%) | Differs (25% lower), same cause; the county poverty total fell 17% (ACS vintage) |
| Land area in floodplain | 35.1 of 792.8 sq mi (4.4%) | 4.3% | Matches |
| Schools in floodplain | 29 of 764 | 31 of 830 | Close; total differs (see below) |
| Police / fire / medical in floodplain | 1 of 40 / 4 of 142 / 1 of 35 | 1 of 44 / 5 of 142 / 1 of 36 | Close; fire total identical |
| NFIP payouts, 1991–2015 (five periods) | within a dollar in four periods, 0.004% off in the fifth | | Matches |
| NFIP payouts 2016–2020 | $1,300,846 | $1,555,739 | **Differs; county filter ruled out, cause unexplained** |
| NFIP claims 1991–2020 | 2,743 | 2,778 | Close (1.3%); counting every claim rather than only paid ones is what makes them comparable |
| Jobs in floodplain | 58,116 of 1,713,003 (3.4%) | 4,415 businesses (2.5%) | Different measures (LODES jobs replace licensed business counts); the block-point share was 2.6%, closer to NOAA's, but jobs concentrate at a few addresses and the two measures cannot be reconciled |

*Why population is lower than NOAA's.* Not a defect, and checked rather than assumed: the same code, run NOAA's way, reproduces NOAA. Taking each block group's share of area in the floodplain and applying it to the whole group (NOAA's stated method) on today's data gives 160,699 people (5.1%), 29,747 aged 65+ and 15,298 in poverty, against NOAA's 151,754, 22,186 and 16,740: same magnitude, and 31% above the areal block-level figure. That is the smearing the spec predicted: a block group's floodplain is often a channel or a bay, and applying its area share to everyone in the group places people in it. The block-level method apportions each group's people to its blocks by 2020 block population first, so people are placed where blocks say they live.

*Areal share, not the block point, is the published figure.* Testing only a block's internal point counts a block that straddles a hazard boundary as wholly in or wholly out. Across the county that undercounts: the block-point SFHA population was 105,089, and weighting each block by the share of its own polygon inside the floodplain gives 123,002 (17% more). Areal weighting assumes people are spread evenly over the block, which is also wrong in detail (a block's people cluster on its buildable land), so neither figure is exact, but the point test's bias is systematic, in one direction, at every boundary, while the areal one's is not. A worry checked and not borne out: areal weighting would lean high if coastal blocks' water were counted as if people lived on it, but only 2.5% of the areal SFHA population (3,043 people) sits in blocks that contain any water. The block-point figures stay on record (`point` in the diagnostics report, the same run) so the comparison is never lost. Block-point and areal jobs differ more (43,807 against 58,116) because employment concentrates at a few addresses, which the areal method spreads over each block. The rest of the gap to NOAA (123,002 against 151,754) is the block-group smearing above, plus ACS 2020–2024 against 2014–2018 and FEMA maps of different vintages.

*Facilities.* USGS's structures layers were refreshed in July 2026 and NOAA's used the 2020 release; schools fell from 830 to 764. Not investigated school by school, so treat "closures and consolidation" as the likely, unverified explanation. The floodplain counts agree to within two facilities.

*NFIP 2016–2020: diagnosed, and the county filter is not the cause.* Five of the six periods match NOAA to within a dollar (one 0.004% off), which validates the payout definition and the period binning. 2016–2020 is $254,893 (16%) lower here. The obvious suspect was `countyCode` dropping real Orange claims, so the window was re-queried three ways (statewide California claims for 2016–2020, 3,953 of them, then filtered): by `countyCode`, by the county prefix of `censusGeoid`, and by NFIP community number (`nfipCommunityNumberCurrent`, else `nfipRatedCommunityNumber`) against all 35 Orange communities in FEMA's Community Status Book (`fema.gov/cis/CA.csv`). All three return the *same 147 claims and $1,300,846*; no claim appears in one set and not another. Also ruled out: the deprecated v2 dataset gives the same 147 claims and the same total (its ids differ from v3's, its amounts do not); payout fields (gross `amountPaidOn…` and net `net…PaymentAmount` both sum to $1,300,846); and a boundary difference (all of 2021 is $199,742, less than the gap). The gap is therefore not reproducible from either current OpenFEMA release, and NOAA's own pull cannot be re-examined. It stays **unexplained**; the likeliest remaining cause is that NOAA's number predates later revisions to 2016–2020 claim records, which no available data can confirm. The Orange community numbers in the request that prompted this diagnosis were partly different from FEMA's list (Huntington Beach is 065034, Newport Beach 060227, Seal Beach 060233, the unincorporated county 060212).

**The one real mechanism it did find, and the decision on it.** `countyCode` is null on some claims. Statewide in 2016–2020 that is 4 claims, all north-coast, none Orange. Over all years, `censusGeoid` finds 4 Orange claims that `countyCode` misses, all 1980s losses (three carry an Orange community number, one a Texas one), so none is in a published period and no figure moved. *Community number is rejected as the county key*: it matched exactly here but is a worse key in general (a community can span counties, `nfipCommunityNumberCurrent` is often null, and the list is a per-state, hand-maintained CSV that Phase 3 would have to parse for 26 more counties). `fetchClaims` now takes the union of `countyCode` and the county prefix of `censusGeoid` (one extra clause, deduplicated by id): it is correct for every county and cannot lose a claim the old filter found. The regenerated per-period figures are identical to the published ones.

**Sea level rise (2/4/6/8/10 ft above MHHW)**

| Population | 2 ft | 4 ft | 6 ft | 8 ft | 10 ft |
|---|---|---|---|---|---|
| Computed, ocean-connected (areal, published) | 4,499 | 37,340 | 78,837 | 106,754 | 122,865 |
| Computed, connected plus low-lying (areal, published) | 32,672 | 63,422 | 88,941 | 110,992 | 129,267 |
| Computed, ocean-connected (block-point, recorded) | 3,162 | 35,710 | 76,705 | 104,491 | 119,883 |
| Computed, connected plus low-lying (block-point, recorded) | 28,673 | 59,377 | 85,724 | 108,039 | 125,407 |
| NOAA | 20,242 | 60,511 | 96,930 | 117,676 | 139,181 |

| Facilities (point-based), computed / NOAA | 2 ft | 4 ft | 6 ft | 8 ft | 10 ft |
|---|---|---|---|---|---|
| Schools | 0 / 1 | 4 / 7 | 15 / 17 | 19 / 21 | 23 / 26 |
| Fire stations | 0 / 1 | 4 / 2 | 5 / 5 | 7 / 7 | 8 / 8 |
| Police stations | 1 / 0 | 2 / 1 | 3 / 2 | 3 / 3 | 3 / 3 |
| Medical facilities | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

(Facilities, ocean-connected; with low-lying areas added they are 3 / 8 / 15 / 19 / 24 schools and 1 / 4 / 5 / 7 / 8 fire stations. Fire and police counts are within two facilities of NOAA everywhere.)

NOAA's population sits between the two computed series at 2 ft and within 5 to 8% of the connected-plus-low-lying series at 4 ft and above (63,422 against 60,511; 88,941 against 96,930; 129,267 against 139,181), and much further from the connected-only series. That is evidence NOAA's snapshot counted both, which is consistent with the decision below. The 2 ft gap (NOAA 20,242 between 4,499 and 32,672) is not explained: NOAA's SLR data is older and its vintage unstated. SLR jobs are not compared: NOAA counts businesses, and the two measures cannot be reconciled.

**What this establishes for Phase 3.** The block-level machinery is sound: every input the intersect can be checked against reproduces (the county totals, the land share, the NFIP payouts, the facility counts, and NOAA's own population figure once run NOAA's way). Populated blocks outside FEMA's panels: none (22 blocks, no residents). Extents nest at every increment (zero violations). Every LODES block exists in the TIGER block list. One item is not closed: the 2016–2020 payout gap (diagnosed above, cause not found and not the county filter). The block-point against areal question is closed: areal is published, point is recorded, and every mask's areal fractions were checked to be disjoint, nested and unclamped (below).

### Areal apportionment is the published method, for every hazard mask
Method 1 first shipped as block-point tests with areal weighting only as a sensitivity check on the SFHA. Nothing was published, so this is a correction to what `method` 1 should have been, not a change from it, and `method` stays 1. The correction applies pipeline-wide: the SFHA and all ten SLR masks (NOAA's ocean-connected inundation, and connected plus low-lying, at 2/4/6/8/10 ft) now weight each block's people, older residents, residents in poverty and jobs by the share of the block's own polygon inside the mask. The reasoning is the "Why population is lower" writeup in the reconciliation above, generalised: a block point undercounts at every irregular boundary. Facilities are points, so they stay on point-in-polygon: a school is inside a floodplain or it is not.

What was checked rather than assumed, per mask: connected and low-lying polygons are disjoint by construction in NOAA's method (low-lying means unconnected), and the connected-plus-low-lying share is the sum of the two, so the code samples blocks that meet two or more polygons and confirms the areas of the polygons taken alone add up to the area taken together (ratio 1.000000 in every mask but one, where it is 0.999999); no block's connected plus low-lying share exceeds 1; no block is less covered at a higher increment (zero nesting violations across all eight steps); and any polygon-clipping failure aborts the run instead of counting the block as uncovered. The block-point figures for the same masks are kept in the diagnostics report (`point`), and land-in-floodplain, facility counts and NFIP figures are unchanged by this correction (verified against the previous snapshot: those sections are byte-identical).

**Run time.** Areal fractions for a mask are cheap only with the right structure. The first version clipped every nearby polygon per block and had not finished one SLR mask after ten minutes (NOAA's coastline polygons have hundreds of thousands of vertices); it now splits each mask once into a 0.02 degree grid by recursive bounding-box clipping (a coarser 0.1 degree grid for the few blocks that span many tiles) and clips only fragments near each block to that block's own box. On Orange County (26,734 blocks, this machine): all eleven masks take 26 s together (SFHA 6 s, connected 2 to 4 s each, low-lying 0.5 to 1.4 s each). The whole intersect took 205 s, of which 172 s is the block-point tests, which are now needed only for the recorded comparison (facilities test 1,300 points and are negligible). Before the change, the intersect measured about 280 s including a 12 s SFHA-only areal check; the difference is within run-to-run noise, so the honest reading is that generalising areal apportionment to eleven masks added roughly 15 to 20 s per county-sized run. A cold run adds the downloads (on this machine, blocks 46 s, NFHL about 160 s, LODES about 58 s, plus the ACS bulk streams and the 112 MB SLR zip). For Phase 3 on GitHub Actions, scale by block count: Orange is among the larger coastal counties, and 27 counties are perhaps ten times Orange's blocks, so the intersect is a few tens of minutes (about 80% of it the recorded block-point comparison, which can be made optional) and well inside a job's six-hour limit. The cost that will not scale well as written is the ACS and LODES streaming, which re-reads a 320 MB national and a state file per county; Phase 3 should read them once per run for all counties.

### SLR sections always show the combined exposure, with the low-lying part marked
NOAA's mapping method (`coast.noaa.gov/data/digitalcoast/pdf/slr-inundation-methods.pdf`, January 2017) maps ocean-connected inundation and hydrologically unconnected low-lying areas separately, and states that unconnected areas "are still displayed, though symbolized differently". The first cut of the reconciliation published only the connected series, which understates exposure. The snapshot therefore carries both (`counts` for connected, `countsWithLow` for connected plus low-lying) for all three SLR sections, and the deck always draws the **combined** figure with the ocean-connected part solid and the additional low-lying part a lighter dashed segment stacked on it (facilities: a third segment before the unexposed remainder), with a legend item for the additional part. The end-of-bar label is the combined total; the tooltip and the data table give both parts, and the callout and prose state one number ("… including isolated low-lying areas"). The chart axis fits the combined values.

*A toggle was tried and replaced.* The first version (commit `7c7f5da`) put a Connected only / Including low-lying areas / Both toggle on each of the three sections, defaulting to Both, with the state in the URL as `?low=`. It was more interface than the data needed: "Including low-lying areas" and "Both" showed the identical combined total, and the only difference was one clause of prose (in Jobs at Risk, which has no chart, that clause was the whole difference between the two states); the solid/dashed split, the thing that shows both pieces of the number at once, appeared only in Both, so "Including low-lying areas" baked a less-certain number into a plain solid bar with no cue; and the citation paragraph rendered unconditionally in every state of every section, nine copies including in Connected only, where it explained a line that was not drawn. Removing the toggle keeps the standing decision (show both, because NOAA's method computes both) without making the reader pick a state to see it. It is a rendering change only: `counts` and `countsWithLow` are both still needed to draw the split, and the pipeline is unchanged. The toggle, its `?low=` parameter and its CSS and script were deleted, not hidden; no other topic used them.

The sections carry no inline explanation at all (no footnote, no link): the solid/dashed split says what is drawn, and the reasoning lives where every other methodology question on the site does, the County Profiles about page (`/county-profiles/about/#connected-low-lying`). A sitewide methodology page was considered and does not exist (the sitewide `/about/` is the author's own history, bio and disclosures; `/about/licenses/` is the credits list; `/compare/about/` and `/county-profiles/about/` are per-tool), so the per-tool page it is. Captions that only restated the low-lying piece were cut too: the callouts state the combined number without ", including isolated low-lying areas", and the legend item for the dashed part is just "Affected in low-lying areas". The data table, tooltips and chart description keep naming the two parts, because there they identify which value is which. The sourcing is worth recording because it is easy to mis-cite: NOAA's methods document is the source for the definition (low-lying areas are those the elevation model does not connect to the ocean) and for mapping them separately, and it also cautions that the model does not resolve drains and ditches, so unconnected areas "may" be mapped incorrectly. It says nothing about groundwater. The groundwater claim, that rising sea level raises coastal water tables and affects areas with no surface connection to the ocean, is cited to Befus, Barnard and Hoover (2020), "Increasing threat of coastal groundwater hazards from sea-level rise in California", *Nature Climate Change* 10, 946–952, doi:10.1038/s41558-020-0874-1 (metadata confirmed; the article is not open access, so only its title and record were checked, not its text). NOAA's own snapshot appears to have counted both series (its populations sit within 5 to 8% of the connected-plus-low-lying series at 4 ft and above), which supports showing the combined figure.

*The total-economy six-foot jobs figure now matches.* `total-economy`'s "Jobs under 6 ft of sea level rise" stat, which had stayed ocean-connected only because it is a fixed stat pair with no increment chart, now uses the combined series (`slrWithLow` at 6 ft), the same field the SLR sections draw, with no caveat of its own (the about page covers it). The two topics can no longer disagree, and the item that had been deferred to Phase 3 is closed. The floodplain half of the pair is unchanged.

*The Flooded Facilities tooltip listed only some categories.* Each bar's tooltip was attached to the exposed and additional segments only, so hovering the unexposed remainder (most of the bar) showed nothing, and the text named just the exposed and additional values, never the unexposed count. Every segment now carries the same tooltip, one category per line, naming every category the bar has: ocean-connected, additional low-lying and not yet exposed (or exposed and not yet exposed for a row with no low-lying series).

### The Census API is keyed; the pipeline uses the bulk files
The Census Data API now answers every request, including a single anonymous one, with "Missing Key". A key is a credential tied to an email address and does not belong in a public repository or an unattended Actions workflow's source, so the pipeline reads the ACS 5-year table-based summary files (`www2.census.gov/.../summary_file/2024/table-based-SF/`) instead, which carry the same estimates. The files are national and 20 to 200 MB, so they are streamed and only the county's rows kept. A side effect worth knowing: B17001 (poverty status) is not published below tract in this release, so poverty uses C17002 (ratio of income to poverty level), whose "under 1.00" classes are the same definition and which is published by block group. If a key is ever provisioned, the API is a drop-in for the streaming reader.

### NOAA SLR extents come from the bulk GeoPackage, not the ArcGIS service
The `dc_slr/slr_<n>ft` services the map draws are pre-cached tiles; their queryable layer returns one dissolved polygon spanning the whole West Coast, which cannot be intersected with a county's blocks. The vector product is a regional GeoPackage (`CA_South_slr_data_dist.zip`, 112 MB, all increments in half-foot steps), read with Node's built-in `node:sqlite` and its R-tree index, so no GDAL is needed. This is a bulk copy of NOAA's data used only to compute statistics, held in a gitignored cache and never committed, consistent with the rule that map data is never copied into the repo.

### A real snapshot fills its pending sections from the fixture, per section (superseded in Phase 3)
*Superseded.* Phase 3 shipped every pending section for every county, deleted the fixtures and the `pending-phase-3` reason, and removed the fill; see "The fixtures are gone" under Phase 3 editorial calls. What follows is the Phase 2 reasoning, kept for the record.

Phase 2 leaves the ENOW and C-CAP sections for Phase 3, but the deck and landing page must keep rendering. A real snapshot records those sections as unavailable with the new `pending-phase-3` reason, which is what the JSON download says. The resolver fills each such section from the county's fixture for display only and labels it in the section's own footnote, so numbers invented for layout are never shown beside real ones unlabelled. A placeholder section is never the landing-page headline, and the page-wide "Placeholder figures" tag and banner stay fixture-only because Orange's flood and sea level rise pages are mostly real. This makes a county's move from fixture to real happen one source at a time with no template change. The alternative considered was to render those sections as the dashed unavailable block; it is more honest at a glance and is what a county with no fixture gets, but it would have left the total-economy and marine-economy pages nearly empty for Orange until Phase 3.

### Phase 3 reconciliation: a second county, and the new sections
The Phase 3 gate. Phase 2 reconciled Orange County's flood and sea level rise figures against NOAA's published snapshot; Phase 3 adds ENOW, total economy and C-CAP, which have no reconciliation yet, and 26 more counties. NOAA's snapshot API answers for every county and every snapshot (`coast.noaa.gov/snapshots/api/<currentFlood|futureFlood|marineEconomy|coastalEconomy>/<fips>.json`), so San Diego County (the second largest, and a different SLR region set from the Bay counties) was reconciled in full, and Orange County's new sections were checked the same way. NOAA's figures are older (ACS 2014–2018, ENOW and Total Economy about 2016, flood zones and SLR extents of unstated dates), so differences from a moving world are expected and are separated from method differences below.

**San Diego County: flood hazard**

| Figure | Computed | NOAA | Verdict |
|---|---|---|---|
| Population, county total | 3,288,774 | 3,302,833 | Matches (0.4%) |
| Population in floodplain | 85,839 | 119,863 | **28% lower**, the same block-group-smearing gap as Orange County (19% lower); NOAA applies a block group's share of area to everyone in it, and a coastal block group's floodplain is often a channel or a bay |
| Aged 65+ / below poverty in floodplain | 13,093 / 10,182 | 16,541 / 15,540 | 21% / 35% lower, the same cause plus ACS vintage (the county totals moved 15% and 19%) |
| Land area in floodplain | 2.9% | 2.9% | Matches |
| Schools in floodplain | 18 of 835 | 19 of 883 | Close (USGS refreshed the layer; the total fell) |
| Police / fire / medical in floodplain | 2 of 55 / 6 of 220 / 0 of 40 | 1 of 63 / 6 of 221 / 0 of 51 | Fire identical; the others within one facility |
| NFIP claims | 1,373 (1996–2025) | 1,434 (1991–2020) | Different windows; not comparable one for one |
| Developed by 2016, outside the floodplain | 643 sq mi | 643 sq mi | Matches (0.1%) |
| Development added 1996–2016, outside the floodplain | 60.9 sq mi | 60.8 sq mi | Matches (0.1%) |
| Developed by 2016, inside the floodplain | 28.3 sq mi | 31.0 sq mi | 9% lower (the floodplain itself has been remapped) |
| Natural land in the floodplain | 50.5 sq mi (41.6%) | 54.0 sq mi (42.5%) | Close (6.5% in area, 0.9 point in share) |

**San Diego County: sea level rise.** Computed population at each increment (ocean-connected / connected plus low-lying) against NOAA's, 2 to 10 ft: 3,924 / 5,109 against 6,562; 7,480 / 10,934 against 11,468; 16,770 / 22,299 against 24,966; 34,162 / 36,014 against 50,071; 50,673 / 51,880 against 69,312. NOAA's is above both series and the gap widens with height (5% above the combined figure at 4 ft, 12% at 6 ft, and 39% and 34% at 8 and 10 ft). That is the same direction as the population-in-the-floodplain gap and has the same explanation (block-group area shares placed on whole groups, in a county whose low-lying land is bay shore and lagoon), and it is not closed here: the older SLR extent and older ACS cannot be separated from the method. Land inundated (wetland / upland / other, sq mi) at 4, 6, 8, 10 ft: 3.2 / 0.3 / 4.0, 4.1 / 0.6 / 8.1, 4.9 / 0.9 / 13.8, 5.4 / 1.2 / 18.9 against NOAA's 3.7 / 0.2 / 4.4, 4.8 / 0.5 / 8.1, 5.6 / 0.9 / 14.2, 6.2 / 1.2 / 19.2: within a tenth of a square mile in upland, within 3% in other from 6 ft up (9% at 4 ft), with wetland 12 to 15% low.

**Orange County: the new sections.** Land inundated (wetland / upland / other, sq mi) against NOAA: at 4 ft 3.7 / 0.4 / 10.5 against 3.7 / 0.4 / 10.2; at 6 ft 4.0 / 0.6 / 15.1 against 4.2 / 0.6 / 16.0; at 8 ft 4.2 / 0.9 / 19.4 against 4.3 / 0.8 / 19.6; at 10 ft 4.2 / 1.1 / 23.1 against 4.4 / 1.0 / 23.6. At 2 ft the combined series is 3.3 / 0.3 / 5.6 against NOAA's 2.4 / 0.1 / 3.9 and the connected-only series is 1.8 / 0.0 / 1.0: NOAA sits between them, as it did for population in Phase 2. Development added outside the floodplain is 42.0 sq mi against 42.0, developed by 2016 outside 448.1 against 448.1, and natural land in the floodplain 12.6 sq mi (37.2%) against 13.6 (37.5%).

**ENOW and total economy (Orange and San Diego).** These are different years by construction (computed 2021 marine, 2023 total; NOAA's about 2016), so the comparison checks method and magnitude, not equality. Total economy self-employed workers, from Census Nonemployer Statistics mapped to the eleven sectors, agree with NOAA's own self-employed total to 0.1% in Orange County (323,247 against 323,593) and within 2.3% in San Diego (299,736 against 292,941); employed jobs are 1.1% and 4.2% higher, as 2023 against about 2016 would give. Marine: Orange County's ocean economy is 2,455 establishments, 49,393 jobs, $2.23B in wages and $4.29B in GDP against NOAA's 2,374, 57,777 employed, $2.12B and $4.15B; San Diego's 4,457, 101,428, $4.55B and $8.94B against 4,347, 118,067, $4.34B and $8.93B. Jobs are 15% lower in both counties and wages and GDP are not, which is the pandemic year (2021) hitting tourism and recreation, the sector that holds 82% and 80% of the jobs; establishments, wages and GDP track. One definition differs and is deliberate: NOAA's "jobs" tile is employed plus self-employed (its 120,480 for San Diego), while the tile here is employed jobs only (101,428) and the self-employed are added on the Total Jobs slide, so the same total appears there (103,318).

**What this establishes.** The C-CAP method reproduces NOAA's own land-cover figures to within a tenth of a square mile wherever the floodplain and SLR extents themselves agree, which localises every residual to the hazard extents and the population apportionment already accounted for in Phase 2. The nonemployer mapping reproduces NOAA's self-employed count. Nothing in the economy sections indicates a method error.

### Phase 3 editorial calls
*ENOW's county series ends in 2021, not 2024.* The brief described ENOW as running through 2024. That is Open ENOW, which NOAA created to bridge the pause of the original dataset, and which reports the nation and 30 states only ("no county-level reporting", from NOAA's own introduction to it). The original ENOW, with counties, ends in 2021 (NOAA's data page says 2005 to 2021 and the API agrees). The marine economy therefore uses 2021 for the county, California and the coastal U.S. alike, so all three dots on a wage row and every share are for the same year, and the vintage on every marine section says 2021. There is no substitute at county level.

*Where the data comes from, and how the footprint is decided.* The bulk ENOW download (`ENOW.zip`, 2005–2021) was found first, but the Quick Report API behind NOAA's own "Download data" button serves the same series plus the two the topics also need (Total Economy (Coastal), through 2023, and ENOW's self-employed workers), so all three come from it. The API writes a withheld value as `"SUP"`. An empty answer is the definition of being outside a dataset: the pipeline asks the API for every county and stops if the answer disagrees with the county's tier (an ENOW county with no shoreline-series rows must be a delta county, one with neither must be flood-only). It agrees for all 27: 23 counties have ENOW rows; 20 have shoreline rows; Sacramento, San Joaquin and Yolo have ENOW rows and no shoreline rows (`not-shore-adjacent`, confirmed rather than assumed); Lake, San Benito, Sutter and Trinity have neither (`outside-enow`). Napa is a decided case, not an open one: ENOW's own geography table flags it as not shore-adjacent, but it had full coverage in NOAA's original Coastal County Snapshots and the Total Economy series includes it as a shoreline county, so it stays in the full tier and ENOW's flag does not override that.

*The total economy is not ENOW.* ENOW covers the six marine sectors. NOAA's all-industry figures are the separate Total Economy (Coastal) series (QCEW jobs, establishments and wages, BEA GDP), and it has no self-employed workers. NOAA's own snapshot takes those from the Census Bureau's Nonemployer Statistics, so that is what is used: nonemployer establishments by 2-digit NAICS, summed into the eleven sectors (NAICS 52 and 53 for Financial activities; 22, 42, 44-45 and 48-49 for Trade, transportation and utilities; and so on). Public administration has no nonemployers, and the file has no row for a sector a county has none of, so both are true zeros; a row flagged "S" is withheld. The result reproduces NOAA's self-employed total to 0.1% in Orange County.

*A sector with no jobs has no average wage.* Seven counties have a marine sector with zero jobs (Del Norte, Mendocino, Monterey, Napa, Sacramento, San Joaquin and Yolo: ship and boat building, tourism and recreation or offshore minerals), so that sector's average wage is undefined, not withheld and not zero. The wages dot plot leaves the row out without comment on the slide (a footnote per slide was tried and removed as clutter); the one-time explanation is on the about page (`#sectors-not-shown`), the way the connected/low-lying explanation is. Drawing a $0 dot would be false, and drawing "withheld" would mislabel a real zero. The validator accepts `noJobs` on `sector-wages` only.

*Zero findings and the callout rule.* A county can have no facilities in its floodplain (San Francisco has none of 274), and then every bar and the callout all say 0%. The callout rule (a callout never repeats a labelled chart figure) would fail the build on that, and forcing the callout to some other figure would hide the finding, so a zero callout ("0%", "0") is exempt, with a comment where the exemption is made. The related coincidence (a callout share that happens to equal some ring's rounded share, which happened for San Benito) is handled without weakening the rule: the callout is restated at two decimals.

*The FEMA study id is not the county code.* Phase 2 selected flood zones with `DFIRM_ID = '<fips>C'`. San Francisco (`060298`) and Sutter (`060394`) are numbered by community, so that filter found nothing and both looked like `no-nfhl-coverage`, which they are not: FEMA's Political Jurisdictions layer names the ids for a county by its FIPS, and both counties have flood zones and FIRM panels under them. `no-nfhl-coverage` is still implemented (a county with no jurisdiction rows), and no county in the spine triggers it.

*NOAA's SLR files are seven regions, and one polygon can be a whole bay.* A county reads every regional GeoPackage its bounding box touches (Los Angeles: South and Catalina; the Bay counties: SFBay, North, Delta, Central). NOAA's polygons are dissolved coastline-scale shapes, so the bounding-box lookup returns a whole bay and Alameda's alone exceeded a 500 MB JSON string; each polygon is clipped to the county's box plus a margin as it is read. Regions overlap where they meet, so fragments from different regions are unioned before a block's share is measured, where one region's fragments are added directly (as in Phase 2). Catalina publishes no low-lying table above 7 ft; nothing unconnected is added at 8 to 10 ft there.

*Sea level rise and the C-CAP raster.* C-CAP is read from the CONUS GeoTIFFs' 1996 and 2016 epochs (the newest regional release; the source's vintage is a period, 1996 to 2016, as NFHL's is). The 1996 epoch is needed for *A Better Future is a Greener Future*. Pixels are counted once, by 2016 class; open water is not land; SLR composition uses the combined (connected plus low-lying) extent like every other SLR section. The C-CAP footprint turned out to cover every county, inland ones included (no county has background pixels inside its land blocks), so `source-geography` is not triggered by C-CAP in the published snapshots.

*The deck's ring title was wrong for the data.* The natural-features rings were titled "Share of land that is natural (wetland, forest, open space)" with a Natural greenspace / Developed land legend, but the schema, the caption and NOAA's own section say each ring is development added 1996–2016 as a share of land developed by 2016. No real data had reached that slide before, so the mismatch was invisible. The title and legend now say what the arc measures; the callout beside it is still the natural share.

*`method` stays 1.* The tool is still in development, so nothing published needs to be told apart from a later version, and the method integer stays 1 until it is fully published, even though this phase changed the FEMA study selection, the multi-region SLR read and the per-county projection origin (Orange County's figures reproduce Phase 2's to the person, so nothing moved there in practice). The changelog on the about page says so.

*The fixtures are gone.* All 27 counties have a real snapshot, so the three hand-written fixtures (invented numbers) are deleted along with the code that filled a snapshot's `pending-phase-3` sections from them, and the `pending-phase-3` reason itself. The fixture mechanism (a `"fixture": true` file in `site/_data/countyProfileFixtures/`) still works for prototyping a county but nothing ships in it.


*One value per tooltip (the real cause of the hover bug).* The shared tooltip is bound per mark and always was: the mouse handler resolves `ev.target.closest("[data-tip]")` and shows that one attribute. What showed "everything" was the attribute itself. The Phase 2 fix for the Flooded Facilities tooltip ("every segment now carries the same tooltip, one category per line") gave every segment of a bar, and both parts of a People at Risk column, a tooltip listing all categories, so on exactly the two slides with a low-lying series a hover read as the whole bar or column. Each segment now carries only its own value ("Schools at 4 ft: additional low-lying 4"). The first fix-up attempt changed the SVG accessible name, which was not the cause; that change is harmless and kept. Verified by simulating a hover on every visible mark of both slides (23 and 7 marks: exactly one visible tooltip each, equal to the mark's own `data-tip`, one line) and by a real mouse hover in the browser.

### Fix-up round after Phase 3
*Marine economy stays on ENOW 2021 (Open ENOW has no counties).* Superseded in Phase 7 (below): the county marine economy is now estimated from public QCEW using Open ENOW's method. The request was to switch county marine data to Open ENOW for newer years. NOAA's API serves Open ENOW (2001 to 2024) for California and the coastal U.S. only: every county query, Orange County's for example, returns an empty list, and NOAA's own introduction to Open ENOW says it has "no county-level reporting" by design. Mixing Open ENOW's 2024 state and national comparators with a 2021 county figure would put three dots in different years on one wage row and make the county-to-state comparison meaningless, so the marine topic stays on ENOW 2021 for all three geographies, and the choice is left to the maintainer.

*The delta counties get a sea level rise topic.* Sacramento, San Joaquin and Yolo now have flood hazard, sea level rise and marine economy, still no total economy. The tier rule no longer withholds SLR from the delta tier; `no-slr-extent` remains the flood-only tier's rule and the section-level reason if NOAA's data has no polygon in a county that should have some. Their SLR is read from NOAA's Delta inundation file (the pipeline already read all seven regional files). Total economy's *Coastal Jobs Are Vulnerable* needs the total economy and stays out of the delta tier.

### Print is the reader's browser, from the page (Phase 6)
The spec planned Playwright-generated PDFs at stable URLs. That was dropped: PDFs are not generated, stored or deployed, and no headless browser enters the build. Print CSS is built into every page instead. NOAA's Print View works only from its button (their `@media print` hides the whole app, and the print modal is empty until JavaScript fills it), and our deck has the same hazards, so each page renders a `.print-only` block at build time from the same section objects as the deck, shown under `@media print`. Ctrl+P, File > Print and the Print button then print the same thing. The cost is real: a planner cannot attach a file from a stable URL, only save their own copy. The page's recommended citation, and the footer of every printed page, carry the citable address instead.

The footer carries data-as-of, snapshot, method version and the dated URL, and no print date. A static page cannot know the date, and printing one is how NOAA's "Date Printed" passes 2014–2018 data off as current. The reader's browser may add its own date in its header and footer; the docs say how to turn that off.

*Repeating header and footer.* `position: fixed` inside `@media print` repeats on every page, but reserving space for it with page margin or padding failed in testing (offsets landed off the page, and padding reserves space only on the first page). The final form is a zero `@page` margin plus a real `thead`/`tfoot` spacer pair, which the engine repeats per page.

*"View on the map" is dropped from print.* On screen it is a disabled stub until the map deep link exists, and a printed URL for a pan-and-zoom state would be long and unreadable on paper, the dead-link-on-paper problem the spec cites in the original. Every real source, methodology and correction link prints its address.

*Refactor.* The inside of a section's panel moved to `section-body.njk`, included by the deck slide and by the print block. The built HTML of every existing page is unchanged apart from the added print block, the landing page's Print controls and a body class.

*No NOAA-style sidebar callout in print.* NOAA's print view sets the headline figure in a tinted box beside the section's prose. We keep the callout inline, above the visual. Tried as a CSS-only experiment on Contra Costa (a grid with the figure wrapper set to `display: contents`, so nothing was built): our callouts are one line, and boxed into a narrow column they grow from about 125–150pt to 360–465pt per topic, because the box ends up taller than the prose it sits beside. Sections grew 6–11% in total, sea level rise went from 6 pages to 7 and the other topics stayed put. NOAA's shorter print comes from elsewhere: pie charts, no printed data tables, one-line sources and no closing About page. The printed data tables stay (exact figures matter and thin segments can't be labelled), and per-section sources print name and vintage only, with URLs in the closing citation table. Revisit only if the callout is made shorter than its prose.

### Phase 7: marine and total economy from public QCEW

**Why, and a correction to the spec.** The original ENOW county figures stop at 2021 and were built from confidential BLS establishment-level microdata that NOAA can no longer use, so they cannot be reproduced. The spec's Phase 3 and Phase 7 paragraphs are partly stale: Open ENOW state figures were never a stand-in that shipped (the marine topic stayed on ENOW 2021, see "Fix-up round after Phase 3"), and the original recipe cannot be rebuilt from public data. NOAA's public workaround, [Open ENOW](https://coast.noaa.gov/data/digitalcoast/pdf/enow-introducing-open.pdf) (March 2026), uses public QCEW, an imputation ladder for withheld cells, Census ZIP Code Business Patterns for the shoreline share of tourism and recreation, and BEA GDP by industry, and publishes California and the coastal U.S. only ("no county-level reporting"). Phase 7 re-implements that documented method at county level, stopping before the state roll-up. The county figures are therefore our estimates, and noisier than NOAA's state ones (the tables below measure how much).

**Reachability (stop-and-report point 2).** BLS (`data.bls.gov`), the Census Bureau (`www2.census.gov`, `tigerweb.geo.census.gov`), BEA (`apps.bea.gov`) and NOAA (`coast.noaa.gov`) all answered from the development machine on 2026-09-29. **Not verified:** that the Actions runner can reach them, and BLS in particular, which is the source most likely to treat a cloud address differently. The pipeline sends a descriptive User-Agent (`CASCA-county-profiles/1.0 (California Sea Change Atlas; site and repository URLs)`). The first dispatch of the workflow is the test. The dataset page the brief named (`coast.noaa.gov/data/datasets/datasets/open-enow.html`) returns 404; the dataset is at `coast.noaa.gov/digitalcoast/data/openenow.html` (a redirect), and its API is `coast.noaa.gov/enow/api/v1/openEnow` (California `geoid=06000`, "All Coastal States" `00000`, 2001 to 2024).

**What "national" means.** The comparator called the national one is the API's "All Coastal States", the sum of the coastal portions of the 30 shoreline states, not the whole United States. That is the same footprint as the original ENOW's coastal-U.S. series and the chart's existing "Coastal U.S." label, so the label stays. Open ENOW's employment, wages and establishments run to 2024, its GDP to 2023; QCEW's newest year is 2025.

**QCEW route and years.** The per-area API (`data.bls.gov/cew/data/api/<year>/a/area/<fips>.csv`) has full industry detail only from 2014 (earlier years return a stub), so every year is read from the bulk "annual by area" zips (`.../files/<year>/csv/<year>_annual_by_area.zip`, about 120 MB each; the counties and California are extracted, the raw CSVs kept in the gitignored cache and the zip deleted). Years 2012 to 2025 are read. NAICS vintages: the 2012 annual file already uses NAICS 2012 (722511 and 311710 are present, 722110 and 311711 are not), matching the year windows in Open ENOW's code tables; codes that Open ENOW lists for 2001 to 2011 or 2001 to 2016 are kept in the definitions with their windows and are simply inert before 2012 or after their window. Series for a code are therefore not joined across a vintage change (211111 and 211120, 532292 and 532284, 445220 and 445250 are separate series), and earlier years than 2012 are not estimated. A published ownership row with no entry in a county-year is a true zero; QCEW publishes establishment counts even for withheld rows.

**Definitions, and every difference from the original ENOW.**

| | Original ENOW | This estimate (Open ENOW's definitions) |
|---|---|---|
| Data | Confidential BLS establishment microdata | Public QCEW county-industry-ownership rows, imputed where withheld |
| Extra NAICS codes | | 493190 (inside 4931, marine transportation), and 713110, 721199, 721214 and 722410 (tourism and recreation) |
| Code length | 6-digit codes | 4- and 5-digit codes where every industry under the code is in one sector (4883, 4931, 48311, 33661, 11251, 11411): avoids withheld cells |
| Ownership | Not stated | All ownerships (federal, state, local, private); withheld rows are estimated one ownership at a time |
| Tourism and recreation | Establishments in shore-adjacent ZIP codes, from microdata | Hotels, restaurants and similar codes weighted by the county's share of jobs in shoreline-adjacent ZIP codes from ZIP Code Business Patterns (below) |
| GDP | BEA-based, from microdata | County wages times California's BEA-GDP-to-QCEW-wages ratio per industry (below) |
| Employment | Fractional (apportioned), e.g. 40,023.583 | Annual average employment as published, or imputed |
| Years | 2005 to 2021 | 2012 to 2025 (QCEW); GDP one year behind |

Which tourism codes are weighted by the ZIP share is our call, since neither the Open ENOW document nor NOAA's FAQ says: the "partly ocean-related" codes (restaurants and bars 722, lodging 721, amusement 713110 and 713990, recreation instruction 611620, nature parks and zoos 712, recreational goods rental 532284, other scenic transportation 487990) are weighted; marinas, boat dealers, scenic water tours and sporting goods manufacturing count in full. NOAA's FAQ says only hotels and restaurants are restricted to shore-adjacent ZIPs; testing that narrower rule was not done, and the broader one reproduces California (below).

**Shoreline-adjacent ZIP codes (stop-and-report point 1).** (a) ZIP Code Business Patterns 2023 is the newest vintage (2024 returns 404). The detail file gives establishments by ZIP, 6-digit NAICS and nine employment-size classes; a size class with too few establishments is written `N` (withheld), and the totals file gives employment only as noised values or ranges. So a code's employment in a ZIP is estimated from the size classes (class midpoints; establishments in withheld classes are given the code's statewide average size), and a ZIP is assigned wholly to the county ZBP names for it. The share is computed once (2023) and applied to every QCEW year. (b) NOAA does not publish its shoreline-adjacent ZIP list: checked in the Open ENOW document, the ENOW FAQ, the crosswalk and county list PDFs and the Digital Coast data page. It is therefore derived: a California ZCTA is shoreline-adjacent if it lies within a set distance of the Census coastline or of the boundary of a Census tidal water area (TIGER areal hydrography, bay, estuary and ocean). The coastline file alone was tried first and is wrong for this purpose: it has the open coast but not the interior shores of San Francisco Bay (Oakland's ZCTA measured 11.6 km from it), which put the Bay counties 40 to 80 percent under the original ENOW. The distance is calibrated so that California tourism and recreation jobs match Open ENOW's, then tested where it was not fitted, against the original ENOW's 2021 county values:

| distance to coast | ZIPs | CA jobs 2019 vs Open ENOW | CA jobs 2023 vs Open ENOW | 2021 county median diff vs original ENOW | median abs | mean abs |
|---|---|---|---|---|---|---|
| 0 m | 215 | -27.2% | -27.2% | -15.0% | 15.0% | 19.6% |
| 250 m | 253 | -13.2% | -13.7% | -2.5% | 7.0% | 13.5% |
| 500 m | 259 | -11.8% | -12.2% | -2.5% | 7.0% | 12.0% |
| 1000 m | 287 | 0.4% | -0.6% | 4.0% | 7.0% | 12.4% |
| 2000 m | 328 | 13.9% | 12.6% | 11.2% | 11.8% | 17.0% |
| 3000 m | 372 | 26.0% | 24.8% | 19.1% | 19.1% | 25.0% |
| 5000 m | 436 | 41.0% | 40.1% | 28.0% | 28.0% | 43.9% |
| 8000 m | 526 | 63.7% | 63.4% | 31.7% | 31.7% | 69.3% |

1,000 m is used (287 ZIPs of the 1,802 in the state; California within 1% of Open ENOW in 2019 and 2023). For the ZIP rule alone the county-level 2021 test is out of sample: the median county is 7% off and the mean 12%. (Superseded for the shipped figures by the per-county calibration in the review round below, after which tourism agrees with the original ENOW in 2021 by construction; the numbers here remain the record of how well the uncalibrated rule generalises.) This is a defensible share, not NOAA's list, and the About page says it is derived. Nothing was fabricated and the sector needed no fallback, so the previously shipped figures were not kept.

**The imputation ladder.** Open ENOW's order of preference is implemented as written, with these deviations, all recorded: (1) the unit is a QCEW row (county, ownership, code, year), not a whole county-code cell, so a published private row is kept when the local-government row beside it is withheld; (2) the "parent" of a code is the code with its last digit dropped, and a 3-digit code's parent is its 2-digit sector (the ladder's 5-digit and 4-digit levels, generalised to Open ENOW's 4- and 5-digit codes), and a withheld parent for the row's ownership falls back to the parent summed over ownerships when every one of those rows is published; (3) step 5 (a broader parent in another year) originally found nothing for 821 of 14,742 county-code-year cells across all 27 counties (5.6%), almost all tiny cells of one to three establishments in small counties; it now also looks at later years and then at higher parents (never the all-industry total), leaving 12 of 11,496 rows unresolved in the 23 marine counties (0.1%) and none in the 2025 headline year, so no snapshot figure is currently withheld or partial. Every county-code-year-ownership row's state (published, or which step) is in `.cache/enow-cells-<fips>.json` on every run. Of the 2025 rows, 423 of 833 marine county-code-ownership rows are published as they stand, 242 are estimated by step 2 (California-scaled), 30 by step 3, 17 by step 4 and 121 by step 5; none needed step 1 (the newest year has no later value to interpolate to) and none is unresolved.

**Plausibility check.** Where a published parent exists, an estimated row must not push the parent's children above it (published siblings plus estimated rows, same county, ownership and year, employment and wages checked separately). Across the 23 marine counties and 2012 to 2025 there were 367 (201 on employment and 166 on wages; 328 under a 5-digit parent and 39 under a 3-digit one) violations. Each is handled the same way: the estimated rows under that parent are scaled down together to the room the parent leaves (never below zero), and the event is logged (`capToParents` in `impute.js`). In total the cap removed about 9,000 estimated job-years across all years and counties.

**GDP.** Sector GDP is the county's wages times California's ratio of BEA GDP (SAGDP2, current dollars, millions) to QCEW wages for the same industry and year, as Open ENOW describes, computed per row, with the wages of **all ownerships** in the ratio's denominator. (The first version used a private-wage ratio for private rows and a government ratio for government-owned rows; the review round below shows why that was wrong for Education and health and replaces it.) GDP runs one year behind: BEA publishes the broad sectors for 2025 but the detailed industries only to 2024, so marine GDP is 2024 (with the county's 2024 wages) and total economy GDP, which uses supersector lines, is 2025. Each has its own source entry and a one-line note on the slide. Mapping of marine NAICS codes to BEA lines (the finest line that contains the code):

| NAICS code(s) | BEA SAGDP2 line |
|---|---|
| 11251, 11411 | 113-115, Forestry, fishing, and related activities |
| 311710 (311711, 311712 before 2012) | 311-312, Food and beverage and tobacco products |
| 424460 | 42, Wholesale trade |
| 445250 (445220), 441222 | 44-45, Retail trade |
| 237990 | 23, Construction |
| 334511 | 334, Computer and electronic products |
| 48311, 4883 | 483, Water transportation |
| 4931 | 493, Warehousing and storage |
| 211111, 211112, 211120, 211130 | 211, Oil and gas extraction |
| 212321, 212322 | 212, Mining (except oil and gas) |
| 213111, 213112 | 21, Mining (BEA's whole mining line; the 213 line's ratio was too low, see the review round) |
| 541360 | 5412-5414 and 5416-5419, Other professional, scientific and technical services |
| 33661 | 3364-3466 and 3369, Other transportation equipment (BEA's own line label) |
| 339920 | 339, Miscellaneous manufacturing |
| 487210, 487990 | 487-488 and 492, Other transportation and support activities |
| 532284 (532292) | 532-533, Rental and leasing services |
| 611620 | 61, Educational services |
| 712130, 712190 | 711-712, Arts, entertainment and museums |
| 713110, 713930, 713990 | 713, Amusements, gambling and recreation |
| 721110, 721191, 721199, 721211, 721214 | 721, Accommodation |
| 722xxx | 722, Food services and drinking places |

Several lines are broader than the marine codes in them (fishing shares BEA's line with forestry; seafood processing with all food manufacturing), which is how Open ENOW's ratio approach works too; a marine industry's real GDP per wage dollar can differ from its BEA line's. GDP is the noisiest of the four measures (sum check below).

**Estimated share threshold.** `ESTIMATED_SHARE_THRESHOLD` is 0.25: a figure is marked "estimated" when a quarter or more of its value is imputed. Reasoning: a figure's likely error is roughly its imputed share times the median imputation error (6 to 27% by step, backtest below), so a quarter imputed is a figure a few percent uncertain, and marking below that would mark nearly every figure without telling the reader anything. It is one named constant, and the snapshot stores the share either way, so it can be tuned without a recompute. The distribution of estimated shares, and every count of figures (published, estimated, marked, withheld), is in the reconciled table in "Phase 7 follow-up 2" below; the earlier numbers quoted here (571, 314, 257) came from a different baseline and are replaced.

**Total economy.** All-industry county totals from QCEW, the eleven sectors as QCEW supersectors (industry codes 1011 to 1028, which is how NOAA's series builds them; the first version summed 2-digit sectors and went wrong in San Francisco, see the review round), GDP by the same wage-to-GDP method per supersector (Public administration's GDP is withheld), self-employed workers from Census Nonemployer Statistics 2023 (unchanged). Jobs, wages and establishments match NOAA's Total Economy (Coastal) series to the unit in 2023 (the series is public QCEW), which is a check that the new totals are right, not independent validation.

**Vintages, and where they look misleading.** Every source shows its own newest year in the sources table and the About slide; the headline year is QCEW's. Places where two years meet, each stated on its slide: (a) GDP against jobs, wages and establishments (2024 against 2025 for marine); (b) the marine wages chart, whose comparators end in 2024, so its county dot is 2024 while the other slides are 2025; the total economy wages chart is 2023 for the same reason (the choice between using the county's newest year and matching the comparators' year was made for matching, so a dot is never compared with a dot from another year; the cost is a slide whose year differs from its neighbours'); (c) Total Jobs originally added employed (2025) and self-employed at their own year (2023 total economy; 2021 marine, NOAA's series ends there), a sum that mixed years; it now shows the two as separate figures with their own years and adds nothing (review round); (d) marine jobs as a share of total jobs uses one year (QCEW's) for both.

**Comparison with what shipped, and what moved.** Marine jobs are 2025 estimates against Phase 3's 2021 ENOW, so they include four more years of change and the five extra NAICS codes, and are not comparable to it as a trend. Definitions and the county figures changed for every county with a marine topic; the counties, tiers, topics and reason codes did not. All 54 snapshot files (27 dated, 27 latest) have identical flood hazard, sea level rise, gauge and identity content before and after (`analysis/diff-hazard.js`).

**Validation.** Results only; a poor result ships and is reported. Reproduce with `node scripts/county-profiles/analysis/economy-validation.js` (and `withholding-report.js`, `sf-check.js`, `hand-recompute.js`). These tables are for the final state, after the review round below; tourism and recreation is calibrated to the original ENOW's 2021 county figures, so its 2021 county comparison is in-sample.

*1. Imputation backtest.* Published county-code-ownership-year rows (2012 to 2025) were hidden one at a time, the ladder run on the rest of the data, and the estimate compared with the truth. Each step is run alone on every row it can estimate; "as run" is the first step that applies. A parent with one child is identical to that child and QCEW would withhold it too, so identical ancestors are hidden with the row. The backtest is an optimistic measure of the real thing: withheld cells are withheld because one or few employers dominate them, which published cells are not.

By ladder step (each step run alone on every row it can estimate; "as run" is the first step that applies):

|  | n | median abs % error (employment) | mean | 90th percentile | employment-weighted | median abs % error (wages) | median signed error (employment) |
|---|---|---|---|---|---|---|---|
| step 1 (interpolated) | 4656 | 5.2% | 12.1% | 27.2% | 4.8% | 5.8% | -0.3% |
| step 2 (state-scaled) | 3852 | 6.4% | 14.9% | 31.7% | 2.8% | 6.8% | 0.4% |
| step 3 (establishment-scaled) | 5863 | 7.7% | 15.9% | 35.1% | 6.4% | 9.5% | 0.0% |
| step 4 (parent average, same year) | 1935 | 17.9% | 46.6% | 78.8% | 17.2% | 26.0% | 1.9% |
| step 5 (parent average, earlier year) | 5910 | 26.6% | 82.1% | 199.4% | 21.8% | 30.5% | 5.4% |
| as run (ladder order) | 5912 | 5.7% | 14.6% | 29.7% | 4.5% | 6.3% | -0.1% |

By sector (as run):

|  | n | median abs % error (employment) | mean | 90th percentile | employment-weighted | median abs % error (wages) | median signed error (employment) |
|---|---|---|---|---|---|---|---|
| Living Resources | 475 | 7.1% | 22.4% | 41.7% | 6.6% | 10.1% | -0.2% |
| Marine Construction | 246 | 10.1% | 21.7% | 44.8% | 10.7% | 11.7% | -0.6% |
| Marine Transportation | 656 | 6.5% | 17.7% | 29.7% | 6.1% | 6.1% | -0.4% |
| Offshore Mineral Resources | 316 | 10.5% | 27.3% | 62.1% | 14.6% | 12.9% | 0.0% |
| Ship and Boat Building | 75 | 8.0% | 13.5% | 30.7% | 3.6% | 7.9% | 1.3% |
| Tourism and Recreation | 4144 | 5.0% | 11.8% | 26.7% | 4.3% | 5.4% | -0.1% |

Worst cases with at least 20 true jobs (as run):

| county | code | ownership | year | true jobs | estimated | step | error |
|---|---|---|---|---|---|---|---|
| Los Angeles | 213111 | 5 | 2016 | 49 | 333 | 1 | 579.2% |
| Santa Clara | 237990 | 5 | 2021 | 40 | 232 | 1 | 478.7% |
| Santa Clara | 713110 | 5 | 2020 | 323 | 1,518 | 1 | 369.8% |
| Humboldt | 311710 | 5 | 2025 | 34 | 144 | 2 | 322.4% |
| Contra Costa | 713110 | 5 | 2020 | 44 | 182 | 1 | 312.9% |
| San Luis Obispo | 4931 | 5 | 2012 | 34 | 127 | 2 | 273.1% |
| Santa Cruz | 339920 | 5 | 2014 | 27 | 92 | 1 | 240.7% |
| Solano | 237990 | 5 | 2012 | 94 | 280 | 3 | 197.9% |

Rows tested: 5912 published county-code-ownership-year rows with positive employment (23 counties, 2012 to 2025).

*2. Sum check.* Our 23 county estimates summed by sector and year against Open ENOW's California figures. Four sectors' establishment counts equal ours to the unit (all but ship and boat building, explained in the review round: Open ENOW's figure for that sector is statewide). Jobs and wages agree within a few percent for the non-tourism sectors (offshore minerals swings by up to 10% because of its few large cells); tourism is the fitted sector and sits 1% to 7% below. GDP is the noisiest: living resources 10 to 17% low, marine construction 4 to 5% low, tourism 1 to 5% high (offshore minerals now within about 12% either way, after the review round's mapping change); 2024 marine transportation and offshore minerals GDP are about 20% high, where our BEA lines are real 2024 data and Open ENOW's 2024 GDP is not yet a full-year figure.

Employment (ours minus Open ENOW, as % of Open ENOW; California):

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| Living Resources | -8.2% | -8.2% | -7.5% | -5.4% | -6.3% | -6.4% | -5.4% | -4.7% | -5.4% | -6.2% |
| Marine Construction | +0.4% | +0.6% | +0.8% | +0.4% | +0.6% | +0.6% | +0.7% | +0.3% | +0.4% | +0.3% |
| Marine Transportation | -1.8% | -1.4% | -1.2% | -0.8% | -0.7% | -0.2% | -0.2% | -0.4% | -0.4% | +0.1% |
| Offshore Mineral Resources | +7.7% | +9.7% | -8.3% | -3.4% | -1.5% | -0.4% | +2.5% | -0.1% | +2.9% | +4.4% |
| Ship and Boat Building | -4.0% | -5.5% | -6.0% | -3.3% | -4.3% | -4.0% | -6.0% | -7.0% | -7.3% | -5.6% |
| Tourism and Recreation | -6.8% | -6.6% | -5.5% | -5.8% | -4.8% | -3.3% | -0.7% | -6.4% | -5.1% | -5.2% |

Wages (ours minus Open ENOW, as % of Open ENOW; California):

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| Living Resources | -9.8% | -10.0% | -7.7% | -4.5% | -5.8% | -6.2% | -4.3% | -3.7% | -4.3% | -4.9% |
| Marine Construction | +0.3% | +0.5% | +0.5% | +0.2% | +0.4% | +0.4% | +0.5% | -0.3% | -0.2% | -0.3% |
| Marine Transportation | -0.5% | -0.7% | -1.0% | -1.0% | -0.6% | -0.1% | +0.1% | -0.5% | -0.3% | +0.1% |
| Offshore Mineral Resources | +9.2% | +16.2% | -14.0% | -11.5% | -9.6% | -4.9% | -1.7% | -3.7% | -2.5% | -3.0% |
| Ship and Boat Building | +0.3% | -2.4% | -2.1% | +2.2% | +1.0% | +1.5% | -1.7% | -2.0% | -2.0% | -0.1% |
| Tourism and Recreation | -6.1% | -6.2% | -5.2% | -5.5% | -4.7% | -2.8% | -0.2% | -6.3% | -5.2% | -5.4% |

Establishments (ours minus Open ENOW, as % of Open ENOW; California):

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| Living Resources | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.2% |
| Marine Construction | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.4% |
| Marine Transportation | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.1% |
| Offshore Mineral Resources | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | -0.8% |
| Ship and Boat Building | -25.7% | -20.9% | -21.4% | -21.3% | -22.5% | -21.3% | -19.7% | -18.5% | -21.1% | -21.8% |
| Tourism and Recreation | -4.1% | -4.0% | -2.8% | -3.0% | -2.0% | -1.0% | +2.0% | -3.5% | -2.6% | -2.3% |

GDP (ours minus Open ENOW, as % of Open ENOW; California):

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| Living Resources | -13.5% | -11.7% | -11.8% | -9.6% | -11.1% | -15.0% | -12.9% | -16.6% | -17.3% | -2.3% |
| Marine Construction | -4.4% | -4.8% | -5.4% | -4.6% | -4.5% | -4.3% | -4.1% | -4.6% | -4.5% | -0.2% |
| Marine Transportation | +3.4% | +0.9% | -2.5% | -0.3% | -2.0% | -5.7% | -0.4% | +2.8% | +1.4% | +20.4% |
| Offshore Mineral Resources | -5.2% | +7.9% | -11.6% | -10.9% | -5.7% | -1.9% | +8.7% | +5.3% | +3.0% | +19.8% |
| Ship and Boat Building | +0.3% | -2.3% | -2.0% | +2.3% | +1.0% | +1.6% | -1.7% | -2.0% | -2.0% | -0.0% |
| Tourism and Recreation | -7.0% | -6.7% | -6.0% | -6.2% | -5.6% | -3.2% | -1.8% | -7.1% | -6.0% | -5.1% |

*3. 2021 against the original ENOW.* Our 2021 county-by-sector figures against the original ENOW's 2021 county values. **Tourism and recreation is anchored to these values (in-sample, 0.0% by construction)**; for the other sectors the comparison is unchanged and out of sample. Differences from definitions are removable and are removed in the second table; differences from method (public rather than confidential data) are what is left. Where less than 10% of our county figure is imputed the difference is small; where more is imputed it is large: the imputed county figures overshoot the confidential ones, consistent with the backtest's positive median error at step 5 and with withheld cells being the concentrated ones. Marine transportation's establishment counts match once 493190 is removed, so that part of the gap is definition; its employment gap is mostly imputation (review round, change 3).

Employment, county by sector, 2021 (ours against the original ENOW; cells the original withholds or reports as zero are skipped):

| sector | counties | median difference (signed) | median abs | mean abs | 90th percentile abs |
|---|---|---|---|---|---|
| Living Resources | 19 | 17.1% | 17.1% | 125.8% | 719.1% |
| Marine Construction | 18 | 0.0% | 0.0% | 0.8% | 0.9% |
| Marine Transportation | 22 | 30.7% | 30.7% | 593.8% | 147.2% |
| Offshore Mineral Resources | 9 | 21.5% | 21.5% | 56.8% | 195.0% |
| Ship and Boat Building | 3 | 0.0% | 0.0% | 28.9% | 86.6% |
| Tourism and Recreation | 19 | 0.0% | 0.0% | 0.1% | 0.0% |

Wages, county by sector, 2021 (ours against the original ENOW; cells the original withholds or reports as zero are skipped):

| sector | counties | median difference (signed) | median abs | mean abs | 90th percentile abs |
|---|---|---|---|---|---|
| Living Resources | 19 | 13.4% | 13.4% | 185.5% | 903.4% |
| Marine Construction | 18 | 0.0% | 0.0% | 0.2% | 0.4% |
| Marine Transportation | 22 | 33.7% | 33.7% | 1307.1% | 180.2% |
| Offshore Mineral Resources | 9 | 21.9% | 21.9% | 53.1% | 214.5% |
| Ship and Boat Building | 3 | 0.0% | 0.0% | 37.7% | 113.2% |
| Tourism and Recreation | 19 | -2.3% | 3.7% | 4.6% | 10.5% |

Establishments, county by sector, 2021 (ours against the original ENOW; cells the original withholds or reports as zero are skipped):

| sector | counties | median difference (signed) | median abs | mean abs | 90th percentile abs |
|---|---|---|---|---|---|
| Living Resources | 19 | 0.0% | 0.0% | 0.2% | 1.3% |
| Marine Construction | 18 | 0.0% | 0.0% | 0.0% | 0.0% |
| Marine Transportation | 22 | 10.6% | 10.6% | 10.2% | 19.0% |
| Offshore Mineral Resources | 9 | 0.0% | 0.0% | 0.0% | 0.0% |
| Ship and Boat Building | 3 | 0.0% | 0.0% | 0.0% | 0.0% |
| Tourism and Recreation | 19 | 0.0% | 0.0% | 0.0% | 0.0% |

GDP, county by sector, 2021 (ours against the original ENOW; cells the original withholds or reports as zero are skipped):

| sector | counties | median difference (signed) | median abs | mean abs | 90th percentile abs |
|---|---|---|---|---|---|
| Living Resources | 19 | 11.9% | 13.5% | 192.2% | 1284.1% |
| Marine Construction | 18 | 5.5% | 5.5% | 5.8% | 6.0% |
| Marine Transportation | 22 | 68.2% | 68.2% | 1584.2% | 216.7% |
| Offshore Mineral Resources | 9 | 70.6% | 70.6% | 205.5% | 1251.8% |
| Ship and Boat Building | 3 | 5.2% | 5.2% | 44.9% | 124.2% |
| Tourism and Recreation | 19 | -1.4% | 3.0% | 4.5% | 10.4% |

Definition-adjusted (our figures with Open ENOW's extra NAICS codes removed: 713110, 721199, 721214 and 722410 dropped from tourism and recreation, and the published 493190 subtracted from marine transportation; withheld 493190 rows cannot be subtracted):

| sector | measure | counties | median difference | median abs | mean abs |
|---|---|---|---|---|---|
| Tourism and Recreation | employment | 19 | -2.4% | 2.4% | 2.5% |
| Tourism and Recreation | establishments | 19 | -3.8% | 3.8% | 4.3% |
| Marine Transportation | employment | 22 | 30.7% | 30.7% | 592.5% |
| Marine Transportation | establishments | 22 | 0.0% | 0.0% | 1.6% |

The same employment comparison split by how much of our county figure was imputed (below or at least 10%):

| sector | counties, imputed < 10% | median difference | counties, imputed >= 10% | median difference |
|---|---|---|---|---|
| Living Resources | 8 | 2.6% | 11 | 38.4% |
| Marine Transportation | 12 | 15.5% | 10 | 105.0% |
| Offshore Mineral Resources | 3 | 4.6% | 6 | 67.8% |
| Tourism and Recreation | 14 | 0.0% | 5 | 0.0% |

By county, ocean-economy employment (the six sectors summed), 2021, after every change. Tourism and recreation is calibrated to the original's 2021 county figure, so this comparison is in-sample for that sector (where the original has one) and out of sample for the other five:

| county | original ENOW | ours | difference | share of ours imputed |
|---|---|---|---|---|
| Alameda | 38,262 | 38,382 | +0.3% | 4.5% |
| Contra Costa | 14,170 | 14,095 | -0.5% | 10.9% |
| Del Norte | 923 | 912 | -1.2% | 14.0% |
| Humboldt | 4,012 | 3,879 | -3.3% | 15.1% |
| Los Angeles | 108,272 | 109,360 | +1.0% | 2.8% |
| Marin | 9,599 | 9,593 | -0.1% | 17.8% |
| Mendocino | 1,981 | 2,071 | +4.6% | 12.7% |
| Monterey | 13,505 | 13,566 | +0.5% | 5.9% |
| Napa | 616 | 639 | +3.8% | 8.3% |
| Orange | 49,393 | 50,145 | +1.5% | 2.1% |
| San Diego | 101,428 | 101,551 | +0.1% | 1.5% |
| San Francisco | 36,997 | 37,041 | +0.1% | 6.2% |
| San Luis Obispo | 8,825 | 8,842 | +0.2% | 4.4% |
| San Mateo | 24,904 | 24,882 | -0.1% | 17.5% |
| Santa Barbara | 16,279 | 16,324 | +0.3% | 14.5% |
| Santa Clara | 6,197 | 6,477 | +4.5% | 8.2% |
| Santa Cruz | 8,914 | 9,038 | +1.4% | 17.4% |
| Solano | 5,529 | 5,528 | -0.0% | 8.2% |
| Sonoma | 5,469 | 5,473 | +0.1% | 4.0% |
| Ventura | 16,284 | 16,214 | -0.4% | 4.7% |
| Sacramento | 6,452 | 6,804 | +5.4% | 9.4% |
| San Joaquin | 27,506 | 30,597 | +11.2% | 1.0% |
| Yolo | 3,659 | 4,151 | +13.5% | 3.5% |

23 counties: 21 within 10% of the original, 2 outside 10%; 16 above the original and 7 below (median difference +0.3%, median absolute difference 0.5%).

*4. Total economy.* Against NOAA's Total Economy (Coastal) series for 2023 (which is what Phase 3 shipped), and the change to the new headline year. GDP is compared with the sum of NOAA's sectors without Public administration because ours withholds it (NOAA's own total row also includes taxes and unallocated GDP that no sector carries):

Ours (QCEW, 2023) against NOAA Total Economy (Coastal), 2023, county totals, 20 full-tier counties:

|  | counties | median difference | median abs | 90th percentile abs | max abs |
|---|---|---|---|---|---|
| Establishments | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| Jobs | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| Wages | 20 | -0.0% | 0.0% | 0.0% | 0.0% |
| GDP (ours has no Public administration) | 20 | -21.4% | 21.4% | 33.0% | 50.6% |
| GDP, against the sum of NOAA's sectors without Public administration | 20 | -7.3% | 7.3% | 8.1% | 8.1% |

By sector, employment, and wages, and GDP (median abs difference across counties; NOAA cells withheld or zero are skipped):

| sector | counties | employment: median difference | median abs | wages: median abs | GDP: median abs |
|---|---|---|---|---|---|
| Construction | 20 | 0.0% | 0.0% | 0.0% | 3.0% |
| Financial activities | 20 | 0.0% | 0.0% | 0.0% | 8.3% |
| Education and health services | 20 | 0.0% | 0.0% | 0.0% | 0.8% |
| Information | 20 | 0.0% | 0.0% | 0.0% | 9.0% |
| Leisure and hospitality | 20 | 0.0% | 0.0% | 0.0% | 10.4% |
| Manufacturing | 20 | 0.0% | 0.0% | 0.0% | 9.6% |
| Natural resources and mining | 20 | 0.0% | 0.0% | 0.0% | 1.2% |
| Other services | 20 | 0.0% | 0.0% | 0.0% | 24.6% |
| Professional and business services | 20 | 0.0% | 0.0% | 0.0% | 6.2% |
| Public administration | 20 | 0.0% | 0.0% | 0.0% | 100.0% |
| Trade, transportation, and utilities | 20 | 0.0% | 0.0% | 0.0% | 6.9% |

Ours (QCEW, 2023) against what Phase 3 shipped (NOAA's 2023 series):

|  | counties | median difference | median abs | 90th percentile abs | max abs |
|---|---|---|---|---|---|
| Establishments | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| Jobs | 20 | 0.0% | 0.0% | 0.0% | 0.0% |
| Wages | 20 | -0.0% | 0.0% | 0.0% | 0.0% |
| GDP | 20 | -21.4% | 21.4% | 33.0% | 50.6% |

Change from what Phase 3 shipped (2023) to the new headline year:

|  | median change in jobs | median change in wages |
|---|---|---|
| all 20 counties | 0.7% | 8.4% |

**Pre-publication reset of the archive.** Nothing has been published, so the existing `2026-09-24` snapshots were regenerated in place rather than minting a new dated snapshot (`run.js --economy-only --reset-archive`, which keeps the snapshot date and overwrites both the dated file and `latest/`). This is a deliberate exception to "a published dated snapshot is never edited" and applies only because the snapshot has never been published; the archive holds one real snapshot at launch. `check-archive.js` compares dated files against git (HEAD by default, which is what the workflow uses), so committing the regenerated files resets its baseline and it passes; run against the previous branch (`--base origin/feat/county-profiles-phase-6`) it correctly reports the rewrite. `method` stays 1.

**Runtime and memory (first round; re-measured in the review round below).** A cold run of the whole economy pipeline for all 27 counties (`run.js all --economy-only --refresh` with the economy cache emptied) took 1,610 s (27 minutes) of wall time with a peak working set of 778 MB on the development machine, of which nearly all is the 14 annual BLS zips (about 120 MB each, 35 s each in one run and about 2 minutes each in this one) and one minute is the ZIP-to-coast distance calculation; the ladder, GDP and section builds for all 27 counties take about 5 s once the data are cached. Against the workflow's 350-minute and 14 GB budget that is about 8% of the time and 6% of the memory added to a run that recomputes any county, and it is paid on every such run, because the runner keeps no cache and the QCEW year files are needed whole however few counties are recomputed. `--economy-only` is not used by the workflow.

**Not done (first round).** The About page has a marked spot for the plain-language explanation and the backtest quote; neither is written. The ZBP share is one vintage applied to every year. QCEW years before 2012 are not estimated. A 2025 GDP is not produced for the marine industries because BEA has not published the detailed lines. The Actions runner's access to BLS and the workflow's end-to-end run are untested.

### Phase 7 review round: what changed after the first PR review

A review of the running site found five problems. Each is diagnosed and recorded here; the tables in the Phase 7 section above were regenerated after these changes and describe the final state. Where the first Phase 7 text is now wrong it says so and points here.

**1. San Francisco Natural resources and mining: the cause was the cell, not the marker.** The total economy sectors were sums of QCEW 2-digit NAICS sectors. In San Francisco 2023 both 11 (agriculture, 49 establishments) and 21 (mining, 5) are withheld for private ownership, so the sum was imputed (step 1, 227 jobs and $17.0M, an average of $75,187) while NOAA's series has $22.7M (an average of $100,034). NOAA does not sum 2-digit sectors: its eleven sectors are QCEW's **supersectors** (industry codes 1011 to 1028), and a supersector row is published even when its parts are withheld, because the combination discloses no single employer. The cells are now the supersector rows. After the change every San Francisco sector matches NOAA 2023 exactly (jobs and establishments to the unit, wages within $2,300 of $121 billion, float rounding in NOAA's file), Natural resources and mining included (227 jobs, $22,707,631, $100,034 a job), and no total economy sector needed imputation in that county. The `estimated` marker had worked as designed; the cell it marked was the wrong cell.

| sector | ours estab | ours jobs | ours wages | NOAA estab | NOAA jobs | NOAA wages | diff estab / jobs / wages | our cell |
|---|---|---|---|---|---|---|---|---|
| Total, all industries | 63,317 | 723,526 | $120,901,072,719 | 63,317 | 723,526 | $120,901,074,944 | = / = / -2,225 |  |
| Construction | 1,922 | 23,259 | $2,664,578,146 | 1,922 | 23,259 | $2,664,578,048 | = / = / +98 | published |
| Financial activities | 4,607 | 57,766 | $20,644,127,972 | 4,607 | 57,766 | $20,644,128,768 | = / = / -796 | published |
| Education and health services | 29,067 | 155,313 | $14,078,392,534 | 29,067 | 155,313 | $14,078,392,320 | = / = / +214 | published |
| Information | 1,912 | 62,732 | $17,996,509,468 | 1,912 | 62,732 | $17,996,509,184 | = / = / +284 | published |
| Leisure and hospitality | 4,792 | 82,928 | $4,539,342,486 | 4,792 | 82,928 | $4,539,342,336 | = / = / +150 | published |
| Manufacturing | 778 | 12,430 | $2,543,133,326 | 778 | 12,430 | $2,543,133,440 | = / = / -114 | published |
| Natural resources and mining | 55 | 227 | $22,707,631 | 55 | 227 | $22,707,632 | = / = / -1 | published |
| Other services | 4,630 | 27,033 | $1,979,730,577 | 4,630 | 27,033 | $1,979,730,560 | = / = / +17 | published |
| Professional and business services | 10,525 | 193,776 | $41,141,586,016 | 10,525 | 193,776 | $41,141,587,968 | = / = / -1,952 | published |
| Public administration | 595 | 31,862 | $4,260,299,517 | 595 | 31,862 | $4,260,299,520 | = / = / -3 | published |
| Trade, transportation, and utilities | 4,355 | 76,075 | $11,016,414,318 | 4,355 | 76,075 | $11,016,414,208 | = / = / +110 | published |


Sum of the eleven sectors: 63,238 establishments, 723,401 jobs, $120,886,821,991 wages.
County total:               63,317, 723,526, $120,901,072,719.
Difference (total minus sectors): 79 establishments, 125 jobs, $14,250,728 wages.

*Do the eleven sectors sum to the county total?* Not exactly, and NOAA's do not either: the eleven supersectors leave out QCEW's "unclassified" supersector, so the total exceeds their sum by 79 establishments, 125 jobs and $14.3M of wages in San Francisco (0.01% of jobs). The page handles it by never presenting the two as parts of one whole: the measuring slide shows the QCEW county total; the diversity chart's shares are of the sectors shown (denominator rule), so nothing is asked to add up.

**2. Total economy GDP by sector: diagnosed, fixed for Education and health, withheld for Public administration.** For California 2023, the BEA line used, the wage base and the resulting GDP-to-wages ratio per QCEW sector, against the ratio implied by NOAA's 2023 county figures (which is the same in every county: NOAA multiplies county wages by one state ratio per sector):

| QCEW sector | BEA SAGDP2 line(s) | BEA GDP, $B | CA wages, private / all ownerships, $B | ratio, private base | ratio, all-ownership base | ratio implied by NOAA |
|---|---|---|---|---|---|---|
| Construction | 23 | 149.7 | 78.2 / 79.1 | 1.91 | 1.89 | 1.95 |
| Financial activities | 52,53 | 716.6 | 113.5 / 114.2 | 6.31 | 6.27 | 6.84 |
| Education and health services | 61,62 | 297.8 | 192.3 / 302.9 | 1.55 | **0.98** | **0.99** |
| Information | 51 | 397.2 | 134.7 / 135.5 | 2.95 | 2.93 | 3.22 |
| Leisure and hospitality | 71,72 | 174.8 | 79.3 / 83.9 | 2.20 | 2.08 | 2.33 |
| Manufacturing | 31-33 | 383.4 | 164.3 / 164.3 | 2.33 | 2.33 | 2.58 |
| Natural resources and mining | 11,21 | 59.1 | 20.1 / 20.1 | 2.95 | 2.95 | 2.98 |
| Other services | 81 | 73.4 | 29.7 / 30.1 | 2.47 | 2.43 | 3.23 |
| Professional and business services | 54,55,56 | 557.9 | 328.2 / 330.3 | 1.70 | 1.69 | 1.80 |
| Public administration | 92 (Government) | 409.1 | 0 / 88.4 (NAICS 92 only); 224.4 (all government wages) | none | 4.63 (or 1.82 on all government wages) | **0.83** |
| Trade, transportation and utilities | 42,44-45 and 22,48-49 | 608.1 | 209.9 / 225.7 | 2.90 | 2.69 | 2.90 |

The hypothesis was right for Education and health: BEA's 61 and 62 lines are **private-industry only**, but QCEW wages for those sectors include government schools and hospitals (about $111B of $303B). Dividing the private GDP by private wages (1.55) and applying it to a county's all-ownership wages overstates GDP by more than half; dividing by all-ownership wages (0.98) gives NOAA's 0.99. That was the flaw in the first Phase 7 allocation (a private ratio for private rows, a government ratio for government rows): every sector now uses the all-ownership base, and the first version's sector median gaps against NOAA (Education and health 65.9%, Public administration 119.5%) become 0.8% and, for Public administration, withheld. NOAA's other ratios are 3% to 33% above the BEA ratio computed now (for example Other services 3.23 against 2.43), most likely a BEA vintage difference (NOAA's series was built from an earlier release of BEA's 2023 values) that cannot be tested; the sector GDP figures are within 1% to 10% of NOAA's except Other services (25%).

Public administration could not be fixed with confidence. BEA's Government line (409.1B) covers state, local and federal government including schools and hospitals that QCEW files under education and health; against NAICS 92 wages alone it implies 4.63 and against all government wages 1.82, and NOAA's 0.83 matches neither; no ratio reproducing it was found. A ratio that reproduces nothing would be a number known to be wrong, so **Public administration's GDP is withheld in every county**, the footnote and the About page say why, and the total economy GDP figure leaves it out and is marked incomplete (so it is a floor, and is compared with NOAA's sectors excluding Public administration below).

*Marine GDP, same review.* Sector-level ratios, Open ENOW California 2023 against ours before the change: living resources 3.20 (ours 2.76), marine construction 1.98 (1.89), marine transportation 1.81 (1.84), offshore minerals 4.69 (3.87), ship and boat building 1.82 (1.82), tourism and recreation 2.10 (2.10). Ship and boat building and tourism reproduce exactly, so the mapping and the all-ownership base are right; the two low sectors are BEA-line choices. For offshore minerals, mapping NAICS 213 (support activities for mining, ratio 2.20) to BEA's whole mining line (21) cut the mean absolute California GDP gap over 2015 to 2023 from 20.9% to 6.8% (211, 212 and 541360 unchanged), so it is adopted (`enow-def.js`; a fit to Open ENOW's California figures, recorded as such). For living resources, using BEA's broader line 11 for fishing cut the gap only from 13.3% to 10.6% and has no independent reason, so it is not adopted: the remaining 10 to 17% shortfall is reported, not fixed. Fishing, seafood and offshore minerals GDP remain the least certain marine figures.

**3. Marine transportation against the original ENOW 2021: how much is definition, how much is imputation.** Restricting the 2021 comparison to counties where none of the marine transportation figure is imputed, and separately removing 493190 (Open ENOW's extra code) from our own pull wherever its 6-digit row is published (the definitions are not changed to match the original):

Marine transportation employment, 2021, ours against the original ENOW (22 counties where the original has a figure). "Ours, minus 493190" removes the published 493190 rows (Open ENOW's extra code) from our pull; a withheld 493190 row cannot be removed.

| group | counties | median difference, ours | median difference, ours minus 493190 | median abs difference, ours minus 493190 |
|---|---|---|---|---|
| all counties | 22 | 30.7% | 30.7% | 30.7% |
| none of our figure imputed (share < 1%) | 3 | 4.1% | 1.2% | 1.2% |
| less than 10% imputed | 12 | 15.5% | 9.5% | 9.5% |
| 10% or more imputed | 10 | 105.0% | 105.0% | 105.0% |
| 25% or more imputed | 7 | 142.0% | 142.0% | 142.0% |

By county:

| county | original | ours | ours minus published 493190 | 493190 removed (jobs) | our imputed share | establishments: original / ours minus 493190 |
|---|---|---|---|---|---|---|
| Alameda | 9,585 | 12,344 | 12,344 | 0 | 4.5% | 148 / 148 |
| Contra Costa | 540 | 1,205 | 1,205 | 0 | 43.2% | 52 / 52 |
| Humboldt | 28 | 52 | 52 | 0 | 46.5% | 7 / 7 |
| Los Angeles | 53,135 | 57,105 | 56,034 | 1,071 | 2.8% | 767 / 766 |
| Marin | 167 | 214 | 214 | 0 | 22.0% | 15 / 15 |
| Mendocino | 28 | 69 | 69 | 0 | 59.7% | 6 / 6 |
| Monterey | 309 | 380 | 380 | 0 | 18.6% | 26 / 25 |
| Napa | 467 | 486 | 467 | 19 | 0.0% | 25 / 25 |
| Orange | 7,281 | 8,527 | 7,963 | 564 | 8.0% | 154 / 153 |
| San Diego | 11,019 | 11,921 | 11,761 | 160 | 5.0% | 173 / 171 |
| San Francisco | 1,573 | 2,348 | 2,348 | 0 | 22.0% | 43 / 43 |
| San Luis Obispo | 69 | 167 | 167 | 0 | 58.7% | 13 / 11 |
| San Mateo | 704 | 1,081 | 1,028 | 53 | 30.0% | 26 / 26 |
| Santa Barbara | 16 | 1,937 | 1,937 | 0 | 83.9% | 32 / 32 |
| Santa Clara | 1,109 | 1,264 | 1,217 | 47 | 8.5% | 62 / 61 |
| Santa Cruz | 59 | 146 | 146 | 0 | 34.2% | 20 / 20 |
| Solano | 296 | 429 | 429 | 0 | 9.0% | 24 / 21 |
| Sonoma | 291 | 500 | 500 | 0 | 4.8% | 26 / 26 |
| Ventura | 922 | 1,222 | 1,222 | 0 | 9.1% | 64 / 64 |
| Sacramento | 5,274 | 5,460 | 5,353 | 107 | 1.4% | 66 / 66 |
| San Joaquin | 26,921 | 27,291 | 27,248 | 43 | 0.5% | 106 / 106 |
| Yolo | 3,264 | 3,991 | 3,991 | 0 | 0.9% | 21 / 21 |

The finding: **definition explains the establishment counts completely and a few points of employment; imputation explains the rest.** After removing the published 493190 rows the establishment counts match the original in every county to within a few (Los Angeles 767 against 766, Orange 154 against 153). For employment, the three counties with none of the figure imputed are 4.1% above the original as pulled and 1.2% above after removing 493190, so the definition is worth about 3 points there and the pull is otherwise accurate; counties with less than 10% imputed have a median gap of 15.5% (9.5% without 493190); counties with 10% or more imputed are 105% above and those with 25% or more 142% above. So of the 30.7% median gap, roughly 3 points are 493190 (and can be removed only where the 6-digit row is published) and the remainder is overshoot in imputed values, concentrated in small cells filled by the parent-average steps. The withholding rule removes the figures that are mostly weakly imputed but not the ones imputed at steps 1 to 3, however far they are from the original; Santa Barbara's marine transportation, the largest outlier, is traced in "Phase 7 follow-up 2" (it is one step 2 estimate for a real employer, not a ladder overshoot).

**4. Tourism shoreline share: calibrated per county to the original ENOW's 2021 figure.** The 1 km ZIP rule matched California in total but missed counties (against original ENOW 2021 ocean-economy employment: Santa Clara -41.1%, San Luis Obispo +25.2%, Santa Barbara +18.2%, Sonoma +16.4%, Yolo +13.5%, Los Angeles +10.6%; 16 of 23 counties above the original). Each county's shoreline share of tourism and recreation is now set so that **our 2021 tourism jobs equal the original ENOW's 2021 county figure**, and held constant for every other year; establishments are calibrated the same way against the original's establishment count, and wages follow jobs. The 2021 figures the shares are anchored to are the original ENOW's own (NOAA's Quick Report API, `oceanEconomy`, 2021). Where the original's figure is withheld or zero (Napa, Sacramento, Yolo and San Joaquin), or where no share between 0 and 1 could reach it (Del Norte, whose tourism jobs need more than 100% and is capped at 100%), the 1 km rule's share is kept or the cap applies. Every county's share and method is in its snapshot (`estimation.tourismShoreShare`) and here:

| county | jobs method | jobs share | 2021 jobs target | establishments method | establishments share | 2021 establishments target | 1 km ZIP rule (jobs share) |
|---|---|---|---|---|---|---|---|
| Alameda | calibrated | 47.9% | 24,382 | calibrated | 53.8% | 2,187 | 50.6% |
| Contra Costa | calibrated | 36.3% | 11,563 | calibrated | 41.2% | 896 | 32.8% |
| Del Norte | calibrated-clamped | 100.0% | 811 | calibrated | 100.0% | 70 | 100.0% |
| Humboldt | calibrated | 79.5% | 3,535 | calibrated | 80.4% | 304 | 83.8% |
| Los Angeles | calibrated | 11.6% | 43,213 | calibrated | 10.5% | 2,538 | 14.4% |
| Marin | calibrated | 85.7% | 9,189 | calibrated | 83.5% | 615 | 84.7% |
| Mendocino | calibrated | 50.1% | 1,761 | calibrated | 46.1% | 155 | 51.1% |
| Monterey | calibrated | 68.7% | 12,900 | calibrated | 61.6% | 665 | 69.2% |
| Napa | zip-rule | 0.0% | none | zip-rule | 0.0% | none | 0.0% |
| Orange | calibrated | 25.9% | 40,024 | calibrated | 23.6% | 2,142 | 26.6% |
| Sacramento | zip-rule | 0.0% | none | zip-rule | 0.0% | none | 0.0% |
| San Diego | calibrated | 54.1% | 80,198 | calibrated | 50.1% | 4,049 | 51.9% |
| San Francisco | calibrated | 71.0% | 34,054 | calibrated | 74.7% | 2,937 | 76.7% |
| San Joaquin | zip-rule | 14.1% | none | zip-rule | 14.4% | none | 14.1% |
| San Luis Obispo | calibrated | 51.9% | 8,387 | calibrated | 54.5% | 541 | 64.7% |
| San Mateo | calibrated | 82.8% | 23,219 | calibrated | 88.8% | 1,761 | 79.3% |
| Santa Barbara | calibrated | 61.2% | 13,716 | calibrated | 62.9% | 780 | 74.9% |
| Santa Clara | calibrated | 6.7% | 4,407 | calibrated | 6.6% | 307 | 2.1% |
| Santa Cruz | calibrated | 79.7% | 8,706 | calibrated | 79.6% | 570 | 87.8% |
| Solano | calibrated | 35.8% | 4,411 | calibrated | 39.1% | 320 | 37.8% |
| Sonoma | calibrated | 25.1% | 4,687 | calibrated | 26.2% | 335 | 29.4% |
| Ventura | calibrated | 46.1% | 13,975 | calibrated | 49.0% | 874 | 40.3% |
| Yolo | zip-rule | 0.0% | none | zip-rule | 0.0% | none | 0.0% |

**Tourism and recreation is now anchored to the original ENOW's 2021 county figures.** That is a real change of stance: for this sector the estimate is no longer independent of the confidential data, and it holds the 2021 county shares fixed for other years (the shoreline is fixed; the mix of businesses changes slowly, but not never). Consequences for the validation: (a) the county-by-county 2021 comparison for tourism and recreation is **in-sample** and equals the original by construction (0.0% median), so it no longer counts as an out-of-sample test; the out-of-sample record of the uncalibrated rule is the tolerance table in the Phase 7 section (median county 7% off, mean 12%, before calibration); (b) the California sum check against Open ENOW is not fitted to and is the remaining independent test of tourism: it stays within a few percent (jobs -5.1% in 2023, -0.7% to -6.8% across 2015 to 2024, all below Open ENOW; the earlier ZIP-rule-only figures were within about 3%). Calibrating county by county trades a little California-total accuracy for county-level agreement with the original. Santa Clara's calibrated jobs share is 6.7% (the ZIP rule gave 2.1%), and its tourism now matches the original's 2021 figure (4,407 jobs); its ocean-economy total, which was 41.1% low, is now 4.5% above the original, the residual being marine transportation and living resources.

**5. Total Jobs, both topics.** The equation is gone. Employed workers (QCEW 2025) are the headline and self-employed workers a separate tile with its own year and source (total economy: Census Nonemployer Statistics 2023; marine: NOAA ENOW self-employed, 2021, a series with no successor), with a one-line note that they describe different years and are not added. The section kind is `jobs-pair` (`employedYear`, `selfEmployedYear`, no total); the accessible markup, print block and footnotes follow from the shared stats rendering; the sources table still lists both vintages; the callout (largest self-employed sector) is dropped if any sector's self-employed count is withheld.

**1. (again) Withholding by weakest ladder step: superseded.** The review round withheld a figure when its weakest ladder step was 4 or 5 and it was at least 75% imputed. That was in effect a 75% share cutoff, since the weakest step present is 5 for most estimated figures; it is replaced by a cutoff on the part imputed at steps 4 and 5, with one set of counts, in "Phase 7 follow-up 2" below. The handling of withheld figures (suppressed state, partial totals, dropped callouts, the denominator rule, the dot plot, accessible tables and print) is unchanged.

**Ship and boat building establishments: the ~21% gap is in Open ENOW's California figure, not in ours.** Confirmed first that the pull is right: the 5-digit code 33661 (not 336611 plus 336612) and every ownership are used (state and county rows exist only for private ownership, ownership 5). Then the comparison target: Open ENOW's California ship and boat building figure for 2023 (166 establishments, 8,997 jobs, $745,577,533 wages) equals **QCEW statewide for NAICS 33661 exactly**, in every year checked (2019, 2021 and 2023 to the unit), i.e. all 58 counties. Ours is the 23 ENOW counties: 131 establishments and 7,946 jobs (all 27 spine counties give the same 131). The other four sectors' Open ENOW establishment counts equal our 23-county sums exactly (851, 283, 2,238 and 406), so this sector alone is statewide in Open ENOW. Ruled out: the code definition, ownership, imputation (establishments are never imputed), the county list (adding the four flood-only counties adds nothing). Jobs differ less (-7% in 2023) because the extra establishments are small. The gap is left in the table and explained here; nothing about our county figures changes.

**Hand-recomputed cells.** From the raw QCEW CSVs (not the pipeline's compact data), one published cell and one at each of steps 1 to 4 (`analysis/hand-recompute.js`); the pipeline's values equal the hand arithmetic in each case:

**Published (Alameda 2025, NAICS 722511, private).** Raw row: 1513 establishments, 21789 jobs, $830,157,979 wages. The pipeline uses it as it stands.

**Step 1, interpolation (county 06001 2019, NAICS 334511, private).** Raw 2019: withheld (N), 3 establishments. Last published year 2012: 4 establishments, 403 jobs, $20,086,012 wages; next published year 2020: 5 establishments, 441 jobs, $32,993,301 wages. Weight t = (2019 - 2012) / (2020 - 2012) = 0.8750. Jobs = 403 + t x (441 - 403) = 436.25; pipeline: 436.25. Wages = 31379890; pipeline: 31379890.

**Step 2, California-scaled (county 06001 2025, NAICS 212321, private).** Raw 2025: withheld (N), 3 establishments. Nearest published year 2021: 4 establishments, 93 jobs, $12,055,880 wages. California, all ownerships, NAICS 212321: 2,031 jobs in 2025, 2,502 in 2021 (ratio 0.8118). Jobs = 93 x 0.8118 = 75.49; pipeline: 75.49.

**Step 3, establishment-scaled (county 06001 2025, NAICS 48311, private).** Raw 2025: withheld (N), 6 establishments. Nearest published year 2018: 9 establishments, 599 jobs, $104,815,254 wages. California's value for the code, all ownerships: none/none ; none/none ; 4/withheld ; 3216/5991 (ownerships 1, 2, 3, 5; 2025/2018): one is withheld, so step 2 cannot be used. Jobs = 599 x 6 / 9 = 399.33; pipeline: 399.33.

**Step 4, parent average (county 06087 2025, NAICS 721191, private).** Raw 2025: withheld (N), 5 establishments. No published history to interpolate or scale from. Parent NAICS 72119, same county, year and ownership: 6 establishments, 23 jobs, $701,974 wages, so 23 / 6 = 3.833 jobs per establishment. Jobs = 3.833 x 5 = 19.17; pipeline: 19.17. Wages = 701974 / 23 x 19.17 = 584978; pipeline: 584978.

**Full-path equivalence.** The full pipeline (`run.js <county> --reuse-intersect --reset-archive`, not `--economy-only`) was run for Orange and Santa Cruz (heavy imputation): the marine economy, total economy, `estimation` and `sources` blocks are byte-identical to the `--economy-only` output apart from the `retrieved` and `verified` stamps, and flood hazard and sea level rise are identical.

**Runtime and memory (re-measured).** The same cold run of the whole economy pipeline for all 27 counties (`run.js all --economy-only --refresh` with the QCEW cache emptied) took 1305 s (22 minutes) of wall time with a peak working set of 804 MB on the development machine (first round: 1,610 s and 778 MB). Nearly all of it is the 14 annual BLS zips; the ladder, calibration, GDP and section builds for all 27 counties take a few seconds once the data are cached, so the review changes add no measurable runtime or memory. Against the workflow's 350-minute and 14 GB budget that is about 6% of the time and 6% of the memory, paid on every run that recomputes any county.

### Phase 7 follow-up 2: the withholding rule, Santa Barbara, one set of counts

This supersedes the review round's withholding rule and every count quoted before it (548, 518, 571, 428, 406, 179 and 109 all came from different baselines and are replaced by the one table below).

**1. The withholding rule is now a share cutoff on the part imputed at the weak steps.** The review round's rule (weakest ladder step 4 or 5 and at least 75% imputed) was in effect just a 75% share cutoff, because the weakest step present is 5 for most estimated figures (a single small step-5 row sets it). The rule now measures what it is meant to: for each figure, the share of its value that was imputed at ladder steps 4 and 5 combined (the two parent-average steps; backtest median error 18% and 27% against 5% to 8% at steps 1 to 3), and the figure is withheld when that share is at least `WITHHOLD_WEAK_SHARE` in `scripts/county-profiles/estimated.js` (0.25; `WITHHOLD_WEAKEST_STEP` and `WITHHOLD_MIN_SHARE` and the code that read them are removed). The steps counted as weak are `WEAK_STEP = 4` in `impute.js`; each cell carries the weak part of its jobs and wages (adjusted when the parent-sum check scales a row), and sums carry it up to sectors and totals. Everything else is as before: the existing suppressed state and footnote, a total leaves a withheld sector out and is partial (and is itself withheld if what is left is again 25% weakly imputed), callouts are dropped when their inputs are partly withheld, and the diversity chart's denominator rule applies. The marker threshold stays 0.25 (an estimated figure is marked ≈ at a quarter imputed at any step; it is withheld at a quarter imputed at the weak steps). **Default kept at 0.25:** at 0.25 the rule withholds 93 of the 518 figures that have any estimate or would (18%), under the third that would have prompted a different value.

*One set of counts.* Definitions (`scripts/county-profiles/figure-slots.js`, used by both `state-report.js` and `analysis/withholding-report.js`):

- **figure**: one county figure slot in the marine or total economy: the four headline stats (establishments, jobs, wages, GDP), the four measures of each sector in the diversity chart, and the county's average wage in each sector of the wages chart (23 marine counties, 20 with a total economy: 1,953 figures). Comparators (California, coastal U.S.), the denominator, years and the Total Jobs counts are not figures here.
- **published**: a plain number, no part imputed. **estimated**: a figure with an estimate provenance object `{value, est}`, shown; **marked ≈** if `est.share` (imputed at any step) is at least 0.25, **not marked** below it. **withheld**: `{suppressed: true}`, **by the rule** or **structural** (Public administration's GDP, withheld in every county). **Partial** is a flag on a total that leaves a withheld figure out, not a category.
- published + estimated not marked + marked ≈ + withheld by the rule + withheld structural = figures. "With any estimate" is not marked plus marked.

The columns are one baseline (the same 1,953 figures) under the old rule (the snapshots at commit `39e1a18`, before this round), with no rule, and with the new rule at each threshold (the whole economy rebuilt at each):

| | before (old rule, HEAD) | rule off | 0.10 | **0.25 (shipped)** | 0.50 | 0.75 |
|---|---|---|---|---|---|---|
| published (plain number) | 1418 | 1415 | 1415 | 1415 | 1415 | 1415 |
| estimated, not marked (< 0.25 imputed) | 228 | 228 | 218 | 230 | 230 | 229 |
| estimated, marked ≈ (>= 0.25 imputed) | 178 | 290 | 164 | 195 | 219 | 229 |
| withheld by the rule | 109 | 0 | 136 | 93 | 69 | 60 |
| withheld, Public administration GDP | 20 | 20 | 20 | 20 | 20 | 20 |
| **figures** | 1953 | 1953 | 1953 | 1953 | 1953 | 1953 |
| with any estimate (unmarked + marked) | 406 | 518 | 382 | 425 | 449 | 458 |
| partial totals (flag, not a category) | 67 | 20 | 73 | 66 | 60 | 53 |
| withheld by the rule as a share of figures that have any estimate or are withheld by the rule | 21% | 0% | 26% | 18% | 13% | 12% |

Figures withheld by the rule, by county (thresholds 0.10 / 0.25 / 0.50 / 0.75):

| county | 0.10 | **0.25** | 0.50 | 0.75 |
|---|---|---|---|---|
| Mendocino | 12 | 12 | 8 | 8 |
| Santa Cruz | 12 | 12 | 8 | 8 |
| Del Norte | 12 | 10 | 8 | 8 |
| Napa | 8 | 8 | 8 | 8 |
| San Francisco | 8 | 7 | 3 | 0 |
| San Joaquin | 8 | 6 | 4 | 4 |
| Marin | 8 | 4 | 4 | 4 |
| Santa Barbara | 8 | 4 | 2 | 0 |
| Santa Clara | 8 | 4 | 4 | 4 |
| Solano | 8 | 4 | 4 | 4 |
| Ventura | 8 | 4 | 4 | 0 |
| Yolo | 8 | 4 | 4 | 4 |
| Monterey | 6 | 4 | 4 | 4 |
| Contra Costa | 4 | 4 | 0 | 0 |
| Humboldt | 4 | 4 | 4 | 4 |
| Alameda | 4 | 2 | 0 | 0 |
| Sacramento | 8 | 0 | 0 | 0 |
| San Mateo | 2 | 0 | 0 | 0 |

Figures withheld by the rule, by sector (thresholds 0.10 / 0.25 / 0.50 / 0.75):

| sector | 0.10 | **0.25** | 0.50 | 0.75 |
|---|---|---|---|---|
| marine: Offshore mineral resources | 56 | 38 | 29 | 20 |
| marine: Living resources | 32 | 20 | 12 | 12 |
| marine: Ship and boat building | 16 | 16 | 16 | 16 |
| marine: Marine transportation | 20 | 11 | 4 | 4 |
| marine: Tourism and recreation | 8 | 4 | 4 | 4 |
| marine: Marine construction | 4 | 4 | 4 | 4 |

Figures still marked ≈ at each threshold: 0.1: 164, 0.25: 195, 0.5: 219, 0.75: 229 (rule off: 290).

Reading it: the old rule withheld 109 figures and this one 93; the old rule and the new one withhold different figures (the old one was a 75% cutoff on total share, the new a 25% cutoff on the weak part), so the numbers differ although the new threshold is lower. Marked ≈ falls from 290 with no rule to 195, because withheld figures are no longer shown (and a total that leaves one out is recomputed). The counties that lose the most at the shipped 0.25 are Mendocino and Santa Cruz (12 each), Del Norte (10), Napa (8) and San Francisco (7). The sector that loses the most is offshore mineral resources (38), then living resources (20), ship and boat building (16, at every threshold: those cells are fully imputed by a parent average) and marine transportation (11). No total economy figure is withheld by the rule: its cells are supersector rows, which are rarely withheld and never weakly imputed above the cutoff.

`state-report.js` (all five states, with the same definitions) now prints exactly this row for the shipped snapshots (1,953 = 1,415 + 230 + 195 + 93 + 20; 66 partial) and forces each state onto a real snapshot as before. Charts, callouts, print blocks and accessible tables handle the new gaps through the existing suppressed paths; Del Norte, Humboldt, Yolo (a delta county) and San Francisco were rendered in greyscale print and the print-colour audit passes on eight counties including Del Norte, Mendocino, Napa and Santa Cruz, which lose the most.

**2. Santa Barbara marine transportation: 1,937 jobs in 2021 against the original's 16, traced.** (`analysis/trace-sector.js 06083 2021 "Marine Transportation"`.)

| code | ownership | raw QCEW row | result | ladder step | jobs |
|---|---|---|---|---|---|
| 334511 | private | withheld, 7 estab | imputed | 2 | 1,514 |
| 4883 | local | withheld, 1 estab | imputed | 2 | 81 |
| 4883 | private | withheld, 4 estab | imputed, capped by the parent-sum check | 4 | 23 |
| 4931 | local | withheld, 2 estab | imputed | 2 | 8 |
| 4931 | private | 20 estab, 311 jobs, $15,550,519 | published |  | 311 |

Sector total 1,937 jobs, of which imputed 1,626 (84%).

Plausibility events in 2021 for this county: parent 488 (private, emp): parent 454, published siblings 431, estimated 41 capped to 23 for 4883; parent 488 (private, w): parent 27,415,175, published siblings 26,234,415, estimated 2,492,289 capped to 1,180,760 for 4883.

Largest imputed row: 334511 (private), 1,514 jobs at step 2. Its history, parent 33451 and California:

| year | 334511 | parent 33451 | California 334511 |
|---|---|---|---|
| 2012 | withheld, 11 estab | 33 estab, 2869 jobs, $290,762,402 | 160 estab, 33074 jobs, $3,863,039,093 |
| 2013 | withheld, 11 estab | 34 estab, 2768 jobs, $281,524,063 | 163 estab, 30788 jobs, $3,681,648,977 |
| 2014 | withheld, 11 estab | 36 estab, 2681 jobs, $276,009,734 | 168 estab, 28690 jobs, $3,511,473,398 |
| 2015 | withheld, 10 estab | 34 estab, 2700 jobs, $282,677,090 | 181 estab, 30247 jobs, $3,737,940,149 |
| 2016 | withheld, 10 estab | 36 estab, 2639 jobs, $275,320,805 | 177 estab, 29270 jobs, $3,678,123,512 |
| 2017 | withheld, 8 estab | 38 estab, 2718 jobs, $298,444,137 | 190 estab, 27256 jobs, $3,525,132,468 |
| 2018 | 8 estab, 1392 jobs, $166,876,281 | 39 estab, 2705 jobs, $297,338,439 | 203 estab, 27725 jobs, $3,608,151,212 |
| 2019 | 9 estab, 1499 jobs, $183,870,172 | 38 estab, 2829 jobs, $324,670,689 | 202 estab, 30203 jobs, $3,864,267,104 |
| 2020 | withheld, 8 estab | 36 estab, 2746 jobs, $336,661,273 | 200 estab, 31061 jobs, $4,145,666,651 |
| 2021 | withheld, 7 estab | 34 estab, 2737 jobs, $342,127,607 | 198 estab, 30514 jobs, $4,088,393,581 |
| 2022 | withheld, 6 estab | 30 estab, 2739 jobs, $360,072,589 | 200 estab, 27092 jobs, $3,902,925,230 |
| 2023 | withheld, 6 estab | 29 estab, 2725 jobs, $358,739,488 | 202 estab, 21645 jobs, $3,217,971,267 |
| 2024 | withheld, 8 estab | 28 estab, 2218 jobs, $306,778,328 | 207 estab, 14817 jobs, $2,255,765,349 |
| 2025 | withheld, 10 estab | 30 estab, 2256 jobs, $331,322,812 | 200 estab, 14161 jobs, $2,218,935,105 |

What feeds the number: **1,514 of the 1,937 jobs (78%) are one row: NAICS 334511, search, detection, navigation, guidance and aeronautical instrument manufacturing, private, 7 establishments, withheld in 2021 and imputed at step 2** (the nearest published year, 2019, at 1,499 jobs, scaled by California's change for the code). It is not a warehousing cell: warehousing (4931) is 311 published jobs and 8 imputed, and water transportation (4883) is 104. The step 2 estimate is sound: the cell has a real published history in the same county (1,392 jobs in 2018 and 1,499 in 2019), and its parent 33451 is published at 2,737 jobs in 2021 with the other child (334510) at 77, so the room left under the parent is 1,982 and the estimate of 1,514 is comfortably inside it. This is **the method behaving as designed, not a bug**: the plausibility check (imputed rows plus published siblings may not exceed the published parent) did not catch the cell because the parent's published total is large enough to hold it, and the check exists to catch impossible cells, not merely large ones. It did act on the one cell it could: 4883 private was capped from 41 to 23 jobs under parent 488 (454 published, 431 by published siblings). Nothing was changed for the cell. The new rule does not withhold it either, since it is a step 2 estimate; in the 2025 snapshot Santa Barbara's marine transportation is shown marked ≈ (employment 1,041, 72% imputed, but less than a quarter of it at steps 4 and 5). The gap to the original's 16 is therefore mostly on the original's side: QCEW's own published parents show the industry is large in Santa Barbara (the published warehousing row alone is 311 jobs, already 20 times the original's total), and the original ENOW's microdata may classify or scope these establishments differently, which public data cannot show.

*Do other cells share the failure?* Every imputed county-code-ownership row in 2021 and 2025 (816) was compared with its published parent (`analysis/imputed-overshoot.js`): rows at 2 or more times the parent's jobs per establishment, with at least 50 jobs:

Imputed rows checked (2021, 2025): 816. Rows imputed at 2 times or more the parent's jobs per establishment, with at least 50 jobs: 5.

| county | sector | year | code | ownership | step | estabs | jobs imputed | jobs per estab | parent | parent jobs / estabs | parent per estab | room under parent after published siblings |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alameda | Marine Transportation | 2025 | 4883 | private | 2 | 9 | 2,129 | 237 | 488 | 5,078 / 268 | 19 | 2,159 |
| Santa Barbara | Marine Transportation | 2021 | 334511 | private | 2 | 7 | 1,514 | 216 | 33451 | 2,737 / 34 | 81 | 1,982 |
| Monterey | Tourism and Recreation | 2025 | 722514 | private | 2 | 4 | 200 | 50 | 72251 | 13,704 / 804 | 17 | 1,735 |
| Solano | Marine Transportation | 2025 | 4883 | private | 2 | 3 | 95 | 32 | 488 | 652 / 44 | 15 | 286 |
| Santa Cruz | Tourism and Recreation | 2021 | 721214 | private | 1 | 4 | 75 | 19 | 72121 | 93 / 10 | 9 | 93 |

Five rows of 816. Three are marine transportation (Santa Barbara's 334511, Alameda's 4883 and Solano's 4883) and two tourism; only Santa Barbara's 334511 and Alameda's 4883 (9 establishments, 2,129 jobs, a step 2 estimate from its own published years) are large; all five are step 1 or 2 estimates with a real published history of a large employer, every one leaves room under its published parent, and none is a step 4 or 5 average. No offshore minerals cell qualifies. So the failure pattern the first review suspected, a weak-step parent average overshooting a single large employer, does not occur in the data; the overshoot the 2021 comparison shows is the original's confidential values being lower than public QCEW implies for a few large cells, plus ordinary imputation noise.

**3. Step 5, recomputed by hand from the raw QCEW CSVs**, alongside the step 1 to 4 recomputes in the review round (`analysis/hand-recompute.js`; the pipeline equals the hand arithmetic):

**Step 5, broader parent in another year (county 06001 2025, NAICS 311710, private).** Raw 2025: withheld (N), 3 establishments. published years of this row: none, so steps 1 to 3 have nothing to interpolate or scale from; step 4, parent 31171 in 2025: withheld or no usable row, so step 4 fails. Step 5 tries the parent two digits shorter (3117) in the nearest earlier year first: 311 in 2024 (private row): 268 establishments, 9038 jobs, $614,330,176 wages, so 9038 / 268 = 33.724 jobs per establishment. Jobs = 33.724 x 3 = 101.17; pipeline: 101.17. Wages = 614330176 / 9038 x 101.17 = 6876830; pipeline: 6876830.

**4. The regenerated county comparison** (2021 ocean-economy employment, the six sectors summed, after every change; from `analysis/economy-validation.js enow2021`). Tourism and recreation is calibrated to the original's 2021 county figure, so for that sector (which is most of every county's jobs) the comparison is in-sample; the other five sectors' comparison is out of sample and is in the sector tables above. Shares imputed are of our total.

By county, ocean-economy employment (the six sectors summed), 2021, after every change. Tourism and recreation is calibrated to the original's 2021 county figure, so this comparison is in-sample for that sector (where the original has one) and out of sample for the other five:

| county | original ENOW | ours | difference | share of ours imputed |
|---|---|---|---|---|
| Alameda | 38,262 | 38,382 | +0.3% | 4.5% |
| Contra Costa | 14,170 | 14,095 | -0.5% | 10.9% |
| Del Norte | 923 | 912 | -1.2% | 14.0% |
| Humboldt | 4,012 | 3,879 | -3.3% | 15.1% |
| Los Angeles | 108,272 | 109,360 | +1.0% | 2.8% |
| Marin | 9,599 | 9,593 | -0.1% | 17.8% |
| Mendocino | 1,981 | 2,071 | +4.6% | 12.7% |
| Monterey | 13,505 | 13,566 | +0.5% | 5.9% |
| Napa | 616 | 639 | +3.8% | 8.3% |
| Orange | 49,393 | 50,145 | +1.5% | 2.1% |
| San Diego | 101,428 | 101,551 | +0.1% | 1.5% |
| San Francisco | 36,997 | 37,041 | +0.1% | 6.2% |
| San Luis Obispo | 8,825 | 8,842 | +0.2% | 4.4% |
| San Mateo | 24,904 | 24,882 | -0.1% | 17.5% |
| Santa Barbara | 16,279 | 16,324 | +0.3% | 14.5% |
| Santa Clara | 6,197 | 6,477 | +4.5% | 8.2% |
| Santa Cruz | 8,914 | 9,038 | +1.4% | 17.4% |
| Solano | 5,529 | 5,528 | -0.0% | 8.2% |
| Sonoma | 5,469 | 5,473 | +0.1% | 4.0% |
| Ventura | 16,284 | 16,214 | -0.4% | 4.7% |
| Sacramento | 6,452 | 6,804 | +5.4% | 9.4% |
| San Joaquin | 27,506 | 30,597 | +11.2% | 1.0% |
| Yolo | 3,659 | 4,151 | +13.5% | 3.5% |

23 counties: 21 within 10% of the original, 2 outside 10%; 16 above the original and 7 below (median difference +0.3%, median absolute difference 0.5%).


*Read this table with follow-up 3 below:* tourism and recreation, most of every county's jobs, is calibrated to these very figures, so "21 of 23 counties within 10%" is **in-sample and is not an accuracy figure**. The comparison that is out of sample (the five other sectors: 5 of 23 counties within 10%, all 23 above, median +27.1%) is in follow-up 3.

**Runtime and memory (re-measured again).** The same cold run (`run.js all --economy-only --refresh` with the QCEW cache emptied) took 1336 s (22 minutes) with a peak working set of 803 MB (review round: 1,305 s and 804 MB; first round: 1,610 s and 778 MB); the change to weak-share tracking adds a few additions per cell and no measurable time or memory. About 6% of the 350-minute and 6% of the 14 GB workflow budget, paid on every run that recomputes any county.

### Phase 7 follow-up 3: a harsher backtest, provenance in the JSON, an out-of-sample comparison

This round adds measurement and provenance only. No imputation logic, withholding rule, threshold (0.25 for both the marker and `WITHHOLD_WEAK_SHARE`), definition or displayed figure value changed: `analysis/diff-provenance.js` compares every snapshot file with the previous commit after removing the new fields and finds nothing else different, and the rendered economy pages differ from the previous build only by the one added data-page note (below).

**1. A harsher backtest, and signed error for both.** (`node scripts/county-profiles/analysis/backtest-runs.js`, on demand only: it is not part of the build or the workflow, and runs in about 3 seconds.) The existing backtest hides one published county-code-ownership-year row at a time and leaves every other year visible, so steps 1 and 2 always have a neighbouring year to anchor on and the error it reports for them flatters them. Real suppression runs across years. The new backtest hides **runs of consecutive years** of the same series (interior windows of 2, 3 and 5 years, every window of published rows; and the last 2, 3 and 5 years of the series, where nothing later exists), with an ancestor identical to the hidden row hidden with it, and runs the ladder with no anchor inside the run, as it would behave for a persistently withheld cell. Each hidden row-year is estimated by each ladder step alone and by the ladder as run. Both backtests are in one table set below: the "single cell" rows reproduce the existing backtest exactly (5,912 row-years, 5.7% median absolute error as run, the numbers in the first Phase 7 validation section), and the run-masked rows are new. Error is (estimate - truth) / truth, so **positive is too high**; percent and absolute jobs are both reported, with samples (row-years) for every row and rows under 30 flagged †.

Row-years hidden as runs (interior windows of 2, 3 and 5 years, and the last 2, 3 and 5 years), stride 1; 48250 row-years estimated by the ladder as run. † marks rows under 30 samples. Positive error means the estimate is too high.

**By run length, ladder as run:**

| run | n | median signed | mean signed | median abs | mean abs | p90 abs | median abs error (jobs) | mean abs error (jobs) | total bias (sum of errors / sum of truth) |
|---|---|---|---|---|---|---|---|---|---|
| single cell (the existing backtest) | 5912 | -0.1% | +5.1% | 5.7% | 14.6% | 29.7% | 14 | 146 | -0.1% |
| interior, 2 years | 10044 | -0.5% | +5.2% | 7.3% | 16.3% | 34.6% | 21 | 220 | -0.2% |
| interior, 3 years | 12951 | -0.7% | +4.7% | 8.6% | 17.4% | 38.8% | 29 | 291 | -0.4% |
| interior, 5 years | 15890 | -0.6% | +6.3% | 10.6% | 21.3% | 46.2% | 44 | 434 | -0.9% |
| tail, last 2 years | 784 | +0.0% | +2.9% | 6.3% | 13.5% | 32.2% | 19 | 109 | -0.1% |
| tail, last 3 years | 1164 | -0.3% | +1.1% | 7.0% | 14.6% | 33.5% | 23 | 123 | -0.4% |
| tail, last 5 years | 1505 | -8.0% | +2.3% | 17.8% | 31.6% | 52.6% | 67 | 725 | -12.6% |

**By ladder step (each step alone on every row-year it can estimate), all runs:**

| step | n | median signed | mean signed | median abs | mean abs | p90 abs | median abs error (jobs) | mean abs error (jobs) | total bias (sum of errors / sum of truth) |
|---|---|---|---|---|---|---|---|---|---|
| step 1 (interpolated) | 34709 | -0.6% | +4.9% | 8.0% | 16.3% | 36.8% | 30 | 336 | -0.2% |
| step 2 (state-scaled) | 30305 | +0.1% | +4.1% | 7.1% | 16.2% | 36.8% | 24 | 126 | +0.2% |
| step 3 (establishment-scaled) | 47999 | -0.1% | +3.8% | 9.4% | 18.5% | 42.6% | 32 | 342 | -0.3% |
| step 4 (parent average, same year) | 16436 | +1.8% | +26.3% | 16.5% | 43.5% | 73.3% | 174 | 1,448 | -2.8% |
| step 5 (parent average, earlier year) | 48238 | +4.8% | +53.4% | 25.8% | 73.7% | 160.0% | 91 | 832 | -3.6% |
| as run | 48250 | -0.6% | +5.2% | 8.6% | 18.4% | 40.0% | 29 | 312 | -1.0% |

**By ladder step and run length (median signed % error / median abs % error, n):**

| step | single cell (the existing backtest) | interior, 2 years | interior, 3 years | interior, 5 years | tail, last 2 years | tail, last 3 years | tail, last 5 years |
|---|---|---|---|---|---|---|---|
| step 1 | -0.3% / 5.2%, n=4656 | -0.8% / 7.0%, n=7876 | -1.1% / 8.5%, n=9987 | -0.2% / 9.8%, n=12190 | n/a | n/a | n/a |
| step 2 | +0.4% / 6.4%, n=3852 | +0.0% / 6.3%, n=6571 | +0.1% / 7.2%, n=8023 | +0.1% / 8.2%, n=9172 | +0.0% / 6.2%, n=768 | -0.3% / 7.0%, n=1143 | +0.8% / 9.8%, n=776 |
| step 3 | +0.0% / 7.7%, n=5863 | +0.0% / 7.7%, n=9984 | +0.0% / 9.1%, n=12898 | +0.0% / 11.0%, n=15823 | +0.8% / 7.9%, n=778 | -1.4% / 8.9%, n=1158 | -15.4% / 22.1%, n=1495 |
| step 4 | +1.9% / 17.9%, n=1935 | +1.8% / 16.9%, n=3351 | +1.8% / 16.5%, n=4390 | +1.8% / 15.8%, n=5608 | +3.0% / 19.1%, n=242 | +3.0% / 19.0%, n=359 | +3.4% / 16.8%, n=551 |
| step 5 | +5.4% / 26.6%, n=5910 | +5.1% / 26.3%, n=10041 | +4.7% / 26.2%, n=12947 | +5.1% / 25.6%, n=15887 | +6.4% / 23.7%, n=784 | +3.8% / 23.7%, n=1164 | +0.0% / 26.1%, n=1505 |

**By sector, ladder as run:**

| sector | n | median signed | mean signed | median abs | mean abs | p90 abs | median abs error (jobs) | mean abs error (jobs) | total bias (sum of errors / sum of truth) |
|---|---|---|---|---|---|---|---|---|---|
| Living Resources | 3264 | -0.7% | +6.5% | 9.8% | 21.2% | 43.3% | 10 | 24 | -0.9% |
| Marine Construction | 2004 | +0.7% | +16.5% | 15.6% | 33.7% | 64.9% | 35 | 73 | +1.2% |
| Marine Transportation | 5485 | -0.3% | +6.3% | 10.3% | 21.7% | 46.7% | 49 | 297 | -1.0% |
| Offshore Mineral Resources | 1844 | -0.0% | +10.8% | 13.6% | 27.6% | 54.2% | 12 | 27 | +0.9% |
| Ship and Boat Building | 537 | +0.0% | +8.2% | 9.0% | 24.5% | 44.6% | 21 | 95 | -0.9% |
| Tourism and Recreation | 35116 | -0.6% | +3.9% | 7.7% | 16.2% | 37.2% | 32 | 373 | -1.0% |

**By number of establishments in the cell, ladder as run:**

| establishments | n | median signed | mean signed | median abs | mean abs | p90 abs | median abs error (jobs) | mean abs error (jobs) | total bias (sum of errors / sum of truth) |
|---|---|---|---|---|---|---|---|---|---|
| 1-4 establishments | 7827 | +0.0% | +14.7% | 11.1% | 30.3% | 59.2% | 3 | 11 | +0.8% |
| 5-9 | 8172 | -0.5% | +8.5% | 12.6% | 25.4% | 51.7% | 9 | 23 | -0.5% |
| 10-24 | 9822 | -0.5% | +3.9% | 10.6% | 18.4% | 41.4% | 21 | 68 | -0.0% |
| 25 or more | 22429 | -0.9% | +1.3% | 6.2% | 11.7% | 29.4% | 116 | 630 | -1.0% |

**By establishments, steps 4 and 5 only (each alone):**

| establishments | n | median signed | mean signed | median abs | mean abs | p90 abs | median abs error (jobs) | mean abs error (jobs) | total bias (sum of errors / sum of truth) |
|---|---|---|---|---|---|---|---|---|---|
| 1-4 establishments | 8767 | +6.3% | +119.5% | 35.8% | 143.3% | 314.7% | 10 | 41 | +18.0% |
| 5-9 | 10570 | +15.5% | +79.0% | 38.1% | 101.0% | 228.4% | 32 | 76 | +8.7% |
| 10-24 | 12281 | +9.1% | +55.8% | 30.8% | 75.7% | 208.9% | 60 | 219 | -8.8% |
| 25 or more | 33056 | +1.2% | +13.4% | 15.7% | 30.8% | 73.3% | 405 | 1,817 | -3.3% |

**Runtime of this backtest:** 3 s.

*Direction of the bias, plainly.* **The ladder does not lean high in the middle of its distribution and does lean high in its tail.** Steps 1 to 3 have median signed error within about 1 point of zero in every run length except the last 5 years of a series (step 1 -0.6%, step 2 +0.1%, step 3 -0.1% over all runs); their mean signed error is +4% to +5% because the error distribution is right-skewed (a few large overshoots). **Steps 4 and 5 overshoot**: step 4 median +1.8% and mean +26%; step 5 median +4.8% and mean +53%, and for small cells the overshoot is large and systematic (steps 4 and 5 on cells of 1 to 4 establishments: median +6%, mean +120%, and the sum of the errors is 18% of the sum of the truth; 5 to 9 establishments: median +15.5%). Weighted by jobs the picture reverses: the ladder as run has a total bias of -1.0% over all runs, because large cells, where steps 1 to 3 apply, are slightly underestimated (the last 5 years of a series, where nothing later exists to anchor on, are underestimated by 12.6% in total and step 3 by 15% at the median: probably series that shrank, a decline that scaling by establishment count cannot see). So the ladder's contribution to a county total is small and, if anything, low; what leans high is the count of small, weakly imputed cells, and the withholding rule (a quarter imputed at steps 4 and 5) is aimed at exactly those. **The high lean of our county totals against the original ENOW is not mainly the ladder** (see the out-of-sample table below: the overshoot is as large in counties where 2% to 6% of the figure is imputed).

*Harsher, but how much?* Stepping from one hidden cell to runs of 2, 3 and 5 years moves the ladder-as-run median absolute error from 5.7% to 7.3%, 8.6% and 10.6% (interior) and the 90th percentile from 30% to 35%, 39% and 46%; steps 1 and 2 degrade the most (step 1 from 5.2% to 7.0%, 8.5% and 9.8%; step 2 from 6.4% to 6.3%, 7.2% and 8.2%), steps 4 and 5 barely move because they never used the same cell's neighbours. By sector the median absolute error as run is 7.7% (tourism and recreation) to 15.6% (marine construction), and small cells are worse in percent (1 to 4 establishments 11.1% median, 30% mean) and smaller in jobs (median 3 jobs, mean 11).

*What this test still does not capture.* Every row in it is a cell QCEW published, and a published cell is published because it is not dominated by one or a few employers; the cells that really are withheld are withheld precisely because a few employers dominate them, so their size and their year-to-year swings are larger and more erratic than the hidden published cells' (Santa Barbara's 334511, a real employer of about 1,500, is the typical case), and their neighbouring years and parents are more often withheld too. No test on published cells can reproduce that. The errors above should be read as a floor on the error of the imputed cells actually shown, most of all at steps 4 and 5.

**2. Provenance in the snapshot JSON.** So that a reader can reproduce the withholding rule and know what a file was built with, each figure and the file itself now carry more (existing fields `share`, `step`, `partial` and `value` are unchanged):

- `est` gains **`weakShare`**: the fraction (0 to 1) of the figure's value imputed at ladder steps 4 and 5 combined, the quantity the withholding rule tests. A figure that is shown always has `weakShare` below `WITHHOLD_WEAK_SHARE` (state-report.js checks this, so a shown figure that the rule should have withheld is an error). `weakShare` cannot exceed `share`.
- A withheld figure is `{"suppressed": true, "reason": ...}` with `reason` from a closed vocabulary: **`weak-share`** (withheld by the rule), **`no-data`** (the source withholds it and there is nothing to impute from: a Census nonemployer cell marked S, a NOAA comparator marked SUP), **`gdp-unreproducible`** (Public administration's GDP: BEA's government GDP includes schools and hospitals that QCEW counts under other sectors, so no defensible ratio exists). A withheld figure with no reason, or an unknown one, is a validation error.
- The `estimation` block gains **`thresholds`**: `{marker, withholdWeakShare}`, the thresholds in force when the file was built (0.25 and 0.25); `state-report.js` checks they equal the thresholds in the code, and the validator requires the block for every county with a marine topic.

The accessible tables, charts, print blocks and footnotes are unchanged in output. Checked two ways: (a) `analysis/diff-provenance.js HEAD` over all 54 snapshot files (27 dated, 27 latest): 896 `weakShare` fields, 226 reasons and 46 `thresholds` blocks added and **nothing else differs** (no figure, source, vintage or availability); (b) the economy pages rendered before and after (with the `generated` timestamp, which the pages print, normalised): the only differing files are the 86 economy topic pages (46 marine, 40 total, current and dated), and the only differing line in each is the added note. The one deliberate visible addition is a short note on the "Data, methods and citation" slide of the marine and total economy decks, beside the unchanged "Download this snapshot (JSON)" link, saying what `est` and `reason` mean and that published-only figures are those with no `est` object and no `suppressed` flag.

**3. The out-of-sample 2021 comparison, and why the all-sector figure must not be quoted as accuracy.** Tourism and recreation is calibrated to the original ENOW's 2021 county figures and is most of every county's jobs, so the 2021 county comparison in follow-up 2 ("21 of 23 counties within 10%") is **in-sample for the largest sector and must not be quoted as accuracy**. The comparison that is not fitted to the original is the five other sectors (living resources, marine construction, marine transportation, offshore minerals, ship and boat building) on their own:

**Out of sample: the five non-tourism sectors combined, jobs, 2021, ours against the original ENOW.** Tourism and recreation is left out because it is calibrated to the original's 2021 county figure (in-sample). The original's employment is confidential-microdata; ours is public QCEW with the ladder. Do not quote the all-sector comparison (21 of 23 counties within 10%) as accuracy: it is dominated by the calibrated sector.

| county | original ENOW | ours | difference (signed) | share of ours imputed |
|---|---|---|---|---|
| Alameda | 10,692 | 13,660 | +27.8% | 5.6% |
| Contra Costa | 1,768 | 2,488 | +40.7% | 23.1% |
| Del Norte | 73 | 88 | +20.8% | 17.2% |
| Humboldt | 266 | 328 | +23.2% | 23.4% |
| Los Angeles | 61,861 | 66,147 | +6.9% | 3.0% |
| Marin | 344 | 394 | +14.6% | 12.7% |
| Mendocino | 186 | 239 | +28.7% | 20.2% |
| Monterey | 316 | 462 | +46.2% | 21.5% |
| Napa | 567 | 586 | +3.4% | 0.0% |
| Orange | 8,740 | 10,121 | +15.8% | 8.6% |
| San Diego | 20,327 | 21,353 | +5.0% | 3.3% |
| San Francisco | 2,196 | 2,971 | +35.3% | 17.4% |
| San Luis Obispo | 262 | 393 | +50.2% | 32.4% |
| San Mateo | 975 | 1,351 | +38.6% | 24.3% |
| Santa Barbara | 338 | 2,564 | +658.7% | 75.3% |
| Santa Clara | 1,510 | 1,665 | +10.2% | 6.5% |
| Santa Cruz | 85 | 251 | +195.2% | 39.4% |
| Solano | 489 | 622 | +27.1% | 6.2% |
| Sonoma | 534 | 747 | +39.9% | 4.1% |
| Ventura | 1,329 | 2,146 | +61.4% | 28.6% |
| Sacramento | 5,896 | 6,261 | +6.2% | 4.1% |
| San Joaquin | 27,055 | 27,441 | +1.4% | 0.5% |
| Yolo | 3,315 | 4,099 | +23.6% | 2.3% |

23 counties: 5 within 10% of the original, 18 outside; 23 above the original and 0 below; median difference +27.1%, median absolute difference 27.1%.

Per sector, across the counties where the original has a figure (original zero counted; "total" columns sum the counties; the median columns are over counties where the original is above zero):

| sector | counties | original, total jobs | ours, total jobs | difference of totals (signed) | median county difference (signed) | median county difference (absolute) | within 10% / above / below | share of ours imputed |
|---|---|---|---|---|---|---|---|---|
| Living Resources | 19 (19 above zero) | 7,305 | 8,145 | +11.5% | +17.1% | 17.1% | 7 / 16 / 1 | 10.5% |
| Marine Construction | 18 (18 above zero) | 8,203 | 8,235 | +0.4% | +0.0% | 0.0% | 17 / 4 / 0 | 0.4% |
| Marine Transportation | 22 (22 above zero) | 123,057 | 138,139 | +12.3% | +30.7% | 30.7% | 5 / 22 / 0 | 5.3% |
| Offshore Mineral Resources | 10 (9 above zero) | 2,896 | 4,167 | +43.9% | +21.5% | 21.5% | 3 / 8 / 0 | 30.5% |
| Ship and Boat Building | 8 (3 above zero) | 7,663 | 7,692 | +0.4% | +0.0% | 0.0% | 2 / 1 / 0 | 0.8% |

Left out because the original withholds the sector in that county: Alameda Ship and Boat Building, Contra Costa Ship and Boat Building, Del Norte Marine Construction, Del Norte Marine Transportation, Del Norte Ship and Boat Building, Humboldt Offshore Mineral Resources, Humboldt Ship and Boat Building, Marin Offshore Mineral Resources, Marin Ship and Boat Building, Mendocino Marine Construction, Mendocino Offshore Mineral Resources, Monterey Marine Construction, Monterey Offshore Mineral Resources, Napa Living Resources, Napa Offshore Mineral Resources, San Francisco Offshore Mineral Resources, San Francisco Ship and Boat Building, San Luis Obispo Offshore Mineral Resources, San Luis Obispo Ship and Boat Building, San Mateo Marine Construction, San Mateo Ship and Boat Building, Santa Barbara Ship and Boat Building, Santa Clara Offshore Mineral Resources, Santa Clara Ship and Boat Building, Santa Cruz Offshore Mineral Resources, Santa Cruz Ship and Boat Building, Solano Living Resources, Solano Offshore Mineral Resources, Solano Ship and Boat Building, Sonoma Offshore Mineral Resources, Sonoma Ship and Boat Building, Ventura Ship and Boat Building, Sacramento Offshore Mineral Resources, San Joaquin Living Resources, San Joaquin Offshore Mineral Resources, Yolo Living Resources, Yolo Marine Construction, Yolo Ship and Boat Building.

**The only out-of-sample view of the ZIP rule for tourism and recreation:** the counties where calibration was not possible because the original's 2021 figure is withheld or zero, so tourism uses the 1 km ZIP rule alone (jobs and establishments, 2021):

| county | ours, tourism jobs (ZIP rule) | original ENOW, tourism jobs | ours, establishments | original, establishments | ZIP rule's jobs share |
|---|---|---|---|---|---|
| Napa | 21 | 0 | 2 | 0 | 0.0% |
| Sacramento | 364 | 0 | 28 | 0 | 0.0% |
| San Joaquin | 3,033 | 0 | 206 | 0 | 14.1% |
| Yolo | 9 | 0 | 2 | 0 | 0.0% |

*What it shows.* **Out of sample, our county figures are higher than the original's in every county: 5 of 23 counties within 10%, 18 outside, all 23 above, median +27.1%.** Two sectors agree (marine construction and ship and boat building: median difference 0.0%, and a difference of totals of +0.4% each, at 0.4% and 0.8% imputed); marine transportation (+30.7% median, +12.3% of totals), offshore minerals (+21.5%; +43.9% of totals, 30% imputed) and living resources (+17.1%) are higher. The lean is **not mainly the ladder**: it is as large in counties with almost nothing imputed (Alameda +27.8% at 5.6% imputed, Sonoma +39.9% at 4.1%, Solano +27.1% at 6.2%, Los Angeles +6.9% at 3.0%, Napa +3.4% at 0.0%) as in heavily imputed ones (Santa Barbara +659% at 75% imputed, the 334511 case; Santa Cruz +195% at 39%), and the backtest's jobs-weighted bias for the ladder is -1%. It is the difference between public QCEW and the original's confidential microdata for multi-code sectors, plus, for the extra code 493190 in marine transportation, the definition (removing the published 493190 rows takes about 3 points off; establishment counts match). One tested and rejected explanation: scoping marine transportation's warehousing (4931, most of its jobs) to shoreline ZIP codes, as the original's FAQ describes for "some industrial classes", overcorrects (median about -36% instead of about +31% on the 22 counties with an original figure; Los Angeles alone would fall from 57,105 to 36,349 against the original's 53,135). The cause is not established.

*Tourism, the only out-of-sample view of the ZIP rule.* The four counties where calibration was not possible (the original's 2021 tourism figure is 0 or withheld) use the 1 km ZIP rule alone. In all four the original reports **zero** tourism jobs and zero establishments; the ZIP rule gives Napa 21 jobs, Sacramento 364, San Joaquin 3,033 and Yolo 9. So the ZIP rule alone puts tourism where the original has none (San Joaquin's 3,033 jobs come from a 14.1% jobs share of ZIP codes near the Delta's tidal water). The original ENOW may be zeroing sectors in counties outside its shore-adjacent definition; these four are the delta counties and Napa, which ENOW's own geography flags as not shore-adjacent. Treat tourism jobs in these four counties as the least certain in the tool; the ZIP share is not itself flagged as uncertain in the snapshot beyond the `zip-rule` method in `estimation.tourismShoreShare`.

**4. Two small count movements in the follow-up 2 table, explained.** (Both are classification effects, not bugs; nothing changed.)

- *Published 1,418 (old rule) to 1,415 (rule off and every later column).* The three figures are Napa's marine county totals (jobs, wages and GDP). In the snapshots at commit `39e1a18` the old rule withheld one of Napa's sectors, the total left it out and became `{value, partial: true}`, and the sectors that remained were all published, so the total carried no `est` object and was counted "published" (with the partial flag). With the rule off nothing is left out, the total includes the imputed sector, and it carries an `est` object, so it is counted estimated (not marked). The 1,415 is the same in every column from "rule off" on because a published figure does not depend on any threshold.
- *Estimated, not marked: 228 (rule off) to 230 (0.25).* Two totals, Mendocino's marine jobs and Santa Barbara's marine wages, were **marked** with the rule off because heavily imputed sectors were in them (share at or above 0.25); with the rule on those sectors are withheld and left out, the total is recomputed over what is shown, its imputed share falls below 0.25, and it moves from marked to not marked (and becomes partial). Withholding sectors can therefore raise the not-marked count by moving a total across the marker line. Of the 290 marked with no rule, 93 became withheld and 2 became not marked, leaving 195 (290 - 93 - 2). Confirmed by comparing the two runs figure by figure: the only category changes are those 93 marked-to-withheld and these 2 marked-to-not-marked.

**Runtime and memory (re-measured).** The same cold run of the whole economy pipeline for all 27 counties (`run.js all --economy-only --refresh` with the QCEW cache emptied) took 1352 s (23 minutes) with a peak working set of 801 MB (follow-up 2: 1,336 s and 803 MB; review round: 1,305 s and 804 MB; first round: 1,610 s and 778 MB): unchanged, as expected, since this round adds fields and a note and no computation. The backtests run separately and on demand in about 3 seconds each and are not part of the build or the workflow.

### Phase 7 follow-up 4: a California-level check, and tourism withheld where it has no calibration anchor

**1. The California-level three-way check (analysis only; no figure changed).** (`node scripts/county-profiles/analysis/economy-validation.js threeway`, on demand.) For every year where the original ENOW and Open ENOW overlap (2015 to 2021), every sector, and jobs, wages and establishments: Open ENOW's California figure; the original ENOW's own California figure; the original's county figures summed; our 23-county sum. The original's county series is read from the same Quick Report API the pipeline already uses (`oceanEconomy?geotype=ENOW&geoid=<fips>`, geoid `06000` for the state).

**Verdict: case (A).** Open ENOW itself runs above the sum of the original's published county cells in the non-tourism sectors, so the gap we measured in follow-up 3 is built into the comparison, not into our county build; our 23-county sums track Open ENOW. The evidence, 2021 jobs:

- **Open ENOW tracks the original's own California figure** (jobs): living resources -0.1%, marine construction -1.3%, marine transportation +1.8%, offshore mineral resources -8.0%, ship and boat building 0.0%, tourism and recreation +1.7% (the 1.7% NOAA reports). So Open ENOW is not the outlier; the original's California total is.
- **The original's county cells do not add up to its own California figure.** Summed over all 23 counties it covers, they fall short of its California figure by 16% (living resources), 6% (marine construction), 9% (marine transportation), 48% (offshore minerals) and 18% (ship and boat building); tourism adds up exactly. The shortfall is mostly confidential cells: the original publishes "SUP" for 4, 5, 1, 13 and 15 of the 23 county cells in those five sectors (a withheld cell is missing from the sum, so the sum is a lower bound). One part is not explained by SUP: marine transportation has a single SUP cell (Del Norte), yet the county sum is 12.9k jobs (9%) below the original's California figure. We cannot say where those jobs sit; they may be in the original's counties outside its 23 (the original has a California row but publishes county rows only for the 23) or in confidential cells it does not flag.
- **Our 23-county sum tracks Open ENOW, not the county sum**: -5.4%, +0.7%, -0.2%, +2.5%, -6.0% and -0.7% (jobs), and the wages and establishments tables agree to the same order. Our establishments equal Open ENOW's exactly in four of six sectors (Open ENOW's California establishment count for those sectors is our county sum; ship and boat building's is statewide NAICS 33661, which is why ours is 19.7% lower there: it counts only the 23 shown counties).
- Therefore **ours against the original's county sum is high (+12.0%, +5.6%, +12.3%, +81.5%, +14.3% for the five sectors) for the same reason Open ENOW is** (+18.4%, +4.9%, +12.5%, +77.0%, +21.6%): the denominator is short. The out-of-sample comparison of follow-up 3 (our county figures above the original's in all 23 counties, median +27.1%) compares against those published cells, which are the same short denominator plus the cells the original withholds.
- Ruled out: **coverage** (the original covers exactly the 23 counties we show: identical sets; no county in one and not the other); **NAICS codes, ownerships and year/vintage** (the Open ENOW comparison uses the same years and its own definitions; ours differ from Open ENOW only by a few points, and by the ladder as measured in follow-up 3); **units** (jobs, dollars and counts match in order of magnitude in every cell; wages follow jobs); **double counting** (ours against Open ENOW is within -6% to +2.5% for jobs in every sector; a double count would put it far above); **imputed cells inflating the sum** (the ladder's jobs-weighted bias is about -1%, follow-up 3).
- Earlier years: the original's county series for ship and boat building is tiny in 2015 and in 2017 to 2020 (almost every county cell withheld or zero), so the percentages there (+1,600% to +8,000%) are an artefact of the original's withholding, not a finding; marine transportation's gap closes from +36% (2015) to +12.5% (2021). Tourism and recreation, anchored to the original's 2021 county figures, runs -7% to -3% against Open ENOW before 2021 (the county shares are held at their 2021 value).
- Where we differ from the original after allowing for the withheld cells: our non-tourism sectors against the original's own county total minus its tourism row (a derived total that includes the withheld cells) are within a median +0.9% across the 23 counties, 17 of 23 within 10% (the large gaps are Humboldt -28%, Mendocino +41% and Santa Cruz +60%).

**What NOAA's documentation says about geographic scope** (read 2026-09-30). NOAA's ENOW frequent-questions document (<https://coast.noaa.gov/data/digitalcoast/pdf/enow-faq.pdf>, May 2025) says: "For some industrial classes, only those establishments located in shore-adjacent zip codes are included in the sector totals", giving hotels and restaurants as the example; a business is included when "the establishment is either associated with an industry whose definition explicitly ties the activity to the ocean, or located in an industry which is partially related to the ocean and located in a shore-adjacent zip code". The sector and industry definitions (<https://oceaneconomics.org/methods_faqs/sectors.html>) say other industries "are defined as ocean only if their locations are also 'near shore'" and that shipbuilding and marine passenger and freight transportation are defined as ocean "regardless of location". So the original's non-tourism sectors are **not** uniformly shoreline-ZIP-scoped: shipbuilding and marine transportation use all establishments in their codes, and a subset of codes in the other sectors (the page marks them in green italics) is restricted to shoreline ZIP codes. The text we could retrieve does not carry that per-industry marking, so we could not confirm which of the non-tourism codes are restricted; our pipeline uses the per-code `shore` flags in `enow-def.js`, which follow Open ENOW's published definitions. This is not verified against NOAA's own list of restricted codes.

**The tables** (all years, all three measures; "SUP" cells are missing from the original sums):

The original ENOW covers 23 California counties (the API returns rows for them in 2021; the other 35 return nothing). We show 23: the same set, so the two county coverages are identical. Original cells it withholds ("SUP") are missing from its sums, which are then lower bounds.

**Jobs, 2021, California** (Open ENOW; the original ENOW's own California figure; the original's counties summed over all it covers and over the 23 we show; ours):

| sector | Open ENOW | original, California | original, sum of counties covered | original, sum of the 23 shown | SUP cells | ours, 23 counties | Open ENOW vs original (sum) | ours vs original (sum of the 23) | ours vs Open ENOW |
|---|---|---|---|---|---|---|---|---|---|
| Living Resources | 8,647 | 8,653 | 7,305 | 7,305 | 4 | 8,184 | +18.4% | +12.0% | -5.4% |
| Marine Construction | 8,601 | 8,716 | 8,203 | 8,203 | 5 | 8,663 | +4.9% | +5.6% | +0.7% |
| Marine Transportation | 138,438 | 135,926 | 123,057 | 123,057 | 1 | 138,153 | +12.5% | +12.3% | -0.2% |
| Offshore Mineral Resources | 5,127 | 5,571 | 2,896 | 2,896 | 13 | 5,255 | +77.0% | +81.5% | +2.5% |
| Ship and Boat Building | 9,322 | 9,321 | 7,663 | 7,663 | 15 | 8,762 | +21.6% | +14.3% | -6.0% |
| Tourism and Recreation | 348,987 | 343,138 | 343,138 | 343,138 | 0 | 346,546 | +1.7% | +1.0% | -0.7% |

**Wages, 2021, California** (Open ENOW; the original ENOW's own California figure; the original's counties summed over all it covers and over the 23 we show; ours):

| sector | Open ENOW | original, California | original, sum of counties covered | original, sum of the 23 shown | SUP cells | ours, 23 counties | Open ENOW vs original (sum) | ours vs original (sum of the 23) | ours vs Open ENOW |
|---|---|---|---|---|---|---|---|---|---|
| Living Resources | 535,929,928 | 535,240,166 | 460,477,467 | 460,477,467 | 4 | 513,067,648 | +16.4% | +11.4% | -4.3% |
| Marine Construction | 1,092,045,004 | 1,104,369,857 | 1,033,920,449 | 1,033,920,449 | 5 | 1,096,960,425 | +5.6% | +6.1% | +0.5% |
| Marine Transportation | 12,051,274,591 | 12,037,969,440 | 10,671,975,854 | 10,671,975,854 | 1 | 12,062,455,110 | +12.9% | +13.0% | +0.1% |
| Offshore Mineral Resources | 526,759,571 | 551,767,826 | 286,152,513 | 286,152,513 | 13 | 517,705,896 | +84.1% | +80.9% | -1.7% |
| Ship and Boat Building | 696,152,800 | 696,227,013 | 569,378,021 | 569,378,021 | 15 | 684,250,473 | +22.3% | +20.2% | -1.7% |
| Tourism and Recreation | 11,268,387,432 | 11,737,762,084 | 11,737,762,084 | 11,737,762,084 | 0 | 11,245,465,068 | -4.0% | -4.2% | -0.2% |

**Establishments, 2021, California** (Open ENOW; the original ENOW's own California figure; the original's counties summed over all it covers and over the 23 we show; ours):

| sector | Open ENOW | original, California | original, sum of counties covered | original, sum of the 23 shown | SUP cells | ours, 23 counties | Open ENOW vs original (sum) | ours vs original (sum of the 23) | ours vs Open ENOW |
|---|---|---|---|---|---|---|---|---|---|
| Living Resources | 838 | 1,042 | 831 | 831 | 4 | 838 | +0.8% | +0.8% | +0.0% |
| Marine Construction | 290 | 308 | 276 | 276 | 5 | 290 | +5.1% | +5.1% | +0.0% |
| Marine Transportation | 2,071 | 2,063 | 1,876 | 1,876 | 1 | 2,071 | +10.4% | +10.4% | +0.0% |
| Offshore Mineral Resources | 390 | 435 | 292 | 292 | 13 | 390 | +33.6% | +33.6% | +0.0% |
| Ship and Boat Building | 152 | 160 | 78 | 78 | 15 | 122 | +94.9% | +56.4% | -19.7% |
| Tourism and Recreation | 21,842 | 22,046 | 22,046 | 22,046 | 0 | 22,284 | -0.9% | +1.1% | +2.0% |

**Jobs: Open ENOW against the original's county sum (all covered), by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | +229.5% | +25.6% | +23.0% | +19.5% | +20.5% | +22.3% | +18.4% |
| Marine Construction | +5.0% | +2.7% | +6.1% | +5.9% | +9.4% | +3.6% | +4.9% |
| Marine Transportation | +36.4% | +19.3% | +18.1% | +14.9% | +13.7% | +13.0% | +12.5% |
| Offshore Mineral Resources | +128.5% | +92.1% | +90.2% | +96.7% | +81.7% | +92.4% | +77.0% |
| Ship and Boat Building | +1766.8% | +12.7% | +1608.2% | +4824.4% | +8008.9% | +4816.5% | +21.6% |
| Tourism and Recreation | +3.5% | +3.7% | +3.1% | +3.9% | +3.1% | +4.0% | +1.7% |

**Jobs: our 23-county sum against the original's county sum (the 23 shown), by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | +202.4% | +15.3% | +13.8% | +13.0% | +12.9% | +14.4% | +12.0% |
| Marine Construction | +5.3% | +3.3% | +6.9% | +6.4% | +10.0% | +4.2% | +5.6% |
| Marine Transportation | +33.9% | +17.6% | +16.7% | +14.1% | +13.0% | +12.8% | +12.3% |
| Offshore Mineral Resources | +146.0% | +110.6% | +74.4% | +90.0% | +79.1% | +91.6% | +81.5% |
| Ship and Boat Building | +1691.9% | +6.5% | +1505.3% | +4659.8% | +7662.7% | +4620.4% | +14.3% |
| Tourism and Recreation | -3.5% | -3.2% | -2.5% | -2.1% | -1.8% | +0.6% | +1.0% |

**Jobs: our 23-county sum against Open ENOW, by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | -8.2% | -8.2% | -7.5% | -5.4% | -6.3% | -6.4% | -5.4% |
| Marine Construction | +0.4% | +0.6% | +0.8% | +0.4% | +0.6% | +0.6% | +0.7% |
| Marine Transportation | -1.8% | -1.4% | -1.2% | -0.8% | -0.7% | -0.2% | -0.2% |
| Offshore Mineral Resources | +7.7% | +9.7% | -8.3% | -3.4% | -1.5% | -0.4% | +2.5% |
| Ship and Boat Building | -4.0% | -5.5% | -6.0% | -3.3% | -4.3% | -4.0% | -6.0% |
| Tourism and Recreation | -6.8% | -6.6% | -5.5% | -5.8% | -4.8% | -3.3% | -0.7% |

**Wages: Open ENOW against the original's county sum (all covered), by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | +340.8% | +27.8% | +25.5% | +21.1% | +21.9% | +23.3% | +16.4% |
| Marine Construction | +4.5% | +2.6% | +5.5% | +5.1% | +8.2% | +3.1% | +5.6% |
| Marine Transportation | +41.0% | +17.5% | +18.3% | +14.8% | +13.6% | +14.0% | +12.9% |
| Offshore Mineral Resources | +170.6% | +112.9% | +95.7% | +115.6% | +101.8% | +107.8% | +84.1% |
| Ship and Boat Building | +1721.3% | +12.6% | +1587.7% | +5410.9% | +8348.5% | +5898.2% | +22.3% |
| Tourism and Recreation | -2.8% | -1.8% | -2.5% | -2.2% | -3.4% | -1.7% | -4.0% |

**Wages: our 23-county sum against the original's county sum (the 23 shown), by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | +297.6% | +15.1% | +15.9% | +15.6% | +14.9% | +15.6% | +11.4% |
| Marine Construction | +4.9% | +3.0% | +6.0% | +5.3% | +8.6% | +3.6% | +6.1% |
| Marine Transportation | +40.2% | +16.7% | +17.2% | +13.7% | +13.0% | +13.8% | +13.0% |
| Offshore Mineral Resources | +195.5% | +147.3% | +68.3% | +90.9% | +82.4% | +97.6% | +80.9% |
| Ship and Boat Building | +1725.8% | +9.9% | +1552.8% | +5534.6% | +8429.7% | +5988.4% | +20.2% |
| Tourism and Recreation | -8.7% | -7.9% | -7.6% | -7.5% | -8.0% | -4.5% | -4.2% |

**Wages: our 23-county sum against Open ENOW, by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | -9.8% | -10.0% | -7.7% | -4.5% | -5.8% | -6.2% | -4.3% |
| Marine Construction | +0.3% | +0.5% | +0.5% | +0.2% | +0.4% | +0.4% | +0.5% |
| Marine Transportation | -0.5% | -0.7% | -1.0% | -1.0% | -0.6% | -0.1% | +0.1% |
| Offshore Mineral Resources | +9.2% | +16.2% | -14.0% | -11.5% | -9.6% | -4.9% | -1.7% |
| Ship and Boat Building | +0.3% | -2.4% | -2.1% | +2.2% | +1.0% | +1.5% | -1.7% |
| Tourism and Recreation | -6.1% | -6.2% | -5.2% | -5.5% | -4.7% | -2.8% | -0.2% |

**Establishments: Open ENOW against the original's county sum (all covered), by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | +110.1% | +5.0% | +6.6% | +5.2% | +3.6% | +3.5% | +0.8% |
| Marine Construction | +7.5% | +6.8% | +13.2% | +15.0% | +13.6% | +10.5% | +5.1% |
| Marine Transportation | +12.9% | +12.4% | +12.0% | +12.7% | +13.4% | +12.6% | +10.4% |
| Offshore Mineral Resources | +16.2% | +10.9% | +18.7% | +35.1% | +21.4% | +9.2% | +33.6% |
| Ship and Boat Building | +465.0% | +88.5% | +330.8% | +481.0% | +823.1% | +513.0% | +94.9% |
| Tourism and Recreation | +5.7% | +5.5% | +6.0% | +4.9% | +4.0% | +2.5% | -0.9% |

**Establishments: our 23-county sum against the original's county sum (the 23 shown), by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | +110.1% | +5.0% | +6.6% | +5.2% | +3.6% | +3.5% | +0.8% |
| Marine Construction | +7.5% | +6.8% | +13.2% | +15.0% | +13.6% | +10.5% | +5.1% |
| Marine Transportation | +12.9% | +12.4% | +12.0% | +12.7% | +13.4% | +12.6% | +10.4% |
| Offshore Mineral Resources | +16.2% | +10.9% | +18.7% | +35.1% | +21.4% | +9.2% | +33.6% |
| Ship and Boat Building | +320.0% | +49.2% | +238.5% | +357.1% | +615.4% | +382.6% | +56.4% |
| Tourism and Recreation | +1.3% | +1.2% | +3.1% | +1.7% | +2.0% | +1.4% | +1.1% |

**Establishments: our 23-county sum against Open ENOW, by sector and year (signed):**

| sector | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---|---|---|---|---|---|---|
| Living Resources | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% |
| Marine Construction | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% |
| Marine Transportation | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% |
| Offshore Mineral Resources | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% | +0.0% |
| Ship and Boat Building | -25.7% | -20.9% | -21.4% | -21.3% | -22.5% | -21.3% | -19.7% |
| Tourism and Recreation | -4.1% | -4.0% | -2.8% | -3.0% | -2.0% | -1.0% | +2.0% |




**2. Tourism and recreation withheld where it has no calibration anchor.** The four counties whose tourism could not be calibrated (the original's 2021 county figure is withheld or zero: Napa, Sacramento, San Joaquin, Yolo) no longer show tourism and recreation. The measured result of follow-up 3 was that the ZIP rule alone puts tourism where the original has none (San Joaquin 3,033 jobs against an original zero), so it is withheld rather than shown.

- *Trigger, data-driven.* `marineSections` flags the tourism sector when the county's calibration method (`estimation.tourismShoreShare.jobs.method`) is `zip-rule`, that is, when there is no usable original 2021 figure for the county. No county is named in code; the About page's county list is read from the snapshots. Withheld in every measure: establishments, wages, employment, GDP and the average wage on the wages chart.
- *Reason.* The existing withheld state, with the new reason **`no-calibration-anchor`** in `WITHHOLD_REASONS` (validator, `state-report.js`, `docs/COUNTY-PROFILES.md`, `figure-slots.js` category `withheld-noanchor`). `state-report.js` also checks the two directions of the rule: a county with calibration method `zip-rule` must have tourism withheld with this reason in every measure, and a calibrated county must not.
- *Totals.* Every total tourism feeds (marine jobs, wages, establishments, GDP, the Total Jobs employed tile) leaves it out and is marked partial (a floor). The sector-share chart is shares of the partial total; callouts are dropped when an input is partly withheld (as before), so none states a figure whose parts are withheld.
- *Kept.* The ZIP-rule code and `zipRuleJobsShare` stay in `estimation.tourismShoreShare` with the calibration provenance. No imputation logic, definition, threshold (0.25 for both) or any other figure changed.

*Before and after, latest snapshot (2025 jobs, wages and establishments; 2024 GDP; the share is tourism's share of the county's marine total before; `*` is a partial total):*

| county | marine jobs | marine wages | establishments | GDP |
|---|---|---|---|---|
| Napa | 790 → 769* (tourism 21, 2.7%) | $55.9M → $55.1M* (tourism $0.8M, 1.5%) | 45 → 42* (3, 6.7%) | $64.1M → $62.8M* ($1.3M, 2.0%) |
| Sacramento | 9,513 → 9,166* (347, 3.6%) | $658M → $638M* ($20.8M, 3.2%) | 161 → 137* (24, 14.9%) | $886M → $839M* ($46.6M, 5.3%) |
| San Joaquin | 32,643 → 29,055* (3,588, 11.0%) | $2,057M → $1,951M* ($106M, 5.2%) | 370 → 139* (231, 62.4%) | $2,875M → $2,669M* ($207M, 7.2%) |
| Yolo | 3,744 → 3,744* (tourism already withheld by the rule, so unchanged) | $257M → $257M* (likewise) | 62 → 60* (2, 3.2%) | $360M → $360M* (likewise) |

Yolo's tourism jobs, wages and GDP were already withheld by the weak-step rule in follow-up 2, so only its establishments change; the totals were already partial.

*Snapshot diff against the previous commit* (every leaf of all 54 files): the only differences are (a) the tourism sector's figures in these four counties (suppressed, reason `no-calibration-anchor`, in the sector chart, accessible table and the wages chart), (b) the totals they feed (value lower, `partial: true`, and the `est` shares and `weakShare` of those totals recomputed over what remains) and the Total Jobs employed tile, and (c) the `generated` date and each source's `retrieved` and `verified` dates (re-stamped because the runtime measurement re-fetched every source; the figures from the re-fetch are identical to the run before it). Nothing in the other 23 counties, nothing under `estimation`, and no flood-hazard or sea-level-rise field changed (`diff-hazard.js`: 54 snapshots identical).

*Count table, regenerated (`state-report.js`; 1,953 figures, one definition in `figure-slots.js`):*

| | before (follow-up 3) | now |
|---|---|---|
| published (plain number) | 1,415 | 1,415 |
| estimated, not marked | 230 | 222 |
| estimated, marked ≈ | 195 | 187 |
| withheld by the weak-step rule | 93 | 89 |
| withheld, Public administration GDP | 20 | 20 |
| withheld, tourism and recreation with no calibration anchor | 0 | 20 |
| partial totals (a flag, not a category) | 66 | 73 |

The 20 are the four counties' five tourism slots each (establishments, wages, employment, GDP, average wage); they came from the 8 unmarked, 8 marked and 4 withheld-by-rule figures above (Yolo's four, already withheld, move from the rule to the new reason). The seven added partial totals are the totals that were not already partial.

**Runtime and memory (re-measured).** The same cold run of the whole economy pipeline for all 27 counties (`run.js all --economy-only --refresh`, QCEW cache emptied) took 779 s (13 minutes) with a peak working set of 793 MB (follow-up 3: 1,352 s and 801 MB): memory unchanged; the shorter wall time is download speed on the day, since this round adds a flag and no computation.

### Phase 7 follow-up 5: footnote and notes pass (wording only)

**No data changed.** Snapshots are byte-identical to commit 115655d (`git diff 115655d -- site/data` is empty) and `diff-hazard.js` reports 54 files identical. Footnotes are not stored in the snapshots: they are built at render time in `scripts/county-profiles/section-models.js` (`withheldNotes`, `gdpYearNote`, `tourismNote`, `SECTOR_CAVEATS`) and `site/_includes/county-profiles/section-body.njk`. `model.footnote` (one string) became `model.footnotes` (one string per reason); notes may now carry a link (`{text, anchor, label}`).

**How a footnote is chosen.** Each withheld figure's own `reason` picks the wording, so a footnote shows only for a reason present on that slide (`withheldNotes` throws on a missing or unknown reason, and at load if the wording table and `WITHHOLD_REASONS` disagree). Checked over all 172 economy sections in the snapshots: the reasons present in each section's data equal the reasons its footnotes state (weak-share 30 sections, gdp-unreproducible 40, no-calibration-anchor 8; `no-data` occurs in no shipped snapshot, so it was checked with a synthetic figure). The first (stats) slide has no sector data, so a starred total says "Incomplete: leaves out a withheld sector (see the sector chart)" and the sector chart gives the reasons.

**Judgment calls.**
- Santa Barbara marine transportation is keyed to county and sector (`SECTOR_CAVEATS`), not derived: the snapshots carry no per-industry rows, so the mechanism cannot be detected from them. The general statement (navigation instruments, NAICS 334511, in the marine transportation definition) is in the About page's definitions bullet. The slide note originally cited "about 1,500 jobs in 2021", the year it was traced (follow-up 2); the 2025 split was **not** traced (displayed 2025 marine transportation employment is 1,041, ≈, step 4), so follow-up 6 removed the count and the year from the note and the About bullet.
- The "All Coastal States (the coastal portions of 30 states)" wording is applied to the marine wages slide only. The total economy slide keeps "Coastal U.S.": that series comes from NOAA's Total Economy (Coastal), and its state footprint is not documented here.
- GDP accuracy figures (Education and health within about 1%, other sectors roughly 1% to 10%, Other services 25%) are on the About page only, with the caveat that they are medians over the 20 total economy counties against NOAA's 2023 series; slides carry the model and the year lag and link there.
- The tourism note is on the marine sector slide only (not repeated on the first and wages slides), to avoid repeating one note in the print block.
- The marine economy print blocks gained words (required new content: GDP model, tourism calibration, comparator definition, Santa Barbara caveat); the total economy blocks lost words. Print page counts across San Francisco, Humboldt, Napa, San Joaquin, Yolo (delta), Santa Barbara and Del Norte: unchanged or fewer (Del Norte marine 5 to 4). Footnote and note words in the print blocks, summed over the 12 county-topics measured: 3,049 before, 2,999 after.

**Data-side wording not fixed in follow-up 5 (the Open ENOW label was fixed in follow-up 6).** The snapshot source labels "NOAA Open ENOW (California and coastal U.S.)" and "NOAA Total Economy (Coastal), coastal California and coastal U.S." appear in each page's sources lines and table. Vintages in every sources block match the slide years.

#### Inventory of user-facing economy strings (before this round)

| String | Words before | Status |
|---|---|---|
| section-body.njk: withheld footnote (generic, one text for every reason) | 24 | changed |
| footnote, reason weak-share | 32 | changed |
| footnote, reason no-data | 4 | changed |
| footnote, reason gdp-unreproducible (diversity slide) | 36 | changed |
| footnote, reason gdp-unreproducible (first slide) | 33 | changed |
| footnote, reason no-calibration-anchor | 4 | changed |
| first slide, marine total starred | 32 | changed |
| wages slide withheld footnote | 28 | changed |
| estimated (≈) footnote | 28 | changed |
| note: years, first slide (years differ) | 19 | changed |
| note: years, first slide (years equal) | 5 | changed |
| note: years, sector slide | 23 | changed |
| note: wages years | 29 | changed |
| wages series label (marine) | 2 | changed |
| note: wages comparator (marine, new) | 0 | changed |
| note: Total Jobs | 32 | changed |
| note: tourism (marine sector slide, new) | 0 | changed |
| note: Santa Barbara marine transportation (marine sector and wages slides, new) | 0 | changed |
| sector slide: denominator rule | 7 | changed |
| deck.njk: JSON note on the data slide | 62 | changed |
| About: Withheld values, zeros and gaps | 35 | changed |
| About: marine definitions bullet | 0 | changed |
| About: GDP bullet | 33 | changed |
| About: tourism bullet | 30 | changed |
| About: estimated paragraph | 17 | changed |
| About: intended use (new h3, “What these figures are for”) | 0 | changed |
| credits.json: NOAA Open ENOW note | 11 | changed |
| sr-only “Estimated: ” and “(estimated)” in chart descriptions; “withheld” cell and tooltip text (section-body.njk, blocks-deck.njk, template-helpers.mjs) | n/a | unchanged: short, true, the screen-reader cue for ≈ and withheld |
| callout captions (section-models.js) | n/a | unchanged: they describe the figure drawn; no stale claims |
| “This topic omits jobs at risk …” (deck.njk, print-topic.njk) | n/a | unchanged: about jobs at risk, not an economy figure |
| print footer and Sources lines and table (print-frame.njk, blocks-deck.njk sources macro) | n/a | unchanged: labels and vintages come from the snapshots; every vintage checked against each snapshot’s sources block and the slide years (all match) |
| About: Economy data years | n/a | unchanged: every year is a template variable read from a snapshot’s sources block |
| About: Withheld values and the imputation ladder; Differences from NOAA’s published ENOW | n/a | unchanged: checked against DECISIONS.md, true |
| countyProfileSchema.json: intro and prose of the economy sections | n/a | unchanged: NOAA’s original wording, not a description of our figures |
| Snapshot source labels “NOAA Open ENOW (California and coastal U.S.)” and “NOAA Total Economy (Coastal), coastal California and coastal U.S.” | n/a | unchanged (data): listed in the PR; fixing them needs regenerated snapshots |

#### Before and after

| Key | Old | New | Words old | Words new | Reason |
|---|---|---|---|---|---|
| section-body.njk: withheld footnote (generic, one text for every reason) | * {labels} is/are withheld: the source does not publish it/them, and the estimate that could stand in for it/them is too uncertain to show. | one footnote per reason (next four rows) | 24 | 7 | One text covered four reasons and was only true for some. |
| footnote, reason weak-share | * Withheld, because the source does not publish it and the estimate that could stand in for it is too uncertain to show: {sector (measures)}. Shares shown are of the remaining sectors. | * {names} is/are withheld: the public data hides it, and 25% or more of an estimate would rest on the two weakest methods, which our own test found unreliable. | 32 | 29 | Says what the rule is; 25% is WITHHOLD_WEAK_SHARE. |
| footnote, reason no-data | (the same generic text) | * {names} is/are withheld: the public data hides it and there is nothing to estimate it from. | 4 | 17 | Own wording. No figure in the shipped snapshots has this reason; checked with a synthetic case. |
| footnote, reason gdp-unreproducible (diversity slide) | Public administration’s GDP is withheld in every county: BEA’s government GDP includes schools and hospitals that QCEW counts under other sectors, so no defensible GDP-to-wages ratio exists for it, and the GDP total leaves it out. | * Public administration GDP is withheld in every county: we could not reproduce NOAA’s ratio for it. Totals leave it out and are marked incomplete (*). | 36 | 26 | The old text stated a cause as established; the verified fact is that no ratio we tried reproduced NOAA’s. |
| footnote, reason gdp-unreproducible (first slide) | GDP leaves out Public administration, whose GDP is withheld in every county: BEA’s government GDP includes schools and hospitals that QCEW counts under other sectors, so no defensible GDP-to-wages ratio exists for it. | * GDP leaves out Public administration, which is withheld in every county because we could not reproduce NOAA’s ratio for it. | 33 | 21 | Same. |
| footnote, reason no-calibration-anchor | (the same generic text) | * Tourism and recreation is withheld in {County}: its shoreline share could not be calibrated to NOAA’s original 2021 county figure, which is withheld or zero there. Totals leave it out and are marked incomplete (*). | 4 | 36 | The generic text said the estimate was too uncertain, which is not why. |
| first slide, marine total starred | * One or more values are withheld (the source does not publish them and the estimate that could stand in for them is too uncertain to show), so this figure is incomplete. | * Incomplete: leaves out a withheld sector (see the sector chart). | 32 | 11 | This slide has no sector data; the sector chart gives each reason. |
| wages slide withheld footnote | * One or more average wages are withheld: the source does not publish them and the estimate that could stand in for them is too uncertain to show. | one footnote per reason, naming the sectors | 28 | 7 | Reason-specific. |
| estimated (≈) footnote | Figures marked ≈ are partly estimated: BLS withholds some employers’ data for confidentiality, and the gap is filled from other years or wider industries. How estimates are made. | Figures marked ≈ (and hatched segments or dashed rings) are estimates: 25% or more of the value was filled in from other values rather than published. The mark is not colour alone. Detail: the JSON est fields and Data, methods and citation. How estimates are made. | 28 | 46 | States the threshold, that it is an estimate, where the detail is, and that colour is not the only cue. 25% is ESTIMATED_SHARE_THRESHOLD. |
| note: years, first slide (years differ) | Establishments, jobs and wages are for 2025; GDP is for 2024, the newest year BEA publishes for these industries. | Establishments, jobs and wages are for 2025. GDP is for 2024, a year behind, and is modeled from wages (all ownerships) and California’s GDP-to-wages ratio. How GDP is modeled. | 19 | 29 | States the GDP model and lag (the gap is computed, not hardcoded). |
| note: years, first slide (years equal) | All figures are for 2025. | Establishments, jobs, wages and GDP are for 2025. GDP is modeled from wages (all ownerships) and California’s GDP-to-wages ratio. How GDP is modeled. | 5 | 23 | GDP is modeled in every year. |
| note: years, sector slide | Establishments, employment and wages are for 2025; GDP is for 2024, the newest year BEA publishes for these industries. (none when years equal) | same text as the first slide, also when years are equal | 23 | 11 | GDP is shown, so the model is stated. |
| note: wages years | All three series are for 2024, the newest year the comparison series covers, so the county’s dot is for 2024 rather than the headline year of the other slides. | Wages are for 2024 (other slides: 2025), the newest year the comparison covers. | 29 | 13 | Gives both years; the headline year is read from the snapshot. |
| wages series label (marine) | Coastal U.S. | All Coastal States | 2 | 3 | Open ENOW’s series is the coastal portions of 30 states, not national. |
| note: wages comparator (marine, new) |  | All Coastal States means the coastal portions of 30 states, not the whole country. | 0 | 14 | Required wording. |
| note: Total Jobs | Employed workers are for 2025 and self-employed workers for 2021, the newest year each source publishes. They describe different years, so they are not added. (equal years: Both counts are for X.) | Employed workers: BLS QCEW, 2025. Self-employed workers: NOAA ENOW, 2021, the newest year it covers. They are separate counts and are not added. (total economy: Census Nonemployer Statistics, 2024) | 32 | 29 | Names each source with its year; one wording for equal and unequal years; no note implies a sum. |
| note: tourism (marine sector slide, new) |  | Tourism and recreation counts only shoreline ZIP-code activity. Each county’s share is calibrated to NOAA’s original 2021 figure and held constant, so 2021 agrees with NOAA by construction. (Del Norte: its share is capped at 100%.) How shares are set. | 0 | 40 | Required; the cap sentence is read from the calibration method, not from a county name. |
| note: Santa Barbara marine transportation (marine sector and wages slides, new) |  | Santa Barbara’s marine transportation is dominated by navigation instruments manufacturing (NAICS 334511, about 1,500 jobs in 2021). The sector definition includes it, but its products are not all maritime. | 0 | 29 | Keyed to county and sector (SECTOR_CAVEATS in section-models.js) because the snapshots carry no per-industry rows, so the mechanism cannot be detected. The general statement is in About. Shown only when the figure is shown. |
| sector slide: denominator rule | Shares shown are of the remaining sectors. | Shares exclude withheld sectors. | 7 | 4 | Shorter, same meaning. |
| deck.njk: JSON note on the data slide | In the JSON download, a figure with an est object was partly imputed (share: the imputed fraction; weakShare: the part imputed at the two weakest steps of the ladder; step: the weakest step used), and "suppressed": true marks a withheld figure, with a reason. To keep only published figures, leave out any figure that has an est object or a suppressed flag. | same content, reworded as shorter sentences | 62 | 6 | Marginal; no change in meaning. |
| About: Withheld values, zeros and gaps | Withheld is a figure this page does not show: the source does not publish it and the estimate that could stand in for it is too uncertain, or there is nothing to estimate it from. | Withheld is a figure this page does not show, for one of four reasons that the slide’s footnote and the JSON reason field give (weak methods, nothing to estimate from, GDP ratio not reproduced, tourism share not calibrated). | 35 | 38 | Matches the four-reason vocabulary. |
| About: marine definitions bullet |  | + Some codes cover products that are not all maritime: marine transportation includes navigation instruments manufacturing (NAICS 334511), which can make up most of a county’s marine transportation jobs (Santa Barbara, about 1,500 jobs in 2021). | 0 | 36 | The generic mechanism, in one place. |
| About: GDP bullet | a sector’s GDP is the county’s wages … times California’s ratio … with wages of all ownerships in the ratio. Public administration’s GDP is withheld … so no defensible ratio exists for it | modeled, not reported; all-ownership wages; marine GDP runs a year behind; against NOAA’s 2023 county figures Education and health matches within about 1% (median county), other sectors roughly 1% to 10%, Other services 25%; Public administration withheld (no ratio we tried reproduces NOAA’s) | 33 | 43 | Figures from DECISIONS.md (review round, total economy table): medians 0.8%, 1.2% to 10.4%, 24.6%. |
| About: tourism bullet | tourism and recreation is anchored to the original ENOW’s 2021 county figures … Where the original’s figure is withheld or zero there is nothing to anchor to, and … withheld | each county’s share is calibrated to the original’s 2021 county figure, held for other years, capped at 100% (counties read from the snapshots); agrees with the original in 2021 by construction, which is not a measure of accuracy; withheld where there is nothing to calibrate to | 30 | 46 | Item 7; the capped counties come from the snapshots. |
| About: estimated paragraph | The two parent-average steps of the ladder (4 and 5) are much less accurate than the others | … were much less accurate in our own test (median error about 18% and 27%, against 5% to 8% for steps 1 to 3) | 17 | 24 | Numbers from the backtest table (17.9%, 26.6%; 5.2% to 7.7%). |
| About: intended use (new h3, “What these figures are for”) |  | The county economy figures describe the approximate size and mix of each sector. They are not exact counts. They are built on a different basis from NOAA’s original county series, whose county figures add up to less than its own California totals in the five sectors other than tourism (by 6% to 48%, because it withholds cells) … The imputation test … is a best case: the cells that are actually withheld are the concentrated ones … | 0 | 77 | Item 10; 6% to 48% is from follow-up 4. |
| credits.json: NOAA Open ENOW note | …the California and coastal U.S. values on the marine wages chart | …the California and All Coastal States (the coastal portions of 30 states) values … | 11 | 14 | Comparator naming. |

Word totals of the quoted texts: 526 before, 679 after, over 27 changed strings (rows with an elided old or new text are approximate, and new rows have no old text, so the totals are not a like-for-like measure).


### Phase 7 follow-up 6: Santa Barbara note and the Open ENOW source label

- **Santa Barbara marine transportation note.** Removed "about 1,500 jobs in 2021" from the slide note (`SECTOR_CAVEATS` in `section-models.js`) and from the About page's definitions bullet. The slides show 2025 and only the 2021 split was traced, so a reader would take 1,500 as the figure on the page. The note now names the industry and NAICS code and says the sector definition includes it but its products are not all maritime. The 2021 trace stays in the follow-up 2 records above.
- **Open ENOW source label.** "NOAA Open ENOW (California and coastal U.S.)" is now "NOAA Open ENOW (California and All Coastal States)": Open ENOW's comparator is the coastal portions of 30 states. Changed at its source (`economySources` in `pipeline/economy-topics.js`) and in `docs/COUNTY-PROFILES.md`.
- **Total Economy label unchanged.** "NOAA Total Economy (Coastal), coastal California and coastal U.S." keeps NOAA's own wording, because the 30-state footprint is verified only for Open ENOW. That footprint stays on the PR's "not verified" list.
- **Snapshots patched in place.** The label string was replaced by script in the 46 committed snapshot files (23 counties, `latest/` and `2026-09-24/`), not by a regenerate, so nothing was re-fetched and no `retrieved` or `verified` date, figure, state, threshold or provenance field changed. A regenerate would produce the same string. The dated files were edited because nothing is published yet (the pre-publication reset above); `latest/` and the dated copies stay identical in content, and `check-archive.js` against the PR base reports these as edits to files the stack already carries.

### Text, legend and layout pass (PR #32, stacked on #31)

A site-wide pass over slide text, chart headers, legends, footnotes and layout, for all four County Profiles topics, the About page, the data and citation slide and print. **No data changed:** snapshots are byte-identical to a49e5a9 (`git diff a49e5a9 -- site/data/county-profiles` is empty), `diff-hazard.js` reports 54 files identical, `state-report.js` and `check-archive.js` pass, `method` stays 1, footnote IDs and keys, the `reason` vocabulary (`weak-share`, `no-data`, `gdp-unreproducible`, `no-calibration-anchor`) and the JSON structure are unchanged. The About page's plain-language slot (`data-author-slot="economy-plain-language"`) is untouched.

**Where the code is.** Strings: `scripts/county-profiles/section-models.js` (callouts, marks, keys, withheld lines) and `site/data/countyProfileSchema.json` (chart captions, the second prose paragraph some slides carried). Markup: `site/_includes/county-profiles/section-body.njk` (callout, tiles, notes, key line) and `blocks-deck.njk` (legends, label marks, the timing headers). Layout: the `cpd-` rules in `site/css/style.css`. Tools added under `scripts/county-profiles/analysis/`: `fit-report.js` (display target), `footnote-words.js`, `emdash-scan.js`, `slide-text.js`. All four take `SITE_DIR` (a built site) so they can run against any build.

**How a symbol works now.** A mark is a printable glyph on a *label* (a tile's label, a chart row's label, a legend entry), never on a figure. The slide's one-line key explains each symbol it uses once, and the key also carries the `≈` line. A screen reader gets the meaning in words: the label carries visually hidden text ("Jobs (2025 figure; some sectors withheld)"), and a key line is a full sentence without the glyph. The set:

| Symbol | Meaning | Where |
|---|---|---|
| † | Figures for the headline year (2025) | Marine economy tiles and sector chart labels. Shown only where the years differ, so the total economy (all 2025) carries none |
| ‡ | Figures for the year before (2024): marine GDP | Marine economy |
| * | A total that leaves something out. Marine: "Some sectors withheld, see the sector chart." Total economy: "Excludes Public administration." (on the GDP label) | Tiles, the GDP row label, the Total Jobs tile |
| § | A sector with a withheld figure, in the sector legend, with the one line "[sector] withheld; not enough reliable data." | Sector charts |
| ≈ | An estimate. "≈ and hatched segments are estimates." ("dashed rings" on the dot plot, "≈ marks estimates." on tiles) | Everywhere a figure is estimated |

All five are in a text key on the slide, survive a greyscale print and do not depend on colour. `†` and `‡` are also used for the 2050 / 2100 range notes on the timing slide and in the About page's horizons section; each key is local to its own slide, so they do not meet, but it is a reuse (see "Needs Peter's call" in the PR).

#### What each removed statement became

Nothing a person citing a figure needs was deleted. Every removed slide statement is on the About page (factual methods section, with an anchor) or on the slide's "Data, methods and citation" part, except the one sentence the brief asked to delete outright.

| Slide string (before) | Destination (after) |
|---|---|
| "Establishments, jobs, wages and GDP are for 2025." (total economy, three slides) | The year is each source's vintage in the Sources row. About `#economy-years` |
| "GDP is modeled from wages (all ownerships) and California's GDP-to-wages ratio. How GDP is modeled." (both topics) | About `#gdp-model` (no link from the slide) |
| "GDP is for 2024, a year behind, and is modeled from..." (marine, three slides) | Symbols † and ‡ on the labels and the key "2025 figures. 2024 figures."; the model on About `#gdp-model`; the year lag on About `#economy-years` |
| "* GDP leaves out Public administration, which is withheld in every county because we could not reproduce NOAA's ratio for it." | Slide: "* Excludes Public administration." on the GDP label. The reason: About `#public-administration` and `#withheld-reasons` |
| "* Incomplete: leaves out a withheld sector (see the sector chart)." | Key line "* Some sectors withheld, see the sector chart." (symbol on the label, not the figure) |
| "Tourism and recreation counts only shoreline ZIP-code activity. Each county's share is calibrated to NOAA's original 2021 figure and held constant, so 2021 agrees with NOAA by construction." (and "<county>'s share is capped at 100%") | About `#tourism-calibration`, which keeps the shoreline-ZIP rule, "agrees with the original in 2021 by construction, which is not a measure of accuracy", and the capped counties |
| "* [sector] (wages, employment, GDP) is withheld: the public data hides it, and 25% or more of an estimate would rest on the two weakest methods..." (one footnote per reason: `weak-share`, `no-data`, `gdp-unreproducible`, `no-calibration-anchor`) | Slide: § in the legend and one line, "[sector] withheld; not enough reliable data." The four reasons, one entry each with its JSON `reason` code: About `#withheld-reasons` |
| " Totals leave it out and are marked incomplete (*)." | About `#withheld-reasons` (closing paragraph) |
| "≈ Estimated. Figures marked ≈ (and hatched segments) are estimates: 25% or more of the value was filled in from other values rather than published. The mark is not colour alone. Detail: the JSON est fields and Data, methods and citation. How estimates are made." | Slide: "≈ and hatched segments are estimates." The 25% threshold, the `est` fields (`share`, `weakShare`, `step`) and the mark not being colour alone: About `#estimated` and the data and citation slide (its JSON note now states the threshold and links to `#estimated` and `#withheld-reasons`); the print data block has an "Estimates" row |
| "Wages are for 2023 (other slides: 2025), the newest year the comparison covers." | Checked first: the slide's Sources row lists the comparison sources with their own vintages ("wages comparison year (2023)", "NOAA Total Economy (Coastal)... (2023)"; marine 2024), so the year is visible and the note is gone. About `#economy-years` states the comparison year |
| "Employed workers: BLS QCEW, 2025. Self-employed workers: Census Nonemployer Statistics, 2024, the newest year it covers. They are separate counts and are not added." | Checked first: each tile's label carries its own year ("Employed workers, 2025", "Self-employed workers, 2024"; marine self-employed 2021) and the Sources row lists both sources and vintages. "Separate counts, not added": About `#economy-years` |
| "This counts jobs, not businesses: a different measure from the business counts NOAA's original snapshots reported." (flood and sea level rise jobs at risk, total economy jobs at risk; screen, print, accessible text) | Removed outright, as instructed. The measure is still stated by every label ("jobs"); why business sections became job sections is in `docs/COUNTY-PROFILES.md` |
| Gauge name repeated in the timing table caption and the 2050 / 2100 subtitle | Named once in the header; see the duplication audit |

#### Duplication audit

Every chart on every topic was read for a header, subtitle, axis label, legend and caption that say the same thing. Anything carrying a unit, a year or the "withheld", "estimated" or "incomplete" meaning was kept somewhere.

| Slide | Duplicated | Kept |
|---|---|---|
| Flood, Homes at Risk | The chart title was the slide heading ("Homes at Risk"), and the callout already says who paid | The callout (NFIP, claims, since year). The chart title now names the measure: "NFIP payouts by five-year period." |
| Flood, Critical Facilities | Title "inside and outside the floodplain, by type" and the legend "Inside / Outside the floodplain" | The legend. Title: "Critical facilities, by type." |
| Flood, Natural features | "1996–2016" in both the chart title and the first legend entry | The title. Legend: "Development added", "Already developed in 1996". Also fixed a `<ul>` nested inside a `<p>` |
| Flood, People at Risk | None found | |
| Sea level rise, Flooded Facilities | "by type" in the title, and the axis title "Number of facilities of each type" | The axis title. Title: "Facilities exposed at each increment of sea level rise." |
| Sea level rise, Jobs | Title "Jobs in areas exposed at each increment..." and axis title "Jobs in exposed areas" | The title (unit and measure). Axis title removed; "Total jobs" above the end labels stays |
| Sea level rise, Land cover | "in square miles" in the title, and the axis title "Square miles inundated" | The axis title (the unit sits where the scale is). The title ends at "...sea level rise." |
| Sea level rise, People at Risk | None found (title, slider label and legend say different things) | |
| Sea level rise, When is the time to act | The gauge was named in the chart header, the table caption and the 2050 / 2100 subtitle, and the header's "Year each increment is reached" was wrong for the 2050 / 2100 view | The gauge once, in the shared header "Projections at the X gauge, by scenario". Each view then says only what is new: Chart "Feet above 2000, by year", Table "Year each increment is reached", 2050 / 2100 "Feet above 2000, in 2050 and 2100". The table caption appears only for a county with more than one timing table (none today); the table has an `aria-label`. The chart's `<title>` still names the tide gauge, for assistive technology only |
| Total and marine, sector charts | The title listed "Establishments, wages, employment and GDP... each as a share of the county total", which are the four row labels | The row labels. Title: "Share of the county total, by sector." (the unit) |
| Total and marine, tiles and sector charts | The year in a footnote, and again in each Sources row | The Sources row (each source's vintage); a symbol marks the one year that differs |
| Total economy, Wages | The year note, and the Sources row's "wages comparison year (2023)" | The Sources row |
| Total and marine, Total Jobs | The year in the tile label, in a note and in the Sources row | The tile label and the Sources row |
| Total and marine, Wages callout | The ratio headline and its own sentence said the same number | Superseded in the revision round: the headline is now the lowest-paying sector's name and no ratio remains |
| Marine, Wages | "All Coastal States" in the legend and in the Sources label | The legend, and one sentence saying what it means (30 coastal states) |

#### Every changed string

`xxx` is the county name; numbers and formatting are as the data gives them.

| # | Where | Before | After |
|---|---|---|---|
| 1 | Flood, critical facilities callout | of xxx County's critical facilities, across all types, are in the floodplain. | of the critical facilities in xxx County falls within the FEMA 100-year floodplain. |
| 2 | Flood, jobs at risk callout | (### jobs) of all jobs in xxx County are in the floodplain. | of all ### jobs in xxx County are in the FEMA 100-year floodplain. |
| 3 | Flood, natural features callout | (N square miles) of the land in xxx County's floodplain is still natural: wetland, forest or open space. | (N square miles) of the designated 100-year floodplain are natural features. (1 reads "1 square mile") |
| 4 | Flood, jobs; SLR, jobs; total economy, jobs at risk | "This counts jobs, not businesses: ..." | removed |
| 5 | Flood, Homes at Risk chart title | Homes at Risk | NFIP payouts by five-year period. |
| 6 | Flood, Critical Facilities chart title | Critical facilities inside and outside the floodplain, by type. | Critical facilities, by type. |
| 7 | Flood, natural features legend | Development added, 1996–2016 | Development added |
| 8 | SLR, Flooded Facilities chart title | ...increment of sea level rise, by type. | ...increment of sea level rise. |
| 9 | SLR, Jobs axis title | Jobs in exposed areas | removed |
| 10 | SLR, Land cover chart title | ...increment of sea level rise, in square miles. | ...increment of sea level rise. |
| 11 | SLR, timing header | Year each increment is reached at the X gauge, by scenario | Projections at the X gauge, by scenario |
| 12 | SLR, timing views | 2050 / 2100: "Projected rise at the X gauge in 2050 and 2100, in feet above 2000". Table caption: "Based on projections for the X tide gauge." | Chart "Feet above 2000, by year"; Table "Year each increment is reached"; 2050 / 2100 "Feet above 2000, in 2050 and 2100"; caption only when there is more than one table |
| 13 | Print, timing | "Projected rise at the X gauge in 2050 and 2100, in feet above 2000" and "Year each increment is reached at the X gauge, by scenario" | "Projections at the X gauge, by scenario", then "Feet above 2000, in 2050 and 2100" and "Year each increment is reached" |
| 14 | Sector charts, chart title | Establishments, wages, employment and GDP by sector, each as a share of the county total. | Share of the county total, by sector. |
| 15 | Tiles (both economy topics) | "16,978*" (mark on the figure) | "Jobs†*" (marks on the label), figure "16,978" |
| 16 | Total economy, tiles and sector chart | GDP row labelled "GDP", footnote about Public administration | "GDP*", key "* Excludes Public administration." |
| 17 | Marine, tiles and sector chart | Two footnote lines (years and GDP model; incomplete) | Marks † ‡ * on the labels, key "† 2025 figures. ‡ 2024 figures. * Some sectors withheld, see the sector chart." |
| 18 | Sector chart legends | Centred, ragged flow | Left-aligned grid in sector order (as in print), with § on a withheld sector |
| 19 | Withheld sectors, all slides | One footnote per reason, each naming sector and measures | § in the legend (sector charts) and "[sector] withheld; not enough reliable data." |
| 20 | Estimate note | "≈ Estimated. Figures marked ≈ (and hatched segments) are estimates: 25% or more of the value was filled in..." | "≈ and hatched segments are estimates." / "≈ and dashed rings are estimates." / "≈ marks estimates." |
| 21 | Total and marine, Wages callout | [Sector] pays the most on average in xxx County's economy, that many times the lowest-paying sector's wage. (with an em dash) | Revised again (revision round, below): the sector name in the headline slot, with "**[Sector]** has the lowest average wage per job in xxx County." |
| 22 | Total economy, Wages | Wages are for 2023 (other slides: 2025), the newest year the comparison covers. | removed (Sources row) |
| 23 | Total economy, Coastal jobs | Jobs in the floodplain / Jobs under 6 ft of sea level rise | Potential jobs affected by current flooding / Potential jobs affected by future flooding |
| 24 | Total Jobs, both topics | self-employed professional and business services workers in xxx County, more than any other sector. | Revised in the fourth revision round: "# professional and business services workers in xxx County are self-employed, more than any other sector." (only the sector name bold; "1 ... worker in xxx County is self-employed"; "tied for the most of any sector" if two sectors tie) |
| 25 | Total Jobs, both topics | Employed workers: BLS QCEW, 2025. Self-employed workers: ... They are separate counts and are not added. | removed (tile labels and Sources row) |
| 26 | Marine, sector chart | Tourism calibration note | removed (About `#tourism-calibration`) |
| 27 | Chart data-table headings and tooltips | "<title> — data table"; "2 ft — Wetlands: ..." | "<title>: data table" (trailing full stop dropped); "2 ft, Wetlands: ..." |
| 28 | County Profiles page titles | "X — Y — CA Sea Change Atlas" | "X \| Y \| CA Sea Change Atlas" |
| 29 | Landing, snapshot list | "— current", "— you are here" | "(current)", "(you are here)" |
| 30 | Land cover "Other" | Drawn dark (`--ink-soft`), the strongest mark on the chart | The muted sand (`--sand-deep`), outlined; wetlands dark teal, upland mid teal |

#### Judgment calls (made without Peter, one line each)

- **"Not enough reliable data"** (with "reliable", as asked): for some withheld values the data exists but is too uncertain to show. One wording for all four reasons; the reason is on About `#withheld-reasons` and in the JSON.
- **`gdp-unreproducible` is shown by the asterisk only.** Public administration's jobs and wages are shown and only its GDP is withheld, so "GDP*" with "* Excludes Public administration." says it and no § line or legend mark ever describes that reason (second revision round; code: `wholeWithheld()`).
- **Withheld wording on slides with no sector legend** (wages, tiles, Total Jobs): the same line without a symbol, since there is no legend entry to mark.
- **Several withheld sectors** are listed with commas and "and" in one line; a sector name that itself contains "and" (Tourism and recreation) is told apart by the § on its legend entry.
- **The wages callout** was a ratio in the first version and is now the lowest-paying sector's name (revision round, below); the ratio and every mention of it are gone.
- **"falls" with a plural noun** ("0% of the critical facilities in xxx County falls within...") is NOAA's phrasing and reads correctly for 0%, 100% and every value between, taking the percentage as the subject. "(1 square mile)" is singular; no other number needed a change.
- **Total Jobs sentence** with a tie: "tied for the most of any sector" instead of "more than any other sector".
- **Layout follows viewport height.** Panel padding, gaps, headline size and the left column's heading and prose scale with `vh` through `clamp()` (a 1280 × 650 page gets the tight end, a 1080-tall page the old values), instead of a media query. Chart geometry was tightened a little: sector bars 44 to 40 units with 22 between (was 28), dot plot rows 46 to 41 units, label type 21 to 20 px. Note and Sources type went from 14 to 12.5 px (line height 1.3, padding 12 to 7 px); contrast is unchanged (the same `--ink-soft`, about 6:1 on the panel in light and well above 4.5:1 in dark).
- **Tiles:** four across while the panel is at least 520 px wide, a balanced 2 × 2 below that (a three-tile row stays three across, so no tile is ever alone), type fluid in the panel's width.
- **"Other" in the land cover chart:** the muted sand used for "outside the floodplain" and "not yet exposed", with a 1 px `--ink-soft` outline so it keeps 3:1 against the panel (the fill alone is about 1.4:1, as for the other muted segments). Wetlands are the darkest, upland mid, other the lightest: separable in greyscale (checked in print) and in dark mode.
- **Print:** page counts for San Francisco, Humboldt, Napa and Santa Barbara are unchanged, not reduced (see below). The print data block gained one short "Estimates" row (threshold, and where the detail is), and print source-table rows lost 1 pt of padding so the marine block still fits on its page. The print sector table's row labels carry the mark glyph, with the words as hidden text.
- **Accessibility fixes found by axe:** a hidden `<h4>` before each chart table (it skipped a heading level) is now an `<h3>`, and each chart table's empty corner header now holds hidden text ("Category"). Both were there before this pass.
- **Em dashes:** removed from every County Profiles string (titles, tooltips, table headings, landing list, new strings). Not touched: other site pages (home, compare, tools, licenses; the About page in the author's voice), code comments, and the two developer-facing schema fields (`callouts`, `chartStyle`). `emdash-scan.js` over the built `county-profiles/` pages finds none.

#### Display-target report (1280 × 650 and larger)

`scripts/county-profiles/analysis/fit-report.js` loads every slide of Santa Barbara, San Francisco and Humboldt (all four topics) at 1280 × 650, 1366 × 768, 1440 × 900 and 1920 × 1080, with the deck's own layout, and reports a slide taller than its viewport (it would need the deck to scroll), wider than it, or with an inner scrollbar or clipped content. The timing slide is also checked in its Table and 2050 / 2100 views. It needs `playwright-core` on `NODE_PATH` (not a project dependency) and an installed Chrome or Edge, and downloads nothing. 1280 × 650 stands for the stated 1280 × 800 CSS pixels less browser chrome.

**Before (a49e5a9): 64 problems over 252 slide checks** (each line is one slide, with the worst overshoot over the three counties):

**1280 × 650: 14 slides**

- flood-hazard#people-at-risk: taller than the viewport by up to 62 px (3 of 3 counties)
- flood-hazard#critical-facilities: taller than the viewport by up to 29 px (3 of 3 counties)
- flood-hazard#natural-features: taller than the viewport by up to 156 px (3 of 3 counties)
- flood-hazard#about: taller than the viewport by up to 13 px (3 of 3 counties)
- sea-level-rise#people-at-risk: taller than the viewport by up to 36 px (3 of 3 counties)
- sea-level-rise#jobs-at-risk: taller than the viewport by up to 122 px (3 of 3 counties)
- sea-level-rise#natural-landscapes: taller than the viewport by up to 18 px (3 of 3 counties)
- sea-level-rise#about: taller than the viewport by up to 48 px (3 of 3 counties)
- sea-level-rise#when-to-act/table: inner scroll in .cpd-pane (14px hidden) (3 of 3 counties)
- total-economy#diversity: taller than the viewport by up to 279 px (3 of 3 counties)
- total-economy#wages: taller than the viewport by up to 196 px (3 of 3 counties)
- total-economy#about: taller than the viewport by up to 156 px (3 of 3 counties)
- marine-economy#diversity: taller than the viewport by up to 391 px (3 of 3 counties)
- marine-economy#wages: taller than the viewport by up to 232 px (3 of 3 counties)

**1366 × 768: 7 slides**

- flood-hazard#natural-features: taller than the viewport by up to 43 px (3 of 3 counties)
- sea-level-rise#jobs-at-risk: taller than the viewport by up to 28 px (3 of 3 counties)
- total-economy#diversity: taller than the viewport by up to 154 px (3 of 3 counties)
- total-economy#wages: taller than the viewport by up to 118 px (3 of 3 counties)
- total-economy#about: taller than the viewport by up to 3 px (3 of 3 counties)
- marine-economy#diversity: taller than the viewport by up to 218 px (3 of 3 counties)
- marine-economy#wages: taller than the viewport by up to 130 px (2 of 3 counties)

**1440 × 900: 1 slides**

- marine-economy#diversity: taller than the viewport by up to 97 px (2 of 3 counties)

**1920 × 1080: none**


**After: 0 problems over 252 slide checks.** The same run over all 27 county directories (every county that has the topic; 1,296 slide checks): 0 problems.

What fixed it, in order of effect: the chart and legend rows (sector charts: a 3-column legend grid and shorter bars), the notes (1,502 to 306 words over these 12 pages), the Sources row (smaller and tighter), height-driven padding and gaps, the headline and left column scaling with viewport height, the timing table (no inner scroll, tighter rows), and the data slide's sources table (5 px row padding, 12.5 px type).

#### Footnote words, before and after

Words in each slide's notes (footnotes, the key line, the second prose paragraph some slides carried; the About slide and the print block excluded), summed per page:

| Page | Before | After |
|---|---|---|
| santa-barbara/flood-hazard | 16 | 0 |
| santa-barbara/sea-level-rise | 16 | 0 |
| santa-barbara/total-economy | 152 | 12 |
| santa-barbara/marine-economy | 363 | 123 |
| san-francisco/flood-hazard | 16 | 0 |
| san-francisco/sea-level-rise | 16 | 0 |
| san-francisco/total-economy | 152 | 12 |
| san-francisco/marine-economy | 229 | 69 |
| humboldt/flood-hazard | 16 | 0 |
| humboldt/sea-level-rise | 16 | 0 |
| humboldt/total-economy | 152 | 12 |
| humboldt/marine-economy | 358 | 78 |
| **Total** | **1502** | **306** |

Sources rows are 1,155 words before and after (the same sources; only their type size and spacing changed). Print blocks are not in these counts; their page counts are unchanged.

#### Verification

`npm run build` (with the canonical-host and stale-host checks), `state-report.js` (all five availability states), `check-archive.js` on HEAD, `diff-hazard.js` (54 files identical), `audit-print-colors.js` (San Francisco, Humboldt, Napa, Santa Barbara, Orange, Yolo: legend swatches match their marks, including the recoloured "Other"), greyscale print of Santa Barbara marine diversity and land cover checked, print PDF page counts compared before and after (San Francisco, Humboldt, Napa and Santa Barbara, per topic: flood hazard 5, sea level rise 6, total economy 6, marine economy 4; full profile 22; Yolo and San Joaquin full profile 16 and Del Norte 22; all unchanged, none reduced: the marine block gained its § and key lines and lost its tourism and GDP notes, a net wash on paper), axe-core (light and dark, 1280 × 650, 4 counties × 4 topics: no violations; before this pass the same two minor findings on every page, now fixed), the em dash scan and the removed-sentence scan.

### Text pass, revision round (PR #32)

Same branch and PR. Snapshots are still byte-identical to a49e5a9 (`git diff a49e5a9 -- site/data/county-profiles` is empty); `diff-hazard.js` finds 54 files identical.

1. **Wages headline (total and marine).** Revised in the second revision round: the headline is now the sentence alone, with the lowest-paying sector in bold at its start; the separate big name row is gone. Lowest among sectors whose county wage is shown, ties to the alphabetically first name, an estimated lowest wage carries ≈, fewer than two shown sectors gives no callout, no ratio anywhere. (Superseded in the fifth revision round: the lowest sector is now ranked by county wage only when every county wage is shown, otherwise by the Coastal California comparator, and the headline never carries ≈.)
2. **Total Jobs tiles.** Employed and self-employed are the same size (the common tile size, the smaller of the two sizes the first tile used to switch between), in two equal columns, top-aligned; in print the first tile no longer takes 24 pt. The headline callout is unchanged.
3. **Withheld symbol on every sector label.** Audit of every chart: sector charts (Diversity, both topics): § on the legend entry of every sector with a figure withheld whole (Public administration is not marked: only its GDP is withheld, which the asterisk on GDP covers; second revision round); Wages dot plot (both topics): § on the row label of a sector with any withheld value, with the note "§ [sectors] withheld; not enough reliable data." starting with the same symbol; accessible tables: the column or row header says "(some figures withheld)"; print sector table headers carry § too. Not applicable, because there is no sector label to mark: the stat tiles (a withheld tile is not drawn; a plain line, no sector), Total Jobs (same), and the flood and sea level rise charts (nothing is withheld there).
4. **Data and citation slide (total and marine).** The closing text is "Some figures are estimated with NOAA's Open ENOW method, and some are withheld." followed by the links "How estimates are made" and "Why figures are withheld" (print: the same sentence with both addresses). The JSON field explanation (`est`, `share`, `weakShare`, `step`, `suppressed`, `reason`, `partial`) moved to the About page's factual section, `#json-fields`, linked from the JSON download link on every deck ("what the fields mean"). "This topic omits jobs at risk" is gone from this section on screen and in print; it is on the About page at `#marine-jobs`. Nothing there compares with the NOAA tool.
5. **Every topic's data slide.** The "Every figure on this page comes from one dated snapshot..." block is deleted (screen and print). "Vintage" is gone from all user-facing County Profiles text: the sources table column is "Period covered", an unpublished one reads "(period not published)", and page descriptions say "the year each figure covers". JSON field names are unchanged.
6. **Re-run.** Display target for Santa Barbara, San Francisco and Humboldt: 0 problems over 252 checks; all 27 county directories: 0 problems over 1,952 slide checks (the earlier all-county figure of 1,296 undercounted, because pages that failed to load were skipped silently; `fit-report.js` now fails on a built page that does not load). axe-core (light and dark, 4 counties × 4 topics): no violations. Print-colour audit: San Francisco, Humboldt, Napa, Santa Barbara, Orange and Yolo match. Print page counts dropped for the first time: total economy 6 to 5 pages and the full profile 22 to 21 for all four counties (the Data section lost two blocks); other topics unchanged. Note words (12 pages): 333, against 1,502 before the text pass.
7. **Server note.** The maintainer's `eleventy --serve --port 8000` against `_site/` is left alone. Verification builds go to a separate directory (`npx eleventy --output=<dir>`) and the dev scripts read `SITE_DIR`; one line saying so is in `AGENTS.md`.

#### Total Economy (Coastal) comparators: which geography is pulled (report only, nothing changed)

The "Coastal California" and "Coastal U.S." comparators on the total economy Wages slide come from NOAA's Digital Coast API behind the Quick Report tool, endpoint `coastaleconomy` (`scripts/county-profiles/pipeline/econ.js`, `shared()`):

| Label | Request (`econ.js`) | What NOAA calls it | Response `geoName`, 2023 total employment |
|---|---|---|---|
| Coastal California | `geotype=StateCoastal`, `geoid=06000` (line 52) | Coastal Shoreline Portion of States: the aggregate of California's shoreline counties | "California", 12,662,997 |
| Coastal U.S. | `geotype=ShorelineCounties`, `geoid=00000` (line 53) | Coastal Shoreline Counties: the 452 counties directly adjacent to the open ocean, major estuaries and the Great Lakes | "Coastal US", 59,488,928 |
| (not a label) all of California, the denominator of "share of California's employment" | `geotype=CoastalStates`, `geoid=06000` (line 55) | Coastal States (whole states) | "California", 18,002,892 |

The county's own row is also from `ShorelineCounties` (line 69), so the county and both comparators are shoreline-county series. The geography selector is the request parameter `geotype`; the response carries `geoid`, `geoName`, `year`, `sector`, `establishments`, `employment`, `wages` and `gdp` (no geography column), and `economy-sections.js` (lines 158 to 160) reads the sector rows of `state` and `nation` into `coastalState` and `coastalUS`. The watershed series (`WatershedCounties`) is used only as a fallback for a county's base year (line 75), never for a comparator; whole coastal states are not used for any comparator. Checked live against the API on 2026-10-02 (the build's cache is not in this checkout): `StateCoastal` answers for 30 states (the Great Lakes states Illinois, Indiana, Michigan, Minnesota, New York, Ohio, Pennsylvania and Wisconsin included, Alaska not); their 2023 employment sums to 58.70 million against 59.49 million for "Coastal US", a gap of 0.78 million that I did not trace (Alaska's shoreline boroughs are one possibility, unconfirmed). NOAA's definitions are on the data page (coast.noaa.gov/digitalcoast/data/coastaleconomy.html, which lists the five geographies) and in the Coastal County Definitions PDF it links (May 2024).

**Proposed wording** (applied in the second revision round, item 5): the source label became "NOAA Total Economy (Coastal), shoreline counties of California and of the U.S."; the legend labels "Coastal California" and "Coastal U.S." were kept. Not applied: the sentence "Shoreline counties are the counties directly adjacent to the ocean, major estuaries and the Great Lakes." on the Wages slide. The existing "All Coastal States (30 states)" label is Open ENOW's series, a different dataset; its Great Lakes coverage is unchecked. The gap of 0.78 million jobs was traced in the second revision round (Puerto Rico and the U.S. Virgin Islands).

### Text pass, second revision round (PR #32)

Snapshots differ from the starting commit a49e5a9 only in the one source label of item 5 (`git diff a49e5a9 -- site/data/county-profiles` shows 40 changed lines, all that label); `diff-hazard.js` finds 54 files identical; `state-report.js` and `check-archive.js` pass.

1. **Coastal Jobs labels and numbers (shared grid).** The two stat-pair items now sit in one grid: row 1 holds both labels, bottom-aligned in a row sized for two lines (`min-height: 2.7em`); row 2 holds both numbers, so they share a baseline however the labels wrap. Checked at 1280 × 650, 1366 × 768, 1920 × 1080 and (to force wrapping) 1100 and 1000 wide, for San Luis Obispo (longest county name), Los Angeles (longest numbers) and San Francisco: label bottoms and number tops are equal in every case and the slide fits. The labels carry no county name, so the longest county name only matters in the page header.
2. **Wages (total and marine).** The big sector-name row is gone. The headline is the sentence alone, with the sector name in bold at its start ("**[Sector]** has the lowest average wage per job in [County] County."), set larger than a caption (22 to 36 px by viewport) and free to wrap. An estimated lowest wage still gets the leading ≈ mark. There is no figure any more, so the print and screen-reader text are the sentence only, and nothing on the data and citation slide repeated it. The longest sector names ("Trade, transportation, and utilities", "Professional and business services", "Offshore mineral resources") with San Luis Obispo County were injected into the real slide at 1280 × 650, 1366 × 768 and 1920 × 1080: two lines (three at 1366 × 768 for the long total economy names) and the slide fits each time. (Superseded in the fifth revision round: the lowest sector is now ranked by county wage only when every county wage is shown, otherwise by the Coastal California comparator, and the headline never carries ≈.)
3. **Marine economy "If you can't measure it" headline.** *Not a regression; the callout guard.* The headline ("N% of total employment in X County is in the marine economy") is built only when the jobs total is neither withheld nor partial. Marine jobs is a partial total whenever any sector is withheld. The guard is the same code at a49e5a9 (`section-models.js`, the `stats` case: `!isSuppressed(data.jobs) && !isPartialCell(data.jobs)`), and a build of the starting commit gives the same result: the headline is present for every county in both builds except the same 16 marine decks, with no difference between the two builds for any of the 43 county-topic pages checked. The 16 marine counties with no headline are Contra Costa, Del Norte, Humboldt, Marin, Mendocino, Monterey, Napa, Sacramento, San Francisco, San Joaquin, Santa Barbara, Santa Clara, Santa Cruz, Solano, Ventura and Yolo; the seven with one (including Los Angeles) have no withheld sector. All 20 total economy decks have a headline. **Proposed fix (applied in the third revision round, below):** show the headline from the sum of the known sectors as a floor, "at least N% of total employment in X County is in the marine economy", with the incomplete asterisk on it and the existing key line "* Some sectors withheld, see the sector chart." The floor can sit far below the truth where the withheld sector is large (tourism and recreation in Napa, Sacramento, San Joaquin and Yolo), so whether to publish a floor is your call. **The check:** `buildSectionModel` now returns `calloutSkip`, a closed list of reasons (`withheld-part`, `too-few-sectors`), and throws at build time if any section that normally has a headline (every kind but the timing chart and the stat pair) has none and gives no reason. Shown by negative test: with the reason removed, the marine measuring section for a county with a partial jobs total throws "no headline for marine-economy/measuring (T) and no reason given".
4. **Public administration.** The "§ Public administration withheld; not enough reliable data." line is gone from the total economy diversity slide. What stays: "GDP*" and "* Excludes Public administration." The § is for sectors whose figures are withheld whole; Public administration's jobs and wages are shown. The code now passes every list of withheld cells through `wholeWithheld()`, which drops reason `gdp-unreproducible`, so no § line, legend mark or note can describe that reason (the accessible chart description still says "GDP ... Public administration withheld" for the GDP row, which is accurate). The About page's symbol key and withheld-reasons text say the same.
5. **Comparator label (own commit, label only).** "NOAA Total Economy (Coastal), coastal California and coastal U.S." became "NOAA Total Economy (Coastal), shoreline counties of California and of the U.S." in `economy-topics.js` and, by string replacement with no re-fetch, in the 40 snapshot files (`latest/` and `2026-09-24/`, 20 counties each). Proof: the commit changes 41 lines (40 + 1), `git diff --word-diff` shows only "coastal ... coastal" becoming "shoreline counties of ... of the", and against a49e5a9 the only differing snapshot lines are the 40 label lines. The legend labels "Coastal California" and "Coastal U.S." are unchanged. About `#total-economy-comparators` gives the definition: California's shoreline counties; the U.S. coastal shoreline counties, NOAA's 452 counties adjacent to the ocean, major estuaries and the Great Lakes; not watershed counties and not whole states.
6. **The employment gap (report only).** *Territories explain it exactly.* Querying `coastaleconomy` with `geotype=StateCoastal`: Puerto Rico (geoid 72000) has 748,279 jobs in 2023 and the U.S. Virgin Islands (78000) 35,839; American Samoa, Guam and the Northern Mariana Islands (60000, 66000, 69000) return nothing. 58,704,810 (the 30 states and DC) + 748,279 + 35,839 = **59,488,928**, equal to "Coastal US" to the job. `ShorelineCounties` also answers for county-level geoids in Puerto Rico (72127, San Juan) and the Virgin Islands (78010, St. Croix) but not for Alaska (02013, 02020) or the other territories. So "Coastal U.S." includes Puerto Rico and the U.S. Virgin Islands and excludes Alaska, American Samoa, Guam and the Northern Mariana Islands. NOAA's definition document (May 2024) lists 452 shoreline counties and county equivalents, including 25 in Alaska, 45 in Puerto Rico, 3 in the Virgin Islands, 3 in American Samoa, 1 in Guam and 4 in the Northern Marianas (parsed from its county table; asterisks per state), so the series carries about 419 of NOAA's 452, a derived count not checked county by county. **Proposed About wording (not applied):** "Coastal U.S. is NOAA's Total Economy (Coastal) aggregate of shoreline counties in 29 states and the District of Columbia (the Great Lakes states included), Puerto Rico and the U.S. Virgin Islands. NOAA defines 452 shoreline counties; the series has no data for the shoreline counties of Alaska, American Samoa, Guam and the Northern Mariana Islands." The item 5 About paragraph says only what NOAA defines, so it stays accurate until you choose that wording.
7. **Re-run.** Display target, all 27 county directories: 0 problems over 1,952 slide checks at 1280 × 650, 1366 × 768, 1440 × 900 and 1920 × 1080 (the data slide's source table rows lost 1 px of padding to absorb the longer JSON link line). axe-core (light and dark, Santa Barbara, San Francisco, Humboldt, Napa, all topics): no violations. Print-colour audit: San Francisco, Humboldt, Napa, Santa Barbara, Orange and Yolo match. Print pages unchanged from the first revision (total economy 5, marine economy 4, full profile 21). `diff-hazard.js`: 54 files identical.

### Text pass, third revision round (PR #32)

Snapshots are unchanged in this round (`git diff HEAD -- site/data` empty); against a49e5a9 only the 40 label lines of the second round differ; `diff-hazard.js` finds 54 files identical.

**Marine headline for partial totals.** A marine (or total economy) jobs total that leaves a withheld sector out is a floor, because withheld sectors only add jobs. The first slide now always has a headline:

- **Complete total:** the exact share, as before.
- **Partial total, floor share at least 0.1%:** "More than N% of total employment in [County] County is in the marine economy." N is the partial total over the same denominator as the complete-case headline, rounded down to one decimal. The headline is the number "N%" with a small "More than" above it and the rest of the sentence beside it, so it reads as one sentence for a screen reader and in print.
- **Otherwise:** "More than [J] jobs in [County] County are in the marine economy." J is the partial total rounded down to two significant figures (a total under 100 is shown as it is).
- The floor headline carries no ≈ mark (revised in the fourth revision round): "More than" already says the figure is not exact. An estimated figure keeps its ≈ everywhere else. The repeat-of-a-chart-figure guard does not apply to these floor headlines (they are deliberately rounded down).
- Only a wholly withheld jobs total (reason `jobs-withheld`) has no headline; no shipped snapshot has one. The build check is unchanged in force: a section that normally has a headline must have one or give a `calloutSkip` reason, and with this change a marine "If you can't measure it" deck cannot lack a headline unless its whole jobs total is withheld. Verified over every built page: 0 of 43 economy first slides lack a headline (marine 23, total 20); 27 exact, 16 floor.
- Nothing on the data and citation slide described the headline, so nothing there changed. The About page and `docs/COUNTY-PROFILES.md` now say that a headline from a partial total is a floor, and that the largest-sector headline and the Total Jobs sentence are still left out when a sector is withheld.

**The 16 decks that gained a headline.** All use the share form; none had a floor share under 0.1%, so the "More than J jobs" form is not used by any shipped deck (it is covered by synthetic tests: 769 jobs over a million gives "More than 760 jobs", 17,516 gives "More than 17,000", 999,999 gives "More than 990,000", 7 gives "More than 7").

| County | Headline | Jobs tile (the partial total) |
|---|---|---|
| Contra Costa | More than 4.6% | 17,516 |
| Del Norte | More than 11.1% (no ≈ on the headline; the jobs tile keeps its ≈) | ≈ 932 |
| Humboldt | More than 7.2% | 3,809 |
| Marin | More than 9.7% | 10,741 |
| Mendocino | More than 6.3% | 2,025 |
| Monterey | More than 8.0% | 15,990 |
| Napa | More than 0.9% | 769 |
| Sacramento | More than 1.2% | 9,166 |
| San Francisco | More than 6.9% | 48,483 |
| San Joaquin | More than 10.0% | 29,055 |
| Santa Barbara | More than 7.8% | 16,978 |
| Santa Clara | More than 0.7% | 8,255 |
| Santa Cruz | More than 9.5% | 9,967 |
| Solano | More than 5.3% | 7,744 |
| Ventura | More than 5.5% | 18,584 |
| Yolo | More than 3.4% | 3,744 |

Where tourism and recreation is the withheld sector (Napa, Sacramento, San Joaquin, Yolo and others) the floor is far below the likely truth; the statement is still true, and the asterisk and key on the tiles say sectors are withheld.

**Re-run.** Display target, all 27 county directories: 0 problems over 1,952 slide checks at 1280 × 650, 1366 × 768, 1440 × 900 and 1920 × 1080. axe-core (light and dark, four counties, all topics): no violations. Print-colour audit: San Francisco, Humboldt, Napa, Santa Barbara, Orange and Yolo match. Print pages unchanged (marine economy 4, full profile 21). No em dashes.

### Text pass, fourth revision round (PR #32)

Snapshots unchanged (`git diff HEAD -- site/data` empty; against a49e5a9 only the 40 label lines of the second round differ); `diff-hazard.js` finds 54 files identical.

1. **No ≈ on a "More than" headline.** The floor headline ("More than N%" or "More than J jobs") no longer carries the ≈ mark, in the markup or in the screen-reader text (no "Estimated:" is read before it). Del Norte is the one shipped case; its headline now reads "More than 11.1% of total employment in Del Norte County is in the marine economy." and its Jobs tile keeps its ≈. Estimated figures everywhere else keep ≈ (tiles, chart labels, the exact-share headline). Nothing on the data and citation slide ever described the headline's mark; the DECISIONS notes and `docs/COUNTY-PROFILES.md` that did now say a floor headline never carries it.
2. **Total Jobs sentence (total economy and marine economy; the same code serves both).** "# self-employed [sector] workers in [County] County, more than any other sector." became "# [sector] workers in [County] County are self-employed, more than any other sector." The number stays the headline figure, only the sector name is bold (lowercase, as before), a count of 1 reads "1 [sector] worker in [County] County is self-employed, ...", and a tie still reads "..., tied for the most of any sector." The screen-reader text is the figure followed by that sentence; the print block uses the same markup. The old sentence appeared in the "Every changed string" table (row 24), now revised; nowhere else in the docs.
3. **Re-run.** Display target, all 27 county directories: see below. axe-core, print-colour audit and `diff-hazard.js` repeated; results in the PR description.

### Text pass, fifth revision round: the Wages headline and withheld sectors (PR #32)

Text and logic only. Snapshots are byte-identical to HEAD (`git diff HEAD -- site/data` empty; against a49e5a9 only the 40 label lines of the second round differ); `diff-hazard.js` finds 54 files identical.

**The error.** The headline "[Sector] has the lowest average wage per job in [County] County." ranked only the sectors whose county wage is shown. When a sector's county wage is withheld it cannot be ranked, so the sentence could name the wrong sector: Napa marine said Marine transportation, while Tourism and recreation (whose Coastal California value is on the chart) is lowest there; Del Norte named Tourism and recreation with three sectors withheld.

**The rule, for both wages slides:**

1. Every sector's county wage shown (published or estimated): "**[Sector]** has the lowest average wage per job in [County] County.", ranked by county wage.
2. Any sector's county wage withheld, for any reason: "**[Sector]** has the lowest average wage per job in coastal California.", ranked by the Coastal California comparator across all sectors.
3. The headline never carries ≈, in either form, including when the lowest wage is estimated (the dot keeps its dashed ring on the chart).
4. A sector with no Coastal California value is left out of the comparator ranking, and the comparator sentence is still used. If no sector has one, no ranking is stated: "Average wages are shown for [n] of [N] sectors in [County] County." This case occurs in no shipped snapshot and is covered by a synthetic test.
5. Ties are broken by sector name in both forms, with the same wording (a tie never changes the sentence). A county with fewer than two sectors has no headline, reason `too-few-sectors`.
6. Screen reader, print block and everything else read the same sentence (it is one paragraph in the shared markup). The wages chart's accessible table and its heading carry no "lowest" text and the data and citation slide never mentioned the headline, so no other text needed to change; the earlier DECISIONS notes that said the lowest is taken among shown county wages, or that an estimated lowest wage gets ≈, are marked superseded.

**Check.** An independent derivation from the 27 snapshots (not the build's code) gave the expected headline for all 43 county-topic Wages slides, and the rendered headline matched every one, with no ≈ on any (0 mismatches). 26 slides use the county sentence and 17 the comparator sentence.

| Case | Rendered headline |
|---|---|
| Del Norte marine (estimated, three sectors withheld) | Tourism and recreation has the lowest average wage per job in coastal California. |
| Napa marine (three sectors withheld) | Tourism and recreation has the lowest average wage per job in coastal California. |
| Los Angeles marine (every county wage shown) | Tourism and recreation has the lowest average wage per job in Los Angeles County. |
| Sonoma marine (every county wage shown; county-lowest Ship and boat building, Coastal California-lowest Tourism and recreation) | Ship and boat building has the lowest average wage per job in Sonoma County. |
| San Francisco total economy | Leisure and hospitality has the lowest average wage per job in San Francisco County. |

Sonoma is the case where the two rankings differ: the county form is correct there because every county wage is shown, and the comparator form appears only when a county wage is withheld. Synthetic cases: three sectors with one county wage shown and no comparator gives "Average wages are shown for 1 of 3 sectors in Test County."; a comparator tie (Zed and Abe equal) gives Abe; a sector missing its comparator is skipped; an estimated lowest county wage gives the county sentence with no ≈.

**Re-run.** The display-target script now also loads 1280 × 800 (1920 × 1200 at 150%): all 27 county directories at 1280 × 650, 1280 × 800, 1366 × 768, 1440 × 900 and 1920 × 1080: 0 problems over 2,440 slide checks. axe-core (light and dark, Santa Barbara, San Francisco, Humboldt, Napa, all topics): no violations. Print-colour audit on San Francisco, Humboldt, Napa, Santa Barbara, Orange, Yolo, Del Norte and Sonoma (economy pages included): all match. `diff-hazard.js`: 54 files identical. No em dashes.

**Needs Peter's call:** the Wages headline switches to coastal California when any county sector is withheld.

## Behavior

### Nominatim: submit only
Search runs on submit, never per keystroke, because Nominatim's usage policy forbids autocomplete. Results are biased to a California viewbox and limited to the US.
