# County Profiles

A third CASCA tool, rebuilding the function of NOAA's discontinued [Coastal County Snapshots](https://coast.noaa.gov/digitalcoast/tools/snapshots.html) for California, at the county level: flood hazard, sea-level-rise, total-economy and marine-economy exposure, for 27 counties. The map answers "where is the hazard?", the comparison tool answers "which tool should I use?", and County Profiles answers "what does this mean for my jurisdiction?"

This file tracks the tool as it's built. The full design — county spine and coverage tiers, the availability model, sea-level-rise framing against OPC scenarios, the vintaging and snapshot-archive rules, the build pipeline, and the implementation plan — lives in the project's own spec document; this doc is filled in with that content, section by section, as each phase lands, per [`ARCHITECTURE.md`](ARCHITECTURE.md#documentation-conventions) ("update the relevant doc in the same change as the code").

## Status

Phase 1 (data model and county spine) is built. There are no network calls and no spatial computation yet. Exposure figures come from hand-written fixtures with invented numbers; the one real dataset is the sea-level-rise timing table, which is computed from the committed OPC reference file.

A county's pages read a real snapshot from `site/data/county-profiles/latest/` when one exists and fall back to a fixture in `site/_data/countyProfileFixtures/` otherwise. `latest/` does not exist yet. A county with neither still gets a landing page, showing its tier's coverage and no topic pages. A fixture page names which of its sections are placeholder; that list is derived, not written.

The site deploys at the root of `https://seachangeatlas.org` (see [`ARCHITECTURE.md`](ARCHITECTURE.md)); County Profiles builds every internal link with the `url` filter and every absolute URL (canonicals, citations, the JSON download link) from `site.url`, and `scripts/county-profiles/validate.js`'s `checkNoStaleHost` fails the build if the old GitHub Pages host or path prefix leaks into the output.

## Routes

Nested under `/county-profiles/`, consistent with how `/map/` and `/compare/` are grouped. One page per topic, not one page per county:

| Route | Page |
|---|---|
| `/county-profiles/` | Index: all 27 counties with a coverage matrix and the county-selection explainer |
| `/county-profiles/county/<id>/` | County landing page: header, each topic's headline figure and a link to its page (or its reason, in place), earlier snapshots |
| `/county-profiles/county/<id>/<topic>/` | Topic deck: a full-width, one-topic-per-page presentation. `<topic>` is `flood-hazard`, `sea-level-rise`, `total-economy` or `marine-economy` |
| `/county-profiles/county/<id>/<date>/` | Dated landing page, canonical to the current landing page |
| `/county-profiles/county/<id>/<date>/<topic>/` | Dated topic deck, canonical to the current topic deck |
| `/county-profiles/about/` | Method: the timing table, gauge assignments, withheld values, why marine jobs at risk are not published, the methodology changelog |
| `/county-profiles/county/<id>/<topic>.pdf` | Per-topic PDF, current snapshot only (planned) |
| `/county-profiles/county/<id>/profile.pdf` | Full-county PDF (planned) |

A topic the county has no data for at all — unavailable per its tier, or simply not built yet — gets no page at all; its tab in the deck's top bar is disabled (not removed), and the landing page states its reason in place. An unknown county, an unknown date or a topic with no page 404s, since nothing generates a route for it. Dated pages render now, for the current (only) snapshot; older ones accumulate in Phase 5.

Snapshot JSON is served by the site-wide `data/**/*.json` passthrough, so a real snapshot in `site/data/county-profiles/latest/` is at `/data/county-profiles/latest/<fips>.json`. Phase 1 also passthrough-copies the fixtures to that same path, so a fixture county's "Download this snapshot (JSON)" link resolves too; remove that passthrough once Phase 2 writes real files there. Each topic deck has one stable anchor per section (`#s-people-at-risk`) and a closing `#s-about` slide. A shareable sea-level-rise increment view is `?slr=<feet>`, default 2.

Archived dated snapshot pages must not dilute search ranking for the current one once older ones exist — see the SEO note below.

## File layout

- `site/county-profiles/`: Eleventy templates — `index.njk` (the statewide index), `county.njk`/`county-snapshot.njk` (the landing page, current and dated), `topic.njk`/`topic-snapshot.njk` (the topic deck, current and dated), `about.njk` (methodology).
- `site/_includes/county-profiles/`: `landing.njk` (the landing page body, shared by current and dated), `deck.njk` (the topic deck body, shared by current and dated), `blocks.njk` (the landing page's unavailable block and sources line), `blocks-deck.njk` (every deck chart macro: rings via `share-ring.njk`, stacked bars, stacked-by-increment bars, 100%-stacked bars, grouped columns, the wages dot plot, the sea-level-rise curves, the gap block and sources line), `share-ring.njk` (the share ring macro, used by both).
- `scripts/county-profiles/sector-icons.js`: the sector → Material Symbols icon mapping (one per total-economy and marine-economy sector), pulled from `@material-symbols/svg-400` at build time and drawn inside a wide-enough Diverse Economies bar segment.
- `site/js/county-deck.js`: the deck's dot nav, keyboard paging (Page Up/Down, arrow keys), the snap on/off toggle, the sea-level-rise timing chart's Chart/Table switch, the three sea-level-rise increment sliders (timing chart, People at Risk, Flooded Facilities — one shared `wireSlider()` drives each slider's fill, value badge and `aria-valuetext`, and calls that chart's own `select(ft)`) and the timing chart's `?slr=` sync, the per-mark tooltip for the denser charts, and the citation Copy button. Every chart and every increment state is rendered at build; this script only shows or hides what is already there.
- `site/_data/countySpine.json`: the hand-authored county spine. It is in `_data/` because `site/data/county-profiles/` holds generated snapshots only.
- `site/_data/opcGaugeProjections.json`: Appendix F of the 2024 California Sea Level Rise Guidance, hand-transcribed (14 gauges, 5 scenarios, 13 decades from 2030 to 2150, feet, baseline 2000, median, vertical land motion included).
- `site/_data/countyProfileFixtures/`: placeholder snapshots (`"fixture": true`), used only where `latest/` has none.
- `site/_data/countyProfiles.js`: loads the spine, schema, reference table and snapshots, validates them, runs the build assertions and derives what the templates use: the county list, tier groups, coverage matrix, per-topic section models, the "sources used on this page" table and the topic-deck pagination data (`topicPages`). Templates restate none of those.
- `site/data/countyProfileSchema.json`: the schema (below).
- `site/data/county-profiles/`: snapshot JSON (`latest/`; `<date>/` later), pipeline output only. Committed for the archive's git-history backstop and never hand-edited.
- `scripts/county-profiles/`: non-Eleventy tooling. `validate.js` (the snapshot validator, plus `checkNoStaleHost`, run in an `eleventy.after` hook over the whole built site; the Phase 2 pipeline should call `validateSnapshot` before writing a file), `section-models.js` (turns a section's data into its visual and its `{figure, caption}` callout, and enforces the callout rule), `timing.js` (the timing method), `format.js` (number, vintage and citation-date formatting) and `template-helpers.mjs` (chart geometry behind the `ring`, `barChart`, `stackedBars`, `stacked100Bars`, `groupedColumns`, `dotPlot` and `slrCurves` filters). Later: fetchers, the intersect pipeline, the `EFF_DATE` gate, the PDF renderer.

Any validator error, failed assertion, stale-host reference or repeated callout figure fails the build.

## Data model

`site/data/countyProfileSchema.json` is the source of truth for the snapshot shape (`snapshotShape`), the availability rules, the tiers, the topics and their sections (including NOAA's prose), the section kinds and the reason codes. One snapshot file describes one county. This section explains the choices; read the schema for the fields.

- **Vintage has three kinds, and it is what the data describes, not when it was fetched.** `{kind: "date", date}`, `{kind: "period", start, end}` and `{kind: "year", year}`, or null only where a source publishes none (the page then says "no published vintage"). NFHL is a period, the earliest to the latest panel `EFF_DATE`. ACS, LODES and ENOW are years; ACS uses the Census API vintage key, which is the dataset's final year. `retrieved` (when the build fetched it) and `verified` (when the endpoint last answered) are never null and appear only in the Data and method table, never inline — every figure on these pages is built, not live, so "live from source" is not said anywhere. Inline source notes show the dataset name and the vintage in a distinct colour ("FEMA National Flood Hazard Layer (2009–2018)"); the Data and method table shows the full form.
- **`method` is a monotonic integer.** It increments when a pipeline change could move a number while the source data stays put (switching the intersect from block centroids to areal weighting, changing the rollup geography, fixing an aggregation bug). It does not increment for a new section, a restyle or an added county. Snapshots with different `method` values are never joined by a trend line. It is shown on every county page.
- **`geometry` is null in Phase 1.** It is provisioned so the inset map can later hold `{"nfhl": "nfhl-2009-12-03"}`, a reference to geometry versioned by source vintage and shared across snapshots, without a schema migration.
- **Availability is explicit.** Every topic and section has `available` and `reason`; `reason` is non-null if and only if `available` is false. An unavailable topic has no sections; an available topic has exactly its schema sections, and an unavailable section renders its reason in position.
- **Three value states, never conflated.** *Zero* is `available: true` with the value 0, and renders solid as a finding. *Suppressed* is a value the publisher withholds (ENOW does this for confidentiality): `{"suppressed": true}` in place of a number, allowed only in the two ENOW-sourced economy topics, rendered as "withheld" (dotted, muted). A total with a suppressed component is stored as `{value, partial: true}`, the validator checks `partial` is true if and only if a component is suppressed, and anything derived from a withheld value carries an asterisk and a footnote. *Unavailable* is a whole section or topic with a reason, rendered as a dashed block.
- **`use: {ui, pdf, present}`** on each section says which output it appears in. Phase 1 honours `ui`; the sea-level-rise curves graph is `pdf: false` in the schema and is hidden in print (the timing table is what prints).
- **Tier rules are data.** `tiers` in the schema gives each tier's expected topic availability and reason, and a snapshot must agree with its tier. The index coverage matrix is drawn from that rule, or from the snapshot when there is one (validated to be identical).
- **Fixtures.** The validator requires `"fixture": true` on a fixture and forbids it on a real snapshot, so a fixture cannot be promoted into `latest/` by accident.

### Reason codes

A closed set of five, each stating a rule (the wording is in the schema's `reasons`):

| Code | Meaning |
|---|---|
| `outside-enow` | Outside ENOW's economic county definition |
| `not-shore-adjacent` | On ENOW's list but outside its shore-adjacent definition; the delta counties' total economy |
| `no-slr-extent` | No significant sea level rise inundation extent in this county |
| `no-nfhl-coverage` | No effective NFHL coverage for this county |
| `source-geography` | The source dataset does not extend to this geography |

`no-nfhl-coverage` is not yet used by any tier or fixture.

## Sections

The four topics follow NOAA Coastal County Snapshots' section lists. Each topic opens with NOAA's own intro paragraph (`topics[].intro` in the schema), directly under its `<h2>`. Each section then has a heading, prose, a visual, one callout and a one-line sources note; the section map is in the schema (`topics[].sections[]`) and the visual by kind in `sectionKinds`. Section headings and prose are NOAA's own text, a U.S. federal work, taken from the live snapshot pages, verbatim except for the adaptations below.

**Headings are NOAA's, including capitalisation** ("People at Risk", "If You Can't Measure It, You Can't Protect It", "When Is the Time to Act? Now!"), with one exception: the total-economy jobs section is retitled "Coastal Jobs Are Vulnerable", adapted from NOAA's "Coastal Businesses Are Vulnerable".

Adaptations, and only these:

- Flood *A Better Future is a Greener Future* uses NOAA's screen-view paragraph ("How do past development trends…"), not its print-view paragraph (which duplicates the Homes at Risk text by mistake — the original bug this rebuild avoids). SLR *Creating a Better Future* keeps NOAA's own paragraph ("Make it a goal…"). No two sections share a paragraph, except where NOAA's own live tool genuinely reuses the same closing sentence for structurally parallel sections across topics (the "Being Underwater" jobs sections in flood and SLR both carry "Flood-related losses of services, revenues, and salaries can hit a community hard.", and the "Total Jobs" sections in total and marine economy both carry the self-employed/fishermen paragraph) — those are NOAA's own repeats, not errors, and are kept as NOAA's verbatim text rather than paraphrased apart.
- The marine intro drops "and Great Lakes", and its disclaimer ("Total coastal economy… covered in another snapshot") is folded into the topic intro and points at the total-economy section on the same page.
- Business sections become jobs sections, with a "jobs, not businesses" line, because business locations are licensed data (LODES job counts replace them). NOAA's measuring sections ("If You Can't Measure It…") carry no prose of their own, matching the live tool.
- The timing section names the assigned gauge instead of NOAA's "closest gauge to your county", and drops NOAA's sentence about which projection set it uses.

**Marine jobs at risk is not published.** No open source isolates marine jobs by location: LODES is 2-digit NAICS and ENOW's marine sectors go to 6 digits. This is stated on `/county-profiles/about/`.

### The callout rule

Each section's callout is `{figure, caption}`, shown as a large figure with the caption beside it, above the section's visual (`.cpd-bign` in the deck). `figure` is a short value built from a number already in the section's own data, so it can't drift from the chart; `caption` is a full sentence naming the county that completes the figure's thought. A callout's figure never repeats a value the chart draws as its own visible, labelled text — it reframes against a different denominator, aggregates what the visual breaks out, gives the leading edge (the lowest sea level rise increment), or names the top category. A section with no visual (a jobs-at-risk section) carries `{figure, caption}` alone. `section-models.js` tracks, per section, exactly the text a chart draws as visible labels (not its accessible table, which necessarily mirrors every value and would make the rule impossible to satisfy) and throws if a callout's figure matches one, so a data change that would make a callout repeat a displayed figure fails the build. Charts with no visible per-value labels at all (the economic-diversity 100%-stack, the wages dot plot) can freely use any real number as a callout figure.

One deliberate, documented exception: SLR *People at Risk* renders as grouped columns of counts (only the highest increment's column is labelled), so its caption states the headcount at the lowest increment alongside a share the columns never show ("(5,260 people) … 0.2%"). The headcount is technically the same number the first (unlabelled) column represents, but nothing about the *share* is repeated, and the count is what makes the share legible — `section-models.js` does not register it against the repeat guard, with a comment explaining why.

### Charts

Every chart is hand-rolled SVG on `d3-scale` and `d3-array` (build-time devDependencies, scale, tick and extent maths only) and rendered fully at build time. Only the sea-level-rise timing chart ("When Is the Time to Act?") offers a Chart/Table switch — it is the only section where NOAA itself publishes both a table and a graph. Every other chart stands alone: its accessible data table is always in the markup, reachable only via an `sr-only` heading immediately before a plain `<table>`, never a visible toggle. The timing chart's switch (`site/js/county-deck.js`) toggles a `.cpd-pane-hidden` class, not the `hidden` attribute, because both panes share one CSS Grid cell (`.cpd-timing-stage{display:grid}`, each pane `grid-area:1/1`) so the grid sizes to whichever view is taller and the source line never jumps when the switch is pressed. Bars and columns are at most 34px thick, with a 6px rounded corner at the data end and a square baseline end (`rectPath`/`columnPath` in `template-helpers.mjs`); stacked segments have a 3px background gap between them. A chart with two or more series or segment types shows a legend. Colours come from CASCA's custom properties in `site/css/style.css`; ordinal series (the five sea level rise increments, the three OPC scenarios) use a dedicated five-step teal ramp (`--ramp-0`…`--ramp-4`, light-to-dark, defined for both themes) rather than the categorical palette, and text never takes a series colour. `svg [hidden]{display:none}` is what actually hides a `<g>`/`<text>` marked `hidden` — SVG has no UA rule for `[hidden]` the way HTML does, so every conditionally-shown mark in the deck depends on this one rule. A value label drawn inside a mark's own fill (the 100%-stack's headline segment) picks white or ink from that fill's own hand-verified luminance (`--onfill-headline`, per theme) rather than the theme's default text colour; labels outside any fill keep the ordinary text tokens. An end-of-bar value sits at its bar's own vertical centre (`dominant-baseline:middle`, and the geometry's own `midY`), not baseline-minus-a-few-px. Every mark carries its value: sparser charts (Homes at Risk payouts) use a native SVG `<title>`; denser ones (economic diversity, the wages dot plot, the SLR grouped columns) carry a `data-tip` attribute and use the shared styled `.cpd-tooltip` (`site/js/county-deck.js`) instead, since native tooltips are slow and unstyled at that density.

**Chart sizing.** Every chart draws in a viewBox close to 1000 units wide — matching the panel's real rendered width, roughly — with height set by content: row count for the bar-style charts, about 0.4 of the width for the column and line charts as a starting point. `.cpd-chart svg` carries no `max-height`, with one deliberate exception (the wages dot plot — see below). Both the viewBox-matches-panel rule and the no-max-height rule matter together: a narrow viewBox (the old ones ran 420–600 wide) forced into a much wider container, height-capped on top of that, makes the browser shrink the whole drawing to fit and letterbox it with gutters and undersized text — see docs/DECISIONS.md. Font sizes inside the SVG are chosen so on-screen text clears 14px at the panel's narrowest realistic width (~700px at a 1400px viewport), which is why they read roughly twice the old chart's raw numbers even though the visual proportions are the same.

The generic "0.4 of the width" column/line-chart ratio and the shared type scale are a starting point, not a rule every chart must inherit uninspected: SLR People at Risk (the sole remaining `groupedColumns` caller) draws at its own 1000x300 with a `.cpd-col-chart` class setting its own (smaller) axis/group/value text so it renders at the same size as Flooded Facilities' ticks and row labels, and the timing chart draws at 1000x320 with its own margins — both came out looking too tall and too small at the shared ratio, since a 3-group column chart and a 150-year line chart don't actually need the same vertical room. The wages dot plot keeps a `max-height` on its `.cpd-chart-dotplot` wrapper (52vh) — at up to 11 rows it ran taller than the panel at 1400px and below and clipped at the bottom; a tighter row height (`dotPlot()`'s `rowH`) does most of the work and the cap is there for whatever it doesn't cover.

A chart's title/caption and its legend are centred over the chart's own width (not the panel — though the two are usually the same width, since `.cpd-chart` and its siblings all span the panel). The timing chart's title shares a `.cpd-fighead-centered` row with its Chart/Table switch and stays centred over the chart.

**Increment sliders.** The three sea-level-rise charts with an increment choice (timing chart, People at Risk, Flooded Facilities) share one `incrementSlider` macro: a NOAA-style vertical `<input type="range">` to the chart's right (`.cpd-chart-row`), stepping only through 2/4/6/8/10 ft, labelled "Sea level rise", with the current value in an `<output>` below it (announced on change via its implicit status role) and mirrored in `aria-valuetext`. It's made vertical with `writing-mode:vertical-lr; direction:rtl` (Chrome no longer honours `-webkit-appearance:slider-vertical`). The input is exactly as wide as its thumb, so the thumb is centred on the 8px track by construction; the track and its fill are a centred background strip whose filled part ends at the thumb's centre (`--cpd-slider-frac`, set by `county-deck.js`). The track spans exactly the chart's plot area — bottom on the x-axis, top on the top gridline — with "Sea level rise" beside it, reading bottom to top, and the chart's legend below the whole row. Each macro passes its plot area's top and bottom as fractions of the viewBox width (`--cpd-plot-top`/`--cpd-plot-bottom`); `.cpd-chart-row` is a size container, so the SVG's rendered width is known in CSS (`100cqw` less the slider and gap) and the offsets are exact at any width. Everything inside the slider is absolutely positioned, so it adds no height of its own and the row stays exactly as tall as the SVG.

Horizontal bars (`bars`, `stackedBars`, `stackedByIncrement`), 100%-stacked bars and the dot plot put their row labels in a left column rather than stacking them above each row — sized to the longest label for the bars, but a fixed width for the dot plot, whose longer sector names wrap to two balanced lines (`wrapTwoLines()`) so short names aren't stranded in empty space; a bar/dot's own domain runs to the real data max rather than a `.nice()`-rounded one, so the fullest bar reaches the plot's actual edge (this needs deliberate right-margin room for the end-of-bar label, or the fullest bar's label renders past the SVG's own viewBox and disappears). Each of the first three shows exactly one value at the end of its bar — NOAA's own end-of-bar convention — chosen per chart by `section-models.js`: an abbreviated dollar amount for Homes at Risk, the share inside the floodplain for critical facilities, the natural share for land cover, the count exposed at the selected increment for Flooded Facilities. Every segment's exact figure stays in its tooltip/`<title>` and the accessible table regardless.

Rings render in exactly two sections — flood *People at Risk* (independent shares of population, over-65 and poverty) and flood *A Better Future is a Greener Future* (development added 1996–2016 as a share of land developed by 2016, one ring inside and one outside the floodplain, captioned "Share of land that is natural…" since the ring's own label names the *area*, not what the arc measures). A ring's own label (the figcaption's `.share-label`) is body size or larger; the "count of total" detail line beneath stays small and muted. Every other section uses one of:

- **Grouped/simple bars** (`bars` macro, `barChart` filter): NFIP payouts by period only, now that wages and the SLR increment sections have their own chart forms below.
- **Absolute stacked bars** (`stackedBars` macro/filter): flood critical facilities (inside vs. outside the floodplain, by type) and SLR natural landscapes (one bar per increment, wetland/upland/other in square miles), each segment sized to its real value on a shared scale. An optional `segClasses` array (set by `section-models.js`, not the macro) picks each segment's swatch by index instead of the default cycling palette — land cover uses it so the natural classes (wetland, upland) carry the colour emphasis and "Other" is a muted neutral.
- **Horizontal bars stacked by increment** (`facilitiesStack` macro, `stackedByIncrement` filter): SLR Flooded Facilities. NOAA pattern — each facility type is one bar split into "exposed at the selected increment" and the rest of that type as a muted "not yet exposed" segment, so the type's true total (which varies by two orders of magnitude between types) stays visible however small the exposed share is. A type's total doesn't change with the increment, so every increment's split is precomputed as its own `<g data-cpd-fac-state>` and an increment slider, identical to People at Risk's, shows one state's segments and label per row at a time.
- **100%-stacked bars** (`stacked100Bars` macro/filter): economic diversity, four bars (establishments, wages, employment, GDP) sharing one sector order and colour set, each scaled to 100% *of the sectors actually known* — a withheld sector has no value to give it a width, so it is left out of the bar entirely (named in the section's footnote, not drawn as a placeholder) and the real sectors scale to fill 100% among themselves. That denominator (present sectors only) is the same one the section's callout uses, so the two figures can't disagree — see the "one denominator rule" decision below. Only the headline sector (the one named in the big number, passed through as `headline`) is coloured and gets an inline % label, using the same glyph's *filled* Material Symbols variant for its icon; every other sector is one of two alternating neutral shades, using the *outlined* variant. Any segment wide enough (a fixed width threshold, independent of whether it's the headline) carries its sector's icon (`scripts/county-profiles/sector-icons.js` — see below); narrower segments are identified only by the legend (which shows every sector's icon too) and the tooltip. Bars are 44 units thick, taller than the deck's other charts, so the icon (30 units) and the row have real presence rather than sitting in a thin strip at the top of the panel.
- **Vertical grouped columns** (`columns` macro, `groupedColumns` filter): SLR People at Risk, one column per increment per group. Only the selected increment's columns take their ramp colour (`.cpd-col-active`); the rest share one muted tone. Each column's value sits in a fixed row above the plot area, in full-contrast ink rather than on the fill, and only the selected increment's labels are visible; an `increments` argument renders the increment slider to choose which, defaulting to the highest.
- **Dot plot** (`dots` macro, `dotPlot` filter): average wage per sector, one row per sector (named in a fixed-width text column) with a dot each for county, coastal California and coastal U.S., a thin line spanning the row's real values, a vertical gridline at each x-axis tick, and a horizontal guide line along each row from the label column across the plot.
- **Sea level rise curves** (`curves` macro, `slrCurves` filter): the three OPC scenario curves for the county's gauge, named in a legend below the chart (not at the curves' ends, which freed the right margin for the plot), and an increment slider (2/4/6/8/10 ft). All five threshold overlays (line, crossing dots, drop lines) are precomputed and embedded, drawn twice: once as a muted gridline set (`.cpd-thresh-muted`/`.cpd-xlab-muted`, one `<g data-cpd-muted>` per increment, the selected increment's own muted twin hidden so its label isn't doubled) and once as the bold, selected-only overlay (`.cpd-thresh`/`.cpd-xlab`, one `<g data-cpd-state>` shown via `hidden` at a time), so only the picked increment reads as emphasized. Beneath the chart, the crossing years for the selected increment read as a small three-item stat row (scenario name above, year below — `.cpd-readout-stats`, the same visual language as `.cp-stats`) rather than an inline sentence; a scenario that doesn't reach the increment by 2150 reads "after 2150" in muted body text instead of the stat's serif number. The slider syncs `?slr=`. The crossing years come from the same interpolation as the timing table, so the two can never disagree. The table view is the timing table itself, and this is the only chart with a Chart/Table switch (see above).
- **Stats, equation, stat pair**: plain figures, no chart. Values spread across the panel in equal columns (`repeat(auto-fit, minmax(...))`, not a fixed column count, so a 2-item row like marine economy's stat pair still fills the panel width). A withheld stat is dropped from its row entirely (not drawn as "Withheld*") and the section's footnote names it instead — GDP being withheld for one topic doesn't mean it takes up a slot saying so; Establishments/Jobs/Wages/GDP is a genuinely different-shaped row when GDP is missing, not the same row with one greyed-out cell. The Total Jobs equation (Employed + Self-employed = Total) only renders when self-employed is known; when it's withheld, the section shows one plain line instead ("17,030 people employed in this industry (self-employed count withheld).") — a "total" that just repeats "employed" with an unknown addend would be misleading arithmetic. The section's callout is independent of this and renders either way. A stat-pair section (Coastal Jobs Are Vulnerable) has no big number of its own, so its two stats *are* the slide's content: they render at `.cpd-fig` scale, centred as a group, and the section's explanatory prose moves below as a footnote instead of sitting above the numbers as a note.

**Sector icons.** `scripts/county-profiles/sector-icons.js` maps each of the 17 sectors (the 11 total-economy ones and the 6 marine-economy ones) to a [Material Symbols](https://github.com/marella/material-symbols) icon name and reads both its outlined and filled SVGs from `@material-symbols/svg-400` (a devDependency; Apache-2.0, credited in `site/_data/credits.json`) at build time — `fs.readFileSync`, not hand-drawn, and not a runtime fetch. `fill:currentColor` on `.cpd-sector-icon` (and `.cpd-onfill-headline`'s own contrast token, for the headline sector specifically) recolours the icon the same way a text label would be recoloured for the fill it sits on. No glyph in the set is a literal match for a two-word sector or for "mining"/"oil"; the picks and reasoning are in docs/DECISIONS.md.

| Sector | Icon |
|---|---|
| Construction | `construction` |
| Financial activities | `account_balance` |
| Education and health services | `school` |
| Information | `cell_tower` |
| Leisure and hospitality | `beach_access` |
| Manufacturing | `factory` |
| Natural resources and mining | `landscape` |
| Other services | `handyman` |
| Professional and business services | `work` |
| Public administration | `gavel` |
| Trade, transportation, and utilities | `local_shipping` |
| Living resources | `set_meal` |
| Marine construction | `construction` |
| Marine transportation | `directions_boat` |
| Offshore mineral resources | `oil_barrel` |
| Ship and boat building | `anchor` |
| Tourism and recreation | `beach_access` |

## Sea level rise timing

Exposure increments are NOAA's: 2, 4, 6, 8 and 10 feet (`increments` in the schema). "When is the time to act?" is a table whose rows are increments and whose columns are the Intermediate, Intermediate-high and High scenarios; each cell is the year the increment is reached at the county's assigned tide gauge. It depends only on the committed reference file, so it is real data, not a placeholder, and it is computed at build rather than stored in a snapshot.

**Method** (`scripts/county-profiles/timing.js`): piecewise-linear interpolation between the Appendix F decades, starting from 0 ft in 2000, rounded to the year; an increment not reached by 2150 is shown as "after 2150" (the internal sentinel is `>2150`, from `timing.js`'s `BEYOND` constant). It uses the median projection.

**Validation.** The build asserts the San Francisco gauge table:

| Increment | Intermediate | Intermediate-high | High |
|---|---|---|---|
| 2 ft | 2083 | 2067 | 2060 |
| 4 ft | 2113 | 2092 | 2079 |
| 6 ft | 2150 | 2115 | 2096 |
| 8 ft | after 2150 | 2148 | 2112 |
| 10 ft | after 2150 | after 2150 | 2131 |

Against NOAA's published San Francisco County table (2022 report, which stops at 2100), every year NOAA shows matches except High at 4 ft, which is a year off (2080 there, 2079 here); the cells NOAA shows as ">2100" are all later than 2100 here.

**Curves view.** Screen only (`use.pdf: false`). Scenario curves over time, an increment slider (2/4/6/8/10 ft), a threshold line with crossing dots and drop lines, a readout sentence, and `?slr=4` in the URL to share a view — see "Charts" above. The table is the default and is what prints. A flood-only or delta county has no sea level rise topic and so no timing table or curves.

**Gauges and straddling.** Each county has a reference `gauge` and, where a second regime applies, an `altGauge` in the spine (Sonoma and Marin: San Francisco; San Mateo: Alameda; Los Angeles: Santa Monica). Whether a county *straddles* is computed at build, never authored: it straddles when any of the 15 cells differs by 5 or more years between the two gauges' tables, or one gauge reaches an increment by 2150 and the other does not. A straddling county shows both tables and a generated note. The build asserts San Mateo is the only county that straddles.

## County spine

`site/_data/countySpine.json` holds the 27 counties (fips, slug, name, tier, gauge id, optional alt gauge) and the gauge names. The tier counts and the county-selection explainer on the index page are derived from it, so the lists of counties per tier are not repeated here; see the index page. Gauge assignment is an editorial call, following the spec's table.

## The topic deck

Each topic is a full-width, one-topic-per-page deck (`site/_includes/county-profiles/deck.njk`) — an app-shell page like `/map/`, not a document inside `.wrap`/`.main`. A fixed top bar opens with the CASCA logo (linking to the site root) and a divider, then the county crumb — "County Profiles" is itself a link back to the index — then the four topic tabs (a tab with no page is disabled, not removed), the data-as-of stamp and a Print button; a left-edge dot nav lists the slides. Below 600px the logo stays and the wordmark text next to it drops. A title slide (the topic's NOAA intro plus a contents list) is followed by one slide per section and a closing *About this data* slide.

Each section slide is a 5fr/7fr grid: the left column carries the heading, NOAA's prose (only the first paragraph; further paragraphs become a note in the panel) and a "View on the map" link (deferred; disabled for now), all at a measure of about 44ch. The right panel, on `--paper-2`, carries the callout, then the visual, then the sources line — nothing in the panel takes a `max-width`, so captions and chart titles run the full panel width. `.cpd-panel-body` is a centred flex column, so a key-value section (stats, equation, stat-pair) sits vertically centred in the panel rather than pinned to the top with empty space below; a four-across stat row collapses to 2×2 under 640px.

`scroll-snap-type: y mandatory` applies only at `min-width: 900px` and `min-height: 620px`, and never under `prefers-reduced-motion` (`site/js/county-deck.js` toggles a `.is-snap` class on resize); outside that, slides stack in normal scroll, and the topic tabs still fit by wrapping the top bar to a second row rather than hiding them. Page Up/Down and the arrow keys step between slides when the deck has focus. Print lays the slides out linearly with most of the chrome (topic tabs, data-as-of, dot nav, switches) hidden but the brand and crumb kept, without their link underlines, so a printed page still says where it came from — matching NOAA's own print view, which drops cartography entirely.

The *About this data* slide uses the same 5/7 layout, both columns vertically centred like every other slide: a vintage sentence, a facts list (snapshot date linking the landing page's Earlier Snapshots, methodology version linking the changelog on `/county-profiles/about/`, and — for sea level rise — the tide gauge and scenarios) on the left; the recommended citation in a box with a Copy button, and a three-column sources table (Source, Vintage, Retrieved — aggregated per section, so a source appears once; "used for" is dropped since the slides already say what each source is for) on the right, set in smaller type than a section slide since it is reference material. The site's own `footer.njk` include closes the slide, pinned to the panel's bottom outside the centred content block — the Methodology/Download JSON/About County Profiles links pass through as `footerAttribution`. A topic-wide footnote (currently: why marine economy has no jobs-at-risk section) appears once here rather than repeating on every affected slide.

## Citation

Each topic deck ends with a recommended citation in APA 7, naming the topic: `California Sea Change Atlas. (2026, September 20). *Orange County coastal county profile: Sea level rise*. <permalink>`. The county landing page's citation drops the topic. The permalink is always the dated route, built from `site.url`, which resolves now for the current (only) snapshot.

## Data sources and licensing

Phase 1 fetches nothing, so none of the sources below are used yet except the OPC reference table; the fixtures' source entries only label where real figures will come from. All are public domain except Esri Business Analyst business-location data, which is licensed and excluded outright (replaced by LEHD LODES workplace-area-characteristics job counts — a different measure, reported as such). Full source list, cadence and the reasoning behind each substitution belong here once Phase 2 fetches real data; see the spec for the complete table.

This is the first CASCA tool that stores data in the repo; see [`DECISIONS.md`](DECISIONS.md#county-profiles-store-derived-data-in-the-repo).

## SEO note for the snapshot archive

The dated route already carries `rel="canonical"` pointing at the current profile (via the `canonical` front-matter key in `base.njk`), and is left out of the sitemap. A canonical keeps the archived page crawlable, which matters when someone searches for a cited figure. When older snapshots start to accumulate in Phase 5, they use the same template and need nothing further.

## Implementation phasing

1. **Data model and county spine** (built) — schema, availability model with reason codes, vintage kinds, method version, the 27-county spine, NOAA's section lists, the timing table. Index and county pages against fixtures.
2. **The intersect pipeline, one county (Orange)** — the correctness phase: real NFHL/ACS/LODES/USGS/OpenFEMA data, block-level intersects rolled up for display, `EFF_DATE` vintage. Gate: figures reconcile against NOAA's published values or the divergence is explained.
3. **All counties, all topics** — scale to 27 counties, add ENOW and C-CAP, exercise every availability state including the delta and flood-only tiers.
4. **Sea-level-rise scenario layer** — precomputed exposure at each increment annotated with the timing, client-side scenario emphasis with URL encoding.
5. **Automation and the archive** — the single Actions workflow, quarterly schedule plus dispatch, `EFF_DATE` short-circuit, snapshot-on-change, committed JSON, older dated snapshots.
6. **PDF and print** — Playwright generation for snapshots, per-topic scoping, prominent data-as-of, accessibility note.
7. **Inset map** — last; simplified hazard geometry keyed by source vintage (the `geometry` field above).

Phase 2 is the real risk: everything after it is assembly, and a wrong intersect method makes every number in the tool wrong and the archive makes it permanently citable.
