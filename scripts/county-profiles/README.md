# County Profiles build scripts

Non-Eleventy tooling for [`docs/COUNTY-PROFILES.md`](../../docs/COUNTY-PROFILES.md).

- `validate.js` validates a snapshot against `site/data/countyProfileSchema.json` and the county spine. `site/_data/countyProfiles.js` runs it at build time and the pipeline runs it before writing a file.
- `section-models.js`, `timing.js`, `format.js` and `template-helpers.mjs` turn snapshot data into what the templates draw.
- `pipeline/` is the data pipeline (Phase 2, Orange County). `node scripts/county-profiles/pipeline/run.js 06059` fetches FEMA NFHL, Census blocks and ACS, LODES, USGS Structures, OpenFEMA and NOAA SLR inundation, runs the block-level intersect and writes `site/data/county-profiles/latest/06059.json`. See the "Data pipeline" section of the doc for the method and the sources.
- `.cache/` (gitignored) holds the raw downloads, so a re-run does not fetch them again, plus the run's diagnostics report. Delete it or pass `--refresh` to re-fetch.

Still to come: the ENOW and C-CAP fetchers (Phase 3), the `EFF_DATE` change-detection gate (Phase 5) and the Playwright PDF renderer (Phase 6).

These scripts run once per Actions workflow invocation and write their output directly into `site/data/county-profiles/` — they are build-time tooling, not site source, which is why they live outside `site/`.
