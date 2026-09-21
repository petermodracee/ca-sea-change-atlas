# Agent guide

CA Sea Change Atlas: an unofficial successor to California's "Sea the Future" tool. A static Eleventy site with three tools: a Leaflet **map** of live sea-level-rise and flood-hazard layers, a **comparison** of the tools behind them, and **county profiles** rebuilding NOAA's discontinued Coastal County Snapshots for California. Deployed to GitHub Pages at the root of `seachangeatlas.org` (`site/CNAME`). Eleventy's source root is `site/`; root-level files are project docs and tooling, not site source.

This file is a map, not a manual. It points at the docs, which are the source of truth.

## Commands

```bash
npm install
npm run serve   # http://localhost:8080/
npm run build   # one-off build into _site/ (gitignored); must pass before a PR
```

`.claude/launch.json` defines an `eleventy-dev` preview server for browser verification. There are no automated tests.

## Where things live

| Looking for | Go to |
|---|---|
| Page templates and front-matter keys | `site/**/*.njk`, `site/_includes/`; [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| The map (modules, layer table, popups, permalink) | `site/js/map/`, `site/map/index.njk`; [`docs/MAP.md`](docs/MAP.md) |
| One map layer | `site/js/map/layers/<source>-layer.js` |
| The tool dataset (and per-tool status) | `site/data/tools.json`; [`docs/TOOLS.md`](docs/TOOLS.md) |
| Tool list page | `site/compare/index.njk`, `site/js/sources.js` |
| Tool page and compare page | `site/compare/tool.njk`; `site/compare/side-by-side.njk`, `site/js/compare.js`; layout in `site/data/toolDetailSchema.json`, resolved by `site/js/tool-detail.js` |
| County profiles tool | `site/county-profiles/` (once built), `scripts/county-profiles/`; [`docs/COUNTY-PROFILES.md`](docs/COUNTY-PROFILES.md) |
| Licenses and credits page | `site/about/licenses.njk` fed by `site/_data/credits.json`; [`docs/LICENSING.md`](docs/LICENSING.md) |
| Why something is the way it is | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| How to contribute, license rules | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Invariants

- **`site/data/tools.json` is the single source of truth for per-tool status** (`implementationStatus`, `mapEligibility`). Never restate status or tool counts in prose or other data; link or derive in a template.
- **`site/data/toolDetailSchema.json` is the single source of truth for the tool page's and compare page's section/row layout.** Add or reorder sections there, not in `compare/tool.njk` or `compare.js`.
- **Never overlay a comparison-only source's data.** No fetching, proxying or embedding of a tool marked `mapEligibility: "excluded"`. See `docs/LICENSING.md`.
- Every source or library needs an entry in `site/_data/credits.json`, and only openly licensed material is added (`CONTRIBUTING.md`). The exception is small, credited, dated tool screenshots (`docs/LICENSING.md#screenshots`).
- Map data is loaded live from publishers' servers, never copied into the repo.
- Map layers use `groupPane(map, key)` from `site/js/map/shared/panes.js`; new keys go in `GROUP_PANE_KEYS`.
- Third-party scripts are pinned to a version with an SRI hash.
- Internal links go through the `url` filter (`pathPrefix` is `/`). Front matter and `site/js/sources.js` can't use filters, so they use relative paths (`../map/`, `tool/<id>/`), never a hardcoded host or prefix. Nested pages (anything under `map/`, `compare/`, `about/`) link with a trailing slash (e.g. `/compare/side-by-side/`), not `.html`, since their permalink is `.../index.html`.
- Test assumptions about a live map service directly (tile requests, response headers) rather than reasoning from another service; several earlier assumptions were wrong (`docs/DECISIONS.md`).

## Working here

- Update the affected doc in the same change as the code. Verify that files and identifiers you mention exist.
- `site/about/index.njk` is written in the author's own voice; report problems in it rather than rewriting it.
- Commit messages: short imperative subject. Branch, don't commit to `main`.
