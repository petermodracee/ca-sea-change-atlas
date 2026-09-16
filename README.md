# Sea the Future (recreated)

An unofficial recreation of California's discontinued "Sea the Future"
tool — a comparison guide to sea-level-rise and coastal-flooding
visualization tools, meant to help someone pick which of the 12 tools
actually applies to their patch of coastline.

## Status

Early scaffold. See `BRIEF.md` for the actual project brief and
definition of done — that's the file to hand to an agent (or read
yourself) before making changes.

## Layout

- `BRIEF.md` — the project brief: goals, map interaction spec, data
  model, constraints, definition of done.
- `data/tools.json` — the 12-tool dataset (descriptions, scope, links,
  strengths/limitations, etc.), with a `coverageRegion` field on each
  tool pointing at a region id.
- `data/coverage/SOURCES.md` — where to find real boundary data for each
  `coverageRegion` id. No GeoJSON exists yet — that's the next thing to
  add.
- `reference/sea-the-future-prototype.html` — a working single-file
  prototype with the filter-and-compare UI (no map yet). Useful as a
  reference for the comparison-table logic and the visual style; not
  meant to be the final architecture.
- `index.html` (not yet created) — where the real map-based version
  should live once it exists.

## Running locally

No build step once `index.html` exists:

```
python3 -m http.server
```

then open `http://localhost:8000`.

## Deploying

GitHub Pages, serving from either the repo root or a `docs/` folder —
whichever this ends up using. No server-side code required.

## Source

Reconstructed from the tool's original public spec:
https://www.adaptationclearinghouse.org/resources/california-e-sea-the-future-e-tool.html
The original platform is offline; this project isn't affiliated with the
California State Coastal Conservancy or NOAA.
