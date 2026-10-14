#!/usr/bin/env node
// Internal link check for a built site.
//
//   SITE_DIR=_site node scripts/check-links.js      (npm run check:links; SITE_DIR defaults to _site)
//
// Fails when an internal href or src points at a file that was not built, or carries a #fragment
// that the target page has no element with that id (or <a name>) for. Covers every .html page in the
// directory. External URLs are ignored (mailto:, tel:, javascript:, data: and anything on another
// host), except that an absolute URL on the site's own host (site/_data/site.js url) is checked as
// the internal link it is: the print pages write their links that way.
//
// Links built by script at run time (the deck's dot nav, the county switcher) are not in the built
// HTML and are not checked here.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_DIR = path.resolve(process.env.SITE_DIR || path.join(ROOT, "_site"));
const OWN_HOST = require(path.join(ROOT, "site/_data/site.js")).url.replace(/\/$/, "");

if (!fs.existsSync(SITE_DIR)) { console.error("check-links: " + SITE_DIR + " does not exist; run the build first"); process.exit(2); }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// The page's markup without inline script and style bodies, so text inside them is never read as a link.
const stripInline = (html) => html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, "<script></script>").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = stripInline(fs.readFileSync(file, "utf8"));
    const ids = new Set();
    for (const m of html.matchAll(/<[a-z][^>]*?\sid=("([^"]*)"|'([^']*)')/gi)) ids.add(decode(m[2] ?? m[3]));
    for (const m of html.matchAll(/<a\b[^>]*?\sname=("([^"]*)"|'([^']*)')/gi)) ids.add(decode(m[2] ?? m[3]));
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

// The built file a URL path resolves to, the way GitHub Pages serves it, or null.
function resolveFile(urlPath) {
  const p = path.join(SITE_DIR, ...urlPath.split("/").filter(Boolean));
  if (!p.startsWith(SITE_DIR)) return null;
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  if (fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "index.html"))) return path.join(p, "index.html");
  return null;
}

const problems = [];
let checked = 0;
const pages = walk(SITE_DIR);
for (const file of pages) {
  const rel = "/" + path.relative(SITE_DIR, file).split(path.sep).join("/");
  const pageUrl = rel.replace(/index\.html$/, "");
  const html = stripInline(fs.readFileSync(file, "utf8"));
  const seen = new Set();
  for (const m of html.matchAll(/<[a-z][^>]*?\s(?:href|src)=(?:"([^"]*)"|'([^']*)')/gi)) {
    let raw = decode((m[1] ?? m[2]).trim());
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    if (raw.startsWith(OWN_HOST + "/") || raw === OWN_HOST) raw = raw.slice(OWN_HOST.length) || "/";
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue; // external or non-navigational
    const hash = raw.indexOf("#");
    const fragment = hash === -1 ? "" : raw.slice(hash + 1);
    let target = (hash === -1 ? raw : raw.slice(0, hash)).split("?")[0];
    if (!target && !fragment) continue; // "#" or "?x" alone
    checked++;
    let targetFile;
    if (!target) targetFile = file; // a fragment on this page
    else {
      const urlPath = target.startsWith("/") ? target : new URL(target, "http://x" + pageUrl).pathname;
      targetFile = resolveFile(decodeURIComponent(urlPath));
      if (!targetFile) { problems.push(rel + ": " + raw + " (no such file)"); continue; }
    }
    if (fragment && targetFile.endsWith(".html") && !idsOf(targetFile).has(decodeURIComponent(fragment))) {
      problems.push(rel + ": " + raw + " (" + (targetFile === file ? "this page" : "/" + path.relative(SITE_DIR, targetFile).split(path.sep).join("/")) + " has no #" + fragment + ")");
    }
  }
}

console.log("check-links: " + pages.length + " pages, " + checked + " internal links checked");
if (problems.length) {
  console.error(problems.length + " broken link" + (problems.length === 1 ? "" : "s") + ":\n" + problems.join("\n"));
  process.exit(1);
}
console.log("check-links ok");
