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
const { cellValue: cv, cellEst, isEstimatedCell, isPartialCell, ESTIMATED_SHARE_THRESHOLD, WITHHOLD_REASONS } = require("./estimated.js");

// A callout share is built with pc() so that, if it happens to equal a number the chart labels,
// the callout can be restated at two decimals instead of failing the build over a coincidence.
const ratios = new Map();
const pc = (a, b) => { const f = pct(a, b); ratios.set(f, [a, b]); return f; };
const pct2 = (a, b) => ((a / b) * 100).toFixed(2) + "%";

const isSuppressed = (v) => v !== null && typeof v === "object" && v.suppressed === true;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const SECTOR_MEASURES = [
  { key: "establishments", label: "Establishments", fmt: num },
  { key: "wages", label: "Wages", fmt: usdWords, print: usdCompact },
  { key: "employment", label: "Employment", fmt: num },
  { key: "gdp", label: "GDP", fmt: usdWords, print: usdCompact },
];
// `print` is what the printed data table shows: the same abbreviation as the big-number callouts
// ("$2.81B"), so a dollar amount reads one way on paper. The screen keeps `fmt`.

const EST_PCT = Math.round(ESTIMATED_SHARE_THRESHOLD * 100);

// Marks and keys. A mark is a printable glyph on a label (never on the figure); each has the words a screen
// reader gets instead (`sr`), and each is explained once in the slide's one-line key. The reasons behind a
// withheld figure are not stated on a slide: they are on the About page (#withheld-reasons), and the JSON
// `reason` field is unchanged. A slide only says which figure is withheld and that the data was not reliable.
const MARK_YEAR = "†";
const MARK_GDP_YEAR = "‡";
const MARK_INCOMPLETE = "*";
const MARK_WITHHELD = "§";
const listNames = (names) => (names.length <= 2 ? names.join(" and ") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]);
const withheldLine = (names) => listNames(names) + " withheld; not enough reliable data.";
// The § line is for figures withheld whole. Public administration's GDP (reason gdp-unreproducible) is one measure of a
// sector whose jobs and wages are shown, so it is never described by that line: the star on GDP and "Excludes Public
// administration." say it. Every caller passes its cells through here, so the line cannot describe that reason.
// Round down to `digits` significant figures (never up, so a "More than" statement stays true).
const floorSig = (n, digits) => { if (n < 10 ** digits) return Math.floor(n); const mag = 10 ** (Math.floor(Math.log10(n)) - digits + 1); return Math.floor(n / mag) * mag; };
const wholeWithheld = (cells) => cells.filter((c) => c.reason !== "gdp-unreproducible");
// Every withheld figure must carry a reason from the closed vocabulary, even though the slide does not state it.
const checkReasons = (cells) => cells.forEach((c) => { if (!WITHHOLD_REASONS.includes(c.reason)) throw new Error("withheld figure " + c.name + " has no known reason: " + c.reason); });

// The two figure years on a slide. Marked only where they differ (marine economy: GDP runs a year behind); when
// they agree the source rows give the year and nothing is marked.
const yearMarks = (year, gdpYear) => {
  if (!year || year === gdpYear) return null;
  return {
    main: { glyph: MARK_YEAR, sr: year + " figure", key: year + " figures." },
    gdp: { glyph: MARK_GDP_YEAR, sr: gdpYear + " figure", key: gdpYear + " figures." },
  };
};
const KEY_INCOMPLETE = { glyph: MARK_INCOMPLETE, key: "Some sectors withheld, see the sector chart.", sr: "some sectors withheld" };
const KEY_EXCLUDES = (names) => ({ glyph: MARK_INCOMPLETE, key: "Excludes " + listNames(names) + ".", sr: "excludes " + listNames(names) });

// Sector caveats that depend on what is inside a county's figure, keyed by county and sector (the snapshots carry no
// per-industry rows, so this cannot be derived from them). The mechanism is general and is stated in the About page's
// sector definitions; the figure is the traced one (docs/DECISIONS.md, "Santa Barbara marine transportation").
const SECTOR_CAVEATS = [
  { topicId: "marine-economy", county: "Santa Barbara", sector: "Marine transportation", text: "Santa Barbara’s marine transportation is dominated by navigation instruments manufacturing (NAICS 334511). The sector definition includes it, but its products are not all maritime." },
];
const caveatsFor = (topicId, county, sectors) => SECTOR_CAVEATS.filter((c) => c.topicId === topicId && c.county === county && sectors.includes(c.sector)).map((c) => c.text);

// Value cell -> display text; a suppressed cell has no text. A cell may carry provenance ({value, est}).
const cellText = (v, fmt) => (isSuppressed(v) ? null : fmt(cv(v)));

function buildSectionModel({ county, topicId, def, data, increments, estimation, headlineYear }) {
  const C = county + " County";
  const shown = [];
  const show = (...s) => s.forEach((x) => { if (x !== null && x !== undefined) shown.push(String(x)); });
  const anySuppressed = (vals) => vals.some(isSuppressed);
  let visual = null;
  let callout = null; // {figure, caption}
  // Why a section that normally has a headline has none (a closed list, so a headline cannot vanish unexplained):
  // "withheld-part" (a share of a total whose parts are withheld is not stated), "jobs-withheld" (the whole jobs total is withheld) or "too-few-sectors".
  let calloutSkip = null;
  // True for an SLR section whose data carries `countsWithLow`: its figures are then the combined
  // (ocean-connected plus low-lying) counts, drawn with the connected part solid and the additional
  // low-lying part dashed. The explanation lives on the County Profiles about page, not on the section.
  let hasLow = false;
  const footnotes = []; // withheld-figure footnotes, one per reason (withheldNotes)
  // The estimated state: every figure drawn from this section that is marked "≈" (imputed share at or
  // above ESTIMATED_SHARE_THRESHOLD) is registered here, so the section can explain the mark once.
  const marks = [];
  // Notes that say which year each figure is for, wherever the years differ (one line each).
  const notes = [];
  // The slide's one-line key: [{glyph, text}], one entry per symbol used on it.
  const keyItems = [];
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
        callout = { figure: pc(data.naturalSqMi, data.floodplainSqMi), caption: "(" + num(data.naturalSqMi) + (num(data.naturalSqMi) === "1" ? " square mile" : " square miles") + ") of the designated 100-year floodplain are natural features." };
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
      callout = { figure: pc(insideTotal, insideTotal + outsideTotal), caption: "of the critical facilities in " + C + " falls within the FEMA 100-year floodplain." };
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
      callout = { figure: pc(data.count, data.total), caption: "of all " + num(data.total) + " jobs in " + C + " are in the FEMA 100-year floodplain." };
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
        opts: { unit: "jobs", keyTitle: "Total jobs" },
      };
      callout = { figure: pc((hasLow ? data.countsWithLow : data.counts)[0], data.total), caption: "(" + num((hasLow ? data.countsWithLow : data.counts)[0]) + " jobs) of " + C + "’s jobs are in areas exposed to just " + increments[0] + " ft of sea level rise" + "" + "." };
      break;
    }

    case "timing":
      // The chart carries its own picker and readout; there is no separate headline figure.
      visual = { type: "timing" };
      break;

    case "stats": {
      // Marks sit on the labels, never on the figures. Year marks appear only where the figures' years differ
      // (marine GDP); the star says why a total is partial. The key under the tiles explains each once.
      const years = yearMarks(data.year, data.gdpYear || data.year);
      // A starred total leaves out something withheld: Public administration's GDP (total economy) or a withheld sector (marine economy).
      const gdpStar = topicId === "total-economy" && isPartialCell(data.gdp);
      const raw = [data.establishments, data.jobs, data.wages, data.gdp];
      const items = [
        { label: "Establishments", v: data.establishments, fmt: num },
        { label: "Jobs", v: data.jobs, fmt: num },
        { label: "Wages", v: data.wages, fmt: usdCompact },
        { label: "GDP", v: data.gdp, fmt: usdCompact },
      ].map((s, k) => {
        const text = cellText(s.v, s.fmt);
        show(text);
        const marks = [];
        if (years) marks.push(k === 3 ? years.gdp : years.main);
        if (isPartialCell(s.v)) marks.push(gdpStar && k === 3 ? KEY_EXCLUDES(["Public administration"]) : KEY_INCOMPLETE);
        return { label: s.label, text, suppressed: text === null, est: mark(s.v), marks, reason: isSuppressed(s.v) ? s.v.reason : null };
      });
      const withheldCells = items.filter((i) => i.suppressed).map((i) => ({ name: i.label, reason: i.reason }));
      checkReasons(withheldCells);
      if (wholeWithheld(withheldCells).length) footnotes.push(withheldLine(wholeWithheld(withheldCells).map((c) => c.name)));
      if (years) keyItems.push({ glyph: years.main.glyph, text: years.main.key }, { glyph: years.gdp.glyph, text: years.gdp.key });
      if (gdpStar) keyItems.push({ glyph: MARK_INCOMPLETE, text: KEY_EXCLUDES(["Public administration"]).key });
      if (raw.some((v, k) => isPartialCell(v) && !(gdpStar && k === 3))) keyItems.push({ glyph: MARK_INCOMPLETE, text: KEY_INCOMPLETE.key });
      visual = { type: "stats", items, count: items.filter((i) => !i.suppressed).length, partial: raw.some((v) => isSuppressed(v) || isPartialCell(v)) };
      // A complete jobs total gives the exact share. A partial one (a withheld sector is left out) is a floor, because
      // the withheld sectors only add jobs, so the headline says "More than" and never states a number it could
      // overstate: the share rounded DOWN to one decimal, or, when that share is under 0.1%, the jobs total rounded
      // DOWN to two significant figures. Only a wholly withheld total has no headline.
      if (isSuppressed(data.jobs)) calloutSkip = "jobs-withheld";
      else if (!isPartialCell(data.jobs)) {
        const p = pc(cv(data.jobs), data.denominator);
        callout = topicId === "marine-economy"
          ? { figure: p, caption: "of total employment in " + C + " is in the marine economy.", est: isEstimatedCell(data.jobs) }
          : { figure: p, caption: "of all employment in California is in " + C + ".", est: isEstimatedCell(data.jobs) };
      } else {
        const floorShare = Math.floor((cv(data.jobs) / data.denominator) * 1000) / 10;
        callout = floorShare >= 0.1
          ? { figure: floorShare.toFixed(1) + "%", prefix: "More than", floor: true, caption: (topicId === "marine-economy" ? "of total employment in " + C + " is" : "of all employment in California is in " + C + ".") + (topicId === "marine-economy" ? " in the marine economy." : ""), est: isEstimatedCell(data.jobs) }
          : { figure: num(floorSig(cv(data.jobs), 2)), prefix: "More than", floor: true, caption: topicId === "marine-economy" ? "jobs in " + C + " are in the marine economy." : "jobs are in " + C + ".", est: isEstimatedCell(data.jobs) };
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
      // Marks sit on the measure labels (the chart's row labels): the figure's year where the years differ, and a
      // star on GDP when Public administration's GDP is left out. Sectors with a withheld figure are marked in the
      // legend instead (the bars cannot show them). Each mark is explained in the key; a screen reader gets words.
      const years = yearMarks(data.year, data.gdpYear || data.year);
      const excluded = data.sectors.filter((s) => isSuppressed(s.gdp) && s.gdp.reason === "gdp-unreproducible").map((s) => s.label);
      const measures = SECTOR_MEASURES.map((m) => {
        const marks = [];
        if (years) marks.push(m.key === "gdp" ? years.gdp : years.main);
        if (m.key === "gdp" && excluded.length) marks.push(KEY_EXCLUDES(excluded));
        return { label: m.label, marks, srLabel: m.label + (marks.length ? " (" + marks.map((k) => k.sr).join("; ") + ")" : ""),
        segments: data.sectors.map((s) => {
          const v = s[m.key];
          const suppressed = isSuppressed(v);
          const est = !suppressed && mark(v);
          const val = suppressed ? 0 : cv(v);
          return { label: s.label, value: val, suppressed, est, text: suppressed ? "withheld" : (est ? "≈ " : "") + m.fmt(val), printText: suppressed ? "withheld" : (est ? "≈ " : "") + (m.print || m.fmt)(val), isHeadline: Boolean(top) && s.label === top.label, icon: sectorIconFor(s.label) };
        }),
      }; });
      notes.push(...caveatsFor(topicId, county, data.sectors.filter((s) => !isSuppressed(s.employment)).map((s) => s.label)));
      const partial = SECTOR_MEASURES.some((m) => data.sectors.some((s) => isSuppressed(s[m.key]) || isPartialCell(s[m.key])));
      visual = { type: "stacked100", legend: data.sectors.map((s) => s.label), measures, partial, headline: top ? top.label : null };
      // One denominator rule, everywhere: a share is always of the sectors actually known for that
      // measure, a withheld sector excluded — the callout's employment share, the chart's own
      // Employment bar, and every other measure's bar all divide by their own present-sectors total,
      // never a total that pretends to include an unknown value. Stated in the footnote below so the
      // rule is visible, not just consistently applied.
      const totalEmployment = sum(present0.map((s) => cv(s.employment)));
      const withheldSectors = data.sectors.filter((s) => SECTOR_MEASURES.some((m) => isSuppressed(s[m.key]))).map((s) => s.label);
      const withheld = withheldSectors.length > 0;
      // The callout is the largest sector's share of employment, so it is built from every sector's employment.
      const withheldEmployment = data.sectors.some((s) => isSuppressed(s.employment));
      const whose = topicId === "marine-economy" ? "marine economy workforce" : "workforce";
      // A callout never states a figure whose parts are withheld: with any sector's employment withheld the
      // largest sector's share of the workforce is a share of only part of it, so no callout is stated (the chart
      // still shows the shares of the sectors that are known, under the denominator rule above).
      if (withheldEmployment || !top) calloutSkip = "withheld-part";
      callout = withheldEmployment || !top ? null : {
        figure: pc(cv(top.employment), totalEmployment),
        caption: "of " + C + "’s " + whose + " works in " + top.label + ", its largest sector by employment.",
        est: isEstimatedCell(top.employment),
      };
      // Key: the year marks, the GDP star, then one § line for every sector with a withheld figure, on its legend
      // label. One wording for all reasons (the reason is on the About page and in the JSON), except that Public
      // administration's withheld GDP (gdp-unreproducible) is the star's alone: its jobs and wages are shown.
      if (years) keyItems.push({ glyph: years.main.glyph, text: years.main.key }, { glyph: years.gdp.glyph, text: years.gdp.key });
      if (excluded.length) keyItems.push({ glyph: MARK_INCOMPLETE, text: KEY_EXCLUDES(excluded).key });
      const markedSectors = [];
      data.sectors.forEach((s) => SECTOR_MEASURES.forEach((m) => {
        const v = s[m.key];
        if (!isSuppressed(v)) return;
        checkReasons([{ name: s.label + " " + m.key, reason: v.reason }]);
        if (v.reason !== "gdp-unreproducible" && !markedSectors.includes(s.label)) markedSectors.push(s.label);
      }));
      if (markedSectors.length) keyItems.push({ glyph: MARK_WITHHELD, text: withheldLine(markedSectors) });
      visual.withheldMark = markedSectors.length ? { glyph: MARK_WITHHELD, sectors: markedSectors } : null;
      if (withheld) footnotes.push("Shares exclude withheld sectors.");
      break;
    }

    case "sector-wages": {
      // As with sector-measures, no per-sector value is drawn as chart text.
      // Marine: Open ENOW's "All Coastal States" series, the coastal portions of 30 states (not the whole country).
      const marine = topicId === "marine-economy";
      const series = ["County", "Coastal California", marine ? "All Coastal States" : "Coastal U.S."];
      const keys = ["county", "coastalState", "coastalUS"];
      const items = data.items.map((i) => ({
        label: i.label,
        // A sector with any withheld value carries the withheld mark on its label (and the key says what it means).
        marked: keys.some((k) => isSuppressed(i[k])),
        values: keys.map((k) => {
          const text = cellText(i[k], usd);
          const est = !isSuppressed(i[k]) && mark(i[k]);
          return { value: isSuppressed(i[k]) ? null : cv(i[k]), text: est ? "≈ " + text : text, suppressed: isSuppressed(i[k]), est };
        }),
      }));
      // The comparison year is given by the sources row (each source's own vintage), not repeated here.
      if (marine) notes.push("All Coastal States means the coastal portions of 30 states, not the whole country.");
      notes.push(...caveatsFor(topicId, county, data.items.filter((i) => !isSuppressed(i.county)).map((i) => i.label)));
      const partial = data.items.some((i) => keys.some((k) => isSuppressed(i[k])));
      visual = { type: "dots", items, series, partial };
      // The headline is the lowest-paying sector's name, in the big slot, and the sentence says so. The lowest is taken
      // among the sectors whose county wage is shown (a withheld one cannot be ranked); equal wages are broken by
      // sector name, so the same data always gives the same sector. A lowest wage that is itself estimated carries
      // the estimate mark. With fewer than two shown sectors there is nothing to be the lowest of, so no callout.
      const present = data.items.filter((i) => !isSuppressed(i.county));
      const lowest = present.slice().sort((x, y) => cv(x.county) - cv(y.county) || x.label.localeCompare(y.label))[0];
      if (present.length < 2) calloutSkip = "too-few-sectors";
      callout = present.length < 2 ? null : {
        figure: null,
        caption: lowest.label + " has the lowest average wage per job in " + C + ".",
        parts: [{ t: lowest.label, b: true }, { t: " has the lowest average wage per job in " + C + "." }],
        est: isEstimatedCell(lowest.county),
      };
      // A sector the county has no jobs in (data.noJobs) is simply not a row: the slide says nothing
      // about it, and /county-profiles/about/#sectors-not-shown explains it once for every county.
      // A withheld value is different (the publisher would not say), so it keeps its footnote.
      const cells = [];
      data.items.forEach((i) => keys.forEach((k, n) => { if (isSuppressed(i[k])) cells.push({ reason: i[k].reason, name: k === "county" ? i.label : i.label + " (" + series[n] + ")" }); }));
      checkReasons(cells);
      if (wholeWithheld(cells).length) keyItems.push({ glyph: MARK_WITHHELD, text: withheldLine(wholeWithheld(cells).map((c) => c.name)) });
      visual.withheldMark = wholeWithheld(cells).length ? { glyph: MARK_WITHHELD } : null;
      break;
    }

    case "jobs-pair": {
      // Employed and self-employed are two separate figures, each with its own year and source: the two
      // counts describe different years, so they are not added. Employed leads; a withheld self-employed count
      // is dropped from the row and named in the footnote, like any withheld stat.
      const pairItems = [
        { label: "Employed workers, " + data.employedYear, v: data.employed },
        { label: "Self-employed workers, " + data.selfEmployedYear, v: data.selfEmployed },
      ].map((p) => {
        const text = cellText(p.v, num);
        show(text);
        return { label: p.label, text, suppressed: text === null, est: mark(p.v), marks: isPartialCell(p.v) ? [KEY_INCOMPLETE] : [] };
      });
      visual = { type: "stats", pair: true, items: pairItems, count: pairItems.filter((i) => !i.suppressed).length, partial: pairItems.some((i) => i.suppressed) || isPartialCell(data.employed) };
      const pairWithheld = [[data.employed, "Employed workers"], [data.selfEmployed, "Self-employed workers"]].filter(([v]) => isSuppressed(v)).map(([v, name]) => ({ reason: v.reason, name }));
      checkReasons(pairWithheld);
      if (wholeWithheld(pairWithheld).length) footnotes.push(withheldLine(wholeWithheld(pairWithheld).map((c) => c.name)));
      if (isPartialCell(data.employed)) keyItems.push({ glyph: MARK_INCOMPLETE, text: KEY_INCOMPLETE.key });
      // Each tile's label carries its own year, and the sources row gives each source and vintage; they are
      // separate counts, never added (About page, #economy-years).
      const present = data.sectors.filter((s) => !isSuppressed(s.selfEmployed)).sort((a, b) => b.selfEmployed - a.selfEmployed);
      const withheld = data.sectors.some((s) => isSuppressed(s.selfEmployed));
      const tied = present.length > 1 && present[1].selfEmployed === present[0].selfEmployed;
      const phrase = "self-employed " + (present[0] ? present[0].label.toLowerCase() : "") + " workers";
      if (withheld || !present.length) calloutSkip = "withheld-part";
      callout = withheld || !present.length ? null : {
        figure: num(present[0].selfEmployed),
        caption: phrase + " in " + C + (tied ? ", tied for the most of any sector." : ", more than any other sector."),
        parts: [{ t: phrase, b: true }, { t: " in " + C + (tied ? ", tied for the most of any sector." : ", more than any other sector.") }],
      };
      break;
    }

    case "stat-pair": {
      // No callout on this section — these two counts are the slide's whole content, so the
      // template draws them at big-number scale; the label says "jobs" since nothing else here does.
      const items = [
        { label: "Potential jobs affected by current flooding", count: data.sfha.count },
        { label: "Potential jobs affected by future flooding", count: data.slr6.count },
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
  // A section that normally has a headline must have one, or say in the closed list above why not. This fails the build
  // when a headline disappears without a reason (timing and the stat pair never have one).
  if (!callout && !calloutSkip && !["timing", "stat-pair"].includes(def.kind)) {
    throw new Error("no headline for " + topicId + "/" + def.id + " (" + county + ") and no reason given: a section that normally has a callout lost it");
  }
  const isZeroFigure = callout && callout.figure && /^0(\.0+)?%?$/.test(callout.figure);
  if (callout && callout.figure && !callout.floor && !isZeroFigure && shown.includes(callout.figure) && ratios.has(callout.figure)) {
    const [a, b] = ratios.get(callout.figure);
    if (!shown.includes(pct2(a, b))) callout = { ...callout, figure: pct2(a, b) };
  }
  if (callout && callout.figure && !callout.floor && !isZeroFigure && shown.includes(callout.figure)) {
    throw new Error("callout for " + topicId + "/" + def.id + " (" + county + ") repeats a figure its chart already shows: " + callout.figure);
  }

  const partial = Boolean((visual && visual.partial) || (callout && callout.partial));
  // `estimated` is set when any figure on this section carries the "≈" mark: the template then prints the
  // one-line explanation, and the callout's figure gets the mark when what it is built from is estimated.
  const estimated = marks.length || (callout && callout.est) ? { count: marks.length, maxShare: marks.length ? Math.max(...marks) : null, thresholdPercent: EST_PCT } : null;
  return { visual, callout, calloutSkip, partial, footnotes, estimated, notes, keys: keyItems };
}

module.exports = { buildSectionModel };
