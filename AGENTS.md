# Agent guide

CA Sea Change Atlas: an unofficial successor to California's "Sea the Future" tool. A static Eleventy site with two tools: a Leaflet **map** of live sea-level-rise and flood-hazard layers, and a **comparison** of the tools behind them. Deployed to GitHub Pages under `/ca-sea-change-atlas/`.

This file is a map, not a manual. It points at the docs, which are the source of truth.

## Commands

```bash
npm install
npm run serve   # http://localhost:8080/ca-sea-change-atlas/
npm run build   # one-off build into _site/ (gitignored); must pass before a PR
```

`.claude/launch.json` defines an `eleventy-dev` preview server for browser verification. There are no automated tests.

## Where things live

| Looking for | Go to |
|---|---|
| Page templates and front-matter keys | `*.njk`, `_includes/`; [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| The map (modules, layer table, popups, permalink) | `js/map/`, `map.njk`; [`docs/MAP.md`](docs/MAP.md) |
| One map layer | `js/map/layers/<source>-layer.js` |
| The tool dataset (and per-tool status) | `data/tools.json`; [`docs/TOOLS.md`](docs/TOOLS.md) |
| Tool list page | `sources.njk`, `js/sources.js` |
| Tool page and compare page | `tool.njk`; `compare.njk`, `js/compare.js`; layout in `data/toolDetailSchema.json`, resolved by `js/tool-detail.js` |
| Licenses and credits page | `licenses.njk` fed by `_data/credits.json`; [`docs/LICENSING.md`](docs/LICENSING.md) |
| Why something is the way it is | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| How to contribute, license rules | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Invariants

- **`data/tools.json` is the single source of truth for per-tool status** (`implementationStatus`, `mapEligibility`). Never restate status or tool counts in prose or other data; link or derive in a template.
- **`data/toolDetailSchema.json` is the single source of truth for the tool page's and compare page's section/row layout.** Add or reorder sections there, not in `tool.njk` or `compare.js`.
- **Never overlay a comparison-only source's data.** No fetching, proxying or embedding of a tool marked `mapEligibility: "excluded"`. See `docs/LICENSING.md`.
- Every source or library needs an entry in `_data/credits.json`, and only openly licensed material is added (`CONTRIBUTING.md`). The exception is small, credited, dated tool screenshots (`docs/LICENSING.md#screenshots`).
- Map data is loaded live from publishers' servers, never copied into the repo.
- Map layers use `groupPane(map, key)` from `js/map/shared/panes.js`; new keys go in `GROUP_PANE_KEYS`.
- Third-party scripts are pinned to a version with an SRI hash.
- Internal links go through the `url` filter (`pathPrefix` is `/ca-sea-change-atlas/`). `footerAttribution` front matter and `js/sources.js` hardcode it because they can't.
- Test assumptions about a live map service directly (tile requests, response headers) rather than reasoning from another service; several earlier assumptions were wrong (`docs/DECISIONS.md`).

## Working here

- Update the affected doc in the same change as the code. Verify that files and identifiers you mention exist.
- `about.njk` is written in the author's own voice; report problems in it rather than rewriting it.
- Commit messages: short imperative subject. Branch, don't commit to `main`.
