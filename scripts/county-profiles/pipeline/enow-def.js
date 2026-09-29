// Definitions for the marine and total economy estimates (Phase 7).
//
// Marine sectors and their NAICS codes are Open ENOW's (NOAA Office for Coastal Management,
// "Introducing the Open ENOW Dataset", March 2026, tables 2 to 7): a code has a validity window
// because QCEW switched NAICS vintages during the series (2012, 2017 and 2022 revisions). Open ENOW
// uses 4- and 5-digit codes in place of some 6-digit ones where every industry under the shorter code
// is in the same sector; that is kept here, and the imputation ladder's "parent" of a code is the
// same code with its last digit dropped.
//
// Not the original ENOW's crosswalk. Open ENOW adds 493190 (inside 4931), 721199, 721214, 722410 and
// 713110 to the original definitions; every difference is recorded in docs/DECISIONS.md.

// First QCEW year the pipeline reads. NAICS 2012 codes begin here (722511 and 311710 exist in the
// 2012 annual file), so every code below that was discontinued before 2012 is inert. Earlier years
// would need the 2002/2007 vintages' codes; Open ENOW's own series starts in 2001, ours in 2012.
const FIRST_YEAR = 2012;

const OPEN = 9999;
// `shore: true` marks a tourism and recreation code whose industry is only partly ocean-related
// (restaurants, lodging, amusement): only the share of it in shoreline-adjacent ZIP codes counts. A
// code that is itself marine (marinas, boat dealers, scenic water tours) or manufactured goods
// (sporting goods) counts in full. The Open ENOW document does not say which codes are which; this
// split is our call, tested against Open ENOW's California total (docs/DECISIONS.md).
const MARINE_CODES = {
  "Living Resources": [
    { code: "11251", from: 2001, to: OPEN, bea: "113-115" },
    { code: "11411", from: 2001, to: OPEN, bea: "113-115" },
    { code: "311710", from: 2012, to: OPEN, bea: "311-312" },
    { code: "311711", from: 2001, to: 2011, bea: "311-312" },
    { code: "311712", from: 2001, to: 2011, bea: "311-312" },
    { code: "424460", from: 2001, to: OPEN, bea: "42" },
    { code: "445220", from: 2001, to: 2021, bea: "44-45" },
    { code: "445250", from: 2022, to: OPEN, bea: "44-45" },
  ],
  "Marine Construction": [
    { code: "237990", from: 2001, to: OPEN, bea: "23" },
  ],
  "Marine Transportation": [
    { code: "334511", from: 2001, to: OPEN, bea: "334" },
    { code: "48311", from: 2001, to: OPEN, bea: "483" },
    { code: "4883", from: 2001, to: OPEN, bea: "483" },
    { code: "4931", from: 2001, to: OPEN, bea: "493" },
  ],
  "Offshore Mineral Resources": [
    { code: "211111", from: 2001, to: 2016, bea: "211" },
    { code: "211112", from: 2001, to: 2016, bea: "211" },
    { code: "211120", from: 2017, to: OPEN, bea: "211" },
    { code: "211130", from: 2017, to: OPEN, bea: "211" },
    { code: "212321", from: 2001, to: OPEN, bea: "212" },
    { code: "212322", from: 2001, to: OPEN, bea: "212" },
    { code: "213111", from: 2001, to: OPEN, bea: "213" },
    { code: "213112", from: 2001, to: OPEN, bea: "213" },
    { code: "541360", from: 2001, to: OPEN, bea: "5412-5419" },
  ],
  "Ship and Boat Building": [
    { code: "33661", from: 2001, to: OPEN, bea: "3364-3369" },
  ],
  "Tourism and Recreation": [
    { code: "339920", from: 2001, to: OPEN, bea: "339" },
    { code: "441222", from: 2001, to: OPEN, bea: "44-45" },
    { code: "487210", from: 2001, to: OPEN, bea: "487-488,492" },
    { code: "487990", from: 2001, to: OPEN, bea: "487-488,492", shore: true },
    { code: "532284", from: 2017, to: OPEN, bea: "532-533", shore: true },
    { code: "532292", from: 2001, to: 2016, bea: "532-533", shore: true },
    { code: "611620", from: 2001, to: OPEN, bea: "61", shore: true },
    { code: "712130", from: 2001, to: OPEN, bea: "711-712", shore: true },
    { code: "712190", from: 2001, to: OPEN, bea: "711-712", shore: true },
    { code: "713110", from: 2001, to: OPEN, bea: "713", shore: true },
    { code: "713930", from: 2001, to: OPEN, bea: "713" },
    { code: "713990", from: 2001, to: OPEN, bea: "713", shore: true },
    { code: "721110", from: 2001, to: OPEN, bea: "721", shore: true },
    { code: "721191", from: 2001, to: OPEN, bea: "721", shore: true },
    { code: "721199", from: 2001, to: OPEN, bea: "721", shore: true },
    { code: "721211", from: 2001, to: OPEN, bea: "721", shore: true },
    { code: "721214", from: 2001, to: OPEN, bea: "721", shore: true },
    { code: "722110", from: 2001, to: 2011, bea: "722", shore: true },
    { code: "722211", from: 2001, to: 2011, bea: "722", shore: true },
    { code: "722212", from: 2001, to: 2011, bea: "722", shore: true },
    { code: "722213", from: 2001, to: 2011, bea: "722", shore: true },
    { code: "722410", from: 2001, to: OPEN, bea: "722", shore: true },
    { code: "722511", from: 2012, to: OPEN, bea: "722", shore: true },
    { code: "722513", from: 2012, to: OPEN, bea: "722", shore: true },
    { code: "722514", from: 2012, to: OPEN, bea: "722", shore: true },
    { code: "722515", from: 2012, to: OPEN, bea: "722", shore: true },
  ],
};

// The codes of a sector that are in force in `year`.
const codesFor = (sector, year) => MARINE_CODES[sector].filter((c) => c.from <= year && year <= c.to);
const ALL_MARINE_CODES = [...new Set(Object.values(MARINE_CODES).flat().map((c) => c.code))];

// The 2-digit NAICS sectors QCEW publishes (the codes the annual files use: "31-33", "44-45", "48-49").
const NAICS_SECTORS = ["11", "21", "22", "23", "31-33", "42", "44-45", "48-49", "51", "52", "53", "54", "55", "56", "61", "62", "71", "72", "81", "92"];

// A ZCTA within this many metres of the Census coastline or a tidal water boundary is shoreline-adjacent. Calibrated, not published by NOAA:
// chosen so that California tourism and recreation jobs match Open ENOW's (within 1% in 2019 and 2023);
// docs/DECISIONS.md, "Shoreline-adjacent ZIP codes".
const SHORE_TOLERANCE_M = 1000;

// The QCEW code a longer code rolls up to, one level at a time: 722511 -> 72251 -> 7225 -> 722 -> 72.
// A 3-digit code's 2-digit parent is the sector code the files use (311 -> "31-33").
const SECTOR_OF = { 11: "11", 21: "21", 22: "22", 23: "23", 31: "31-33", 32: "31-33", 33: "31-33", 42: "42", 44: "44-45", 45: "44-45", 48: "48-49", 49: "48-49", 51: "51", 52: "52", 53: "53", 54: "54", 55: "55", 56: "56", 61: "61", 62: "62", 71: "71", 72: "72", 81: "81", 92: "92" };
const parentOf = (code) => (/^[0-9]+$/.test(code) ? (code.length > 3 ? code.slice(0, -1) : code.length === 3 ? SECTOR_OF[code.slice(0, 2)] : null) : null);

// BEA state GDP by industry (SAGDP2, current dollars) lines, keyed by the classification string BEA
// writes, and the QCEW codes that make up the same industry. GDP = wages x (BEA GDP / QCEW private wages).
// BEA's private-industry lines exclude government, so the ratio's wage base is private (ownership 5);
// government-owned rows use a government ratio (docs/DECISIONS.md).
const BEA_LINES = {
  "113-115": { codes: ["113", "114", "115"], classification: "113-115" },
  "211": { codes: ["211"], classification: "211" },
  "212": { codes: ["212"], classification: "212" },
  "213": { codes: ["213"], classification: "213" },
  "23": { codes: ["23"], classification: "23" },
  "311-312": { codes: ["311", "312"], classification: "311-312" },
  "334": { codes: ["334"], classification: "334" },
  "339": { codes: ["339"], classification: "339" },
  "3364-3369": { codes: ["3364", "3365", "3366", "3369"], classification: "3364-3466,3369" }, // BEA's own (mistyped) classification string
  "42": { codes: ["42"], classification: "42" },
  "44-45": { codes: ["44-45"], classification: "44-45" },
  "483": { codes: ["483"], classification: "483" },
  "493": { codes: ["493"], classification: "493" },
  "487-488,492": { codes: ["487", "488", "492"], classification: "487-488,492" },
  "5412-5419": { codes: ["5412", "5413", "5414", "5416", "5417", "5418", "5419"], classification: "5412-5414,5416-5419" },
  "532-533": { codes: ["532", "533"], classification: "532-533" },
  "61": { codes: ["61"], classification: "61" },
  "711-712": { codes: ["711", "712"], classification: "711-712" },
  "713": { codes: ["713"], classification: "713" },
  "721": { codes: ["721"], classification: "721" },
  "722": { codes: ["722"], classification: "722" },
};
// The total economy's sectors are the 2-digit NAICS sectors; each has its own BEA line.
for (const s of NAICS_SECTORS) if (s !== "92") BEA_LINES[s] = BEA_LINES[s] || { codes: [s], classification: s };
const GOVERNMENT_LINE = { classification: "92" }; // BEA "Government and government enterprises"

// Every QCEW industry code the pipeline keeps from the annual files.
function neededCodes() {
  const need = new Set(["10", ...NAICS_SECTORS]);
  for (const code of ALL_MARINE_CODES) { for (let c = code; c; c = parentOf(c)) need.add(c); }
  for (const l of Object.values(BEA_LINES)) for (const c of l.codes) need.add(c);
  return need;
}

// The rows kept from QCEW: every code above, plus the siblings of each marine code (the other children of
// its parent), which the parent-sum plausibility check needs.
// Also kept: the 6-digit children of 4931 that the original ENOW used in its place (493190 is the code Open
// ENOW adds), so the 2021 comparison can say how much of a difference is the definition.
const ATTRIBUTION_CODES = ["493110", "493120", "493130", "493190"];
function codeFilter() {
  const need = neededCodes();
  for (const c of ATTRIBUTION_CODES) need.add(c);
  const parents = new Set(ALL_MARINE_CODES.map(parentOf));
  return (code) => need.has(code) || (/^[0-9]+$/.test(code) && parents.has(parentOf(code)));
}

// The eleven total-economy sectors, in NAICS 2-digit codes.
const TOTAL_SECTOR_CODES = {
  "Construction": ["23"],
  "Financial activities": ["52", "53"],
  "Education and health services": ["61", "62"],
  "Information": ["51"],
  "Leisure and hospitality": ["71", "72"],
  "Manufacturing": ["31-33"],
  "Natural resources and mining": ["11", "21"],
  "Other services": ["81"],
  "Professional and business services": ["54", "55", "56"],
  "Public administration": ["92"],
  "Trade, transportation, and utilities": ["22", "42", "44-45", "48-49"],
};

module.exports = { SHORE_TOLERANCE_M, FIRST_YEAR, OPEN, MARINE_CODES, codesFor, ALL_MARINE_CODES, NAICS_SECTORS, parentOf, BEA_LINES, GOVERNMENT_LINE, neededCodes, codeFilter, ATTRIBUTION_CODES, TOTAL_SECTOR_CODES };
