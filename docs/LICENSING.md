# Licensing of data sources

This is the reasoning behind what is and isn't drawn on the map. The visitor-facing list of licenses and attributions is `/licenses.html`, generated from [`_data/credits.json`](../_data/credits.json); keep that current first. This file records the evidence and the rules, so the decisions don't have to be re-researched.

The project's own licenses (GPLv3 code, CC BY-SA 4.0 content) are in [`LICENSE`](../LICENSE) and [`LICENSE-CONTENT.md`](../LICENSE-CONTENT.md). Contribution rules are in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## The rule

A source goes on the map only if it has a confirmed, documented path to reuse. Layers are always loaded live from the publisher's own server and never copied into this repository. A source that fails the test stays on the comparison page only ("external tool only"), and `data/tools.json` records `mapEligibility: "excluded"`; the reason is recorded here.

**Do not fetch, proxy, scrape or embed the data of a comparison-only source**, however technically reachable it is. That is a permissions problem, not a technical one.

## Sources on the map

| Source | Footing | Obligation |
|---|---|---|
| NOAA (Sea Level Rise Viewer, CFEM, High Tide Flooding stations, C-CAP), NHC storm surge | U.S. federal data, public domain under 17 U.S.C. §105. NOAA's Digital Coast program is also required by its authorizing legislation to keep its data "fully and freely available". | None; credited as a courtesy. |
| USGS (CoSMoS, National Map Structures) | Public domain per USGS's information policy. | None. CoSMoS is served through Point Blue Conservation Science's infrastructure (`geo.pointblue.org`); Point Blue asks only for a courtesy citation (checked against its own suggested-citations document; no redistribution restriction stated). |
| FEMA National Flood Hazard Layer | Public domain. Verified against FEMA's own metadata (`hazards.fema.gov/filedownload/metadata/NFHL/NFHL_metadata.xml`): use constraint "Acknowledgement of FEMA would be appreciated in products derived from these data", access constraint "None". | None; FEMA is credited anyway. **Not CC BY 3.0**: that claim traces to a third-party Data Basin mirror applying its own platform-wide license to its copy, not a term FEMA imposes. |
| EPA (Smart Location Database, FRS), CDC/ATSDR SVI | U.S. federal data, public domain. | None. |
| BCDC Adapting to Rising Tides (Bay and East Contra Costa) | CC BY-SA, via the Caltrans open data portal. | Attribute Caltrans/BCDC. If the *dataset itself* were ever redistributed in modified form it would need to stay share-alike; displaying it as a live layer is fine. |
| Cal-Adapt Sea Level Rise – Coastal Inundation Scenarios | No separate license stated on the tool. The CoSMoS component is USGS (public domain); CalFloD3D-TFS is California Energy Commission / Fourth Climate Change Assessment. | Attribute Cal-Adapt and cite the underlying studies (listed in `credits.json`). |
| Caltrans traffic and truck volumes | CC BY. | Attribute Caltrans. |
| OpenStreetMap, OpenFreeMap / OpenMapTiles | ODbL data; MIT style and code; CC BY 4.0 schema. | Attribution shown on the map. |

## Comparison-only sources

**Redundant, not a licensing problem**

- **USGS HERA.** Public domain, but its coastal-flooding, groundwater and shoreline-change hazard data is itself sourced from CoSMoS, which is already on the map. HERA is an exposure-analytics tool built on top of those hazard zones (Census population, InfoGroup economic assets, parcel values, NLCD land cover, roads, rail, critical facilities), not new flood-extent geometry.

- **NOAA Coastal Inundation Dashboard.** Federal data (no license statement on the page). It is station-based, and the flood thresholds it shows are the CO-OPS ones the map already draws as High Tide Flooding stations; its sea-level-rise mapping is NOAA's Sea Level Rise Viewer, also on the map. Redundant.
- **NOAA Coastal County Snapshots.** Per-county reports, not a queryable service; NOAA says the datasets are no longer updated. Its flood inputs (FEMA, NOAA SLR) are already mapped. Redundant.

**No reuse license found**

- **FloodRISE (UC Irvine).** The UCI Blum Center project page carries a blanket "All Rights Reserved" footer, and no terms of use were found for the live viewers (hosted on a `floodrise.uci.edu` subdomain).
- **CREST (NFWF).** The underlying federal hazard inputs are public domain, but the Resilience Hub composite output is NFWF/NEMAC's own derived work with no stated license. No general terms of use were found for `nfwf.org` or `resilientcoasts.org`.

To revisit either if the publisher posts license terms:

- FloodRISE: fetch `arcgis.com/sharing/rest/content/items/<id>?f=json` for each viewer id (Newport Beach `4570d7dbfb674aac9887a20eea9c0c4f`, Tijuana River Valley `1d3fe4654858432aad4ca324b6e819ea`, Goat Canyon `a9eff25442434888b5007919cb92c6d7`) and look for a populated `licenseInfo`. If empty, ask the Blum Center (`blumcenter@uci.edu`); UCI's default is all rights reserved, so silence means no.
- CREST: click through Launch, then Download Data on resilientcoasts.org in a real browser and read any license or metadata file bundled with the download. If there is none, email NFWF rather than assuming permission or prohibition.

**Confirmed off limits. Don't revisit without new information.**

- **Climate Central** (Coastal Risk Screening Tool, Surging Seas Risk Finder). Terms of Use (`climatecentral.org/what-we-do/legal`) state that bulk downloading is prohibited and that use of any automated system or software to extract data from the site for any purpose ("screen scraping") is prohibited. The flood-risk maps are separately flagged as not for reuse outside their own context.
- **The Nature Conservancy** (Coastal Resilience Mapping Portal). Terms of Use (`coastalresilience.org/terms-of-use`) restrict reuse to personal, non-commercial single copies and prohibit mirroring content on any other server. TNC's own public ArcGIS REST server (`services2.coastalresilience.org`) carries "The Nature Conservancy reserves all rights in data provided" in its layer metadata, so even where a service is reachable it grants no reuse rights.

## Context layers and the old "no exposure" scope

The map originally scoped itself to sea-level-rise and flood-hazard tools and deliberately left out NOAA CFEM's "exposure" layers (who and what is exposed, as opposed to the hazard). It now includes a Geo / demographic info group of context layers. They come from the agency that publishes each dataset, not from CFEM's repackaging, so the licensing is the publisher's own (see the table above). What CFEM's exposure layers are sourced from, in case it matters again (per NOAA's published data-sources table, `coast.noaa.gov/data/digitalcoast/pdf/flood-exposure-data.pdf`):

| CFEM layer | Actual source |
|---|---|
| Population Density, Poverty, Elderly | U.S. Census Bureau (2020 Census / ACS), not NOAA |
| Employees | **Esri Business Analyst, a licensed product. NOAA states it is not publicly available. It cannot be used.** The map substitutes EPA's LEHD-derived Smart Location Database. |
| Critical Facilities | USGS The National Map structures |
| Pollution Sources | EPA Facility Registry Service |
| Development, Development Changes, Natural Areas and Open Space | NOAA's own Coastal Change Analysis Program (C-CAP) land cover |
