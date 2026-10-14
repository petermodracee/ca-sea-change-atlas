# County Profiles build scripts

Non-Eleventy tooling for [`docs/COUNTY-PROFILES.md`](../../docs/COUNTY-PROFILES.md).

- `validate.js` validates a snapshot against `site/data/countyProfileSchema.json` and the county spine. `site/_data/countyProfiles.js` runs it at build time and the pipeline runs it before writing a file.
- `section-models.js`, `timing.js`, `format.js` and `template-helpers.mjs` turn snapshot data into what the templates draw.
- `pipeline/` is the data pipeline. `node scripts/county-profiles/pipeline/run.js <fips | fips,fips | all>` fetches FEMA NFHL, Census blocks and ACS, LODES, USGS Structures, OpenFEMA, NOAA SLR inundation (seven regional files), BLS QCEW, BEA GDP by industry, Census ZIP Code Business Patterns and TIGER shoreline geography, NOAA Open ENOW, ENOW and Total Economy (comparators and footprint), Census Nonemployer Statistics and NOAA C-CAP land cover, runs the block-level intersect and writes `site/data/county-profiles/latest/<fips>.json`. See the "Data pipeline" section of the doc for the method and the sources.
- `.cache/` (gitignored) holds the raw downloads, so a re-run does not fetch them again, plus the run's diagnostics report. Delete it or pass `--refresh` to re-fetch.

- `pipeline/gate.js` is the `EFF_DATE` change gate, `pipeline/archive.js` decides when a dated snapshot is minted, and `check-archive.js` fails if a published dated snapshot was edited (Phase 5; see "Automation and the archive" in the doc). The workflow is `.github/workflows/county-profiles.yml`.

- `pipeline/run.js <fips|all> --economy-only` rebuilds only the marine and total economy topics of the existing snapshot (Phase 7); `--reset-archive` overwrites the dated snapshot in place (never used by the workflow). `analysis/economy-validation.js` prints the validation tables in `docs/DECISIONS.md`; `analysis/diff-hazard.js <baseline dir>` proves the flood hazard and sea level rise figures did not move. `estimated.js` holds the estimated state's one threshold constant.

Print is the reader's browser (Phase 6); no PDFs are generated.

These scripts run once per Actions workflow invocation and write their output directly into `site/data/county-profiles/` — they are build-time tooling, not site source, which is why they live outside `site/`.
