# County Profiles data archive

This directory holds the tool's committed snapshot JSON: `latest/` for the current build and one dated subdirectory per minted snapshot (a county appears in one only when its content changed), plus `gate.json`, the NFHL fingerprints the change gate diffs against. It is described in [`docs/COUNTY-PROFILES.md`](../../../docs/COUNTY-PROFILES.md) and validated against [`../countyProfileSchema.json`](../countyProfileSchema.json).

Nothing here is hand-authored, and it stays that way: everything is produced by `scripts/county-profiles/pipeline/`, and the archive is append-only. Never edit a published dated snapshot in place: a correction is a new snapshot plus a notice in `site/_data/countyProfileCorrections.json`. `scripts/county-profiles/check-archive.js` fails on an edit.

`latest/` holds one file per county in the spine (27), each written by the pipeline. The hand-authored county list is `site/_data/countySpine.json`.
