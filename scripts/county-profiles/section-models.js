// Turns one available section's stored data into what the templates draw: a visual and a callout
// ({figure, caption}, shown above the visual — see the schema's `callouts` note). `figure` is always
// a short value built from a number in the section's own data, so it can't drift from the chart.
//
// The callout rule: a callout's `figure` never repeats a value the chart draws as its own visible,
// labelled text. The `show()` calls below record only text that is actually drawn on the chart
// canvas (not the accessibility table/description, which necessarily mirrors every value and would
// make the rule impossible to satisfy) — e.g. a stacked bar's printed count, a ring's percentage, or
// (for the SLR grouped columns) the one column per group that gets a visible label. Charts that
// carry no visible per-value text (the diversity 100%-stack, the wages dot plot) can freely use any
// of their real numbers as a callout figure.

const { pct, num, usd, usdWords, compact } = require("./format.js");
const usdCompact = (n) => compact(n, true, 2); // the big stat numbers: two decimals
const { sectorIconFor } = require("./sector-icons.js");
const { cellValue: cv, cellEst, isEstimatedCell, isPartialCell, ESTIMATED_SHARE_THRESHOLD } = require("./estimated.js");

// A callout share is built with pc() so that, if it happens to equal a number the chart labels,
// the callout can be restated at two decimals instead of failing the build over a coincidence.
const ratios = new Map();
const pc = (a, b) => { const f = pct(a, b); ratios.set(f, [a, b]); return f; };
const pct2 = (a, b) => ((a / b) * 100).toFixed(2) + "%";

const isSuppressed = (v) => v !== null && typeof v === "object" && v.suppressed === true;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const PARTIAL_MARK = "*";
const SECTOR_MEASURES = [
  { key: "establishments", label: "Establishments", fmt: num },
  { key: "wages", label: "Wages", fmt: usdWords, print: usdCompact },
  { key: "employment", label: "Employment", fmt: num },
  { key: "gdp", label: "GDP", fmt: usdWords, print: usdCompact },
];
// `print` is what the printed data table shows: the same abbreviation as the big-number callouts
// ("$2.81B"), so a dollar amount reads one way on paper. The screen keeps `fmt`.

// Value cell -> display text; a suppressed cell has no text. A cell may carry provenance ({value, est}).
const cellText = (v, fmt) => (isSuppressed(v) ? null : fmt(cv(v)));

function buildSectionModel({ county, topicId, def, data, increments }) {
  const C = county + " County";
  const shown = [];
  const show = (...s) => s.forEach((x) => { if (x !== null && x !== undefined) shown.push(String(x)); });
  const anySuppressed = (vals) => vals.some(isSuppressed);
  let visual = null;
  let callout = null; // {figure, caption}
  // True for an SLR section whose data carries `countsWithLow`: its figures are then the combined
  // (ocean-connected plus low-lying) counts, drawn with the connected part solid and the additional
  // low-lying part dashed. The explanation lives on the County Profiles about page, not on the section.
  let hasLow = false;
  let footnote = null; // overrides the generic "one or more values are withheld" text when set
  // The estimated state: every figure drawn from this section that is marked "≈" (imputed share at or
  // above ESTIMATED_SHARE_THRESHOLD) is registered here, so the section can explain the mark once.
  const marks = [];
  // Notes that say which year each figure is for, wherever the years differ (one line each).
  const notes = [];
  const mark = (cell) => { const on = isEstimatedCell(cell); if (on) marks.push(cellEst(cell).share); return on; };

  // Rings: flood People at Risk (independent shares) and flood natural features (development
  // added 1996–2016 as a share of land developed by 2016, inside vs. outside the floodplain). The
  // only two sections that render as rings; each ring's percentage and counts are visible text.
  const ringItems = (items) => items.map((it) => {
    show(pct(it.count, it.total), num(it.count), num(it.total));
    return { ...it, showCounts: true };
  });

  switch (def.kind) {
    case "rings":
      visual = { type: "rings", items: ringItems(data.items) };
      if (topicId === "flood" && def.id === "people-at-risk") {
        callout = { figure: pc(data.landInsideSqMi, data.landTotalSqMi), caption: "of " + C + "’s land area is inside the FEMA 100-year floodplain." };
      } else if (topicId === "flood" && def.id === "natural-features") {
        callout = { figure: pc(data.naturalSqMi, data.floodplainSqMi), caption: "(" + num(data.naturalSqMi) + " square miles) of the land in " + C + "’s floodplain is still natural: wetland, forest or open space." };
      }
      break;

    case "inside-outside": {
      // The end-of-bar label is the share inside the floodplain, NOAA's own end-of-bar convention;
      // the exact inside/outside counts are in each segment's tooltip and the data table.
      const rows = data.items.map((it) => ({
        label: it.label,
        keyLabel: pct(it.inside, it.inside + it.outside),
        segments: [
          { label: "Inside the floodplain", value: it.inside },
          { label: "Outside the floodplain", value: it.outside },
        ],
      }));
      visual = { type: "stacked", format: "num", legend: ["Inside the floodplain", "Outside the floodplain"], rows };
      rows.forEach((r) => { show(r.keyLabel); r.segments.forEach((s) => show(num(s.value))); });
      const insideTotal = sum(data.items.map((i) => i.inside));
      const outsideTotal = sum(data.items.map((i) => i.outside));
      callout = { figure: pc(insideTotal, insideTotal + outsideTotal), caption: "of " + C + "’s critical facilities, across all types, are in the floodplain." };
      break;
    }

    case "payouts": {
      const items = data.items.map((it) => {
        show(usd(it.amount));
        return { label: it.period, values: [{ value: it.amount, text: usd(it.amount) }] };
      });
      visual = { type: "bars", format: "usd", items, series: [] };
      const total = usdCompact(sum(data.items.map((i) => i.amount)));
      const since = data.items[0].period.slice(0, 4);
      callout = { figure: total, caption: "paid by the National Flood Insurance Program on " + num(data.claims) + " claims in " + C + " since " + since + "." };
      break;
    }

    case "single-share": {
      callout = { figure: pc(data.count, data.total), caption: "(" + num(data.count) + " jobs) of all jobs in " + C + " are in the floodplain." };
      break;
    }

    case "increment-bars": {
      if (def.id === "people-at-risk") {
        hasLow = data.measures.every((m) => Array.isArray(m.countsWithLow));
        // With a low-lying series every column is the combined count; the connected part is drawn
        // solid and the additional low-lying part dashed on top of it.
        visual = {
          type: "columns",
          hasLow,
          items: data.measures.map((m) => ({
            label: m.label,
            values: m.counts.map((c, k) => ({ value: c, text: num(hasLow ? m.countsWithLow[k] : c), suppressed: false, ...(hasLow ? { low: m.countsWithLow[k], connText: num(c) } : {}) })),
          })),
        };
        // Only the highest increment's column is labelled by default (matching the reference
        // layout), so only that value counts as visibly shown for the repeat guard.
        const head = (m) => (hasLow ? m.countsWithLow : m.counts);
        data.measures.forEach((m) => show(num(head(m)[m.counts.length - 1])));
        const headCount = head(data.measures[0])[0];
        const headTotal = data.measures[0].total;
        callout = {
          figure: pc(headCount, headTotal),
          caption: "(" + num(headCount) + " people) of " + C + "’s total population lives in areas exposed to just " + increments[0] + " ft of sea level rise" + "" + ". As is already the case in many parts of the country, these areas are the first to experience impacts.",
        };
      } else {
        // NOAA pattern: each facility type is a stacked bar (exposed at the selected increment,
        // then the rest of that type as a muted "not exposed" segment), so the type's real total
        // stays visible — counts vary wildly by type (hundreds of schools, dozens of medical
        // facilities), which absolute stacked bars on a shared axis show honestly.
        hasLow = data.measures.every((m) => Array.isArray(m.countsWithLow));
        visual = {
          type: "facilities-stack",
          hasLow,
          items: data.measures.map((m) => ({ label: m.label, total: m.total, counts: m.counts, ...(hasLow ? { countsLow: m.countsWithLow } : {}) })),
        };
        const head = (m) => (hasLow ? m.countsWithLow : m.counts);
        data.measures.forEach((m) => show(num(head(m)[m.counts.length - 1])));
        const p = pc(sum(data.measures.map((m) => head(m)[0])), sum(data.measures.map((m) => m.total)));
        const n0 = sum(data.measures.map((m) => head(m)[0])), nAll = sum(data.measures.map((m) => m.total));
        callout = { figure: p, caption: "(" + num(n0) + " of " + num(nAll) + " facilities) of " + C + "’s critical facilities are in areas exposed to just " + increments[0] + " ft of sea level rise" + "" + ". These areas are the first to experience impacts." };
      }
      break;
    }

    case "increment-composition": {
      const totals = increments.map((_, k) => sum(data.classes.map((c) => c.values[k])));
      const natural = data.classes.filter((c) => c.label !== "Other");
      if (natural.length !== data.classes.length - 1) throw new Error("natural landscapes needs exactly one class labelled \"Other\"");
      // Colour and label carry the emphasis on the natural classes (wetland, upland); "Other" is a
      // muted neutral, so the chart reads "how much of this is natural" at a glance.
      let naturalIdx = 0;
      const segClasses = data.classes.map((c) => (c.label === "Other" ? "cp-bar-neutral" : "cp-bar-natural-" + naturalIdx++));
      // The end-of-bar label is each row's natural share — the same metric as the callout for the
      // lowest increment (row 0), by construction. Not pushed to `show()`: like SLR People at Risk's
      // headcount below, this is a deliberate repeat of the chart's own leading figure as the
      // callout, not an accidental duplicate the guard should catch.
      const rows = increments.map((ft, k) => ({
        label: ft + " ft",
        // No land inundated at this increment is a real zero, not a missing figure: it reads "none".
        keyLabel: totals[k] > 0 ? pct(sum(natural.map((c) => c.values[k])), totals[k]) : "none",
        keyTip: totals[k] > 0 ? "Natural (wetland or upland): " + pct(sum(natural.map((c) => c.values[k])), totals[k]) + ", " + num(sum(natural.map((c) => c.values[k]))) + " of " + num(totals[k]) + " sq mi" : "No land is inundated at this increment (0 sq mi)",
        segments: data.classes.map((c) => ({ label: c.label, value: c.values[k] })),
      }));
      visual = { type: "stacked", format: "num", legend: data.classes.map((c) => c.label), rows, segClasses, opts: { unit: "sq mi", axisTitle: "Square miles inundated", keyTitle: "% natural" } };
      rows.forEach((r) => r.segments.forEach((s) => show(num(s.value))));
      const nat0 = sum(natural.map((c) => c.values[0]));
      callout = totals[0] === 0
        ? { figure: "0", caption: "square miles of land in " + C + " are inundated at " + increments[0] + " ft of sea level rise; the first land is reached at a higher increment." }
        : { figure: rows[0].keyLabel, caption: "(" + num(nat0) + " of " + num(totals[0]) + " square miles) of the land inundated in " + C + " at " + increments[0] + " ft of sea level rise would be natural: wetland or upland." };
      break;
    }

    case "increment-single": {
      hasLow = Array.isArray(data.countsWithLow);
      // All five increments at once, as horizontal bars: the ocean-connected jobs solid and, when the
      // snapshot carries it, the additional jobs in low-lying areas dashed on the end, so a bar's total
      // is the same combined figure the callout gives for the lowest increment. The end-of-bar label
      // is the total job count; like the other SLR sections' leading figure it is a deliberate repeat
      // of the callout's count for row 0, so it is not registered with show().
      const connected = data.counts;
      const combined = hasLow ? data.countsWithLow : data.counts;
      visual = {
        type: "stacked",
        format: "num",
        legend: hasLow ? ["Ocean-connected", "Additional, in low-lying areas"] : ["Ocean-connected"],
        segClasses: hasLow ? ["cp-bar-natural-1", "cp-bar-extra"] : ["cp-bar-natural-1"],
        rows: increments.map((ft, k) => ({
          label: ft + " ft",
          keyLabel: num(combined[k]),
          keyTip: pct(combined[k], data.total) + " of " + num(data.total) + " jobs in " + C,
          segments: hasLow
            ? [{ label: "Ocean-connected", value: connected[k] }, { label: "Low-lying", value: combined[k] - connected[k] }]
            : [{ label: "Ocean-connected", value: connected[k] }],
        })),
        opts: { unit: "jobs", axisTitle: "Jobs in exposed areas", keyTitle: "Total jobs" },
      };
      callout = { figure: pc((hasLow ? data.countsWithLow : data.counts)[0], data.total), caption: "(" + num((hasLow ? data.countsWithLow : data.counts)[0]) + " jobs) of " + C + "’s jobs are in areas exposed to just " + increments[0] + " ft of sea level rise" + "" + "." };
      break;
    }

    case "timing":
      // The chart carries its own picker and readout; there is no separate headline figure.
      visual = { type: "timing" };
      break;

    case "stats": {
      const items = [
        { label: "Establishments", v: data.establishments, fmt: num },
        { label: "Jobs", v: data.jobs, fmt: num },
        { label: "Wages", v: data.wages, fmt: usdCompact },
        { label: "GDP", v: data.gdp, fmt: usdCompact },
      ].map((s) => {
        const text = cellText(s.v, s.fmt);
        show(text);
        return { label: s.label, text, suppressed: text === null, est: mark(s.v) };
      });
      if (data.year) notes.push(data.gdpYear && data.gdpYear !== data.year ? "Establishments, jobs and wages are for " + data.year + "; GDP is for " + data.gdpYear + ", the newest year BEA publishes for these industries." : "All figures are for " + data.year + ".");
      visual = { type: "stats", items, partial: [data.establishments, data.jobs, data.wages, data.gdp].some((v) => isSuppressed(v) || isPartialCell(v)) };
      if (!isSuppressed(data.jobs)) {
        const p = pc(cv(data.jobs), data.denominator);
        callout = topicId === "marine-economy"
          ? { figure: p, caption: "of total employment in " + C + " is in the marine economy.", est: isEstimatedCell(data.jobs) }
          : { figure: p, caption: "of all employment in California is in " + C + ".", est: isEstimatedCell(data.jobs) };
      }
      break;
    }

    case "sector-measures": {
      // No value here is drawn as visible chart text (only the accessible table/description), so
      // the callout figure below is free to reuse a real number from the data.
      const present0 = data.sectors.filter((s) => !isSuppressed(s.employment));
      const top = present0.sort((a, b) => cv(b.employment) - cv(a.employment))[0];
      // Colour and label only the headline sector (the one named in the big number, `top`); every
      // other sector is a neutral alternating shade, identified by name on hover/focus/tap instead.
      const measures = SECTOR_MEASURES.map((m) => ({
        label: m.label,
        segments: data.sectors.map((s) => {
          const v = s[m.key];
          const suppressed = isSuppressed(v);
          const est = !suppressed && mark(v);
          const val = suppressed ? 0 : cv(v);
          return { label: s.label, value: val, suppressed, est, text: suppressed ? "withheld" : (est ? "≈ " : "") + m.fmt(val), printText: suppressed ? "withheld" : (est ? "≈ " : "") + (m.print || m.fmt)(val), isHeadline: s.label === top.label, icon: sectorIconFor(s.label) };
        }),
      }));
      if (data.year && data.gdpYear && data.gdpYear !== data.year) notes.push("Establishments, employment and wages are for " + data.year + "; GDP is for " + data.gdpYear + ", the newest year BEA publishes for these industries.");
      const partial = SECTOR_MEASURES.some((m) => data.sectors.some((s) => isSuppressed(s[m.key]) || isPartialCell(s[m.key])));
      visual = { type: "stacked100", legend: data.sectors.map((s) => s.label), measures, partial, headline: top.label };
      // One denominator rule, everywhere: a share is always of the sectors actually known for that
      // measure, a withheld sector excluded — the callout's employment share, the chart's own
      // Employment bar, and every other measure's bar all divide by their own present-sectors total,
      // never a total that pretends to include an unknown value. Stated in the footnote below so the
      // rule is visible, not just consistently applied.
      const totalEmployment = sum(present0.map((s) => cv(s.employment)));
      const withheldSectors = data.sectors.filter((s) => SECTOR_MEASURES.some((m) => isSuppressed(s[m.key]))).map((s) => s.label);
      const withheld = withheldSectors.length > 0;
      const whose = topicId === "marine-economy" ? "marine economy workforce" : "workforce";
      callout = {
        figure: pc(cv(top.employment), totalEmployment),
        caption: "of " + C + "’s " + whose + " works in " + top.label + ", its largest sector by employment" + (withheld ? PARTIAL_MARK : "") + ".",
        partial: withheld,
        est: isEstimatedCell(top.employment),
      };
      if (withheld) {
        footnote = "* " + withheldSectors.join(" and ") + " " + (withheldSectors.length === 1 ? "is" : "are") + " withheld by the publisher for confidentiality; shares shown are of the remaining sectors.";
      }
      break;
    }

    case "sector-wages": {
      // As with sector-measures, no per-sector value is drawn as chart text.
      const series = ["County", "Coastal California", "Coastal U.S."];
      const keys = ["county", "coastalState", "coastalUS"];
      const items = data.items.map((i) => ({
        label: i.label,
        values: keys.map((k) => {
          const text = cellText(i[k], usd);
          const est = !isSuppressed(i[k]) && mark(i[k]);
          return { value: isSuppressed(i[k]) ? null : cv(i[k]), text: est ? "≈ " + text : text, suppressed: isSuppressed(i[k]), est };
        }),
      }));
      if (data.year) notes.push("All three series are for " + data.year + ", the newest year the comparison series covers, so the county's dot is for " + data.year + " rather than the headline year of the other slides.");
      const partial = data.items.some((i) => keys.some((k) => isSuppressed(i[k])));
      visual = { type: "dots", items, series, partial };
      const present = data.items.filter((i) => !isSuppressed(i.county));
      const top = present.sort((a, b) => cv(b.county) - cv(a.county))[0];
      const bottom = present.sort((a, b) => cv(a.county) - cv(b.county))[0];
      const countyWithheld = data.items.some((i) => isSuppressed(i.county));
      const ratio = (cv(top.county) / cv(bottom.county)).toFixed(1) + "×";
      callout = {
        figure: ratio,
        caption: top.label + " pays the most on average in " + C + "’s economy" + (countyWithheld ? PARTIAL_MARK : "") + " — that many times the lowest-paying sector's wage.",
        partial: countyWithheld,
        est: isEstimatedCell(top.county) || isEstimatedCell(bottom.county),
      };
      // A sector the county has no jobs in (data.noJobs) is simply not a row: the slide says nothing
      // about it, and /county-profiles/about/#sectors-not-shown explains it once for every county.
      // A withheld value is different (the publisher would not say), so it keeps its footnote.
      if (partial) footnote = "* One or more average wages are withheld by the publisher for confidentiality.";
      break;
    }

    case "jobs-equation": {
      // Employed + Self-employed = Total only makes sense to show as an equation when all three
      // numbers are real. When self-employed itself is withheld, "Total" would just be a copy of
      // "Employed" with an unknown addend — misleading arithmetic, not a partial one. Drop the
      // equation and state the one number that is real instead.
      if (data.employedYear && data.selfEmployedYear) notes.push(data.employedYear === data.selfEmployedYear ? "Both counts are for " + data.employedYear + "." : "Employed is for " + data.employedYear + " and self-employed is for " + data.selfEmployedYear + ", the newest year each source publishes, so the total adds two different years.");
      const employedEst = mark(data.employed);
      if (isSuppressed(data.selfEmployed)) {
        const employedText = num(cv(data.employed));
        show(employedText);
        visual = { type: "plain-stat", text: (employedEst ? "≈ " : "") + employedText + " people employed in this industry (self-employed count withheld).", partial: true, est: employedEst };
      } else {
        const parts = [
          { label: "Employed", v: data.employed, est: employedEst },
          { label: "Self-employed", v: data.selfEmployed, est: false },
        ].map((p) => {
          const text = cellText(p.v, num);
          show(text);
          return { label: p.label, text, suppressed: text === null, est: p.est };
        });
        const totalText = num(data.total.value);
        show(totalText);
        // The total is estimated when the imputed part of employed is a large enough share of the total.
        const totalEst = employedEst && (cellEst(data.employed).share * cv(data.employed)) / data.total.value >= ESTIMATED_SHARE_THRESHOLD;
        visual = { type: "equation", parts, total: { text: totalText, partial: data.total.partial, est: totalEst }, partial: data.total.partial };
      }
      const present = data.sectors.filter((s) => !isSuppressed(s.selfEmployed)).sort((a, b) => b.selfEmployed - a.selfEmployed);
      const withheld = data.sectors.some((s) => isSuppressed(s.selfEmployed));
      callout = {
        figure: num(present[0].selfEmployed),
        caption: "self-employed " + present[0].label.toLowerCase() + " workers in " + C + ", more than any other sector" + (withheld ? PARTIAL_MARK : "") + ".",
        partial: withheld,
      };
      break;
    }

    case "stat-pair": {
      // No callout on this section — these two counts are the slide's whole content, so the
      // template draws them at big-number scale; the label says "jobs" since nothing else here does.
      const items = [
        { label: "Jobs in the floodplain", count: data.sfha.count },
        { label: "Jobs under 6 ft of sea level rise", count: data.slr6.count },
      ].map((s) => {
        show(num(s.count));
        return { label: s.label, text: num(s.count) };
      });
      visual = { type: "stat-pair", items };
      break;
    }

    default:
      throw new Error("no section model for kind " + def.kind);
  }

  // The callout rule: the figure may not also be text the chart draws as its own visible label.
  // A zero finding ("0%", "0") is exempt: when a county has no facilities in its floodplain, every
  // bar and the callout all truthfully say 0, and forcing the callout to another figure would hide
  // the finding rather than avoid a repeat. The rule guards against a callout that merely restates a
  // chart's labelled number; a zero is the answer, stated wherever it applies.
  const isZeroFigure = callout && /^0(\.0+)?%?$/.test(callout.figure);
  if (callout && !isZeroFigure && shown.includes(callout.figure) && ratios.has(callout.figure)) {
    const [a, b] = ratios.get(callout.figure);
    if (!shown.includes(pct2(a, b))) callout = { ...callout, figure: pct2(a, b) };
  }
  if (callout && !isZeroFigure && shown.includes(callout.figure)) {
    throw new Error("callout for " + topicId + "/" + def.id + " (" + county + ") repeats a figure its chart already shows: " + callout.figure);
  }

  const partial = Boolean((visual && visual.partial) || (callout && callout.partial));
  // `estimated` is set when any figure on this section carries the "≈" mark: the template then prints the
  // one-line explanation, and the callout's figure gets the mark when what it is built from is estimated.
  const estimated = marks.length || (callout && callout.est) ? { count: marks.length, maxShare: marks.length ? Math.max(...marks) : null } : null;
  return { visual, callout, partial, footnote, estimated, notes };
}

module.exports = { buildSectionModel };
