// The headline a County Profiles page leads its link description with (`description`, and so og:description).
// Built from the section models (section-models.js) the slides draw, so a description and a slide cannot
// disagree: the figure is a callout's own `figure`, or a value its callout or chart prints (`vars`). The
// sentences are in site/_data/countyProfileSeo.json (`headlines`, `noFigure`, `descriptionTail`).
//
//   topicHeadline(county, topicId)  the first section of the topic, in its own order, that has a sentence and a
//                                   plain figure; null when none has (the figure is withheld, partial, a floor
//                                   or marked estimated in every one)
//   countyHeadline(county)          the first available topic's headline (a flood-only county: its flood figure)
//   chooserDescription(county), topicDescription(county, topic)
//                                   headline, then the tail with the snapshot date, at most `descriptionMax`
//                                   characters; a page with no usable figure gets the no-figure sentence

const seo = require("../../site/_data/countyProfileSeo.json");
const { longDate } = require("./format.js");

const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
const unfilled = (text) => /\{\w+\}/.test(text);

// A callout figure the description may state: present, and not withheld, partial, a floor or estimated.
const plain = (model) => Boolean(model && model.callout && model.callout.figure && model.callout.vars
  && !model.callout.est && !model.callout.floor && !model.callout.partial && !model.callout.vars.est);

function topicHeadline(county, topicId) {
  const sentences = seo.headlines[topicId] || {};
  for (const s of (county.topicSections && county.topicSections[topicId]) || []) {
    const template = sentences[s.def.id];
    if (!template || !s.sec.available || !plain(s.model)) continue;
    const text = fill(template, { ...s.model.callout.vars, county: county.name });
    if (!unfilled(text)) return text;
  }
  return null;
}

function countyHeadline(county) {
  const first = county.coverage.find((t) => t.hasPage);
  return first ? topicHeadline(county, first.id) : null;
}

// Cut at a word boundary to at most `max` characters, never inside a number or an open parenthesis.
function cut(text, max) {
  if (text.length <= max) return text;
  const words = text.split(" ");
  while (words.length > 1) {
    words.pop();
    const head = words.join(" ");
    const last = words[words.length - 1];
    const open = (head.match(/\(/g) || []).length > (head.match(/\)/g) || []).length;
    if (head.length + 1 <= max && !open && !/\d[,.]?$/.test(last)) return head.replace(/[,;:]$/, "") + "…";
  }
  return text.slice(0, max);
}

// Headline first, then the tail; if both do not fit, the tail goes and the headline is cut.
function compose(headline, snapshot) {
  const max = seo.descriptionMax;
  const tail = fill(seo.descriptionTail, { date: longDate(snapshot) });
  const full = headline + " " + tail;
  return full.length <= max ? full : cut(headline, max);
}

function chooserDescription(county) {
  const h = countyHeadline(county);
  if (h) return compose(h, county.profile.snapshot);
  const topics = county.coverage.filter((t) => t.hasPage).map((t) => t.label.toLowerCase());
  return compose(fill(seo.noFigure.chooser, { county: county.name, topics: topics.join(", ") }), county.profile.snapshot);
}

function topicDescription(county, topic) {
  const h = topicHeadline(county, topic.id);
  return compose(h || fill(seo.noFigure.topic, { county: county.name, topic: topic.label }), county.profile.snapshot);
}

module.exports = { topicHeadline, countyHeadline, chooserDescription, topicDescription };
