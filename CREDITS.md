# Credits & sources

The full, detailed reference for every third-party library, dataset, and
live data source this project uses, and the license or terms each one is
under. See [`LICENSE`](LICENSE) for this project's own code license
(GPLv3) and [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md) for its own content
license (CC BY-SA 4.0). The site's own condensed, visitor-facing version of
this page is `/licenses.html` (`licenses.njk`).

## Libraries

- **[Leaflet](https://leafletjs.com/)** (BSD-2-Clause) — the map library
  itself, loaded from the `unpkg.com` CDN in `map.html` at a pinned
  version (`leaflet@1.9.4`) with a Subresource Integrity hash.
- **[esri-leaflet](https://github.com/Esri/esri-leaflet)** (Apache-2.0) —
  the ArcGIS REST client library used for the NOAA/FEMA sources below,
  loaded from the `unpkg.com` CDN at a pinned version (`esri-leaflet@3.1.0`)
  with a Subresource Integrity hash, same pattern as Leaflet.
- **[@11ty/eleventy](https://www.11ty.dev/)** (MIT) — the static site
  generator this project is built with (a `devDependency`, not shipped to
  the browser).

## Geospatial data

- **[Plotly `datasets` repository](https://github.com/plotly/datasets)**
  (`geojson-counties-fips.json`), © Plotly Technologies Inc., **MIT
  License** — source for `data/coverage/bay-area-counties.geojson`,
  `data/coverage/california-state.geojson`, and
  `data/coverage/orange-county.geojson`. That file's county boundaries
  originate from U.S. Census Bureau TIGER data (public domain). This
  project filtered it to the relevant counties and dissolved California's
  counties into a single state outline. Full MIT license text and
  provenance detail: `data/coverage/ATTRIBUTION.md` and
  `data/coverage/SOURCES.md`.
- `data/coverage/east-contra-costa.geojson` is original, hand-drawn
  content (not derived from the Plotly/Census data) — no authoritative
  boundary for that study area was found. Licensed the same as the rest
  of this project's own code (GPLv3) / content (CC BY-SA 4.0) as
  applicable.

## Live data sources (not stored in this repo)

- **[BCDC's Adapting to Rising Tides Bay Shoreline Flood
  Explorer](https://explorer.adaptingtorisingtides.org/)** — the
  flood-depth overlay is loaded live from BCDC's own WMS map server.
  Mirrored through the Caltrans open data portal, **licensed CC-BY-SA**:
  attribute Caltrans/BCDC, and if the dataset itself (not just this app)
  is redistributed in modified form, it must stay share-alike licensed.
  Planning-level only; see
  [BCDC's disclaimer](https://explorer.adaptingtorisingtides.org/about/a-disclaimer).
- **[USGS CoSMoS / Our Coast, Our
  Future](https://www.usgs.gov/centers/pcmsc/science/coastal-storm-modeling-system-cosmos)**
  — flood/wave/current/cliff-retreat/shoreline/groundwater overlays are
  loaded live from Point Blue Conservation Science's own tile/WMS
  infrastructure (`geo.pointblue.org`). USGS data is U.S. public domain
  (17 U.S.C. §105); Point Blue asks only for a courtesy citation (per
  their own "suggested citations" document, no redistribution
  restriction stated).
- **[NOAA Sea Level Rise Viewer](https://coast.noaa.gov/slr/)** — the
  sea-level-rise overlay and High Tide Flooding stations toggle are
  loaded live from NOAA's own ArcGIS MapServer family. NOAA data is U.S.
  public domain, and NOAA's Digital Coast program is separately required
  by its authorizing legislation to keep this data "fully and freely
  available." Credited as a courtesy, not a legal requirement.
- **[FEMA National Flood Hazard
  Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer)** —
  the flood-zone overlay (effective data only) is loaded live from FEMA's
  own ArcGIS MapServer. U.S. public domain under 17 U.S.C. §105; FEMA's
  own NFHL metadata asks only for "acknowledgement... appreciated," not a
  specific license or mandatory attribution (this is **not** CC-BY 3.0 —
  that claim traces to an unrelated third-party mirror's platform-wide
  license, not a term FEMA itself imposes). Credited prominently anyway,
  as good practice.
- **[NOAA Coastal Flood Exposure
  Mapper](https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html)**
  — the hazard-overlap composite, High Tide Flooding, FEMA Flood Zones,
  and Tsunami Run-up overlays are each loaded live from NOAA's own ArcGIS
  MapServers. Same public-domain footing as NOAA's Sea Level Rise Viewer
  above; credited as a courtesy.
- **[NOAA/NWS/NHC National Storm Surge Risk
  Maps](https://www.nhc.noaa.gov/nationalsurge/)** — the hurricane storm
  surge overlay (Category 1–2, Southern California only) is loaded live
  from a separate ArcGIS Online hosted tile service published by NOAA's
  National Hurricane Center Storm Surge Unit. Same public-domain federal
  data footing as the rest of NOAA's sources above; credited as a
  courtesy.
- **[OpenStreetMap](https://www.openstreetmap.org/copyright)** contributors
  (ODbL) — the base map tile imagery.
- **[OpenStreetMap Nominatim](https://nominatim.org/)** — address search
  and geocoding.

## Comparison-only sources (cataloged on `sources.html`, not mapped)

See `BRIEF.md`'s "Licensing per source" section for the full detail behind
each of these, including why some are permanently comparison-only:

- **Cal-Adapt (CNRA)** — mirrored through the Caltrans open data portal,
  **CC-BY-SA**, same terms as BCDC above. Confirmed legal for map use;
  not yet implemented as a layer.
- **East Contra Costa Shoreline Flood Explorer (BCDC/SFEI)**, **HERA
  (USGS)** — likely feasible, unverified license.
- **FloodRISE (UC Irvine)**, **CREST (NFWF)** — pending a license check;
  see `BRIEF.md`'s TODO list for the specific verification steps.
- **Coastal Risk Screening Tool** and **Surging Seas Risk Finder**
  (Climate Central) — **permanently off-limits**: Climate Central's Terms
  of Use explicitly prohibit bulk downloading and automated/"screen
  scraping" access.
- **Coastal Resilience Mapping Portal (The Nature Conservancy)** —
  **permanently off-limits**: TNC's Terms of Use restrict reuse to
  personal, non-commercial single copies and prohibit mirroring content;
  their own ArcGIS REST server metadata reserves all rights.

## Attribution rendering

A condensed version of the live-data-source list above is shown directly
on the deployed site: `map.html`'s bottom attribution strip, Leaflet's own
attribution control, and `/licenses.html`.
