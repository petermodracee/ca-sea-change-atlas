#!/usr/bin/env node
// Lists every em dash (U+2014) in the visible text, <title> and aria/title attributes of the built County Profiles
// pages, grouped by the text around it, with how many pages carry it. The sr-only chart tables and descriptions
// count (they are read aloud). Run after a build:
//   SITE_DIR=<built site dir> node scripts/county-profiles/analysis/emdash-scan.js
const fs = require("fs");
const path = require("path");
const root = path.resolve(process.env.SITE_DIR || path.join(__dirname, "../../../_site"));
const files = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === "index.html") files.push(p); }); })(path.join(root, "county-profiles"));
const seen = new Map();
files.forEach((f) => {
  const h = fs.readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const texts = [h.replace(/<[^>]+>/g, " ")];
  (h.match(/(?:aria-label|title|alt|data-tip)="[^"]*"/g) || []).forEach((a) => texts.push(a));
  texts.forEach((t) => { const re = /.{0,40}—.{0,40}/g; let m; while ((m = re.exec(t))) { const k = m[0].replace(/\s+/g, " ").replace(/[\d,.]+/g, "#"); seen.set(k, (seen.get(k) || 0) + 1); } });
});
console.log(files.length + " pages scanned; " + seen.size + " distinct em-dash contexts");
[...seen.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(n + "x  " + k));
