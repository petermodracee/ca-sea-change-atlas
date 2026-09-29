// The marine-economy and total-economy topics of a snapshot, and the sources they cite. One function
// (buildEconomyTopics) builds them for both the full pipeline (snapshot.js) and the economy-only refresh
// (run.js --economy-only), so the two cannot drift. The figures come from economy-sections.js (public QCEW).

const { cellValue } = require("../estimated");

const round = (n) => Math.round(n);
const SUPPRESSED = { suppressed: true };
const isSup = (v) => v === "SUP" || v === null || v === undefined || v === -9999 || v === "-9999";
// A published quantity, or a withheld marker; `rounder` is the rounding the figure is stored at.
const qty = (v, rounder = round) => (isSup(v) ? { ...SUPPRESSED } : rounder(Number(v)));
const isSuppressedCell = (v) => v !== null && typeof v === "object" && v.suppressed === true;

// The eleven sectors of the total economy: display label, the name in NOAA's data API (which cuts the
// longest one short), and the Nonemployer Statistics 2-digit NAICS codes that make it up. NES
// publishes no 55 (management) and no public administration: those have no nonemployers.
const TOTAL_SECTORS = [
  { label: "Construction", api: "Construction", naics: ["23"] },
  { label: "Financial activities", api: "Financial Activities", naics: ["52", "53"] },
  { label: "Education and health services", api: "Education and Health Services", naics: ["61", "62"] },
  { label: "Information", api: "Information", naics: ["51"] },
  { label: "Leisure and hospitality", api: "Leisure and Hospitality", naics: ["71", "72"] },
  { label: "Manufacturing", api: "Manufacturing", naics: ["31-33"] },
  { label: "Natural resources and mining", api: "Natural Resources and Mining", naics: ["11", "21"] },
  { label: "Other services", api: "Other Services", naics: ["81"] },
  { label: "Professional and business services", api: "Professional and Business Services", naics: ["54", "56"] },
  { label: "Public administration", api: "Public Administration", naics: [] },
  { label: "Trade, transportation, and utilities", api: "Trade, Transportation, and Utilitie", naics: ["22", "42", "44-45", "48-49"] },
];
const MARINE_SECTORS = [
  { label: "Living resources", api: "Living Resources" },
  { label: "Marine construction", api: "Marine Construction" },
  { label: "Marine transportation", api: "Marine Transportation" },
  { label: "Offshore mineral resources", api: "Offshore Mineral Resources" },
  { label: "Ship and boat building", api: "Ship and Boat Building" },
  { label: "Tourism and recreation", api: "Tourism and Recreation" },
];

const rowOf = (rows, api) => {
  const hit = rows.find((r) => r.sector.startsWith(api.slice(0, 20)));
  if (!hit) throw new Error("the economy data has no row for " + api);
  return hit;
};

// Total-jobs equation: employed + self-employed. The total is the sum of the components that are
// present, and is partial when either is withheld or is itself a partial sum.
function jobsEquation(employed, selfEmployed, sectors, years) {
  const parts = [employed, selfEmployed];
  const value = parts.reduce((s, p) => s + (isSuppressedCell(p) ? 0 : cellValue(p)), 0);
  const partial = parts.some((p) => isSuppressedCell(p) || (p !== null && typeof p === "object" && p.partial === true));
  return { employed, selfEmployed, total: { value, partial }, sectors, ...(years || {}) };
}

const vintageYear = (year) => ({ kind: "year", year });

// The economy sources for the topics the tier has, one entry per vintage. QCEW's newest year is the
// headline; BEA GDP, the wages comparison year and the self-employed counts each carry their own.
function economySources({ S, eco, nes, meta }) {
  const out = {};
  if (!eco) return out; // a flood-only county has no economy topic
  const bea = "BEA GDP by state and industry (SAGDP2), California";
  const em = eco.meta, ver = meta.verified;
  out.qcew = { label: "BLS Quarterly Census of Employment and Wages (annual averages)", url: "https://www.bls.gov/cew/", vintage: vintageYear(em.qcewYear), retrieved: em.retrieved.qcew, verified: ver.qcew };
  if (eco.marine) {
    const m = eco.marine;
    out["qcew-wages"] = { label: "BLS Quarterly Census of Employment and Wages (annual averages), wages comparison year", url: "https://www.bls.gov/cew/", vintage: vintageYear(m.wagesYear), retrieved: em.retrieved.qcew, verified: ver.qcew };
    out["bea-marine"] = { label: bea, url: "https://www.bea.gov/data/gdp/gdp-industry", vintage: vintageYear(m.gdpYear), retrieved: em.retrieved.bea, verified: ver.bea };
    out.zbp = { label: "Census ZIP Code Business Patterns and shoreline-adjacent ZIP codes", url: "https://www.census.gov/programs-surveys/cbp/data/datasets.html", vintage: vintageYear(em.zbpYear), retrieved: em.retrieved.zbp, verified: ver.zbp };
    out["open-enow"] = { label: "NOAA Open ENOW (California and coastal U.S.)", url: "https://coast.noaa.gov/digitalcoast/data/openenow.html", vintage: vintageYear(em.openEnowYear), retrieved: em.retrieved.openEnow, verified: ver.openEnow };
    out["enow-self"] = { label: "NOAA ENOW self-employed workers", url: "https://coast.noaa.gov/digitalcoast/data/enow-nes.html", vintage: vintageYear(S.selfYear), retrieved: meta.enow.retrieved, verified: ver.enow };
  }
  if (eco.total) {
    const t = eco.total;
    out["qcew-total-wages"] = { label: "BLS Quarterly Census of Employment and Wages (annual averages), wages comparison year", url: "https://www.bls.gov/cew/", vintage: vintageYear(t.wagesYear), retrieved: em.retrieved.qcew, verified: ver.qcew };
    out["bea-total"] = { label: bea, url: "https://www.bea.gov/data/gdp/gdp-industry", vintage: vintageYear(t.gdpYear), retrieved: em.retrieved.bea, verified: ver.bea };
    out["coastal-economy"] = { label: "NOAA Total Economy (Coastal), coastal California and coastal U.S.", url: "https://coast.noaa.gov/digitalcoast/data/coastaleconomy.html", vintage: vintageYear(S.totalYear), retrieved: meta.enow.retrieved, verified: ver.coastalEconomy };
    if (nes) out.nes = { label: "Census Nonemployer Statistics", url: "https://www.census.gov/programs-surveys/nonemployer-statistics.html", vintage: vintageYear(nes.value.year), retrieved: meta.nes.retrieved, verified: ver.nes };
  }
  return out;
}

// {totalEconomy, marine, sources}. `jobsAtRiskTotal` is the total economy's LODES-based section, built by
// the caller (from the intersect, or carried over from the previous snapshot in an economy-only refresh).
function buildEconomyTopics({ entry, has, S, eco, nes, meta, jobsAtRiskTotal, gaps, use }) {
  const section = (sources, data) => ({ available: true, reason: null, use: { ...use }, sources, data });
  const gap = (reason) => ({ available: false, reason, use: { ...use }, sources: [], data: null });
  const noteGap = (where, reason) => { gaps.push(where + ": " + reason); return gap(reason); };

  let totalEconomy = {};
  if (has("total-economy")) {
    if (!S.coastal.length) throw new Error(entry.name + ": the tier says shore-adjacent, but the Total Economy (Coastal) data has no rows for it");
    const nesRow = nes ? nes.value.counties[entry.fips] : null;
    const nesCell = (code) => {
      const c = nesRow[code];
      return c === undefined ? 0 : c.suppressed ? { ...SUPPRESSED } : c.estab;
    };
    const nesSector = (s) => {
      const cells = s.naics.map(nesCell);
      return cells.some(isSuppressedCell) ? { ...SUPPRESSED } : cells.reduce((a, b) => a + b, 0);
    };
    const t = eco.total;
    totalEconomy = {
      measuring: section(["qcew", "bea-total"], t.measuring),
      diversity: section(["qcew", "bea-total"], t.diversity),
      "jobs-at-risk": jobsAtRiskTotal,
      wages: section(["qcew-total-wages", "coastal-economy"], t.wages),
      "total-jobs": !nesRow || !Object.keys(nesRow).length ? noteGap("total-economy/total-jobs", "source-geography") : section(["qcew", "nes"], jobsEquation(
        t.employed,
        nesRow["00"] ? nesCell("00") : { ...SUPPRESSED },
        TOTAL_SECTORS.map((s) => ({ label: s.label, selfEmployed: nesSector(s) })),
        { employedYear: t.Y, selfEmployedYear: nes.value.year },
      )),
    };
  }

  let marine = {};
  if (has("marine-economy")) {
    if (!S.ocean.length) throw new Error(entry.name + ": the tier says it is in ENOW, but ENOW has no rows for it");
    const self = S.self, selfAll = rowOf(self, "Ocean Economy");
    const m = eco.marine;
    marine = {
      measuring: section(["qcew", "bea-marine", "zbp"], m.measuring),
      diversity: section(["qcew", "bea-marine", "zbp"], m.diversity),
      wages: section(["qcew-wages", "open-enow", "zbp"], m.wages),
      "total-jobs": section(["qcew", "zbp", "enow-self"], jobsEquation(
        m.employed,
        qty(selfAll.employment),
        MARINE_SECTORS.map((s) => ({ label: s.label, selfEmployed: qty(rowOf(self, s.api).employment) })),
        { employedYear: m.Y, selfEmployedYear: S.selfYear },
      )),
    };
  }
  return { totalEconomy, marine, sources: economySources({ S, eco, nes, meta }) };
}

module.exports = { buildEconomyTopics, economySources, TOTAL_SECTORS, MARINE_SECTORS, jobsEquation, qty, rowOf };
