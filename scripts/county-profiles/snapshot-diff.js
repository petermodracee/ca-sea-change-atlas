// What changed between two snapshots of one county, as plain data. The data PR's Changes section
// (pipeline/data-pr.js) and the site's data changelog (data-changelog.js) both render this, so the two
// cannot disagree. See docs/COUNTY-PROFILES.md, "Comparing two snapshots".
//
//   diffSnapshots(before, after) -> {fips, county, from, to, method, availability, sources, figures, periods,
//                                     estimation, other, unexplained, stampsOnly, summary}
//
// Stamps are not compared: the fields archive.js's contentOf() drops (`snapshot`, `generated`, `attribution`,
// each source's `retrieved` and `verified`), the same definition that decides whether a dated snapshot is
// minted. Key order and the order of `sources` never count; sectors and rows are matched by label.
//
// A figure is labelled the way its slide labels it: the topic, the section's short name and title from the
// schema, then the row (sector, facility type, payout period) and the measure, using the section models' own
// labels where a slide draws one. A figure whose state changes (published, estimated ≈, partial, withheld with
// its reason, zero, not shown) is a state change and never a percentage. A change of `year`, `gdpYear` and the
// like is a change of period. A change only in an estimate's provenance (`est.share`, `est.step`,
// `est.weakShare`) is listed under `estimation`, not as a figure change; when it flips the ≈ marker or a withheld
// state the figure is also a state change, and the entry's `effect` says which.

const schema = require("../../site/data/countyProfileSchema.json");
const wording = require("../../site/_data/countyProfileChangelog.json");
const { contentOf } = require("./pipeline/archive");
const { cellValue, cellEst, isEstimatedCell, isPartialCell } = require("./estimated");
const { num, compact, vintageText } = require("./format");
const { SECTOR_MEASURES, STAT_MEASURES, WAGE_KEYS, wageSeries, PAIR_LABELS, STAT_PAIR } = require("./section-models");

// A figure that moves by this fraction or more (either way) is listed as notable in the data PR.
const NOTABLE_CHANGE = 0.1;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const stable = (v) => JSON.stringify(v, (k, x) => (isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
const same = (a, b) => stable(a) === stable(b);
const listNames = (xs) => (xs.length <= 2 ? xs.join(" and ") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

for (const t of schema.topics) for (const s of t.sections) if (!s.short) throw new Error("countyProfileSchema.json: section " + t.id + "/" + s.id + " has no `short` name");
const topicDef = (id) => schema.topics.find((t) => t.id === id);
const sectionDef = (topicId, id) => topicDef(topicId).sections.find((s) => s.id === id);
const TOPIC_ORDER = schema.topics.map((t) => t.id);

// --- values and states ---------------------------------------------------------------------------------

const ABSENT = { kind: "absent" };
const NO_JOBS = { kind: "no-jobs" };
function stateOf(cell) {
  if (cell === ABSENT || cell === NO_JOBS) return cell;
  if (isObj(cell) && cell.suppressed === true) return { kind: "withheld", reason: cell.reason || null };
  const value = cellValue(cell);
  if (typeof value !== "number") return { kind: "absent" };
  if (value === 0) return { kind: "zero", value };
  return { kind: "value", value, est: isEstimatedCell(cell), partial: isPartialCell(cell) };
}
function stateName(s) {
  if (s.kind === "absent") return "not shown";
  if (s.kind === "no-jobs") return "no jobs in the county";
  if (s.kind === "withheld") return "withheld" + (s.reason ? " (" + s.reason + ")" : "");
  if (s.kind === "zero") return "zero";
  return [s.est ? "estimated (≈)" : "published", s.partial ? "partial" : null].filter(Boolean).join(", ");
}

const UNITS = {
  count: (n) => num(n),
  usd: (n) => (Math.abs(n) >= 1e6 ? compact(n, true, 2) : "$" + num(Math.round(n))),
  sqmi: (n) => num(n) + " sq mi",
};
// A number change shows the values; a state change also names each side's state.
function valueText(s, unit, withState) {
  if (s.kind === "zero") return UNITS[unit](0);
  if (s.kind === "value") return (s.est ? "≈ " : "") + UNITS[unit](s.value) + (withState ? " (" + [s.est ? "estimated" : "published", s.partial ? "partial" : null].filter(Boolean).join(", ") + ")" : "");
  return stateName(s);
}
// "+3.4%", "−6.4%"; a change too small for one decimal keeps two, and one too small for that says so.
function changeText(f) {
  if (f === null) return null;
  const p = f * 100, a = Math.abs(p), sign = p > 0 ? "+" : "−";
  if (a === 0) return "0%";
  if (a < 0.005) return sign + "<0.01%";
  return sign + (a < 0.05 ? a.toFixed(2) : a.toFixed(1)) + "%";
}

// --- the figures of one section, by kind -----------------------------------------------------------------
//
// Each returns {slots, periods, covers}: `slots` maps a stable key to {row, measure, noun, unit, cell}, `periods`
// maps a field to {label, value}, and `covers` lists the data keys the slots and periods account for. A data key
// that changes and is not covered is reported under `other`, so nothing changes silently.

const byLabel = (xs, key = "label") => new Map((xs || []).map((x) => [x[key], x]));
const ECON_NOUN = { establishments: "establishment", jobs: "job", employment: "job", wages: "wage", gdp: "GDP", denominator: "employment total" };
const HAZARD_NOUN = { "people-at-risk": "population", "critical-facilities": "facility", "homes-at-risk": "NFIP", "jobs-at-risk": "job", "natural-features": "land", "natural-landscapes": "land" };

const RING_MEASURES = {
  "people-at-risk": { count: "in the floodplain", total: "county total", extra: { landInsideSqMi: "Land in the floodplain", landTotalSqMi: "Land area" } },
  "natural-features": { count: "development added, 1996–2021", total: "land developed by 2021", extra: { naturalSqMi: "Natural land in the floodplain", floodplainSqMi: "Land in the floodplain" } },
};

function figuresOf(topicId, def, data) {
  const slots = new Map(), periods = {};
  const add = (key, row, measure, noun, unit, cell) => slots.set(key, { row, measure, noun, unit, cell });
  const hazardNoun = HAZARD_NOUN[def.id];
  const incs = data.increments || schema.increments;
  const series = (key, row, d, noun, unit) => {
    // The slide draws the combined (ocean-connected plus low-lying) count when there is one.
    const low = Array.isArray(d.countsWithLow);
    incs.forEach((ft, k) => {
      if (low) add(key + "|low|" + ft, row, ft + " ft", noun, unit, d.countsWithLow[k]);
      add(key + "|conn|" + ft, row, ft + " ft" + (low ? ", ocean-connected" : ""), noun, unit, d.counts[k]);
    });
    if ("total" in d) add(key + "|total", row, "county total", noun, unit, d.total);
  };
  const yearsOf = (fields) => { for (const [f, label] of fields) if (f in data) periods[f] = { label, value: data[f] }; };
  let covers = [];
  switch (def.kind) {
    case "rings": {
      const m = RING_MEASURES[def.id] || { count: "count", total: "total", extra: {} };
      const unit = def.id === "natural-features" ? "sqmi" : "count";
      for (const it of data.items) { add(it.label + "|count", it.label, m.count, hazardNoun, unit, it.count); add(it.label + "|total", it.label, m.total, hazardNoun, unit, it.total); }
      for (const [k, label] of Object.entries(m.extra)) if (k in data) add(k, null, label, "land", "sqmi", data[k]);
      covers = ["items", ...Object.keys(m.extra)];
      break;
    }
    case "inside-outside":
      for (const it of data.items) { add(it.label + "|in", it.label, "inside the floodplain", hazardNoun, "count", it.inside); add(it.label + "|out", it.label, "outside the floodplain", hazardNoun, "count", it.outside); }
      covers = ["items"];
      break;
    case "payouts":
      for (const it of data.items) add(it.period, it.period, "NFIP payouts", "NFIP", "usd", it.amount);
      add("claims", null, "NFIP claims", "NFIP", "count", data.claims);
      covers = ["items", "claims"];
      break;
    case "single-share":
      add("count", null, "Jobs in the floodplain", "job", "count", data.count);
      add("total", null, "Jobs, county total", "job", "count", data.total);
      covers = ["count", "total"];
      break;
    case "increment-bars":
      for (const m of data.measures) series(m.label, m.label, m, hazardNoun, "count");
      covers = ["measures", "increments"];
      break;
    case "increment-single":
      series("jobs", "Jobs", data, "job", "count");
      covers = ["counts", "countsWithLow", "total", "increments"];
      break;
    case "increment-composition":
      for (const c of data.classes) incs.forEach((ft, k) => add(c.label + "|" + ft, c.label, ft + " ft", "land", "sqmi", c.values[k]));
      covers = ["classes", "increments"];
      break;
    case "stats":
      for (const m of STAT_MEASURES) add(m.key, null, m.label, ECON_NOUN[m.key], m.key === "wages" || m.key === "gdp" ? "usd" : "count", data[m.key]);
      add("denominator", null, topicId === "marine-economy" ? "Employment, all industries (denominator)" : "Employment in California (denominator)", "employment total", "count", data.denominator);
      yearsOf([["year", "figures"], ["gdpYear", "GDP"]]);
      covers = ["establishments", "jobs", "wages", "gdp", "denominator", "year", "gdpYear"];
      break;
    case "sector-measures": {
      const labels = [...byLabel(data.sectors).keys()];
      for (const s of data.sectors) for (const m of SECTOR_MEASURES) add(s.label + "|" + m.key, s.label, m.label, ECON_NOUN[m.key], m.key === "wages" || m.key === "gdp" ? "usd" : "count", s[m.key]);
      if (!labels.length) add("none", null, "Sectors", "sector", "count", ABSENT);
      yearsOf([["year", "figures"], ["gdpYear", "GDP"]]);
      covers = ["sectors", "year", "gdpYear"];
      break;
    }
    case "sector-wages": {
      const names = wageSeries(topicId);
      for (const i of data.items) WAGE_KEYS.forEach((k, n) => add(i.label + "|" + k, i.label, n === 0 ? "average wage" : names[n] + " average wage", k === "county" ? "average wage" : "comparator wage", "usd", i[k]));
      for (const label of data.noJobs || []) add(label + "|county", label, "average wage", "average wage", "usd", NO_JOBS);
      yearsOf([["year", "wage comparison"]]);
      covers = ["items", "noJobs", "year"];
      break;
    }
    case "jobs-pair":
      add("employed", null, PAIR_LABELS.employed, "job", "count", data.employed);
      add("selfEmployed", null, PAIR_LABELS.selfEmployed, "self-employed", "count", data.selfEmployed);
      for (const s of data.sectors) add(s.label + "|self", s.label, PAIR_LABELS.selfEmployed.toLowerCase(), "self-employed", "count", s.selfEmployed);
      yearsOf([["employedYear", PAIR_LABELS.employed.toLowerCase()], ["selfEmployedYear", PAIR_LABELS.selfEmployed.toLowerCase()]]);
      covers = ["employed", "selfEmployed", "sectors", "employedYear", "selfEmployedYear"];
      break;
    case "stat-pair":
      for (const p of STAT_PAIR) { add(p.key + "|count", null, p.label, "job", "count", data[p.key].count); add(p.key + "|total", null, p.label + ", county total", "job", "count", data[p.key].total); }
      covers = ["sfha", "slr6"];
      break;
    case "timing":
      covers = [];
      break;
    default:
      throw new Error("snapshot-diff: no figures for section kind " + def.kind);
  }
  return { slots, periods, covers };
}

// --- comparing ------------------------------------------------------------------------------------------

const where = (topicId, sectionId) => {
  const t = topicDef(topicId), s = sectionId ? sectionDef(topicId, sectionId) : null;
  return { topicId, topicLabel: t.label, sectionId: sectionId || null, sectionShort: s ? s.short : null, sectionTitle: s ? s.title : null };
};
const availabilityText = (a) => (a.available ? "available" : "unavailable (" + a.reason + ")");
const sourceName = (key, src) => (wording.sourceNames && wording.sourceNames[key]) || (src && src.label) || key;
const vintageOf = (v) => (v && v.kind === "period" ? v.start + "–" + v.end : vintageText(v, "full"));

function compareSection(out, topicId, def, a, b) {
  const w = where(topicId, def.id);
  const fa = figuresOf(topicId, def, a.data), fb = figuresOf(topicId, def, b.data);
  for (const key of new Set([...fa.slots.keys(), ...fb.slots.keys()])) {
    const x = fa.slots.get(key), y = fb.slots.get(key);
    const slot = y || x;
    const ca = x ? x.cell : ABSENT, cb = y ? y.cell : ABSENT;
    if (same(ca, cb)) continue;
    const sa = stateOf(ca), sb = stateOf(cb);
    const label = (slot.row ? slot.row + ", " : "") + slot.measure;
    const base = { ...w, row: slot.row, measure: slot.measure, label, noun: slot.noun, unit: slot.unit, sources: [...new Set([...(a.sources || []), ...(b.sources || [])])] };
    const stateChanged = stateName(sa) !== stateName(sb);
    const valueChanged = !stateChanged && sa.value !== sb.value;
    if (stateChanged || valueChanged) {
      const change = valueChanged ? (sb.value - sa.value) / sa.value : null;
      out.figures.push({ ...base, type: stateChanged ? "state" : "number", from: { state: stateName(sa), value: sa.value ?? null, text: valueText(sa, slot.unit, stateChanged) }, to: { state: stateName(sb), value: sb.value ?? null, text: valueText(sb, slot.unit, stateChanged) }, change, changeText: changeText(change), notable: stateChanged || Math.abs(change) >= NOTABLE_CHANGE });
    }
    const ea = cellEst(ca), eb = cellEst(cb);
    if (!same(ea, eb) && (ea || eb)) {
      const fields = ["share", "step", "weakShare"].filter((f) => (ea ? ea[f] : null) !== (eb ? eb[f] : null)).map((f) => ({ field: f, from: ea ? ea[f] : null, to: eb ? eb[f] : null }));
      const effect = !stateChanged ? "none" : sa.kind === "withheld" || sb.kind === "withheld" ? "withheld" : sa.est !== sb.est ? "marker" : "none";
      out.estimation.push({ ...base, fields, effect, valueChanged: stateChanged || valueChanged });
    }
  }
  for (const [field, p] of Object.entries({ ...fa.periods, ...fb.periods })) {
    const from = fa.periods[field] ? fa.periods[field].value : null, to = fb.periods[field] ? fb.periods[field].value : null;
    if (from === to) continue;
    // The same field in two sections of one topic (marine GDP's year is on Measuring and on Diversity) is one change.
    const dup = out.periods.find((q) => q.topicId === topicId && q.field === field && q.from === from && q.to === to);
    if (dup) { dup.sections.push(def.short); continue; }
    out.periods.push({ topicId, topicLabel: w.topicLabel, field, label: p.label, sections: [def.short], from, to, text: w.topicLabel + " " + p.label + ": " + from + " to " + to, sources: [...new Set([...(a.sources || []), ...(b.sources || [])])] });
  }
  const covered = new Set([...fa.covers, ...fb.covers]);
  for (const k of new Set([...Object.keys(a.data), ...Object.keys(b.data)])) {
    if (!covered.has(k) && !same(a.data[k], b.data[k])) out.other.push({ ...w, text: w.topicLabel + ", " + def.short + ": `" + k + "` changed" });
  }
  for (const k of ["sources", "use"]) {
    if (!same(k === "sources" ? [...(a[k] || [])].sort() : a[k], k === "sources" ? [...(b[k] || [])].sort() : b[k])) out.other.push({ ...w, text: w.topicLabel + ", " + def.short + ": " + (k === "sources" ? "cites " + (b.sources.join(", ") || "no sources") + " (was " + (a.sources.join(", ") || "none") + ")" : "`use` changed") });
  }
}

function diffSnapshots(before, after) {
  if (!after) throw new Error("diffSnapshots: no snapshot to compare");
  const out = { fips: after.fips, county: after.county, from: before ? before.snapshot : null, to: after.snapshot, method: null, availability: [], sources: { vintage: [], added: [], removed: [] }, figures: [], periods: [], estimation: [], other: [] };
  if (!before) return finish(out, true);
  if (before.fips !== after.fips) throw new Error("diffSnapshots: " + before.fips + " and " + after.fips + " are different counties");
  const a = contentOf(before), b = contentOf(after);
  if (a.method !== b.method) out.method = { from: a.method, to: b.method };

  for (const key of new Set([...Object.keys(a.sources), ...Object.keys(b.sources)])) {
    const x = a.sources[key], y = b.sources[key];
    if (!x) out.sources.added.push({ key, name: sourceName(key, y), vintage: vintageOf(y.vintage) });
    else if (!y) out.sources.removed.push({ key, name: sourceName(key, x), vintage: vintageOf(x.vintage) });
    else {
      if (!same(x.vintage, y.vintage)) out.sources.vintage.push({ key, name: sourceName(key, y), from: vintageOf(x.vintage), to: vintageOf(y.vintage) });
      for (const f of ["label", "url"]) if (x[f] !== y[f]) out.other.push({ topicId: null, text: "Source `" + key + "` " + f + " changed: " + x[f] + " to " + y[f] });
    }
  }

  for (const topicId of TOPIC_ORDER) {
    const ta = a.topics[topicId], tb = b.topics[topicId];
    if (!same({ available: ta.available, reason: ta.reason }, { available: tb.available, reason: tb.reason })) {
      out.availability.push({ ...where(topicId, null), from: availabilityText(ta), to: availabilityText(tb) });
      continue;
    }
    if (!tb.available) continue;
    for (const def of topicDef(topicId).sections) {
      const sa = ta.sections[def.id], sb = tb.sections[def.id];
      if (sa.available !== sb.available || sa.reason !== sb.reason) {
        out.availability.push({ ...where(topicId, def.id), from: availabilityText(sa), to: availabilityText(sb) });
        continue;
      }
      if (sb.available) compareSection(out, topicId, def, sa, sb);
    }
  }

  // Everything else that is content: the gauge, the estimation block, the license and identity fields.
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (["topics", "sources", "method"].includes(k) || same(a[k], b[k])) continue;
    if (k === "estimation") {
      for (const e of new Set([...Object.keys(a.estimation || {}), ...Object.keys(b.estimation || {})])) {
        if (!same((a.estimation || {})[e], (b.estimation || {})[e])) out.estimation.push({ topicId: null, label: e === "tourismShoreShare" ? "Tourism and recreation shoreline share" : e === "thresholds" ? "Estimate thresholds" : e, fields: [], effect: "none", valueChanged: false, block: e });
      }
    } else out.other.push({ topicId: null, text: "`" + k + "` changed" });
  }
  return finish(out, false);
}

// A changed figure is explained when a source its section cites changed vintage, or was added or removed.
function finish(out, first) {
  const moved = new Set([...out.sources.vintage, ...out.sources.added, ...out.sources.removed].map((s) => s.key));
  for (const f of [...out.figures, ...out.periods]) f.explained = f.sources.some((k) => moved.has(k));
  out.unexplained = [...out.figures, ...out.periods].filter((f) => !f.explained);
  out.first = first;
  out.stampsOnly = !first && !out.method && !out.availability.length && !out.figures.length && !out.periods.length && !out.estimation.length && !out.other.length && !out.sources.vintage.length && !out.sources.added.length && !out.sources.removed.length;
  out.summary = summarize(out);
  return out;
}

// --- the one-line summary -------------------------------------------------------------------------------

const NOUN_ORDER = ["population", "facility", "NFIP", "land", "establishment", "job", "self-employed", "employment total", "wage", "average wage", "comparator wage", "GDP", "sector"];
const nounPhrase = (nouns) => listNames(nouns.sort((x, y) => NOUN_ORDER.indexOf(x) - NOUN_ORDER.indexOf(y))) + " figures";
const topicSections = (entries) => {
  const by = new Map();
  for (const e of entries) {
    if (!by.has(e.topicId)) by.set(e.topicId, new Set());
    for (const s of e.sections || [e.sectionShort]) if (s) by.get(e.topicId).add(s);
  }
  return [...by.entries()].sort((x, y) => TOPIC_ORDER.indexOf(x[0]) - TOPIC_ORDER.indexOf(y[0])).map(([t, s]) => {
    const order = topicDef(t).sections.map((d) => d.short);
    return topicDef(t).label + (s.size ? " (" + [...s].sort((x, y) => order.indexOf(x) - order.indexOf(y)).join(", ") + ")" : "");
  });
};

// A county's changed figures grouped by family, the set of measures one topic changed ("GDP figures", "population
// and job figures"), in topic order: the clauses of its summary line and what entrySummary counts.
function figureFamilies(figures) {
  const byTopic = new Map();
  for (const f of figures) { if (!byTopic.has(f.topicId)) byTopic.set(f.topicId, []); byTopic.get(f.topicId).push(f); }
  const families = new Map();
  for (const [t, fs] of [...byTopic.entries()].sort((x, y) => TOPIC_ORDER.indexOf(x[0]) - TOPIC_ORDER.indexOf(y[0]))) {
    const key = nounPhrase([...new Set(fs.map((f) => f.noun))]);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(...fs);
  }
  return families;
}

function summarize(d) {
  if (d.first) return "First snapshot of this county.";
  if (d.stampsOnly) return "No figures changed; sources re-verified.";
  const parts = [];
  if (d.method) parts.push("Methodology version " + d.method.from + " to " + d.method.to + ".");
  if (d.figures.length) {
    // One clause per set of measures, naming the topics and sections where that set changed.
    const clauses = figureFamilies(d.figures);
    parts.push(upper([...clauses.entries()].map(([nouns, fs]) => nouns + " changed in " + listNames(topicSections(fs))).join("; ")) + ".");
    const states = d.figures.filter((f) => f.type === "state").length;
    if (states) parts.push(upper(plural(states, "figure", "figures")) + " changed state.");
  }
  for (const a of d.availability) parts.push((a.sectionShort ? a.topicLabel + ", " + a.sectionShort : a.topicLabel) + ": " + a.from + " to " + a.to + ".");
  // A change of period goes in the line only when no figure moved; otherwise it is in the detail.
  if (!d.figures.length && d.periods.length) parts.push(d.periods.map((p) => p.text).join("; ") + ".");
  if (!parts.length && d.estimation.length) parts.push("Imputed shares changed in " + listNames(topicSections(d.estimation.filter((e) => e.topicId))) + ".");
  if (!parts.length && (d.sources.vintage.length || d.sources.added.length || d.sources.removed.length)) parts.push("Source vintages changed: " + d.sources.vintage.map((v) => v.name + " " + v.from + " to " + v.to).join("; ") + ".");
  if (!parts.length && d.other.length) parts.push("Other content changed: " + d.other.map((o) => o.text).join("; ") + ".");
  return parts.join(" ");
}

// Vintage changes across the counties of one refresh, one line per source: "BEA ...: 2024 to 2025, 23 counties". A
// source whose vintage is per county (USGS's latest load date) has a different pair in each, so its line gives no
// dates (`varies`); each county's own pair is in its detail.
function sharedVintages(diffs) {
  const by = new Map();
  for (const d of diffs) for (const v of d.sources.vintage) {
    if (!by.has(v.name)) by.set(v.name, { name: v.name, pairs: new Set(), counties: [] });
    by.get(v.name).pairs.add(v.from + "|" + v.to);
    by.get(v.name).counties.push(d.county);
  }
  return [...by.values()].map((g) => {
    const [from, to] = g.pairs.size === 1 ? [...g.pairs][0].split("|") : [null, null];
    const n = plural(g.counties.length, "county", "counties");
    return { name: g.name, from, to, varies: g.pairs.size > 1, counties: g.counties, text: g.name + ": " + (g.pairs.size === 1 ? from + " to " + to + ", " + n : "new vintage in " + n + ", dates vary by county") };
  }).sort((x, y) => y.counties.length - x.counties.length || x.name.localeCompare(y.name));
}

// One line across the counties of one refresh: the counties per figure family, most first, then the figures that
// changed state. "GDP figures changed in 23 counties; facility figures in 6; 9 figures changed state." Null when no
// figure moved in any county.
function entrySummary(diffs) {
  const counts = new Map();
  for (const d of diffs) for (const key of figureFamilies(d.figures).keys()) counts.set(key, (counts.get(key) || 0) + 1);
  const firstNoun = (key) => NOUN_ORDER.findIndex((n) => key.startsWith(n));
  const families = [...counts.entries()].sort((x, y) => y[1] - x[1] || firstNoun(x[0]) - firstNoun(y[0]) || x[0].localeCompare(y[0]));
  const parts = families.map(([key, n], i) => key + (i === 0 ? " changed in " : " in ") + (i === 0 ? plural(n, "county", "counties") : n));
  const states = diffs.reduce((n, d) => n + d.figures.filter((f) => f.type === "state").length, 0);
  if (states) parts.push(plural(states, "figure", "figures") + " changed state");
  return parts.length ? upper(parts.join("; ")) + "." : null;
}

module.exports = { diffSnapshots, summarize, sharedVintages, entrySummary, changeText, stateName, NOTABLE_CHANGE };
