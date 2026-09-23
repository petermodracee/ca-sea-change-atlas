// "When is the time to act?": the year a sea level rise increment is reached at a tide gauge, per
// scenario, from the committed OPC 2024 Appendix F table (site/_data/opcGaugeProjections.json).
// Pure build-time maths; no network. Method: piecewise-linear interpolation between the Appendix F
// decades, starting from 0 ft in 2000, rounded to the nearest year; ">2150" beyond the table.

const SCENARIOS = ["intermediate", "intermediate-high", "high"];
const BEYOND = ">2150";

function series(reference, gaugeId, scenario) {
  const g = reference.gauges[gaugeId];
  if (!g) throw new Error("no OPC gauge " + gaugeId);
  return { years: [2000, ...reference.decades], feet: [0, ...g[scenario]] };
}

function yearReached(reference, gaugeId, scenario, feet) {
  const { years, feet: ft } = series(reference, gaugeId, scenario);
  for (let i = 1; i < ft.length; i++) {
    if (ft[i] >= feet) {
      return Math.round(years[i - 1] + ((feet - ft[i - 1]) / (ft[i] - ft[i - 1])) * (years[i] - years[i - 1]));
    }
  }
  return null;
}

// rows: one per increment; cells: one per scenario (a year, or null for ">2150").
function timingTable(reference, gaugeId, increments) {
  return increments.map((feet) => ({
    feet,
    cells: SCENARIOS.map((s) => {
      const year = yearReached(reference, gaugeId, s, feet);
      return { scenario: s, year, text: year === null ? BEYOND : String(year) };
    }),
  }));
}

// Two gauges straddle when any cell differs by 5 or more years, or one gauge reaches an increment
// by 2150 and the other does not. Returns null when they agree, else what differs.
function compareGauges(reference, gaugeA, gaugeB, increments) {
  const a = timingTable(reference, gaugeA, increments);
  const b = timingTable(reference, gaugeB, increments);
  let maxDiff = 0, unreached = 0;
  a.forEach((row, i) => row.cells.forEach((cell, j) => {
    const other = b[i].cells[j];
    if ((cell.year === null) !== (other.year === null)) unreached++;
    else if (cell.year !== null) maxDiff = Math.max(maxDiff, Math.abs(cell.year - other.year));
  }));
  return maxDiff >= 5 || unreached > 0 ? { maxDiff, unreached } : null;
}

module.exports = { SCENARIOS, BEYOND, series, yearReached, timingTable, compareGauges };
