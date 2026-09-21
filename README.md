# CA Sea Change Atlas

An unofficial spiritual successor to California's discontinued "Sea the Future" tool, expanded into three tools for making sense of California's sea-level-rise and coastal-flooding visualization resources.

Live site: <https://seachangeatlas.org/>

## The tools

**Map** (`/map/`): a Leaflet map that overlays flood and hazard data from publicly accessible sources so you can flip between them for the same stretch of coast. Layers load live from each publisher's own server; nothing is copied into this repository. Click anywhere to see what each active layer reports at that point, search an address, and share a link to the exact view and layer selection.

**Comparison tool** (`/compare/`): a filterable grid of sea-level-rise and coastal-flooding tools, with a side-by-side compare page (`/compare/side-by-side/`) for up to three tools covering scope, processes, exposure, data, and limitations. Each tool also has its own page at `/compare/tool/<id>/`. It includes tools that can't legally be drawn on the map.

**County Profiles** (`/county-profiles/`, in progress): rebuilds NOAA's discontinued Coastal County Snapshots for California — flood, sea-level-rise, and economic exposure at the county level. See [`docs/COUNTY-PROFILES.md`](docs/COUNTY-PROFILES.md).

## Status

Under active development. All planned map layers have been implemented; which tools are on the map, and which are comparison-only and why, is defined in [`site/data/tools.json`](site/data/tools.json) and shown on the comparison page. The next phase is focused on the county-profiles tool and human verification of the comparison data.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run serve
```

Then open <http://localhost:8080/>. The site deploys at the root of <https://seachangeatlas.org>, so there is no path prefix. `npm run build` writes a one-off build to `_site/`. Pushes to `main` deploy to GitHub Pages automatically.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the site is built and deployed
- [`docs/MAP.md`](docs/MAP.md): the map's modules, layers, and how to add one
- [`docs/TOOLS.md`](docs/TOOLS.md): the tool dataset and comparison page
- [`docs/COUNTY-PROFILES.md`](docs/COUNTY-PROFILES.md): the county-profiles tool
- [`docs/LICENSING.md`](docs/LICENSING.md): why each source is or isn't on the map
- [`docs/DECISIONS.md`](docs/DECISIONS.md): findings from testing against the live services
- [`CONTRIBUTING.md`](CONTRIBUTING.md): how to contribute, including license requirements
- [`AGENTS.md`](AGENTS.md): orientation for AI coding agents

## Licenses

- **Code**: GNU GPL v3.0, see [`LICENSE`](LICENSE).
- **Written content** (page copy, tool descriptions, the About page): CC BY-SA 4.0, see [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md).
- **Third-party data and libraries** keep their own terms, listed by category at [`/about/licenses/`](https://seachangeatlas.org/about/licenses/) (source: [`site/_data/credits.json`](site/_data/credits.json)).

Not affiliated with the California State Coastal Conservancy, NOAA, or any agency or organization mentioned on the site. Original tool description: <https://www.adaptationclearinghouse.org/resources/california-e-sea-the-future-e-tool.html>
