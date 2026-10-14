// "View on map" links: the one source of truth for which County Profiles section opens which map layers.
// Every href on the site is generated from MAP_LINKS here; nothing else spells out a map control id.
// The ids and values are the map's linkable controls (docs/MAP.md, "Linkable control ids"), and
// checkMapLinks() fails the build if the built site names one the map no longer has.

const COUNTY_TOGGLE = "id:countyToggle";
const COUNTY_SELECT = "id:countySelect";
const SLIDER = "id:noaaSlrSlider";
const SLR_TOGGLE = "id:noaaSlrToggle";
const FEMA_TOGGLE = "id:femaToggle";
const FACILITIES = "id:geoFacilities";
const PEOPLE = "id:geoPeopleSelect";
const LAND = "id:geoLandSelect";

// Slider index = feet x 2 (docs/MAP.md). The static href uses the slide's default increment.
const DEFAULT_FT = 2;
const sliderIndex = (ft) => ft * 2;

// topic id -> section id -> recipe.
//   on:     layer checkboxes (the county-lines checkbox is always added)
//   v:      value controls as [key, value] (the county select is always added)
//   slr:    true if the NOAA slider is set from the increment (the key `v` omits it; it is added here)
//   follows: the slide has an increment picker, so the browser rewrites the slider value as it moves
//   opens:  plain words for the accessible name and the About page
//   publishers: who publishes the layers, for the About page
// Sections not listed get no link: flood Homes at Risk (no NFIP layer on the map), SLR timing, and both economy topics.
const MAP_LINKS = {
  flood: {
    "people-at-risk": { on: [FEMA_TOGGLE], v: [[PEOPLE, "geoPopDensity"]], opens: "flood zones and population density", publishers: "FEMA (flood zones, effective NFHL); NOAA Office for Coastal Management (flood zones, overview copy); EPA (population density); U.S. Census Bureau (county boundaries)" },
    "jobs-at-risk": { on: [FEMA_TOGGLE], v: [[PEOPLE, "geoJobsDensity"]], opens: "flood zones and jobs density", publishers: "FEMA and NOAA (flood zones); EPA (jobs density); U.S. Census Bureau (county boundaries)" },
    "critical-facilities": { on: [FEMA_TOGGLE, FACILITIES], v: [], opens: "flood zones and critical facilities", publishers: "FEMA and NOAA (flood zones); USGS (critical facilities); U.S. Census Bureau (county boundaries)" },
    "natural-features": { on: [FEMA_TOGGLE], v: [[LAND, "geoDevChange"]], opens: "flood zones and land converted to development", publishers: "FEMA and NOAA (flood zones); NOAA C-CAP (land converted to development); U.S. Census Bureau (county boundaries)" },
  },
  slr: {
    "people-at-risk": { on: [SLR_TOGGLE], slr: true, follows: true, v: [[PEOPLE, "geoPopDensity"]], opens: "the sea level rise layer and population density", publishers: "NOAA Office for Coastal Management (sea level rise); EPA (population density); U.S. Census Bureau (county boundaries)" },
    "critical-facilities": { on: [SLR_TOGGLE, FACILITIES], slr: true, follows: true, v: [], opens: "the sea level rise layer and critical facilities", publishers: "NOAA (sea level rise); USGS (critical facilities); U.S. Census Bureau (county boundaries)" },
    "jobs-at-risk": { on: [SLR_TOGGLE], slr: true, v: [[PEOPLE, "geoJobsDensity"]], opens: "the sea level rise layer and jobs density", publishers: "NOAA (sea level rise); EPA (jobs density); U.S. Census Bureau (county boundaries)" },
    "natural-landscapes": { on: [SLR_TOGGLE], slr: true, v: [[LAND, "geoNatural"]], opens: "the sea level rise layer and natural areas", publishers: "NOAA (sea level rise); NOAA C-CAP (wetlands, natural areas and open space); U.S. Census Bureau (county boundaries)" },
  },
};

/**
 * The link for one section of one county, or null if the section has none.
 * @returns {{href: string, follows: boolean, opens: string, fips: string, hash: string}|null} `href` is a site-relative
 *   path ("/map/#...") to pass through the `url` filter.
 */
function mapLink(topicId, sectionId, fips, ft = DEFAULT_FT) {
  const r = MAP_LINKS[topicId] && MAP_LINKS[topicId][sectionId];
  if (!r) return null;
  const on = [...r.on, COUNTY_TOGGLE];
  const v = [...(r.slr ? [[SLIDER, String(sliderIndex(ft))]] : []), ...r.v, [COUNTY_SELECT, fips]];
  const hash = `on=${on.join(",")}&v=${v.map(([k, val]) => `${k}~${val}`).join("|")}`;
  return { href: `/map/#${hash}`, hash, follows: Boolean(r.follows), opens: r.opens, publishers: r.publishers, fips };
}

/**
 * The link for a whole topic: the county highlighted and, for Flood hazard and Sea level rise, the topic's layers
 * switched on (the layer toggles the topic's section links use, taken from its People at Risk recipe, at the default
 * increment; no value controls). The economy topics have no layers, so they get the county highlight only. The Digging
 * Deeper slide uses this.
 * @returns {{href: string, hash: string, fips: string, layers: boolean}} `href` is a site-relative path ("/map/#...").
 */
function topicMapLink(topicId, fips, ft = DEFAULT_FT) {
  const r = MAP_LINKS[topicId] && MAP_LINKS[topicId]["people-at-risk"];
  const on = [...(r ? r.on : []), COUNTY_TOGGLE];
  const v = [...(r && r.slr ? [[SLIDER, String(sliderIndex(ft))]] : []), [COUNTY_SELECT, fips]];
  const hash = `on=${on.join(",")}&v=${v.map(([k, val]) => `${k}~${val}`).join("|")}`;
  return { href: `/map/#${hash}`, hash, fips, layers: Boolean(r) };
}

// ---- the build check ---------------------------------------------------------------------------------------

/** Parses the map page's static controls: checkbox ids, and for value controls their options or range. */
function parseMapControls(source) {
  const checkboxes = new Set();
  const selects = new Map(); // id -> Set(option values)
  const ranges = new Map(); // id -> {min, max, step}
  const attr = (tag, name) => { const m = tag.match(new RegExp("\\b" + name + '="([^"]*)"')); return m ? m[1] : null; };
  for (const m of source.matchAll(/<input\b[^>]*>/g)) {
    const id = attr(m[0], "id");
    if (!id) continue;
    const type = attr(m[0], "type");
    if (type === "checkbox") checkboxes.add(id);
    else if (type === "range") ranges.set(id, { min: Number(attr(m[0], "min")), max: Number(attr(m[0], "max")), step: Number(attr(m[0], "step") || 1) });
  }
  for (const m of source.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const id = attr("<select " + m[1] + ">", "id");
    if (id) selects.set(id, new Set([...m[2].matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map((o) => o[1])));
  }
  return { checkboxes, selects, ranges };
}

/** Problems with one hash (`on=...&v=...`), as strings. */
function hashProblems(hash, controls, valueControlIds) {
  const problems = [];
  const params = new URLSearchParams(hash);
  for (const key of (params.get("on") || "").split(",").filter(Boolean)) {
    const id = key.startsWith("id:") ? key.slice(3) : null;
    if (!id || !controls.checkboxes.has(id)) problems.push(`on=${key}: no such checkbox in site/map/index.njk`);
  }
  // The picker rewrites the slider in the browser, so every increment must be a legal slider value, not just the default.
  const pairs = (params.get("v") || "").split("|").filter(Boolean);
  if (pairs.some((p) => p.startsWith(SLIDER + "~"))) for (const ft of [2, 4, 6, 8, 10]) pairs.push(`${SLIDER}~${sliderIndex(ft)}`);
  for (const pair of pairs) {
    const [key, value] = pair.split("~");
    const id = key.startsWith("id:") ? key.slice(3) : null;
    if (!id || !valueControlIds.includes(id)) { problems.push(`v=${key}: not in VALUE_CONTROL_IDS (site/js/map/permalink.js), so the map ignores it`); continue; }
    if (controls.selects.has(id)) { if (!controls.selects.get(id).has(value)) problems.push(`v=${key}~${value}: not an option of #${id}`); }
    else if (controls.ranges.has(id)) {
      const { min, max, step } = controls.ranges.get(id);
      const n = Number(value);
      if (!Number.isInteger(n) || n < min || n > max || (n - min) % step !== 0) problems.push(`v=${key}~${value}: outside #${id} (${min} to ${max}, step ${step})`);
    } else problems.push(`v=${key}: no such select or range in site/map/index.njk`);
  }
  return problems;
}

/** Every `/map/#...` href in the built County Profiles pages (`results` is Eleventy's list of written pages). */
function collectBuiltHashes(results) {
  const found = [];
  for (const r of results) {
    if (!/county-profiles/.test(r.outputPath || "") || typeof r.content !== "string") continue;
    for (const x of r.content.matchAll(/href="\/map\/#([^"]*)"/g)) found.push({ file: r.outputPath, hash: x[1].replace(/&amp;/g, "&") });
  }
  return found;
}

/**
 * Fails (throws) if any generated link names a control, option or slider value the map does not have, if a value
 * control is not in VALUE_CONTROL_IDS, or if the spine and the map's county select differ in either direction.
 * @param {{results: object[], mapSource: string, valueControlIds: string[], spineFips: string[], expectLinks?: boolean}} o
 */
function checkMapLinks({ results, mapSource, valueControlIds, spineFips, expectLinks = true }) {
  const controls = parseMapControls(mapSource);
  const problems = [];
  const county = controls.selects.get("countySelect") || new Set();
  const options = [...county].filter(Boolean);
  for (const f of spineFips) if (!county.has(f)) problems.push(`County Profiles county ${f} is not an option of #countySelect`);
  for (const f of options) if (!spineFips.includes(f)) problems.push(`#countySelect option ${f} is not a County Profiles county`);
  const built = collectBuiltHashes(results);
  if (expectLinks && !built.length) problems.push("no map links were found in the built County Profiles pages");
  for (const { file, hash } of built) for (const p of hashProblems(hash, controls, valueControlIds)) problems.push(`${file}: ${p}`);
  if (problems.length) throw new Error("County Profiles map links:\n  " + [...new Set(problems)].slice(0, 40).join("\n  "));
  return { links: built.length };
}

module.exports = { MAP_LINKS, DEFAULT_FT, mapLink, topicMapLink, checkMapLinks, parseMapControls, hashProblems };
