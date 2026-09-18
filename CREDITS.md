# Credits & sources

The full, detailed reference for every third-party library, dataset, and
live data source this project uses, and the license or terms each one is
under. See [`LICENSE`](LICENSE) for this project's own code license
(GPLv3) and [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md) for its own content
license (CC BY-SA 4.0). The site's own condensed, visitor-facing version of
this page is `/licenses.html` (`licenses.njk`).

## Libraries

- **[Leaflet](https://leafletjs.com/)** — BSD-2-Clause. Map library, from
  `unpkg.com` (`leaflet@1.9.4`, pinned, SRI hash).
- **[esri-leaflet](https://github.com/Esri/esri-leaflet)** — Apache-2.0.
  ArcGIS REST client for the NOAA/FEMA sources below, from `unpkg.com`
  (`esri-leaflet@3.1.0`, pinned, SRI hash).
- **[@11ty/eleventy](https://www.11ty.dev/)** — MIT. Static site
  generator (`devDependency`, not shipped to the browser).

## Geospatial data

- **[Plotly `datasets` repository](https://github.com/plotly/datasets)**
  (`geojson-counties-fips.json`), © Plotly Technologies Inc. — **MIT
  License**. Source for `data/coverage/bay-area-counties.geojson`,
  `california-state.geojson`, and `orange-county.geojson`; originally
  derived from U.S. Census Bureau TIGER data (public domain), filtered and
  dissolved into this project's region files. License text and
  provenance: `data/coverage/ATTRIBUTION.md`, `data/coverage/SOURCES.md`.
- `data/coverage/east-contra-costa.geojson` is original, hand-drawn
  content, not derived from the Plotly/Census data — this project's own
  license terms apply (GPLv3 code / CC BY-SA 4.0 content).

## Live data sources (not stored in this repo)

- **[BCDC's Adapting to Rising Tides Bay Shoreline Flood
  Explorer](https://explorer.adaptingtorisingtides.org/)** — CC-BY-SA
  (via the Caltrans open data portal). Attribute Caltrans/BCDC; a
  redistributed copy of the dataset itself must stay share-alike.
  Planning-level only; see
  [BCDC's disclaimer](https://explorer.adaptingtorisingtides.org/about/a-disclaimer).
- **[USGS CoSMoS / Our Coast, Our
  Future](https://www.usgs.gov/centers/pcmsc/science/coastal-storm-modeling-system-cosmos)**
  — U.S. public domain (17 U.S.C. §105). Served via Point Blue
  Conservation Science's tile/WMS infrastructure (`geo.pointblue.org`).
- **[NOAA Sea Level Rise Viewer](https://coast.noaa.gov/slr/)** — U.S.
  public domain. Covers the sea-level-rise overlay and High Tide Flooding
  stations toggle.
- **[FEMA National Flood Hazard
  Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer)** —
  U.S. public domain (17 U.S.C. §105), effective data only. Not CC-BY
  3.0 — that claim traces to an unrelated third-party mirror's own
  platform-wide license, not a term FEMA imposes.
- **[NOAA Coastal Flood Exposure
  Mapper](https://coast.noaa.gov/digitalcoast/tools/flood-exposure.html)**
  — U.S. public domain. Covers the hazard-overlap composite, High Tide
  Flooding, FEMA Flood Zones, and Tsunami Run-up overlays.
- **[NOAA/NWS/NHC National Storm Surge Risk
  Maps](https://www.nhc.noaa.gov/nationalsurge/)** — U.S. public domain.
  Hurricane storm surge overlay, Category 1–2, Southern California only.
- **[OpenStreetMap](https://www.openstreetmap.org/copyright)** — ODbL.
  Base map data behind every basemap option.
- **[OpenFreeMap](https://openfreemap.org/)** /
  **[OpenMapTiles](https://openmaptiles.org/)** — free, keyless hosting
  and schema of the default greyscale (Positron) vector basemap. Style
  and code MIT; OpenMapTiles design CC-BY 4.0; data © OpenStreetMap
  contributors (ODbL).
- **[Humanitarian OpenStreetMap Team](https://www.hotosm.org/)** style,
  hosted by [OpenStreetMap France](https://openstreetmap.fr/) — optional
  Humanitarian basemap; the host asks for light use only.
- **[Esri World Imagery](https://www.esri.com/)** — optional Satellite
  basemap, visualization only, with Esri/Maxar attribution.
- **[MapLibre GL JS](https://maplibre.org/)** (BSD-3-Clause) and
  **[maplibre-gl-leaflet](https://github.com/maplibre/maplibre-gl-leaflet)**
  (ISC) — render the vector basemap; loaded lazily from unpkg at pinned
  versions with SRI hashes.
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
