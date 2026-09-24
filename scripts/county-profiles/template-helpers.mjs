// Build-time chart geometry for the County Profiles templates, registered as Nunjucks filters in
// .eleventy.js. d3-scale and d3-array do scale, tick and extent maths only; the SVG itself is
// written by the templates (site/_includes/county-profiles/). Every chart is rendered fully here —
// the sea-level-rise increment picker (the only remaining Chart/Table switch) only toggles between
// states already in the markup, it never draws anything client-side.
import { createRequire } from "node:module";
import { scaleLinear } from "d3-scale";
import { max, sum } from "d3-array";

const require = createRequire(import.meta.url);
const { shareText, num, compact } = require("./format.js");
const { SCENARIOS, SCENARIO_LABELS: LABELS, series, envelope, MAP_MIN_FT, MAP_MAX_FT } = require("./timing.js");

export { num };
export { apaDate } from "./format.js";

// ---- share ring (flood People at Risk and flood natural features only) -----------------------

export const RING = { size: 120, radius: 48, stroke: 12 };
const circumference = 2 * Math.PI * RING.radius;
const arcLength = scaleLinear().domain([0, 100]).range([0, circumference]).clamp(true);

export function ring(count, total) {
  const pct = (count / total) * 100;
  return { pct, text: shareText(pct), arc: arcLength(pct), circumference, ...RING, center: RING.size / 2 };
}

// ---- shared geometry ----------------------------------------------------------------------------

// Every chart below draws in a viewBox close to 1000 units wide (matching the panel's real rendered
// width, roughly) instead of the old 420-600, and .cpd-chart svg no longer carries a max-height: the
// old narrow viewBox plus a height cap made the browser shrink the whole drawing to fit and letterbox
// it with side gutters. These constants scale with that width so bar thickness, radii and gaps read
// the same proportionally as before, just large enough that on-screen text clears 14px.
const BAR_H = 34; // was 20 at ~460-600 wide; proportional at ~1000 wide
const COL_W = 40; // was 22
const GAP_PX = 3; // background gap between stacked segments / grouped columns
const RADIUS = 6; // rounded corner at the data end; the baseline end is square

// A rough per-character width for a horizontal chart's left label column — there's no canvas at
// build time to measure real text, so this over-estimates slightly rather than risk clipping a
// long label ("Trade, transportation, and utilities") against the plot area.
function labelColumnWidth(labels, fontSize = 22, avgChar = 0.62) {
  const longest = max(labels, (s) => s.length) || 0;
  return Math.ceil(longest * fontSize * avgChar);
}

// A horizontal bar/segment as an SVG path: square at the baseline (left), rounded at the data end
// (right) — only when it is the terminal real piece of its bar, so an internal segment butts
// squarely against the 2px gap before the next one.
function rectPath(x, y, w, h, rounded) {
  w = Math.max(w, 0);
  const r = rounded ? Math.min(RADIUS, w / 2, h / 2) : 0;
  if (r <= 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} Z`;
}

// A vertical column: square at the baseline (bottom), rounded top.
function columnPath(x, yTop, w, h) {
  h = Math.max(h, 0);
  const r = Math.min(RADIUS, h, w / 2);
  const yBottom = yTop + h;
  if (r <= 0) return `M${x},${yBottom} h${w} V${yTop} h${-w} Z`;
  return `M${x},${yBottom} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBottom} Z`;
}

// ---- horizontal bars (NFIP payouts by period) -----------------------------------------------

// items: [{label, values: [{value, text, suppressed}]}]; one value per series (a single bar when
// there is no series). Row labels sit in a left column sized to the longest one; bars start to its
// right. The end-of-bar label is an abbreviated value (matching the axis ticks) — the exact value
// is in the per-mark tooltip and the accessible table, per the NOAA end-of-bar-label convention.
export function barChart(items, format) {
  const plotW = 820, gap = 6, groupGap = 20, top = 10, axisH = 40, labelGap = 20, mr = 90;
  const nSeries = items[0].values.length;
  const plotX = labelColumnWidth(items.map((it) => it.label)) + labelGap;
  const domainMax = max(items, (it) => max(it.values, (v) => (v.suppressed ? 0 : v.value))) || 1;
  // No .nice(): a bar should reach the plot's right edge near the real data max, not a rounded-up
  // domain that leaves every bar looking shorter than it is.
  const x = scaleLinear().domain([0, domainMax]).range([0, plotW]);
  const groupH = nSeries * (BAR_H + gap) - gap;
  const rows = items.map((it, i) => {
    const y0 = top + i * (groupH + groupGap);
    return {
      label: it.label,
      labelY: y0 + groupH / 2 + 7,
      bars: it.values.map((v, s) => {
        const w = v.suppressed ? 0 : Math.max(+x(v.value).toFixed(1), v.value === 0 ? 0 : 2);
        return {
          s,
          y: y0 + s * (BAR_H + gap),
          // The end label's y is the bar's own vertical centre (dominant-baseline:middle in CSS
          // does the rest), not baseline-minus-a-few-px, which used to read slightly low.
          midY: y0 + s * (BAR_H + gap) + BAR_H / 2,
          path: rectPath(0, 0, w, BAR_H, true),
          vx: w + 10,
          zero: !v.suppressed && v.value === 0,
          text: v.suppressed ? "withheld" : compact(v.value, format === "usd"),
          tip: v.suppressed ? "withheld" : v.text,
          suppressed: v.suppressed,
        };
      }),
    };
  });
  const height = top + items.length * (groupH + groupGap) - groupGap + axisH;
  return {
    width: plotX + plotW + mr, height, plotX, plotW, barH: BAR_H, axisY: height - axisH,
    rows,
    ticks: x.ticks(4).map((t) => ({ x: +x(t).toFixed(1), label: compact(t, format === "usd") })),
  };
}

// ---- horizontal bars stacked by increment (SLR Flooded Facilities) -----------------------------

// items: [{label, total, counts: [c2,c4,c6,c8,c10]}]. NOAA pattern: each facility type is one bar,
// split into "exposed at the selected increment" and "not yet exposed" (total - exposed), so the
// type's real total stays visible even though only a fraction is exposed. A type's total (and so
// its bar's full length) doesn't change with the increment — only where the split falls — so every
// increment's split is precomputed as its own state and all rows share one fixed domain (the largest
// type's total); site/js/county-deck.js shows one state's segments/label per row at a time, exactly
// like the timing chart's threshold overlays.
export function stackedByIncrement(items, increments) {
  const plotW = 820, rowGap = 24, top = 8, axisH = 70, labelGap = 20, mr = 90;
  const plotX = labelColumnWidth(items.map((it) => it.label)) + labelGap;
  const domainMax = Math.max(max(items, (it) => it.total) || 1, 1);
  const x = scaleLinear().domain([0, domainMax]).range([0, plotW]);
  const rowH = BAR_H;
  const rows = items.map((it, i) => {
    const y0 = top + i * (rowH + rowGap);
    const states = increments.map((ft, k) => {
      // Every row is the combined count when it has a low-lying series: the ocean-connected part
      // solid, the additional low-lying part dashed after it, then the rest. The tooltip names every
      // category the bar has, so hovering any segment shows all of them.
      const conn = it.counts[k];
      const total = it.countsLow ? it.countsLow[k] : conn;
      const extra = total - conn;
      const rest = Math.max(it.total - total, 0);
      const ew = Math.max(+x(conn).toFixed(1), conn === 0 ? 0 : 2);
      const xw = extra > 0 ? Math.max(+x(extra).toFixed(1), 2) : 0;
      const rw = Math.max(+x(rest).toFixed(1), 0);
      const xX = ew + (xw > 0 && ew > 0 ? GAP_PX : 0);
      const restX = xX + xw + (rw > 0 && (ew > 0 || xw > 0) ? GAP_PX : 0);
      // Each segment's tooltip names only that segment's own value, like every other chart's
      // per-mark tooltip; the combined total is the bar's visible end label.
      const at = it.label + " at " + ft + " ft: ";
      const exposedTip = at + (it.countsLow ? "ocean-connected " : "exposed ") + num(conn);
      const extraTip = at + "additional low-lying " + num(extra);
      const restTip = at + "not yet exposed " + num(rest);
      return {
        ft,
        exposedPath: conn > 0 ? rectPath(0, 0, ew, rowH, xw <= 0 && rw <= 0) : "",
        extraPath: xw > 0 ? rectPath(xX, 0, xw, rowH, rw <= 0) : "",
        restPath: rw > 0 ? rectPath(restX, 0, rw, rowH, true) : "",
        vx: (rw > 0 ? restX + rw : xw > 0 ? xX + xw : ew) + 10,
        keyLabel: num(total),
        connLabel: num(conn),
        lowLabel: it.countsLow ? num(total) : null,
        exposedTip, extraTip, restTip,
      };
    });
    return { label: it.label, total: num(it.total), labelY: y0 + rowH / 2 + 7, midY: y0 + rowH / 2, barY: y0, states };
  });
  const height = top + items.length * (rowH + rowGap) - rowGap + axisH;
  return {
    width: plotX + plotW + mr, height, plotX, plotW, barH: rowH, axisY: height - axisH, axisTitle: "Number of facilities of each type",
    rows,
    ticks: x.ticks(4).map((t) => ({ x: +x(t).toFixed(1), label: compact(t, false) })),
  };
}

// ---- absolute stacked bars (flood critical facilities, SLR natural landscapes) -----------------

// rows: [{label, keyLabel, segments: [{label, value, suppressed}]}]. Segments concatenate along one
// bar per row, on a shared absolute scale (not stretched to 100%), with a 2px gap between them. Row
// labels sit in a left column; `keyLabel` (computed by the caller, since only it knows which share
// matters — e.g. "share inside the floodplain", "natural share") is the one value drawn at the end
// of the bar, NOAA-style. Every segment's exact value is in its own tooltip and the data table.
// `opts`: {unit} appended to every segment's text ("3.6 sq mi"), {axisTitle} drawn under the ticks and
// {keyTitle} above the end-of-bar labels, so a bar's percentage and its scale are both named on the chart.
export function stackedBars(rows, format, opts = {}) {
  // mr leaves room for the end-of-bar key-label text: without .nice() the fullest bar's segment
  // now reaches (almost) exactly to plotW, so the label needs real space past the plot area, not
  // just a few px of breathing room.
  const plotW = 820, rowGap = 24, axisH = 40 + (opts.axisTitle ? 30 : 0), labelGap = 20, mr = 96;
  const top = 8 + (opts.keyTitle ? 26 : 0);
  const plotX = labelColumnWidth(rows.map((r) => r.label)) + labelGap;
  const totals = rows.map((r) => sum(r.segments, (s) => (s.suppressed ? 0 : s.value)));
  const domainMax = Math.max(max(totals) || 1, 1);
  // No .nice(): the fullest bar should reach (near) the plot's right edge, not stop short of a
  // rounded-up domain.
  const x = scaleLinear().domain([0, domainMax]).range([0, plotW]);
  const rowH = BAR_H;
  const built = rows.map((r, i) => {
    const y0 = top + i * (rowH + rowGap);
    const barY = y0;
    let cx = 0;
    const segs = r.segments.map((s, k) => {
      const w = s.suppressed ? 0 : Math.max(+x(s.value).toFixed(1), 0);
      const isLast = k === r.segments.length - 1 || r.segments.slice(k + 1).every((s2) => s2.suppressed || s2.value === 0);
      const seg = { label: s.label, x: cx, w, suppressed: s.suppressed, text: s.suppressed ? "withheld" : num(s.value) + (opts.unit ? " " + opts.unit : ""), path: rectPath(cx, 0, w, BAR_H, isLast) };
      cx += w + (k < r.segments.length - 1 && w > 0 ? GAP_PX : 0);
      return seg;
    });
    return { label: r.label, labelY: y0 + BAR_H / 2 + 7, barY, midY: y0 + BAR_H / 2, keyLabel: r.keyLabel, keyTip: r.keyTip || "", segments: segs };
  });
  const height = top + rows.length * (rowH + rowGap) - rowGap + axisH;
  return {
    width: plotX + plotW + mr, height, plotX, plotW, barH: BAR_H, axisY: height - axisH,
    axisTitle: opts.axisTitle || "", keyTitle: opts.keyTitle || "", keyX: plotW + 10,
    rows: built,
    ticks: x.ticks(4).map((t) => ({ x: +x(t).toFixed(1), label: compact(t, format === "usd") })),
  };
}

// ---- 100%-stacked bars (economic diversity: establishments, wages, employment, GDP) ------------

// measures: [{label, segments: [{label, value, suppressed, text, isHeadline, icon}]}], all sharing
// one sector order (`icon`: {viewBox, outlineInner, fillInner} from sector-icons.js, or null). Each
// measure renders as one bar scaled to 100% — of the sectors actually known, not of a domain that
// includes a withheld one: a withheld sector has no value to give it a width, so it is left out of
// the bar entirely (and named in the section's footnote) rather than drawn as a placeholder with an
// invented width, and the real sectors scale to fill the full 100% among themselves. That
// denominator (present sectors only) is the same one the callout above uses, so the two numbers
// can't disagree. Row labels sit in a left column, like the other bar charts.
const BAR_H_100 = 44;
const ICON_SIZE = 30;
export function stacked100Bars(measures) {
  const plotW = 820, rowGap = 28, top = 8, labelGap = 20;
  const plotX = labelColumnWidth(measures.map((m) => m.label)) + labelGap;
  const rows = measures.map((m, i) => {
    const y0 = top + i * (BAR_H_100 + rowGap);
    const barY = y0;
    const realTotal = sum(m.segments, (s) => (s.suppressed ? 0 : s.value)) || 1;
    let cxPct = 0;
    const segs = m.segments.map((s, k) => {
      if (s.suppressed) {
        // No width, no path — a withheld sector isn't drawn at all; segments keeps its slot so the
        // legend/table (indexed by the same position) still lines up with it.
        return { ...s, pctText: null, path: "", w: 0, labelX: 0, midY: barY + BAR_H_100 / 2, showLabel: false, showIcon: false, tip: s.label + ": withheld" };
      }
      const pct = (s.value / realTotal) * 100;
      const isLastDrawn = m.segments.slice(k + 1).every((s2) => s2.suppressed);
      const wFull = (pct / 100) * plotW;
      const w = isLastDrawn ? wFull : Math.max(wFull - GAP_PX, 0);
      const segX = (cxPct / 100) * plotW;
      // Only the headline sector ever gets an inline % label, and only once its segment is wide
      // enough to hold one. Every segment wide enough (icon size plus its own padding) gets its
      // sector's Material Symbols icon instead, whether headline or neutral; narrower segments are
      // identified only via the tooltip. The icon's own x/y (top-left corner, for a nested <svg>)
      // sits centred on the segment.
      const seg = {
        ...s,
        pctText: shareText(pct),
        path: rectPath(segX, 0, w, BAR_H_100, isLastDrawn),
        labelX: segX + w / 2,
        midY: barY + BAR_H_100 / 2,
        iconX: segX + w / 2 - ICON_SIZE / 2,
        iconY: barY + BAR_H_100 / 2 - ICON_SIZE / 2,
        showLabel: !!s.isHeadline && w >= 30,
        showIcon: !!s.icon && w >= ICON_SIZE + 10,
        tip: s.label + ": " + s.text + " (" + shareText(pct) + ")",
      };
      cxPct += pct;
      return seg;
    });
    return { label: m.label, labelY: y0 + BAR_H_100 / 2 + 7, barY, segments: segs };
  });
  const height = top + measures.length * (BAR_H_100 + rowGap) - rowGap;
  return { width: plotX + plotW, height, plotX, plotW, barH: BAR_H_100, rows };
}

// ---- vertical grouped columns (SLR people at risk, SLR critical facilities) --------------------

// items: [{label, values: [{value, text, suppressed}]}], one column per increment. Only the last
// (highest) increment's value is labelled above its column, matching the reference layout.
//
// This is the only remaining caller of groupedColumns (Flooded Facilities moved to
// stackedByIncrement), so its aspect ratio and type scale are its own, not shared with the
// timing chart: 1000x300 (wider/shorter than the generic "column and line chart" 1000x400 ratio),
// thicker columns (COL_W_PEOPLE, not the shared COL_W) and larger axis/value text via the
// `.cpd-col-chart` class the macro adds to the <svg> — asked for twice, since with only 3 groups of
// 5 columns each, the generic ratio and shared type scale both left this chart looking small and
// oddly tall for how little it actually draws.
const COL_W_PEOPLE = 58;
export function groupedColumns(items, seriesLabels) {
  // mt leaves a band above the plot area for the value labels (VALUE_LABEL_Y), so a label never sits
  // on or inside a column, whatever that column's height.
  const W = 1000, H = 300, ml = 90, mr = 16, mt = 60, mb = 76;
  const VALUE_LABEL_Y = mt - 20;
  const iw = W - ml - mr, ih = H - mt - mb;
  const nSeries = items[0].values.length;
  // With a low-lying series the scale fits the larger (connected plus low-lying) values in every view,
  // so switching views never rescales the axis under the reader.
  const domainMax = max(items, (it) => max(it.values, (v) => (v.suppressed ? 0 : Math.max(v.value, v.low || 0)))) || 1;
  const y = scaleLinear().domain([0, domainMax]).nice(4).range([ih, 0]);
  const band = iw / items.length;
  const colW = Math.min(COL_W_PEOPLE, (band * 0.72) / nSeries - GAP_PX);
  const groupW = colW * nSeries + GAP_PX * (nSeries - 1);
  const groups = items.map((it, gi) => {
    const x0 = ml + gi * band + (band - groupW) / 2;
    const cols = it.values.map((v, i) => {
      const x = x0 + i * (colW + GAP_PX);
      const top = mt + y(v.value);
      const colH = v.suppressed ? 0 : mt + ih - top;
      const isLast = i === nSeries - 1;
      const text = v.suppressed ? "withheld" : v.text;
      // Optional low-lying series: `value` is the ocean-connected part (the solid column) and `low` the
      // combined total; the additional low-lying part is a lighter segment stacked on the column, and
      // `text` is the combined total.
      const hasLow = v.low !== undefined && !v.suppressed;
      const lowTop = hasLow ? mt + y(v.low) : 0;
      const extraH = hasLow ? top - GAP_PX - lowTop : 0;
      return {
        s: i,
        hasLow,
        connText: hasLow ? v.connText : "",
        extraPath: hasLow && extraH > 0.5 ? columnPath(x, lowTop, colW, extraH) : "",
        path: v.suppressed ? "" : columnPath(x, top, colW, colH),
        suppressed: v.suppressed,
        text,
        // Every column's value is drawn above the plot area in a fixed row, centred over its column,
        // but only the selected series' label is shown at a time (site/js/county-deck.js toggles
        // which, via the increment slider); the highest increment is the initial default.
        labelX: x + colW / 2,
        labelY: VALUE_LABEL_Y,
        isLast,
        // One value per mark: the solid part and the dashed low-lying part each name only themselves.
        tip: (seriesLabels ? seriesLabels[i] + ": " : "") + it.label + " " + (hasLow ? "ocean-connected " + v.connText : text),
        extraTip: hasLow ? (seriesLabels ? seriesLabels[i] + ": " : "") + it.label + " additional low-lying " + num(v.low - v.value) : "",
      };
    });
    return { label: it.label, labelX: ml + gi * band + band / 2, labelY: H - mb + 40, cols };
  });
  return {
    width: W, height: H, ml, mr, mt, mb, axisY: mt + ih,
    groups,
    ticks: y.ticks(4).map((t) => ({ y: +(mt + y(t)).toFixed(1), label: compact(t, false) })),
  };
}

// ---- dot plot (average wage per sector: county / coastal California / coastal U.S.) ------------

// Split a label over at most two lines, at the word break that keeps the longer line shortest, once
// it's longer than `maxChars`. Balanced rather than greedy: "Trade, transportation, and utilities"
// becomes "Trade, transportation," / "and utilities", not "Trade," / "transportation, and utilities".
function wrapTwoLines(label, maxChars) {
  if (label.length <= maxChars) return [label];
  const words = label.split(" ");
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const worst = Math.max(a.length, b.length);
    if (!best || worst < best.worst) best = { worst, lines: [a, b] };
  }
  return best ? best.lines : [label];
}

// items: [{label, values: [{value, text, suppressed}]}], 3 series. One row per sector, named in a
// fixed-width left column — not sized to the longest label, which left short names stranded in
// empty space — with longer names balanced over two lines to fit it; a thin line spans the row's
// real (non-suppressed) values with a dot at each, so the spread reads at a glance.
const DOT_LABEL_W = 262, DOT_LABEL_CHARS = 22, DOT_LABEL_LINE_H = 22;
export function dotPlot(items, seriesLabels) {
  // rowH is deliberately tighter than the other bar-style charts' row spacing: at up to 11 sectors,
  // the full row height made this chart run taller than the panel at 1400px and clip at the bottom.
  // .cpd-chart-dotplot's own max-height in style.css is the other half of that fix. It still has to
  // hold a two-line label. mr leaves room for half the last x-axis label, which is centred on it.
  const W = 1040, rowH = 46, top = 14, mr = 40, labelGap = 22;
  const labelW = DOT_LABEL_W;
  const plotL = labelW + labelGap, plotR = W - mr;
  const domainMax = max(items, (it) => max(it.values, (v) => (v.suppressed ? 0 : v.value))) || 1;
  const x = scaleLinear().domain([0, domainMax]).nice(4).range([plotL, plotR]);
  const rows = items.map((it, i) => {
    const cy = top + i * rowH + rowH / 2;
    const present = it.values.map((v, s) => ({ s, v, cx: v.suppressed ? null : +x(v.value).toFixed(1) })).filter((d) => d.cx !== null);
    const xs = present.map((d) => d.cx);
    const lines = wrapTwoLines(it.label, DOT_LABEL_CHARS);
    return {
      label: it.label,
      labelX: labelW,
      // First line's offset from cy, so one line or two sit centred on the row (dominant-baseline
      // middle on the <text>).
      labelLines: lines.map((text, k) => ({ text, dy: k === 0 ? -((lines.length - 1) * DOT_LABEL_LINE_H) / 2 : DOT_LABEL_LINE_H })),
      cy,
      lineX1: xs.length ? Math.min(...xs) : null,
      lineX2: xs.length ? Math.max(...xs) : null,
      dots: it.values.map((v, s) => ({
        s,
        cx: v.suppressed ? null : +x(v.value).toFixed(1),
        suppressed: v.suppressed,
        text: v.suppressed ? "withheld" : v.text,
        tip: (seriesLabels ? seriesLabels[s] + ", " : "") + it.label + ": " + (v.suppressed ? "withheld" : v.text),
      })),
    };
  });
  const height = top + items.length * rowH + 44;
  return {
    width: W, height, top, rowH, labelW, plotL, plotR,
    axisY: height - 34,
    rows,
    ticks: x.ticks(4).map((t) => ({ x: +x(t).toFixed(1), label: compact(t, true) })),
  };
}

// ---- sea level rise scenario curves, with the 2050 and 2100 horizons marked ----------------------

export const SCENARIO_LABELS = LABELS;
// Index into the 5-step ramp for each scenario: steps 1, 3 and 5 (0-indexed 0, 2, 4).
const SCENARIO_RAMP_STEP = { intermediate: 0, "intermediate-high": 2, high: 4 };
const HORIZON_YEARS = [2050, 2100];

// One curve chart for a gauge: the three recommended scenarios, a vertical line at each horizon year
// and, on each line, a dot and a label per scenario with its projected rise. Everything is drawn at
// build; there is no interaction. The three labels at a horizon can sit within a few pixels of each
// other near the baseline, so they are stacked above their dots with a minimum gap and joined to
// their dots by a leader line.
export function slrCurves(reference, gaugeId) {
  const W = 1000, H = 320, m = { l: 70, r: 36, t: 34, b: 50 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const all = SCENARIOS.map((s) => series(reference, gaugeId, s));
  const yMax = Math.max(12, Math.ceil(max(all, (a) => max(a.feet)) / 2) * 2);
  const x = scaleLinear().domain([2000, 2150]).range([m.l, m.l + iw]);
  const y = scaleLinear().domain([0, yMax]).range([m.t + ih, m.t]);
  const pt = (yr, ft) => x(yr).toFixed(1) + "," + y(ft).toFixed(1);

  const curves = SCENARIOS.map((s, i) => ({
    scenario: s,
    label: SCENARIO_LABELS[s],
    ramp: SCENARIO_RAMP_STEP[s],
    d: "M" + all[i].years.map((yr, k) => pt(yr, all[i].feet[k])).join(" L"),
  }));

  const GAP = 24, LIFT = 16;
  const horizons = HORIZON_YEARS.map((year) => {
    const dots = SCENARIOS.map((s, i) => {
      const feet = all[i].feet[all[i].years.indexOf(year)];
      const flag = envelope(feet);
      return { scenario: s, label: SCENARIO_LABELS[s], ramp: SCENARIO_RAMP_STEP[s], feet, flag, text: feet.toFixed(1) + " ft" + (flag === "below" ? " †" : flag === "above" ? " ‡" : ""), cx: +x(year).toFixed(1), cy: +y(feet).toFixed(1) };
    });
    // Lowest dot first: each label sits LIFT above its dot, and no label closer than GAP to the one below.
    let prev = Infinity;
    [...dots].sort((a, b) => b.cy - a.cy).forEach((d) => {
      d.ly = +Math.min(d.cy - LIFT, prev - GAP).toFixed(1);
      prev = d.ly;
    });
    return { year, x: +x(year).toFixed(1), dots, flags: { below: dots.some((d) => d.flag === "below"), above: dots.some((d) => d.flag === "above") } };
  });

  return {
    width: W, height: H, left: m.l, right: m.l + iw, top: m.t, bottom: m.t + ih,
    xTicks: x.ticks(6).map((t) => ({ x: +x(t).toFixed(1), label: String(t) })),
    yTicks: y.ticks(6).map((t) => ({ y: +y(t).toFixed(1), ty: +(y(t) + 7).toFixed(1), label: String(t) })),
    curves,
    horizons,
    flags: { below: horizons.some((h) => h.flags.below), above: horizons.some((h) => h.flags.above), min: MAP_MIN_FT, max: MAP_MAX_FT },
  };
}
