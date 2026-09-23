// Validates County Profiles snapshots against site/data/countyProfileSchema.json and the county
// spine. Run at build time by site/_data/countyProfiles.js; the Phase 2 pipeline should call
// validateSnapshot() before writing a file. Throws on the first problem found, so any error
// fails the build.

const fs = require("fs");
const path = require("path");

// A stale reference to the site's old GitHub Pages home (petermodracee.github.io/ca-sea-change-atlas/),
// left over from before the seachangeatlas.org move. Every internal link and generated URL (canonical,
// citation, snapshot JSON) must be built from `site.url` instead. Run over the built `_site/` output
// after an Eleventy build (wired in .eleventy.js's `eleventy.after` hook) so a hardcoded old host or
// path prefix anywhere in the site — not just County Profiles — fails the build.
const STALE_HOST_RE = /petermodracee\.github\.io|\/ca-sea-change-atlas\//;

function checkNoStaleHost(outputDir) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|xml|json|njk|js)$/.test(entry.name)) {
        // The GitHub *repo* is still named ca-sea-change-atlas and is still linked from the About
        // and licenses pages (github.com/petermodracee/ca-sea-change-atlas) — that's correct and
        // unrelated to where the site is deployed, so strip it before checking for the stale
        // GitHub Pages URL (petermodracee.github.io/ca-sea-change-atlas/) or a leftover path prefix.
        const text = fs.readFileSync(full, "utf8").replace(/github\.com\/petermodracee\/ca-sea-change-atlas/g, "");
        if (STALE_HOST_RE.test(text)) hits.push(full);
      }
    }
  };
  if (fs.existsSync(outputDir)) walk(outputDir);
  if (hits.length) {
    throw new Error(
      "Found a stale reference to the old GitHub Pages host or path prefix (petermodracee.github.io or /ca-sea-change-atlas/) in:\n" +
        hits.map((f) => "  " + f).join("\n") +
        "\nBuild every internal URL from `site.url`."
    );
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SUPPRESSIBLE_TOPICS = new Set(["total-economy", "marine-economy"]);

// Extra fields a section's `data` must carry for its callout, beyond what its kind requires.
const CALLOUT_FIELDS = {
  "flood/people-at-risk": ["landInsideSqMi", "landTotalSqMi"],
  "flood/natural-features": ["naturalSqMi", "floodplainSqMi"],
};

function validateSnapshot(snap, { schema, spine, file, fixture }) {
  const fail = (msg) => { throw new Error("county profile " + file + ": " + msg); };
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const isQty = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const isCount = (v) => Number.isInteger(v) && v >= 0;
  const isStr = (v) => typeof v === "string" && v.length > 0;
  const isSuppressed = (v) => isObj(v) && v.suppressed === true && Object.keys(v).length === 1;
  const isDate = (v) => ISO_DATE.test(v || "");

  const entry = spine.counties.find((c) => c.fips === snap.fips);
  if (!entry) fail("fips " + snap.fips + " is not in the county spine");
  for (const key of ["slug", "tier"]) if (snap[key] !== entry[key]) fail(key + " does not match the spine");
  if (snap.county !== entry.name) fail("county does not match the spine name");
  if (!schema.tiers[snap.tier]) fail("unknown tier " + snap.tier);
  if (file && file.replace(/\.json$/, "") !== snap.fips) fail("file name must be the fips");

  if (!isDate(snap.snapshot)) fail("snapshot must be YYYY-MM-DD");
  if (!Number.isInteger(snap.method) || snap.method < 1) fail("method must be a positive integer");
  if (!ISO_TIME.test(snap.generated || "")) fail("generated must be an ISO 8601 UTC timestamp");
  if (fixture) {
    if (snap.fixture !== true) fail("a fixture must carry \"fixture\": true");
  } else if (snap.fixture !== undefined) {
    fail("\"fixture\" must not appear on a real snapshot");
  }

  if (!("geometry" in snap)) fail("geometry key is required (null in Phase 1)");
  if (snap.geometry !== null) fail("geometry must be null until the inset map lands");

  if (entry.gauge === null) {
    if (snap.gauge !== null) fail("gauge must be null for a county with no reference gauge");
  } else {
    const g = snap.gauge;
    if (!isObj(g)) fail("gauge is required for this county");
    if (g.id !== entry.gauge) fail("gauge.id does not match the spine");
    if (g.name !== spine.gauges[entry.gauge].name) fail("gauge.name does not match the spine");
    if (entry.altGauge) {
      if (!isObj(g.altGauge) || g.altGauge.id !== entry.altGauge || g.altGauge.name !== spine.gauges[entry.altGauge].name) {
        fail("gauge.altGauge does not match the spine");
      }
    } else if (g.altGauge !== null) {
      fail("gauge.altGauge must be null when the spine has none");
    }
    for (const stale of ["straddles", "straddleNote"]) {
      if (stale in g) fail("gauge." + stale + " must not be stored; it is computed at build");
    }
  }

  if (!isObj(snap.sources) || !Object.keys(snap.sources).length) fail("sources must be a non-empty object");
  for (const [key, s] of Object.entries(snap.sources)) {
    const sw = "sources." + key;
    for (const f of ["label", "url"]) if (!isStr(s[f])) fail(sw + "." + f + " is required");
    for (const f of ["retrieved", "verified"]) if (!isDate(s[f])) fail(sw + "." + f + " must be YYYY-MM-DD (never null)");
    const v = s.vintage;
    if (v === null) continue;
    if (!isObj(v)) fail(sw + ".vintage must be an object or null");
    if (v.kind === "date") {
      if (!isDate(v.date)) fail(sw + ".vintage.date must be YYYY-MM-DD");
    } else if (v.kind === "period") {
      if (!isDate(v.start) || !isDate(v.end) || v.start > v.end) fail(sw + ".vintage needs start <= end, both YYYY-MM-DD");
    } else if (v.kind === "year") {
      if (!Number.isInteger(v.year) || v.year < 1900 || v.year > 2100) fail(sw + ".vintage.year must be a four-digit year");
    } else {
      fail(sw + ".vintage.kind must be one of date, period, year");
    }
  }

  const cited = new Set();
  const checkAvail = (node, where) => {
    if (!isObj(node) || typeof node.available !== "boolean") fail(where + ".available must be a boolean");
    if (node.available) {
      if (node.reason !== null) fail(where + ".reason must be null when available");
    } else if (!Object.prototype.hasOwnProperty.call(schema.reasons, node.reason)) {
      fail(where + ".reason must be one of " + Object.keys(schema.reasons).join(", ") + " when unavailable");
    }
  };

  const incs = schema.increments;
  const nondecreasing = (arr) => arr.every((v, i) => i === 0 || v >= arr[i - 1]);

  function validateData(def, data, topicId, where) {
    const suppressible = SUPPRESSIBLE_TOPICS.has(topicId);
    // A value that is a quantity, or {suppressed: true} where the topic allows it.
    const cell = (v, w) => {
      if (suppressible && isSuppressed(v)) return;
      if (!isQty(v)) fail(w + " must be a number >= 0" + (suppressible ? " or {\"suppressed\": true}" : "") + " (null is not zero; mark the section unavailable instead)");
    };
    const share = (o, w) => {
      if (!isObj(o) || !isQty(o.count) || !isQty(o.total) || o.total <= 0) fail(w + " needs count >= 0 and total > 0");
      if (o.count > o.total) fail(w + ".count exceeds total");
    };
    const items = (min) => {
      if (!Array.isArray(data.items) || data.items.length < min) fail(where + ".data.items must be an array of at least " + min);
      return data.items;
    };
    const perIncrement = (arr, w) => {
      if (!Array.isArray(arr) || arr.length !== incs.length || !arr.every(isQty)) fail(w + " must be " + incs.length + " numbers >= 0, one per increment");
      if (!nondecreasing(arr)) fail(w + " must not decrease as the increment rises");
    };
    const checkIncs = () => {
      if (JSON.stringify(data.increments) !== JSON.stringify(incs)) fail(where + ".data.increments must be " + JSON.stringify(incs));
    };

    switch (def.kind) {
      case "rings":
        items(1).forEach((it, i) => {
          const iw = where + ".data.items[" + i + "]";
          if (!isStr(it.label) || !isStr(it.unit)) fail(iw + " needs label and unit");
          share(it, iw);
        });
        break;
      case "inside-outside":
        items(1).forEach((it, i) => {
          const iw = where + ".data.items[" + i + "]";
          if (!isStr(it.label)) fail(iw + ".label is required");
          if (!isCount(it.inside) || !isCount(it.outside)) fail(iw + " needs inside and outside counts >= 0 (null is not zero)");
          if (it.inside + it.outside === 0) fail(iw + " has no facilities at all; a share of nothing is not shown");
        });
        break;
      case "payouts":
        items(1).forEach((it, i) => {
          if (!isStr(it.period) || !isQty(it.amount)) fail(where + ".data.items[" + i + "] needs period and amount >= 0");
        });
        if (!isCount(data.claims)) fail(where + ".data.claims must be an integer >= 0");
        break;
      case "single-share":
        share(data, where + ".data");
        break;
      case "increment-bars":
        checkIncs();
        if (!Array.isArray(data.measures) || !data.measures.length) fail(where + ".data.measures must be a non-empty array");
        data.measures.forEach((m, i) => {
          const mw = where + ".data.measures[" + i + "]";
          if (!isStr(m.label) || !isStr(m.unit)) fail(mw + " needs label and unit");
          if (!isQty(m.total) || m.total <= 0) fail(mw + ".total must be > 0");
          perIncrement(m.counts, mw + ".counts");
          if (m.counts[m.counts.length - 1] > m.total) fail(mw + ".counts exceed total");
        });
        break;
      case "increment-composition":
        checkIncs();
        if (!Array.isArray(data.classes) || !data.classes.length) fail(where + ".data.classes must be a non-empty array");
        data.classes.forEach((c, i) => {
          if (!isStr(c.label)) fail(where + ".data.classes[" + i + "].label is required");
          perIncrement(c.values, where + ".data.classes[" + i + "].values");
        });
        incs.forEach((_, k) => {
          if (data.classes.reduce((s, c) => s + c.values[k], 0) <= 0) fail(where + ".data.classes sum to nothing at increment " + incs[k]);
        });
        break;
      case "increment-single":
        checkIncs();
        if (!isQty(data.total) || data.total <= 0) fail(where + ".data.total must be > 0");
        perIncrement(data.counts, where + ".data.counts");
        if (data.counts[data.counts.length - 1] > data.total) fail(where + ".data.counts exceed total");
        break;
      case "stats":
        for (const k of ["establishments", "jobs", "wages", "gdp"]) cell(data[k], where + ".data." + k);
        if (!isCount(data.denominator) || data.denominator <= 0) fail(where + ".data.denominator must be an integer > 0");
        break;
      case "sector-measures":
        if (!Array.isArray(data.sectors) || !data.sectors.length) fail(where + ".data.sectors must be a non-empty array");
        data.sectors.forEach((s, i) => {
          const sw = where + ".data.sectors[" + i + "]";
          if (!isStr(s.label)) fail(sw + ".label is required");
          for (const k of ["establishments", "wages", "employment", "gdp"]) cell(s[k], sw + "." + k);
        });
        break;
      case "sector-wages":
        items(1).forEach((it, i) => {
          if (!isStr(it.label)) fail(where + ".data.items[" + i + "].label is required");
          for (const k of ["county", "coastalState", "coastalUS"]) cell(it[k], where + ".data.items[" + i + "]." + k);
        });
        break;
      case "jobs-equation": {
        cell(data.employed, where + ".data.employed");
        cell(data.selfEmployed, where + ".data.selfEmployed");
        const t = data.total;
        if (!isObj(t) || !isQty(t.value) || typeof t.partial !== "boolean") fail(where + ".data.total must be {value, partial}");
        const parts = [data.employed, data.selfEmployed];
        const anySuppressed = parts.some(isSuppressed);
        if (t.partial !== anySuppressed) fail(where + ".data.total.partial must be true if and only if a component is suppressed");
        const sum = parts.reduce((s, p) => s + (isSuppressed(p) ? 0 : p), 0);
        if (t.value !== sum) fail(where + ".data.total.value must equal the sum of the components that are present (" + sum + ")");
        if (!Array.isArray(data.sectors) || !data.sectors.length) fail(where + ".data.sectors must be a non-empty array");
        data.sectors.forEach((s, i) => {
          if (!isStr(s.label)) fail(where + ".data.sectors[" + i + "].label is required");
          cell(s.selfEmployed, where + ".data.sectors[" + i + "].selfEmployed");
        });
        break;
      }
      case "stat-pair":
        share(data.sfha, where + ".data.sfha");
        share(data.slr6, where + ".data.slr6");
        break;
      case "timing":
        if (!isObj(data) || Object.keys(data).length) fail(where + ".data must be {} (timing is computed at build)");
        break;
      default:
        fail(where + ": unknown section kind " + def.kind);
    }
    for (const field of CALLOUT_FIELDS[topicId + "/" + def.id] || []) {
      if (!isQty(data[field])) fail(where + ".data." + field + " must be a number >= 0");
    }
  }

  if (!isObj(snap.topics)) fail("topics is required");
  const topicIds = schema.topics.map((t) => t.id);
  if (JSON.stringify(Object.keys(snap.topics)) !== JSON.stringify(topicIds)) {
    fail("topics must be exactly, in order: " + topicIds.join(", "));
  }

  for (const topicDef of schema.topics) {
    const where = "topics." + topicDef.id;
    const topic = snap.topics[topicDef.id];
    checkAvail(topic, where);
    const expected = schema.tiers[snap.tier].topics[topicDef.id];
    if (topic.available !== expected.available || topic.reason !== expected.reason) {
      fail(where + " disagrees with the " + snap.tier + " tier rule in the schema");
    }
    if (!isObj(topic.sections)) fail(where + ".sections must be an object");
    if (!topic.available) {
      if (Object.keys(topic.sections).length) fail(where + " is unavailable, so sections must be {}");
      continue;
    }
    const sectionIds = topicDef.sections.map((s) => s.id);
    if (JSON.stringify(Object.keys(topic.sections)) !== JSON.stringify(sectionIds)) {
      fail(where + ".sections must be exactly, in order: " + sectionIds.join(", "));
    }
    for (const def of topicDef.sections) {
      const sw = where + ".sections." + def.id;
      const sec = topic.sections[def.id];
      checkAvail(sec, sw);
      if (!isObj(sec.use) || ["ui", "pdf", "present"].some((k) => typeof sec.use[k] !== "boolean")) {
        fail(sw + ".use must be {ui, pdf, present} booleans");
      }
      if (!Array.isArray(sec.sources)) fail(sw + ".sources must be an array");
      if ((sec.available || fixture) && !sec.sources.length) fail(sw + ".sources must be a non-empty array");
      if (!sec.available && !fixture && sec.sources.length) fail(sw + " is unavailable, so it cites no sources (an unused source would need a retrieval stamp it never earned)");
      for (const key of sec.sources) {
        if (!snap.sources[key]) fail(sw + ".sources cites " + key + ", which is not in sources");
        cited.add(key);
      }
      if (def.kind === "timing" && !snap.gauge) fail(sw + ": the timing table needs a reference gauge");
      if (!sec.available) {
        if (sec.data !== null) fail(sw + " is unavailable, so data must be null");
        continue;
      }
      if (!isObj(sec.data)) fail(sw + ".data must be an object");
      validateData(def, sec.data, topicDef.id, sw);
    }
  }

  for (const key of Object.keys(snap.sources)) {
    if (!cited.has(key)) fail("sources." + key + " is not cited by any section");
  }
}

module.exports = { validateSnapshot, checkNoStaleHost };
