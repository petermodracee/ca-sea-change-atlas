# County Profiles build scripts

Placeholder. This is where the county-profiles tool's non-Eleventy build tooling will live once Phase 2 of [`docs/COUNTY-PROFILES.md`](../../docs/COUNTY-PROFILES.md) starts: fetchers for FEMA NFHL, Census ACS, USGS Structures, OpenFEMA, NOAA C-CAP, NOAA SLR inundation, ENOW and LODES; the block-level intersect pipeline; the `EFF_DATE` change-detection gate; the Playwright PDF renderer.

These scripts run once per Actions workflow invocation and write their output directly into `site/data/county-profiles/` — they are build-time tooling, not site source, which is why they live outside `site/`.
