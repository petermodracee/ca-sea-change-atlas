#!/usr/bin/env node
// Counts the words in each slide's notes (footnotes, key line, the second prose paragraph some slides carried) and
// in its Sources row, summed per topic, over the built pages of the given counties. Run on two builds to compare:
//   SITE_DIR=<built site dir> node scripts/county-profiles/analysis/footnote-words.js [county ...]
// The About slide and the print block are left out; only what a slide shows on screen is counted.
const fs = require("fs");
const path = require("path");
const root = path.resolve(process.env.SITE_DIR || path.join(__dirname, "../../../_site"));
const counties = process.argv.slice(2).length ? process.argv.slice(2) : ["santa-barbara", "san-francisco", "humboldt"];
const topics = ["flood-hazard", "sea-level-rise", "total-economy", "marine-economy"];
const words = (html) => html.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
const tot = { notes: 0, sources: 0 };
const rows = [];
for (const c of counties) for (const t of topics) {
  const h = fs.readFileSync(path.join(root, "county-profiles/county", c, t, "index.html"), "utf8").split(/<div class="cpp print-only/)[0];
  let notes = 0, sources = 0;
  h.split(/<section class="cpd-slide"/).slice(1).forEach((s) => {
    if (/^[^>]*id="s-(title|about)"/.test(s)) return;
    (s.match(/<p class="cpd-(footnote|note)[^"]*"[^>]*>[\s\S]*?<\/p>/g) || []).forEach((p) => { notes += words(p); });
    (s.match(/<div class="cpd-sources">[\s\S]*?<\/div>/g) || []).forEach((p) => { sources += words(p); });
  });
  rows.push([c + "/" + t, notes, sources]);
  tot.notes += notes; tot.sources += sources;
}
console.log("county/topic | note words | sources-row words");
rows.forEach((r) => console.log(r.join(" | ")));
console.log("TOTAL | " + tot.notes + " | " + tot.sources);
