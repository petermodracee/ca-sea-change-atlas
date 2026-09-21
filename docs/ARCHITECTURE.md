# Architecture

A static site built with [Eleventy](https://www.11ty.dev/) (v3) and deployed to GitHub Pages. There is no backend: everything dynamic runs in the browser, and flood data is fetched live from each publisher's server.

This file covers the site as a whole. Each tool has its own docs:

- [`MAP.md`](MAP.md): the map page (`site/js/map/`)
- [`TOOLS.md`](TOOLS.md): the tool dataset, the tool list, the compare page and per-tool pages
- [`COUNTY-PROFILES.md`](COUNTY-PROFILES.md): the county-profiles tool

Eleventy's source root is `site/`; everything under it is hand-authored and Eleventy-aware. Root-level files (`docs/`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE*`, and the county-profiles build scripts under `scripts/`) are project files, not site source.

## Pages

Routes are grouped by tool rather than flat at the root, so a page's URL and its template's path under `site/` match.

| Page | Source | Purpose |
|---|---|---|
| `/` | `site/index.njk` | Landing page: explains the tools and links to each |
| `/map/` | `site/map/index.njk`, `site/js/map/` | The map |
| `/compare/` | `site/compare/index.njk`, `site/js/sources.js` | Filterable tool grid and compare picker |
| `/compare/side-by-side/` | `site/compare/side-by-side.njk`, `site/js/compare.js`, `site/js/tool-detail.js` | Side-by-side comparison of two or three tools (`?tools=` ids), rendered in the browser |
| `/compare/tool/<id>/` | `site/compare/tool.njk`, `site/data/toolDetailSchema.json` | One generated page per entry in `site/data/tools.json`; its sections come from the detail schema |
| `/compare/about/` | `site/compare/about.njk` | How the comparison's sources were chosen, and what was left out |
| `/about/` | `site/about/index.njk` | Project history, author, disclaimers |
| `/about/licenses/` | `site/about/licenses.njk`, `site/_data/credits.json`, `site/_data/licenseTypes.json` | Licenses and credits |
| `/data/` | `site/data/index.njk` | Landing page for the raw JSON datasets |
| `/404.html` | `site/404.njk` | Custom 404, excluded from the sitemap |
| `/sitemap.xml` | `site/sitemap.njk` | Generated from every page Eleventy knows about |

County Profiles routes are documented in [`COUNTY-PROFILES.md`](COUNTY-PROFILES.md).

## Build and deploy

- `.eleventy.js`: `dir.input` is `site/`; only `.njk` files are templates. It registers the `toolSections` filter (from `site/js/tool-detail.js`) used by `compare/tool.njk`. `site/css/`, `site/js/` and `site/img/` are passthrough-copied whole to their same relative path under the output root; `site/data/` is passthrough-copied by a `**/*.json` glob rather than as a whole directory, because `site/data/index.njk` lives in the same folder as the JSON it lists — a whole-directory copy would also raw-copy that template's `.njk` source into the output alongside its rendered page. `LICENSE` and `robots.txt` stay at the repo root and are passthrough-copied from there. `LICENSE-CONTENT.md` also stays at the repo root but is deliberately *not* passthrough-copied — it's a GitHub-browsing convenience (a second license-declaration file alongside `LICENSE`, since GPLv3 code and CC BY-SA content are different licenses), not a page the live site serves; the licenses page links to CC BY-SA's actual legal text directly instead. `pathPrefix` is `/` (the site is served from the root of seachangeatlas.org; `site/CNAME` is passthrough-copied for GitHub Pages); use the `url` filter for every internal link (front-matter values can't use filters, so `footerAttribution` uses relative paths like `../map/`).
- `.github/workflows/deploy.yml`: on push to `main` (or manually), Node 20, `npm ci`, `npx eleventy`, then upload `_site/` to GitHub Pages. The repo's Pages source is "GitHub Actions".
- `.claude/launch.json`: defines the `eleventy-dev` preview server on port 8080.
- Local dev: see the [README](../README.md#run-it-locally).

## Templates

`site/_includes/base.njk` wraps every page: head metadata (title, description, Open Graph and Twitter tags, canonical URL from `site/_data/site.js`), fonts, the header and footer includes, and scripts. `header.njk` renders the logo (`img/casca-logo.svg`, decorative since the site name sits beside it) and the nav; the browser-tab icon is `img/favicon.svg`, linked from `base.njk`. Both are SVG exports that were slimmed with `svgo`, which is worth repeating if they are re-exported from Inkscape; `footer.njk` renders the copyright/license line, mirrors the header's top-level links (Map, Compare tools, About, Licenses), and shows each page's `footerAttribution`. On the map page the footer collapses into a `<details>` because the page is a fixed-viewport app shell.

Front-matter keys the layout understands:

| Key | Effect |
|---|---|
| `title`, `description` | Page title and meta/OG description |
| `nav` | Which header link gets `aria-current` |
| `bodyClass` | Class on `<body>` (`map-page` switches the footer to its compact form) |
| `leaflet: true` | Loads Leaflet, esri-leaflet and leaflet.locatecontrol (CSS and JS) |
| `mapModuleEntry` | Adds a `<script type="module">` for the map entry point |
| `extraScripts` | Extra plain `<script>` files (`compare/index.njk`, `compare/side-by-side.njk`, and `toc.js` on pages with a table of contents) |
| `ogImage` | Social preview image; defaults to `img/preview-map.png` |
| `footerAttribution` | Per-page attribution text shown in the footer |

Third-party scripts come from unpkg at pinned versions with Subresource Integrity hashes (`base.njk` for Leaflet, esri-leaflet and locatecontrol; `js/map/basemaps.js` for the lazily loaded MapLibre pair). When bumping one, regenerate its hash. `img/preview-map.png` and `img/preview-sources.png` are screenshots used on the landing page and as social previews; they are not generated, so refresh them by hand when those pages change substantially.

### Table of contents component

`site/_includes/toc.njk` plus `site/js/toc.js` give a page a sticky left-hand table of contents (a top block on narrow screens). To use it: wrap the page body in `<div class="wrap page-toc">`, `{% include "toc.njk" %}`, put the content in a container with `data-toc-source`, and add `/js/toc.js` to `extraScripts`. The script lists the container's `<h2>` headings, adds slug ids to any that lack one, and highlights the section in view. `about/licenses.njk` is the reference example, and `about/index.njk` uses it too; adopting it needed no changes to a page's prose.

## Data

| File | Used by | Notes |
|---|---|---|
| `site/data/tools.json` | `site/_data/tools.js` (build time, feeds `compare/tool.njk`) and `site/js/sources.js` and `site/js/compare.js` (browser fetch) | The tool dataset and the **single source of truth for per-tool status**. See [`TOOLS.md`](TOOLS.md). |
| `site/data/toolDetailSchema.json` | `site/_data/toolDetailSchema.js` (build time, feeds `compare/tool.njk`) and `site/js/compare.js` (browser fetch) | Section and row layout for a tool's detail view, shared by the tool page and the compare page. See [`TOOLS.md`](TOOLS.md#detail-layout-tooldetailschema). |
| `site/_data/toolTagMasters.js` | `compare/tool.njk` | Distinct tag values per tag-table field across all tools, computed once at build time from `site/js/tool-detail.js`. |
| `site/_data/credits.json` | `about/licenses.njk` | Every third-party library, dataset and service credited on `/about/licenses/`, alphabetical within each category. A credit line (`attribution`) is present only where the license requires one. |
| `site/_data/licenseTypes.json` | `about/licenses.njk` | License names and links to their texts, referenced by key from `credits.json`. Rationale for what is used: [`LICENSING.md`](LICENSING.md). |
| `site/_data/site.js` | `base.njk`, `index.njk` | Deployed site URL and name for canonical and Open Graph tags |
| `site/data/cosmos-layers.json` | `site/js/map/layers/cosmos-layer.js` | URL and layer-name templates for CoSMoS. See [`MAP.md`](MAP.md#local-configuration-cosmos). |

`site/data/index.njk` renders `/data/`, the landing page listing the JSON files above. County Profiles' generated snapshot archive lives at `site/data/county-profiles/`; its own README there is a repo-facing note only, deliberately not JSON so it isn't served — see [`COUNTY-PROFILES.md`](COUNTY-PROFILES.md).

`reference/sea-the-future-prototype.html` is the original single-file, map-less prototype, kept for reference. It lives at the repo root, not under `site/`, since it isn't part of the deployed site — it is never passthrough-copied or linked from anywhere.

## Documentation conventions

- Don't restate per-tool status or tool counts in prose. Link to `data/tools.json` or the comparison page; derive counts in templates (`{{ tools | length }}`).
- Update the relevant doc in the same change as the code it describes.
- Docs name files, modules and identifiers; verify they still exist when editing.
