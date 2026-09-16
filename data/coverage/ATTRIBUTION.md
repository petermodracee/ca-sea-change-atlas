# Coverage boundary data — attribution

All four files in this folder (`california-state.geojson`,
`bay-area-counties.geojson`, `orange-county.geojson`) except
`east-contra-costa.geojson` are derived from:

**Plotly `datasets` repository**
https://github.com/plotly/datasets — `geojson-counties-fips.json`
Copyright (c) 2019-2024 Plotly Technologies Inc.
Licensed under the MIT License (see full text below).

That file bundles US county boundaries originally sourced from the U.S.
Census Bureau's TIGER/Line data (a public-domain U.S. government work).
This project:
- Filtered it down to the 9 San Francisco Bay Area counties
  (`bay-area-counties.geojson`) and Orange County
  (`orange-county.geojson`).
- Dissolved all 58 California county polygons into a single outline
  (`california-state.geojson`) instead of pulling a separate,
  unlicensed state-boundary source.
- Simplified all geometry with `mapshaper` to reduce file size.

`east-contra-costa.geojson` is a hand-drawn approximation (see its own
`_meta`/`source` properties and `SOURCES.md`) — it is original content,
not derived from the Plotly/Census data, since no authoritative
boundary for that study area could be found.

## MIT License text (Plotly Technologies Inc., 2019-2024)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
