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
