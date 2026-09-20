# Tool dataset and comparison page

The comparison side of the site is driven by one file, `data/tools.json`. It is a good-faith summary of each tool compiled from the provider's own public materials, not the original agency content (see its `_meta`).

## `data/tools.json`

Top level: `_meta` (source, compile date, disclaimer) and `tools` (array). Each tool:

| Field | Meaning |
|---|---|
| `id` | Stable slug. Used in the page URL `/tool/<id>/` and as `toolId` in `_data/credits.json`. |
| `name`, `org` | Display name and publisher. |
| `scope`, `scopeLabel` | Short geographic key (`bay-area`, `socal`, `statewide`, `national`) and its human-readable label. |
| `implementationStatus` | `"implemented"` if the map renders this tool's own data as a live layer; `"not-implemented"` otherwise. |
| `mapEligibility` | Present only as `"excluded"`: the tool can never go on the map (licensing, or redundant). Absent means no such judgement. |
| `released` | Free-text release/update note. |
| `url` | Public link, or `null` if no stable link could be confirmed (shown as "Link unverified"). |
| `description` | Plain-English summary. |
| `processes`, `exposure`, `floodInfo` | Arrays of tags. These are the three filter groups on the comparison page, so keep spellings consistent with existing values. |
| `reportsData`, `slrModel` | Free-text: what data/reports it offers and what SLR model it uses. |
| `strengths`, `limitations` | Arrays of short statements. |
| `keyFeatures` | Optional. Array of short bullet strings. |
| `factSheetUrl` | Optional. Link to a fact sheet, or `null`. |
| `slrMetrics` | Optional. `{ increments?, otherLayers? }`: free text on the flooding increments the tool can project, and other flood layers it offers. |
| `processesDetail`, `exposureDetail`, `floodInfoDetail` | Optional. Objects mapping a tag to free-text elaboration, e.g. `"processesDetail": { "SLR inundation": "..." }`. Keys must be values that appear in the same tool's `processes`, `exposure` or `floodInfo` array respectively. |
| `dataAvailability` | Optional. `{ reportsAvailable?, dataTypes?, uploadable? }`, all free text. `reportsAvailable` takes precedence over `reportsData` where both exist. |
| `slrModelDetail` | Optional. `{ baseModel?, elevationSource?, baseElevation?, horizontalResolution? }`, all free text. `baseModel` takes precedence over `slrModel` where both exist. |

Every field from `keyFeatures` down is optional and safe to omit; renderers must treat a missing field, key or sub-key as "no information" rather than an error. Existing entries do not have to be backfilled.

### Detail layout: `toolDetailSchema`

`data/toolDetailSchema.json` is the single source of truth for which sections and rows appear on a tool's detail view, and in what order. It is shared by the tool page and the upcoming compare page, so neither should hardcode its own section list. `_data/toolDetailSchema.js` re-exports it as Eleventy global data (`toolDetailSchema`); the JSON file is passthrough-copied with the rest of `data/` so `js/sources.js` and the future `js/compare.js` can fetch it.

The file is an array of sections, each `{ title, ... }` in one of two shapes:

- **Row section:** `rows: [{ label, field, kind?, fallbackField? }]`. `field` is a dotted path into the tool (`slrMetrics.increments`). `kind` is `"link"`, `"list"` or omitted for plain text. If `field` is empty or missing, use `fallbackField` (a legacy top-level field such as `reportsData`); if that is also empty, show a "Not provided" placeholder.
- **Tag-table section:** `kind: "tag-table", tagField, detailField`. The renderer lists the full distinct set of values of `tagField` across all tools (the same master list `js/sources.js` builds for the filter checkboxes) and shows Yes/No for each tag depending on whether this tool's `tagField` array contains it. On Yes, the text from `detailField[tag]` is shown alongside when present.

Add or reorder sections in the schema, not in templates.

### Status is defined here and only here

`implementationStatus` and `mapEligibility` are the single source of truth for what is on the map. The comparison cards, the compare table and each tool page all read them. Don't restate status, or counts of tools, in prose or in another data file; link here or derive it in a template.

Status is per *tool*, not per panel group. A tool can be implemented inside another tool's panel group (for example the NHC storm-surge overlay lives in the CFEM group), and some map layers are context data with no tool entry (the geo / demographic group). See [`MAP.md`](MAP.md#layer-groups).

## How it is consumed

- **Build time:** `_data/tools.js` re-exports `data/tools.json`'s `tools` array as Eleventy global data (`tools`). `tool.njk` paginates over it (size 1, `permalink: tool/{{ tool.id }}/index.html`, `addAllPagesToCollections` so each page lands in the sitemap) and emits per-tool `<title>`, meta description, Open Graph tags and `schema.org` Dataset JSON-LD.
- **Browser:** `js/sources.js` fetches `data/tools.json` (a relative path, which is why `data/` is passthrough-copied) and renders everything on `sources.html`.

## Comparison page (`sources.njk` + `js/sources.js`)

- **Filters:** three checkbox groups built from the distinct values in `processes`, `exposure` and `floodInfo`. Within and across groups a tool must have *every* selected value (AND). There is no location filter and no scope filter.
- **Cards:** name, org, description, a status tag (implemented / external tool only / not implemented), scope and first two process tags, release note, a "Details" link to `/tool/<id>/`, an "Open tool" link (or "Link unverified"), and a compare toggle.
- **Compare:** up to three tools. The bar shows selections; the table appears once two or more are selected and covers status, organization, scope, release, description, processes, exposure, flood info, data, SLR model, strengths, limitations and link.
- `render()` is a full re-render on every state change. That is fine at this data size.
- The `Details` link and the `tools.json` footer link in `sources.njk` hardcode the `/ca-sea-change-atlas/` path prefix, so a prefix change needs edits in `js/sources.js` and `sources.njk` as well as `.eleventy.js`.

## Adding a tool

1. Check its terms first ([`CONTRIBUTING.md`](../CONTRIBUTING.md#licensing-requirements)). A tool with no reuse license can still be listed for comparison.
2. Add the entry to `tools.json`. Reuse existing `processes`/`exposure`/`floodInfo` tag values where they fit. If it can never be mapped, set `mapEligibility: "excluded"` and record why in [`LICENSING.md`](LICENSING.md).
3. If it is a map layer, follow [Adding a layer](MAP.md#adding-a-layer) and set `implementationStatus: "implemented"`.
4. Add a `_data/credits.json` entry if the map loads its data. Comparison-only tools use no data, so they get no credits entry.
5. `npm run build` and check the new `/tool/<id>/` page and the compare table.
