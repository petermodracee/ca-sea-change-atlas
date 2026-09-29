// Loads the economy inputs once per run (QCEW, ZBP shoreline shares, BEA GDP, Open ENOW) and builds one
// county's marine and total economy sections from them.

const { fetchQcew } = require("./qcew");
const { fetchShoreShares } = require("./zbp");
const { fetchGdp } = require("./bea");
const { fetchOpenEnow } = require("./open-enow");
const imp = require("./impute");
const E = require("./economy");
const { marineSections, totalSections } = require("./economy-sections");

let loaded = null;

async function loadEconomyInputs(fipsList, spine, opts) {
  if (loaded) return loaded;
  const qcew = await fetchQcew(fipsList, opts);
  const zbp = await fetchShoreShares(opts, spine);
  const gdp = await fetchGdp(opts);
  const ca = await fetchOpenEnow("06000", opts);
  const us = await fetchOpenEnow("00000", opts);
  const ctx = imp.makeContext(qcew.value);
  const g = E.makeGdp(ctx, gdp);
  loaded = {
    ctx, g, shares: zbp.value.shares,
    openEnow: { ca: ca.value, us: us.value },
    meta: {
      qcewYear: qcew.value.last,
      zbpYear: zbp.value.zbpYear, coastlineYear: zbp.value.coastlineYear, shoreTolerance: zbp.value.tolerance, shoreZips: zbp.value.shoreZips,
      openEnowYear: ca.value.years[ca.value.years.length - 1],
      retrieved: { qcew: qcew.fetched, zbp: zbp.fetched, bea: gdp.fetched, openEnow: ca.fetched < us.fetched ? ca.fetched : us.fetched },
    },
  };
  return loaded;
}

// {marine, total} for one county, or null for a topic the tier does not have. `noaa` is the NOAA Total
// Economy (Coastal) comparator set ({year, state, nation}) the total-economy wages chart uses.
function economyFor(inputs, entry, tierTopics, noaa) {
  const { ctx, g, shares, openEnow } = inputs;
  const out = { marine: null, total: null, meta: inputs.meta, estimate: null };
  if (tierTopics["marine-economy"].available) {
    const est = imp.estimateCounty(ctx, entry.fips);
    out.estimate = est;
    out.marine = marineSections({ ctx, est, shares, g, fips: entry.fips, openEnow });
  }
  if (tierTopics["total-economy"].available) out.total = totalSections({ ctx, fips: entry.fips, g, noaa });
  return out;
}

module.exports = { loadEconomyInputs, economyFor };
