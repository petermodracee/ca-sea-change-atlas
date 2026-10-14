// NOAA's Open ENOW estimates for California and the coastal United States, the comparators for the marine
// wages chart and the target of the sum check in docs/DECISIONS.md.
//
// Served by the Digital Coast data API behind the ENOW Explorer: coast.noaa.gov/enow/api/v1/openEnow
// (?geoid=06000 for California, 00000 for "All Coastal States"; the API ignores `geotype`). The dataset page
// is https://coast.noaa.gov/digitalcoast/data/openenow.html (redirects) and the method is
// https://coast.noaa.gov/data/digitalcoast/pdf/enow-introducing-open.pdf. "National" here is "All Coastal
// States": the coastal portions of the 30 shoreline states, not the whole United States, matching the
// original ENOW's coastal-U.S. series (NOAA, "Open ENOW ... for the coastal portions of 30 U.S. states").
// Open ENOW's GDP runs one year behind its jobs and wages, and it has no county rows (a county query
// returns an empty list).

const { getJson, cachedJson } = require("./http");

const API = "https://coast.noaa.gov/enow/api/v1/openEnow";

// {years: [..], byYear: {year: [{sector, establishments, employment, wages, gdp}]}} for one geography.
async function fetchOpenEnow(geoid, opts) {
  return cachedJson("open-enow-" + geoid + ".json", async () => {
    const { years } = await getJson(API + "/years");
    const byYear = {};
    for (const y of years.map(Number).sort((a, b) => a - b)) {
      const rows = await getJson(`${API}?geoid=${geoid}&year=${y}`);
      byYear[y] = rows.map(({ sector, establishments, employment, wages, gdp }) => ({ sector, establishments, employment, wages, gdp }));
    }
    return { years: Object.keys(byYear).map(Number), byYear };
  }, opts);
}

module.exports = { fetchOpenEnow, API };
