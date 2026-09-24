// A small monochrome icon per economic sector, drawn inside a Diverse Economies bar segment wide
// enough to hold one (stacked100Bars() in template-helpers.mjs, assigned below in
// sectorIconFor()). Pulled at build time from @material-symbols/svg-400 (Apache-2.0, Google) —
// see docs/LICENSING.md and site/_data/credits.json — never hand-drawn. The outlined variant is
// used for every sector; the headline sector (the one named in the big number) switches to the
// same glyph's filled variant (Material Symbols' FILL axis toggled on, `<icon>-fill.svg`), so it
// reads as "on" without a different icon shape.
//
// No glyph in the set is a literal fit for "oil/mining" or a two-word sector like "education and
// health" — see docs/DECISIONS.md for the picks and the reasoning ("landscape" for natural
// resources and mining, "school" for education and health, "oil_barrel" for offshore mineral
// resources — the closest literal match available).
const fs = require("node:fs");
const path = require("node:path");

const ICON_DIR = path.join(__dirname, "..", "..", "node_modules", "@material-symbols", "svg-400", "outlined");

// Sector label -> Material Symbols icon name.
const SECTOR_ICON_NAMES = {
  "Construction": "construction",
  "Financial activities": "account_balance",
  "Education and health services": "school",
  "Information": "cell_tower",
  "Leisure and hospitality": "beach_access",
  "Manufacturing": "factory",
  "Natural resources and mining": "landscape",
  "Other services": "handyman",
  "Professional and business services": "work",
  "Public administration": "gavel",
  "Trade, transportation, and utilities": "local_shipping",

  "Living resources": "set_meal",
  "Marine construction": "construction",
  "Marine transportation": "directions_boat",
  "Offshore mineral resources": "oil_barrel",
  "Ship and boat building": "anchor",
  "Tourism and recreation": "beach_access",
};

// file contents, keyed by "<icon>" or "<icon>-fill" -> {viewBox, inner}
const cache = new Map();

function loadIcon(fileBase) {
  if (cache.has(fileBase)) return cache.get(fileBase);
  const raw = fs.readFileSync(path.join(ICON_DIR, fileBase + ".svg"), "utf8");
  const viewBox = raw.match(/viewBox="([^"]+)"/)[1];
  const inner = raw.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const parsed = { viewBox, inner };
  cache.set(fileBase, parsed);
  return parsed;
}

// {viewBox, inner, outlineInner, fillInner} for a sector, or null if it has no icon (shouldn't
// happen for the 17 sectors the schema defines, but a chart caller should treat "no icon" as
// "identify this segment via the tooltip only" rather than throw).
function sectorIconFor(label) {
  const name = SECTOR_ICON_NAMES[label];
  if (!name) return null;
  const outline = loadIcon(name);
  const fill = loadIcon(name + "-fill");
  return { viewBox: outline.viewBox, outlineInner: outline.inner, fillInner: fill.inner };
}

module.exports = { sectorIconFor, SECTOR_ICON_NAMES };
