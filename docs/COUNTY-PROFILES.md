# County Profiles

A third CASCA tool, rebuilding the function of NOAA's discontinued [Coastal County Snapshots](https://coast.noaa.gov/digitalcoast/tools/snapshots.html) for California, at the county level: flood hazard, sea-level-rise, total-economy and marine-economy exposure, for 27 counties. The map answers "where is the hazard?", the comparison tool answers "which tool should I use?", and County Profiles answers "what does this mean for my jurisdiction?"

This file tracks the tool as it's built. The full design — county spine and coverage tiers, the availability model, sea-level-rise framing against OPC scenarios, the vintaging and snapshot-archive rules, the build pipeline, and the six-phase implementation plan — lives in the project's own spec document; this doc is filled in with that content, section by section, as each phase lands, per [`ARCHITECTURE.md`](ARCHITECTURE.md#documentation-conventions) ("update the relevant doc in the same change as the code").

## Status

Not yet started. This is a placeholder ahead of Phase 1.

## Routes (planned)

Nested under `/county-profiles/`, consistent with how `/map/` and `/compare/` are grouped:

| Route | Purpose |
|---|---|
| `/county-profiles/` | Index: all 27 counties with a coverage matrix and the county-selection explainer |
| `/county-profiles/county/<id>/` | Current profile, all four topics |
| `/county-profiles/county/<id>/<date>/` | Frozen snapshot, ISO-dated |
| `/county-profiles/data/latest/<fips>.json` | Current data for one county |
| `/county-profiles/data/<date>/<fips>.json` | Frozen snapshot data |
| `/county-profiles/county/<id>/<topic>.pdf` | Per-topic PDF (current snapshot only) |
| `/county-profiles/county/<id>/profile.pdf` | Full-county PDF |
| `/county-profiles/about/` | Methodology: data sources, the Esri exclusion, the LODES substitution, gauge assignments |

Archived dated snapshot pages must not dilute search ranking for the current one once they exist — see the SEO note below.

## File layout (planned)

- `site/county-profiles/` — Eleventy templates for the routes above (created when Phase 1 starts).
- `site/data/county-profiles/` — generated, committed snapshot JSON (`latest/` and `<date>/`), servable at the `/county-profiles/data/...` routes above via passthrough copy. Committed for the archive's git-history backstop; never hand-edited.
- `scripts/county-profiles/` — non-Eleventy build tooling run by the Actions workflow: fetchers for FEMA NFHL, Census ACS, USGS Structures, OpenFEMA, NOAA C-CAP, NOAA SLR inundation, ENOW and LODES; the block-level intersect pipeline; the `EFF_DATE` change-detection gate; the Playwright PDF renderer. Writes its output directly into `site/data/county-profiles/`.

## Data sources and licensing

All public domain except Esri Business Analyst business-location data, which is licensed and excluded outright (replaced by LEHD LODES workplace-area-characteristics job counts — a different measure, reported as such). Full source list, cadence and the reasoning behind each substitution belong here once Phase 2 fetches real data; see the spec for the complete table.

## SEO note for the snapshot archive

Once `/county-profiles/county/<id>/<date>/` exists, archived dated snapshots need a `noindex` meta tag (or a canonical pointing at the `latest/` page) so search engines don't index dozens of near-duplicate pages per county over years, which would dilute ranking for the current profile. This must land with Phase 5 (the archive), not be retrofitted later.

## Implementation phasing

1. **Data model and county spine** — schema, availability model with reason codes, three-timestamp vintage fields, method version, hardcoded 27-county spine with tiers. Index page against fixtures.
2. **The intersect pipeline, one county (Orange)** — the correctness phase: real NFHL/ACS/LODES/USGS/OpenFEMA data, block-level intersects rolled up for display, `EFF_DATE` vintage. Gate: figures reconcile against NOAA's published values or the divergence is explained.
3. **All counties, all topics** — scale to 27 counties, add ENOW and C-CAP, exercise every availability state including the delta and flood-only tiers.
4. **Sea-level-rise scenario layer** — reference gauge per county, precomputed half-foot increments annotated with OPC scenario and horizon, client-side selection toggle with URL encoding.
5. **Automation and the archive** — the single Actions workflow, quarterly schedule plus dispatch, `EFF_DATE` short-circuit, snapshot-on-change, committed JSON, dated URLs. Add the SEO `noindex`/canonical handling here.
6. **PDF and print** — print CSS for live pages, Playwright generation for snapshots, per-topic scoping, prominent data-as-of, accessibility note.

Phase 2 is the real risk: everything after it is assembly, and a wrong intersect method makes every number in the tool wrong and the archive makes it permanently citable.
