// The "Report a problem with these figures" link: a new-issue URL for the data-problem issue form
// (.github/ISSUE_TEMPLATE/data-problem.yml) with its fields pre-filled from the page. The parameter names
// are the form's field ids. Built here once; templates call the `reportUrl` filter and never spell the URL out.
// The repository URL comes from site/_data/site.js.

const site = require("../../site/_data/site.js");

/**
 * @param {{county: string, topic?: string, snapshot: string, method: number|string, page: string}} o
 *   `county` is the plain name ("Contra Costa"); `topic` is the topic label exactly as the form's dropdown
 *   spells it, and is left out on the county page; `page` is the absolute URL of the page the reader is on.
 */
function reportUrl({ county, topic, snapshot, method, page }) {
  const title = "Data problem: " + county + " County" + (topic ? ", " + topic : "") + ", snapshot " + snapshot;
  const params = [["template", "data-problem.yml"], ["title", title], ["county", county]];
  if (topic) params.push(["topic", topic]);
  params.push(["snapshot", snapshot], ["methodology", String(method)], ["page", page]);
  return site.repo + "/issues/new?" + params.map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
}

module.exports = { reportUrl };
