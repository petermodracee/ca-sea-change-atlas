# Architecture

A static site built with [Eleventy](https://www.11ty.dev/) (v3) and deployed to GitHub Pages. There is no backend: everything dynamic runs in the browser, and flood data is fetched live from each publisher's server.

This file covers the site as a whole. The two applications inside it have their own docs:

- [`MAP.md`](MAP.md): the map page (`js/map/`)
- [`TOOLS.md`](TOOLS.md): the tool dataset, the tool list, the compare page and per-tool pages

## Pages

| Page | Source | Purpose |
|---|---|---|
| `/` | `index.njk` | Landing page: explains the two tools and links to each |
| `/map.html` | `map.njk`, `js/map/` | The map |
| `/sources.html` | `sources.njk`, `js/sources.js` | Filterable tool grid and compare picker |
| `/compare.html` | `compare.njk`, `js/compare.js`, `js/tool-detail.js` | Side-by-side comparison of two or three tools (`?tools=` ids), rendered in the browser |
| `/tool/<id>/` | `tool.njk`, `data/toolDetailSchema.json` | One generated page per entry in `data/tools.json`; its sections come from the detail schema |
| `/about.html` | `about.njk` | Project history, sources, author, disclaimers |
| `/licenses.html` | `licenses.njk`, `_data/credits.json`, `_data/licenseTypes.json` | Licenses and credits |
| `/sitemap.xml` | `sitemap.njk` | Generated from every page Eleventy knows about |

## Build and deploy

- `.eleventy.js`: only `.njk` files are templates. It registers the `toolSections` filter (from `js/tool-detail.js`) used by `tool.njk`. `css/`, `js/`, `data/`, `img/`, `reference/`, `LICENSE`, `LICENSE-CONTENT.md` and `robots.txt` are passthrough-copied. `pathPrefix` is `/ca-sea-change-atlas/`; use the `url` filter for every internal link so it works under that prefix (front-matter values can't use filters, so `footerAttribution` hardcodes it).
- `.github/workflows/deploy.yml`: on push to `main` (or manually), Node 20, `npm ci`, `npx eleventy`, then upload `_site/` to GitHub Pages. The repo's Pages source is "GitHub Actions".
- `.claude/launch.json`: defines the `eleventy-dev` preview server on port 8080.
- Local dev: see the [README](../README.md#run-it-locally).

## Templates

`_includes/base.njk` wraps every page: head metadata (title, description, Open Graph and Twitter tags, canonical URL from `_data/site.js`), fonts, the header and footer includes, and scripts. `header.njk` renders the logo (`img/casca-logo.svg`, decorative since the site name sits beside it) and the nav; the browser-tab icon is `img/favicon.svg`, linked from `base.njk`. Both are SVG exports that were slimmed with `svgo`, which is worth repeating if they are re-exported from Inkscape; `footer.njk` renders the copyright/license line and each page's `footerAttribution`. On the map page the footer collapses into a `<details>` because the page is a fixed-viewport app shell.

Front-matter keys the layout understands:

| Key | Effect |
|---|---|
| `title`, `description` | Page title and meta/OG description |
| `nav` | Which header link gets `aria-current` |
| `bodyClass` | Class on `<body>` (`map-page` switches the footer to its compact form) |
| `leaflet: true` | Loads Leaflet, esri-leaflet and leaflet.locatecontrol (CSS and JS) |
| `mapModuleEntry` | Adds a `<script type="module">` for the map entry point |
| `extraScripts` | Extra plain `<script>` files (`sources.njk`, `compare.njk`, and `toc.js` on pages with a table of contents) |
| `ogImage` | Social preview image; defaults to `img/preview-map.png` |
| `footerAttribution` | Per-page attribution text shown in the footer |

Third-party scripts come from unpkg at pinned versions with Subresource Integrity hashes (`base.njk` for Leaflet, esri-leaflet and locatecontrol; `js/map/basemaps.js` for the lazily loaded MapLibre pair). When bumping one, regenerate its hash. `img/preview-map.png` and `img/preview-sources.png` are screenshots used on the landing page and as social previews; they are not generated, so refresh them by hand when those pages change substantially.

### Table of contents component

`_includes/toc.njk` plus `js/toc.js` give a page a sticky left-hand table of contents (a top block on narrow screens). To use it: wrap the page body in `<div class="wrap page-toc">`, `{% include "toc.njk" %}`, put the content in a container with `data-toc-source`, and add `/js/toc.js` to `extraScripts`. The script lists the container's `<h2>` headings, adds slug ids to any that lack one, and highlights the section in view. `licenses.njk` is the reference example, and `about.njk` uses it too; adopting it needed no changes to a page's prose.

## Data

| File | Used by | Notes |
|---|---|---|
| `data/tools.json` | `_data/tools.js` (build time, feeds `tool.njk`) and `js/sources.js` and `js/compare.js` (browser fetch) | The tool dataset and the **single source of truth for per-tool status**. See [`TOOLS.md`](TOOLS.md). |
| `data/toolDetailSchema.json` | `_data/toolDetailSchema.js` (build time, feeds `tool.njk`) and `js/compare.js` (browser fetch) | Section and row layout for a tool's detail view, shared by the tool page and the compare page. See [`TOOLS.md`](TOOLS.md#detail-layout-tooldetailschema). |
| `_data/toolTagMasters.js` | `tool.njk` | Distinct tag values per tag-table field across all tools, computed once at build time from `js/tool-detail.js`. |
| `_data/credits.json` | `licenses.njk` | Every third-party library, dataset and service credited on `/licenses.html`, alphabetical within each category. A credit line (`attribution`) is present only where the license requires one. |
| `_data/licenseTypes.json` | `licenses.njk` | License names and links to their texts, referenced by key from `credits.json`. Rationale for what is used: [`LICENSING.md`](LICENSING.md). |
| `_data/site.js` | `base.njk`, `index.njk` | Deployed site URL and name for canonical and Open Graph tags |
| `data/cosmos-layers.json` | `js/map/layers/cosmos-layer.js` | URL and layer-name templates for CoSMoS. See [`MAP.md`](MAP.md#local-configuration-cosmos). |

`reference/sea-the-future-prototype.html` is the original single-file, map-less prototype, kept for reference. It is passthrough-copied and not used by anything.

## Documentation conventions

- Don't restate per-tool status or tool counts in prose. Link to `data/tools.json` or the comparison page; derive counts in templates (`{{ tools | length }}`).
- Update the relevant doc in the same change as the code it describes.
- Docs name files, modules and identifiers; verify they still exist when editing.
