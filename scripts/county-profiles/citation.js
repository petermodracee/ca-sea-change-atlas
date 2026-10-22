// The one recommended citation for a County Profile, in APA 7. Every citation on the site goes through
// citationParts(): the `citation` macro in site/_includes/county-profiles/citation.njk renders its parts as
// HTML, and the pipeline writes citationText() for the county page into each snapshot's `attribution`
// (scripts/county-profiles/pipeline/archive.js), so the file and the page cite the same way.
//
// `county` needs {name, slug} (a snapshot's own {county, slug} also works); `topic` is a topic definition
// ({label, slug}) or null for the county's page; `doi` is the snapshot date's DOI or null.

const site = require("../../site/_data/site.js");
const { apaDate } = require("./format.js");

const AUTHOR = "California Sea Change Atlas";

function citationUrl(county, topic, snapshot) {
  return site.url + "/county-profiles/county/" + county.slug + "/" + snapshot + "/" + (topic ? topic.slug + "/" : "");
}

function citationParts(county, topic, snapshot, doi) {
  const name = county.name || county.county;
  return {
    author: AUTHOR,
    date: apaDate(snapshot),
    title: name + " County coastal county profile" + (topic ? ": " + topic.label : ""),
    doiUrl: doi ? "https://doi.org/" + doi : null,
    url: citationUrl(county, topic, snapshot),
  };
}

// The citation as plain text: what the snapshot's `attribution` holds (no DOI: one is minted after the file).
function citationText(county, topic, snapshot, doi) {
  const c = citationParts(county, topic, snapshot, doi);
  return c.author + ". (" + c.date + "). " + c.title + ". " + (c.doiUrl ? c.doiUrl + " " : "") + c.url;
}

// The snapshot's `attribution`: the county page's citation for the snapshot's own date.
const attributionFor = (snap) => citationText({ name: snap.county, slug: snap.slug }, null, snap.snapshot, null);

module.exports = { citationUrl, citationParts, citationText, attributionFor };
