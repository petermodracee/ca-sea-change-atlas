# County Profiles data archive

This directory holds the tool's committed snapshot JSON: `latest/` for the current build and, later, one dated subdirectory per archived snapshot. It is described in [`docs/COUNTY-PROFILES.md`](../../../docs/COUNTY-PROFILES.md) and validated against [`../countyProfileSchema.json`](../countyProfileSchema.json).

Nothing here is hand-authored, and it stays that way: everything is produced by `scripts/county-profiles/`, and Phase 5's snapshot-on-change diffs against `latest/`, so its git history is the archive's backstop. Never edit a published snapshot in place (a correction is a new snapshot plus a notice on the old one, per the spec's archive rules).

Until the pipeline exists this directory has no `latest/`. The placeholder fixtures the pages render meanwhile live in `site/_data/countyProfileFixtures/`, and the hand-authored county list is `site/_data/countySpine.json`.
