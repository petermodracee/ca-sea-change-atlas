// Links from County Profiles into the atlas's other tools, built in one place so a county can be passed
// later without touching a template.

/**
 * The comparison tool. A per-county filter comes with the comparison redesign; until then `countyFips` is
 * accepted and ignored, and every county gets the general page.
 * @returns {{href: string}} `href` is a site-relative path to pass through the `url` filter.
 */
function compareLink(countyFips) { // eslint-disable-line no-unused-vars
  return { href: "/compare/" };
}

module.exports = { compareLink };
