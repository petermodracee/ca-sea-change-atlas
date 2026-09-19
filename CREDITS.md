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

## Live data sources (not stored in this repo)

- **Geo / demographic info layers** — each loaded from the agency that
  publishes the data: EPA Smart Location Database and Facility Registry
  Service, CDC/ATSDR Social Vulnerability Index, USGS The National Map
  Structures, and NOAA C-CAP land cover and Wetland Potential (all U.S.
  public domain); Caltrans traffic and truck volumes
  (CC BY — attribute Caltrans).
- **[BCDC's Adapting to Rising Tides Bay Shoreline Flood
  Explorer](https://explorer.adaptingtorisingtides.org/)** — CC-BY-SA
  (via the Caltrans open data portal). Attribute Caltrans/BCDC; a
  redistributed copy of the dataset itself must stay share-alike.
  Planning-level only; see
  [BCDC's disclaimer](https://explorer.adaptingtorisingtides.org/about/a-disclaimer).
- **[BCDC's East Contra Costa Shoreline Flood
  Explorer](https://eccexplorer.adaptingtorisingtides.org/)** (BCDC /
  SFEI) — same BCDC Adapting to Rising Tides program, WMS server and
  terms as the Bay Shoreline Flood Explorer above (CC-BY-SA via the
  Caltrans open data portal; attribute Caltrans/BCDC; planning-level
  only, see
  [BCDC's disclaimer](https://eccexplorer.adaptingtorisingtides.org/about/a-disclaimer)).
- **[Cal-Adapt Sea Level Rise – Coastal Inundation
  Scenarios](https://cmip5.cal-adapt.org/tools/slr-coastal-inundation/)**
  — flood-extent tiles for two models, loaded live from
  `api.cal-adapt.org`, mosaicked by UC Berkeley's Geospatial Innovation
  Facility for Cal-Adapt. The tool page states no separate license (the
  CoSMoS component is USGS, U.S. public domain); attribute Cal-Adapt and
  cite the underlying studies:
  - CoSMoS — Barnard, P.L., et al. (2019). Dynamic flood modeling
    essential to assess the coastal impacts of climate change.
    *Scientific Reports*, 9, 4309.
    [doi:10.1038/s41598-019-40742-z](https://doi.org/10.1038/s41598-019-40742-z)
  - CalFloD3D-TFS — Radke, J., et al. (2018). *Assessing extreme
    weather-related vulnerability and identifying resilience options for
    California's interdependent transportation fuel sector.* California's
    Fourth Climate Change Assessment, California Energy Commission,
    CCCA4-CEC-2018-012.
    [PDF](https://www.energy.ca.gov/sites/default/files/2019-11/Energy_CCCA4-CEC-2018-012_ADA.pdf)
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
- **[leaflet.locatecontrol](https://github.com/domoritz/leaflet-locatecontrol)**
  (MIT) — the "show my location" button; loaded from unpkg at a pinned
  version with SRI hashes.
- **[MapLibre GL JS](https://maplibre.org/)** (BSD-3-Clause) and
  **[maplibre-gl-leaflet](https://github.com/maplibre/maplibre-gl-leaflet)**
  (ISC) — render the vector basemap; loaded lazily from unpkg at pinned
  versions with SRI hashes.
- **[OpenStreetMap Nominatim](https://nominatim.org/)** — address search
  and geocoding.

## Comparison-only sources (cataloged on `sources.html`, not mapped)

See `BRIEF.md`'s "Licensing per source" section for the full detail behind
each of these, including why some are permanently comparison-only:

- **HERA (USGS)** — likely feasible, unverified license.
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
