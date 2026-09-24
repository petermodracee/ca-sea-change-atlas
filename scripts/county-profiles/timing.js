// "When is the time to act?": the year a sea level rise increment is reached at a tide gauge, per
// scenario, from the committed OPC 2024 Appendix F table (site/_data/opcGaugeProjections.json).
// Pure build-time maths; no network. Method: piecewise-linear interpolation between the Appendix F
// decades, starting from 0 ft in 2000, rounded to the nearest year; ">2150" beyond the table.

const SCENARIOS = ["intermediate", "intermediate-high", "high"];
const BEYOND = ">2150";
const SCENARIO_LABELS = { intermediate: "Intermediate", "intermediate-high": "Intermediate-High", high: "High" };

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

// The horizons the page states, and the range of heights NOAA's inundation layers can show. NOAA's
// layers run from 1 ft to 10 ft above MHHW, so a projection under 1 ft has no layer to point at and
// one over 10 ft is past the top of the map. Such a figure is still stated, and flagged.
const HORIZONS = [2050, 2100];
const MAP_MIN_FT = 1;
const MAP_MAX_FT = 10;

function envelope(feet) {
  return feet < MAP_MIN_FT ? "below" : feet > MAP_MAX_FT ? "above" : "within";
}

const ENVELOPE_NOTE = {
  below: "under " + MAP_MIN_FT + " ft, the lowest level the map shows",
  above: "over " + MAP_MAX_FT + " ft, the highest level the map shows",
};

// One row per scenario: the projected rise (ft above 2000) at each horizon, with its envelope flag.
function horizonRows(reference, gaugeId) {
  return SCENARIOS.map((s) => {
    const g = reference.gauges[gaugeId];
    if (!g) throw new Error("no OPC gauge " + gaugeId);
    return {
      scenario: s,
      label: SCENARIO_LABELS[s],
      cells: HORIZONS.map((year) => {
        const feet = g[s][reference.decades.indexOf(year)];
        const flag = envelope(feet);
        return { year, feet, text: feet.toFixed(1), flag, note: flag === "within" ? null : ENVELOPE_NOTE[flag] };
      }),
    };
  });
}

// Which envelope flags occur among a gauge's horizon cells, to decide which footnotes to print.
function horizonFlags(reference, gaugeId) {
  const cells = horizonRows(reference, gaugeId).flatMap((r) => r.cells);
  return { below: cells.some((c) => c.flag === "below"), above: cells.some((c) => c.flag === "above"), min: MAP_MIN_FT, max: MAP_MAX_FT };
}

// The Appendix F values the snapshot carries for a gauge: the three recommended scenarios, every decade.
function projectionsFor(reference, gaugeId) {
  const g = reference.gauges[gaugeId];
  if (!g) throw new Error("no OPC gauge " + gaugeId);
  return {
    baseline: reference.baseline,
    units: reference.units,
    decades: reference.decades.slice(),
    scenarios: Object.fromEntries(SCENARIOS.map((s) => [s, g[s].slice()])),
  };
}

module.exports = { SCENARIOS, SCENARIO_LABELS, BEYOND, HORIZONS, MAP_MIN_FT, MAP_MAX_FT, envelope, horizonRows, horizonFlags, projectionsFor, series, yearReached, timingTable, compareGauges };
