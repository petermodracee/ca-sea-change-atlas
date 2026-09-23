# County Profiles build scripts

Today this holds `validate.js` (validates a snapshot against `site/data/countyProfileSchema.json` and the county spine; run by `site/_data/countyProfiles.js` at build time and meant for the pipeline to call before writing) and `template-helpers.mjs` (chart maths for the Eleventy filters). It is also where the county-profiles tool's non-Eleventy build tooling will live once Phase 2 of [`docs/COUNTY-PROFILES.md`](../../docs/COUNTY-PROFILES.md) starts: fetchers for FEMA NFHL, Census ACS, USGS Structures, OpenFEMA, NOAA C-CAP, NOAA SLR inundation, ENOW and LODES; the block-level intersect pipeline; the `EFF_DATE` change-detection gate; the Playwright PDF renderer.

These scripts run once per Actions workflow invocation and write their output directly into `site/data/county-profiles/` — they are build-time tooling, not site source, which is why they live outside `site/`.
