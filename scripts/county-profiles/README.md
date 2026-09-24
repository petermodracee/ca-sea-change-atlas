# County Profiles build scripts

Non-Eleventy tooling for [`docs/COUNTY-PROFILES.md`](../../docs/COUNTY-PROFILES.md).

- `validate.js` validates a snapshot against `site/data/countyProfileSchema.json` and the county spine. `site/_data/countyProfiles.js` runs it at build time and the pipeline runs it before writing a file.
- `section-models.js`, `timing.js`, `format.js` and `template-helpers.mjs` turn snapshot data into what the templates draw.
- `pipeline/` is the data pipeline. `node scripts/county-profiles/pipeline/run.js <fips | fips,fips | all>` fetches FEMA NFHL, Census blocks and ACS, LODES, USGS Structures, OpenFEMA, NOAA SLR inundation (seven regional files), NOAA ENOW and Total Economy, Census Nonemployer Statistics and NOAA C-CAP land cover, runs the block-level intersect and writes `site/data/county-profiles/latest/<fips>.json`. See the "Data pipeline" section of the doc for the method and the sources.
- `.cache/` (gitignored) holds the raw downloads, so a re-run does not fetch them again, plus the run's diagnostics report. Delete it or pass `--refresh` to re-fetch.

Still to come: the `EFF_DATE` change-detection gate (Phase 5) and the Playwright PDF renderer (Phase 6).

These scripts run once per Actions workflow invocation and write their output directly into `site/data/county-profiles/` — they are build-time tooling, not site source, which is why they live outside `site/`.
