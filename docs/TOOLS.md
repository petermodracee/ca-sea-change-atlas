# Tool dataset, tool list, tool pages and compare page

The comparison side of the site is driven by one file, `site/data/tools.json`. It is a good-faith summary of each tool compiled from the provider's own public materials, not the original agency content (see its `_meta`).

## `site/data/tools.json`

Top level: `_meta` (source, compile date, disclaimer) and `tools` (array). Each tool:

| Field | Meaning |
|---|---|
| `id` | Stable slug. Used in the page URL `/compare/tool/<id>/` and as `toolId` in `site/_data/credits.json`. |
| `name`, `org` | Display name and publisher. |
| `scope`, `scopeLabel` | Short geographic key (`bay-area`, `socal`, `statewide`, `national`) and its human-readable label. |
| `implementationStatus` | `"implemented"` if the map renders this tool's own data as a live layer; `"not-implemented"` otherwise. |
| `mapEligibility` | Present only as `"excluded"`: the tool can never go on the map (licensing, or redundant). Absent means no such judgement. |
| `released` | Free-text release/update note. |
| `url` | Public link, or `null` if no stable link could be confirmed (shown as "Link unverified"). |
| `description` | Plain-English summary. |
| `processes`, `exposure`, `floodInfo` | Arrays of tags. These are the three filter groups on the tool list page, so keep spellings consistent with existing values. |
| `reportsData`, `slrModel` | Free-text: what data/reports it offers and what SLR model it uses. |
| `strengths`, `limitations` | Arrays of short statements. |
| `keyFeatures` | Optional. Array of short bullet strings. Shown as a "Key features" card above the schema sections on the tool page, with its own link in the contents box (not part of `toolDetailSchema`, so the compare page doesn't show it). |
| `factSheetUrl` | Optional. Link to a fact sheet, or `null`. |
| `slrMetrics` | Optional. `{ increments?, otherLayers? }`: free text on the flooding increments the tool can project, and other flood layers it offers. |
| `processesDetail`, `exposureDetail`, `floodInfoDetail` | Optional. Objects mapping a tag to free-text elaboration, e.g. `"processesDetail": { "SLR inundation": "..." }`. Keys must be values that appear in the same tool's `processes`, `exposure` or `floodInfo` array respectively. |
| `dataAvailability` | Optional. `{ reportsAvailable?, dataTypes?, uploadable? }`, all free text. `reportsAvailable` takes precedence over `reportsData` where both exist. |
| `slrModelDetail` | Optional. `{ baseModel?, elevationSource?, baseElevation?, horizontalResolution? }`, all free text. `baseModel` takes precedence over `slrModel` where both exist. |
| `screenshots` | Optional. Up to two `{ src, alt, caption, credit, capturedOn, copyright? }` objects. `src` starts with `/img/` (files live in `site/img/tools/`); `alt`, `caption`, `credit` and `capturedOn` (`YYYY-MM-DD`) are required, `copyright` is optional. Shown on the tool page only, not part of `toolDetailSchema`. The build fails on a malformed entry (`site/_data/tools.js`). See [Screenshots](#screenshots). |

Every field from `keyFeatures` down is optional and safe to omit; renderers must treat a missing field, key or sub-key as "no information" rather than an error. Existing entries do not have to be backfilled.

### Detail layout: `toolDetailSchema`

`site/data/toolDetailSchema.json` is the single source of truth for which sections and rows appear on a tool's detail view, and in what order. It is shared by the tool page and the compare page, so neither should hardcode its own section list. `site/_data/toolDetailSchema.js` re-exports it as Eleventy global data (`toolDetailSchema`); the JSON file is passthrough-copied with the rest of `site/data/` so `site/js/compare.js` can fetch it. The resolving logic (dotted paths, fallbacks, empty checks, tag master lists) lives once in `site/js/tool-detail.js`, a small module loaded by both Eleventy (the `toolSections` filter and `site/_data/toolTagMasters.js`) and the browser (`window.ToolDetail`).

The file is an array of sections, each `{ title, ... }` in one of two shapes:

- **Row section:** `rows: [{ label, field, kind?, fallbackField? }]`. `field` is a dotted path into the tool (`slrMetrics.increments`). `kind` is `"link"`, `"list"` or omitted for plain text. If `field` is empty or missing, use `fallbackField` (a legacy top-level field such as `reportsData`); if that is also empty the row has no value: the tool page omits it, and the compare page shows a dash in that tool's column (the row is dropped only when no selected tool has a value).
- **Tag-table section:** `kind: "tag-table", tagField, detailField`. The renderer lists the full distinct set of values of `tagField` across all tools (the same master list `site/js/sources.js` builds for the filter checkboxes) and shows Yes/No for each tag depending on whether this tool's `tagField` array contains it. A tool with no tags in that field has nothing for the section. On Yes, the text from `detailField[tag]` is shown alongside when present.

Add or reorder sections in the schema, not in templates.

### Status is defined here and only here

`implementationStatus` and `mapEligibility` are the single source of truth for what is on the map. The tool list cards, the compare page's column headings and each tool page all read them. Don't restate status, or counts of tools, in prose or in another data file; link here or derive it in a template.

Status is per *tool*, not per panel group. A tool can be implemented inside another tool's panel group (for example the NHC storm-surge overlay lives in the CFEM group), and some map layers are context data with no tool entry (the geo / demographic group). See [`MAP.md`](MAP.md#layer-groups).

## How it is consumed

- **Build time:** `site/_data/tools.js` re-exports `site/data/tools.json`'s `tools` array as Eleventy global data (`tools`); `site/_data/toolDetailSchema.js` and `site/_data/toolTagMasters.js` add the detail schema and the master tag lists. `site/compare/tool.njk` paginates over it (size 1, `permalink: compare/tool/{{ tool.id }}/index.html`, `addAllPagesToCollections` so each page lands in the sitemap) and emits per-tool `<title>`, meta description, Open Graph tags and `schema.org` Dataset JSON-LD.
- **Browser:** `site/js/sources.js` fetches `site/data/tools.json` (a relative path, which is why `site/data/` is passthrough-copied) and renders everything on `/compare/`. `site/js/compare.js` fetches `../../data/tools.json` and `../../data/toolDetailSchema.json` (relative to `/compare/side-by-side/`) and renders `/compare/side-by-side/`.

## Tool list page (`site/compare/index.njk` + `site/js/sources.js`)

- **Filters:** three checkbox groups built from the distinct values in `processes`, `exposure` and `floodInfo`. Within and across groups a tool must have *every* selected value (AND). There is no location filter and no scope filter.
- **Cards:** name, org, description, a status tag (implemented / external tool only / not implemented), scope and first two process tags, release note, a "Details" link to `/compare/tool/<id>/`, an "Open tool" link (or "Link unverified"), and a compare toggle.
- **Compare:** up to three tools. The bar shows selections, and its "View comparison" link opens `side-by-side/?tools=<id>,<id>[,<id>]` (see below). There is no inline comparison table any more.
- `render()` is a full re-render on every state change. That is fine at this data size.
- The `Details` link (`site/js/sources.js`) and the `tools.json` footer link (`site/compare/index.njk`) are relative to `/compare/`, so they survive a host or path-prefix change.

## Tool page (`site/compare/tool.njk`)

Each `/compare/tool/<id>/` page is laid out in two columns under a sticky header.

- **Sticky header:** status tag, name, organization and release note, and the "Visit" link. It stays pinned while you scroll; a small inline script measures its height into `--tool-sticky-h` so the contents box and in-page anchors sit just below it. Under 800px it stops being sticky.
- **Content column:** the description, then a "Key features" card (when `keyFeatures` is present), then a "Screenshots" card (when `screenshots` is present), then one card per `toolDetailSchema` section, in schema order. All sections are shown open; there are no collapsibles.
- **"On this page" box:** a sticky list of anchors to Key features, Screenshots and each section that is shown.
- **Empty data:** anything with nothing to show is left out, not rendered as an empty shell. A row is omitted when its field (and `fallbackField`) is empty, a section is omitted when it has no rows, and a tag-table section is omitted when the tool has no tags in that field. A `null` `url` shows "Link unverified" on the row; other empty links are omitted.
- **Tag tables:** every distinct tag across all tools is listed with Yes or No, and the `*Detail` text next to Yes.

The resolving logic is `site/js/tool-detail.js`, exposed to the template as the `toolSections` filter; `site/compare/tool.njk` only loops over what it returns.

### Screenshots

Up to two small, at-a-glance images per tool, with a caption. They sit side by side (stacked on narrow screens); each opens the same image at full size in a new tab, and the tool page's "Visit" link is where a reader goes for the real thing. Under each image a line reads "Screenshot: <credit> · <copyright> · captured <date>".

- **Size:** aim for about 800px wide, WebP or PNG, roughly 100 KB. They are shown at about half that width, so 800px is already sharp on high-density screens. Keep them in `site/img/tools/`, named `<tool-id>-1.webp` and `-2.webp`.
- **Text:** `alt` describes what the screenshot shows, `caption` says what to look at, `credit` names the publisher, `copyright` is the publisher's notice where one is stated, and `capturedOn` is the day you took it.
- **Not on the compare page**, and not used as the page's social-preview image (a tool screenshot as a link preview would read as a link to the tool itself, not to this description).
- **Licensing:** screenshots follow their own rule; see [`LICENSING.md`](LICENSING.md#screenshots).

The `todo-screenshot-*.svg` files in `site/img/tools/` are placeholders used by the three placeholder entries.

## Compare page (`site/compare/side-by-side.njk` + `site/js/compare.js`)

`/compare/side-by-side/?tools=<id>,<id>[,<id>]` compares two or three tools side by side. Ids come from the query string (unknown ids are reported and ignored, at most three are used), and the column headings hold the pickers: each is a dropdown that swaps that tool, the top-left cell has "Back to tool list" (to `/compare/`) plus an "Add a third tool" dropdown, and a third tool has a Remove link. Every change keeps the address in sync with `history.replaceState`, so any comparison can be bookmarked or shared. With fewer than two valid tools it shows two empty pickers and a prompt instead of a table. Re-rendering preserves the scroll position and refocuses the picker you changed. Links and fetches use relative paths (`../tool/<id>/`, `../`, `../../data/…`), relative to `/compare/side-by-side/` since it no longer sits at the site root — a prefix change still needs no edits here, but a route change under `/compare/` does.

- **Layout:** a sticky header row with each tool's status, name dropdown, organization and a Details link to its page, then one collapsible section per `toolDetailSchema` entry, each a table with the row label plus one value column per tool.
- **Missing data:** if a tool has nothing in a section, its column shows "No data available" (one spanning cell, so columns stay aligned). A section is omitted only when no selected tool has anything for it. Within a section, a row is dropped only when no selected tool has a value, and an empty cell in a partly filled row shows a dash.
- **Tag tables:** every distinct tag across all tools is listed, with Yes (plus detail text) or No per tool.

## Adding a tool

1. Check its terms first ([`CONTRIBUTING.md`](../CONTRIBUTING.md#licensing-requirements)). A tool with no reuse license can still be listed for comparison.
2. Add the entry to `tools.json`. Reuse existing `processes`/`exposure`/`floodInfo` tag values where they fit. If it can never be mapped, set `mapEligibility: "excluded"` and record why in [`LICENSING.md`](LICENSING.md).
3. If it is a map layer, follow [Adding a layer](MAP.md#adding-a-layer) and set `implementationStatus: "implemented"`.
4. Add a `site/_data/credits.json` entry if the map loads its data. Comparison-only tools use no data, so they get no credits entry.
5. Add one or two [screenshots](#screenshots) (every tool can have them, including comparison-only ones), and optionally fill the other detail fields (`keyFeatures`, `slrMetrics`, the `*Detail` maps and so on) so the tool page and compare page have more to show. Omitted fields just don't appear.
6. `npm run build` and check the new `/compare/tool/<id>/` page and try it in `/compare/side-by-side/`.
