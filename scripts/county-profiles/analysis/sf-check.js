#!/usr/bin/env node
// San Francisco 2023: the pipeline's sector employment, wages and establishments beside NOAA's Total Economy
// (Coastal) 2023 values, and whether the eleven sectors sum to the county total. Values below are NOAA's,
// read from the Quick Report API (coast.noaa.gov/enow/api/v1/coastaleconomy, ShorelineCounties, 06075, 2023).
const path = require("path");
const P = path.join(__dirname, "..", "pipeline/");
const { load, f1, f0, table } = require("./economy-validation.js");
const E = require(P + "economy.js");
const NOAA = {
  "Total, all industries": [63317, 723526, 120901074944],
  "Construction": [1922, 23259, 2664578048], "Financial activities": [4607, 57766, 20644128768], "Education and health services": [29067, 155313, 14078392320],
  "Information": [1912, 62732, 17996509184], "Leisure and hospitality": [4792, 82928, 4539342336], "Manufacturing": [778, 12430, 2543133440],
  "Natural resources and mining": [55, 227, 22707632], "Other services": [4630, 27033, 1979730560], "Professional and business services": [10525, 193776, 41141587968],
  "Public administration": [595, 31862, 4260299520], "Trade, transportation, and utilities": [4355, 76075, 11016414208],
};
(async () => {
  const L = await load();
  const S = E.totalSectors(L.ctx, "06075", 2023, null);
  const T = E.countyTotal(L.ctx, "06075", 2023);
  const rows = [["Total, all industries", T.estabs, T.emp, T.wages, ...NOAA["Total, all industries"]]];
  for (const [k, v] of Object.entries(S)) rows.push([k, v.estabs, v.emp, v.wages, ...NOAA[k], v.empImp > 0 ? "imputed " + f0(v.empImp) + " jobs (step " + v.step + ")" : "published"]);
  const d = (a, b) => (a === b ? "=" : (a - b > 0 ? "+" : "") + f0(a - b));
  console.log(table(["sector", "ours estab", "ours jobs", "ours wages", "NOAA estab", "NOAA jobs", "NOAA wages", "diff estab / jobs / wages", "our cell"], rows.map((r) => [r[0], f0(r[1]), f0(r[2]), "$" + f0(r[3]), f0(r[4]), f0(r[5]), "$" + f0(r[6]), d(r[1], r[4]) + " / " + d(r[2], r[5]) + " / " + d(r[3], r[6]), r[7] || ""])));
  const sum = (k) => Object.values(S).reduce((a, v) => a + v[k], 0);
  console.log("\nSum of the eleven sectors: " + f0(sum("estabs")) + " establishments, " + f0(sum("emp")) + " jobs, $" + f0(sum("wages")) + " wages.\nCounty total:               " + f0(T.estabs) + ", " + f0(T.emp) + ", $" + f0(T.wages) + ".\nDifference (total minus sectors): " + f0(T.estabs - sum("estabs")) + " establishments, " + f0(T.emp - sum("emp")) + " jobs, $" + f0(T.wages - sum("wages")) + " wages.");
})();
