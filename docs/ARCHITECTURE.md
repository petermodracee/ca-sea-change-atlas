# Architecture

A static site built with [Eleventy](https://www.11ty.dev/) (v3) and deployed to GitHub Pages. There is no backend: everything dynamic runs in the browser, and flood data is fetched live from each publisher's server.

This file covers the site as a whole. The two applications inside it have their own docs:

- [`MAP.md`](MAP.md): the map page (`js/map/`)
- [`TOOLS.md`](TOOLS.md): the tool dataset, comparison page and per-tool pages

## Pages

| Page | Source | Purpose |
|---|---|---|
| `/` | `index.njk` | Landing page: explains the two tools and links to each |
| `/map.html` | `map.njk`, `js/map/` | The map |
| `/sources.html` | `sources.njk`, `js/sources.js` | Filterable tool grid and compare table |
| `/tool/<id>/` | `tool.njk` | One generated page per entry in `data/tools.json` |
| `/about.html` | `about.njk` | Project history, sources, author, disclaimers |
| `/licenses.html` | `licenses.njk`, `_data/credits.json` | Licenses and credits |
| `/sitemap.xml` | `sitemap.njk` | Generated from every page Eleventy knows about |

## Build and deploy

- `.eleventy.js`: only `.njk` files are templates. `css/`, `js/`, `data/`, `img/`, `reference/`, `LICENSE`, `LICENSE-CONTENT.md` and `robots.txt` are passthrough-copied. `pathPrefix` is `/ca-sea-change-atlas/`; use the `url` filter for every internal link so it works under that prefix (front-matter values can't use filters, so `footerAttribution` hardcodes it).
- `.github/workflows/deploy.yml`: on push to `main` (or manually), Node 20, `npm ci`, `npx eleventy`, then upload `_site/` to GitHub Pages. The repo's Pages source is "GitHub Actions".
- `.claude/launch.json`: defines the `eleventy-dev` preview server on port 8080.
- Local dev: see the [README](../README.md#run-it-locally).

## Templates

`_includes/base.njk` wraps every page: head metadata (title, description, Open Graph and Twitter tags, canonical URL from `_data/site.js`), fonts, the header and footer includes, and scripts. `header.njk` renders the nav; `footer.njk` renders the copyright/license line and each page's `footerAttribution`. On the map page the footer collapses into a `<details>` because the page is a fixed-viewport app shell.

Front-matter keys the layout understands:

| Key | Effect |
|---|---|
| `title`, `description` | Page title and meta/OG description |
| `nav` | Which header link gets `aria-current` |
| `bodyClass` | Class on `<body>` (`map-page` switches the footer to its compact form) |
| `leaflet: true` | Loads Leaflet, esri-leaflet and leaflet.locatecontrol (CSS and JS) |
| `mapModuleEntry` | Adds a `<script type="module">` for the map entry point |
| `extraScripts` | Extra plain `<script>` files (used by `sources.njk`) |
| `ogImage` | Social preview image; defaults to `img/preview-map.png` |
| `footerAttribution` | Per-page attribution text shown in the footer |

Third-party scripts come from unpkg at pinned versions with Subresource Integrity hashes (`base.njk` for Leaflet, esri-leaflet and locatecontrol; `js/map/basemaps.js` for the lazily loaded MapLibre pair). When bumping one, regenerate its hash. `img/preview-map.png` and `img/preview-sources.png` are screenshots used on the landing page and as social previews; they are not generated, so refresh them by hand when those pages change substantially.

## Data

| File | Used by | Notes |
|---|---|---|
| `data/tools.json` | `_data/tools.js` (build time, feeds `tool.njk`) and `js/sources.js` (browser fetch) | The tool dataset and the **single source of truth for per-tool status**. See [`TOOLS.md`](TOOLS.md). |
| `_data/credits.json` | `licenses.njk` | Every third-party library, dataset and service credited on `/licenses.html`. See [`LICENSING.md`](LICENSING.md). |
| `_data/site.js` | `base.njk`, `index.njk` | Deployed site URL and name for canonical and Open Graph tags |
| `data/cosmos-layers.json` | `js/map/layers/cosmos-layer.js` | URL and layer-name templates for CoSMoS. See [`MAP.md`](MAP.md#local-configuration-cosmos). |

`reference/sea-the-future-prototype.html` is the original single-file, map-less prototype, kept for reference. It is passthrough-copied and not used by anything.

## Documentation conventions

- Don't restate per-tool status or tool counts in prose. Link to `data/tools.json` or the comparison page; derive counts in templates (`{{ tools | length }}`).
- Update the relevant doc in the same change as the code it describes.
- Docs name files, modules and identifiers; verify they still exist when editing.
