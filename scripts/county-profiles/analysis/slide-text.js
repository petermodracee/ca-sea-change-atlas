#!/usr/bin/env node
// Prints each slide's visible text (chart accessibility tables and descriptions left out) for one built topic page,
// for reading the wording of every slide in one go. Run after `npm run build`:
//   node scripts/county-profiles/analysis/slide-text.js <county-slug> <topic-slug> [maxChars]
const fs = require("fs");
const path = require("path");
const [county, topic, max] = process.argv.slice(2);
const h = fs.readFileSync(path.join(process.env.SITE_DIR || path.join(__dirname, "../../../_site"), "county-profiles/county", county, topic, "index.html"), "utf8");
h.split(/<section class="cpd-slide"/).slice(1).forEach((s) => {
  const id = (s.match(/id="([^"]+)"/) || [])[1];
  if (id === "s-title") return;
  let body = s.replace(/^[^>]*>/, "").split(/<div class="cpp print-only/)[0];
  body = body.replace(/<table class="sr-only[\s\S]*?<\/table>/g, "").replace(/<h4 class="sr-only">[\s\S]*?<\/h4>/g, "").replace(/<desc[\s\S]*?<\/desc>/g, "").replace(/<title[\s\S]*?<\/title>/g, "").replace(/<span class="sr-only">([\s\S]*?)<\/span>/g, "[sr:$1]");
  console.log("--", id);
  console.log(body.replace(/<\/(p|li|div|text|dt|dd|figcaption|span)>/g, "$&|").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\|\s*/g, " | ").slice(0, Number(max) || 1400));
});
