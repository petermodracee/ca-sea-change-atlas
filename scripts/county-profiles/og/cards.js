#!/usr/bin/env node
// County Profiles preview cards (og:image): 1200 by 630 PNGs drawn at build time with Satori (layout to SVG)
// and @resvg/resvg-js (SVG to PNG), no headless browser. Run from .eleventy.js after every build, and on its own:
//   SITE_DIR=<dir> node scripts/county-profiles/og/cards.js           draw the cards into <dir>/img/og/ and check
//   SITE_DIR=<dir> node scripts/county-profiles/og/cards.js --check   check only
//   node scripts/county-profiles/og/cards.js --measure                 list the cards whose text comes nearest the safe area
//
// One card per county chooser (<slug>.png), one per topic deck (<slug>-<topic slug>.png) and one generic card
// (county-profiles.png) for the index, About and print pages. A card names the county and the topic and carries
// no figures and no date, so it never goes stale and a dated page shares its current page's card. The words are
// in site/_data/countyProfileSeo.json (`card`); the layout is cardTree() below. Change CARD_VERSION with the
// layout: a card is redrawn only when the hash of its inputs (its text, the fonts and CARD_VERSION) changes, and
// otherwise copied from the cache in scripts/county-profiles/.cache/og/ (gitignored). Every drawn card is first
// drawn bare and measured: its text must stay inside the centred square crop and above the logo row, and the line
// under the title steps down a size until it does (the build fails if even the smallest overflows).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const site = require("../../../site/_data/site.js");
const seo = require("../../../site/_data/countyProfileSeo.json").card;

const CARD_VERSION = 2;
const WIDTH = 1200, HEIGHT = 630;
const SAFE = 560; // text column width: inside a centred 630 by 630 square crop, with margins
// Where the text's ink may fall: inside the centred square crop (x 285 to 915) with a 15 px margin, and above the
// logo row (which starts at y 530). The tool line steps down through LINE_SIZES until the card's text fits.
const SAFE_BOX = { left: (WIDTH - HEIGHT) / 2 + 15, right: (WIDTH + HEIGHT) / 2 - 15, bottom: 510 };
const LINE_SIZES = [25, 22, 20];
const MAX_BYTES = 1024 * 1024;
const OG_DIR = "img/og";
const GENERIC = "county-profiles";
const CACHE = path.join(__dirname, "..", ".cache", "og");
const FONT_DIR = path.join(__dirname, "fonts");
const FONTS = [
  { name: "Spectral", file: "Spectral-SemiBold.ttf", weight: 600 },
  { name: "IBM Plex Sans", file: "IBMPlexSans-Regular.ttf", weight: 400 },
  { name: "IBM Plex Sans", file: "IBMPlexSans-SemiBold.ttf", weight: 600 },
];
// The deck's dark theme (site/css/style.css): background, cream text, teal accent.
const C = { bg: "#0F1D26", bg2: "#1B3A4B", cream: "#EDE7D6", soft: "#A9BAC1", teal: "#6FD3BE" };

const cardPath = (slug, topicSlug) => "/" + OG_DIR + "/" + (slug ? slug + (topicSlug ? "-" + topicSlug : "") : GENERIC) + ".png";

// The line under the title, by card type (`card.lines`): a topic's own, the chooser's (the flood-only one for a
// county with no sea level rise topic) or the generic card's.
function lineFor(type) {
  const line = seo.lines[type];
  if (typeof line !== "string" || !line) throw new Error("countyProfileSeo.json: card.lines has no line for " + type);
  return line;
}

// Every card the site uses: {file, title, topic, line}. `countyProfiles` is site/_data/countyProfiles.js.
function cardList(countyProfiles) {
  const cards = [{ file: cardPath(null), title: seo.genericTitle, topic: null, line: lineFor("generic") }];
  for (const c of countyProfiles.counties) {
    if (!c.profile) continue;
    const pages = c.coverage.filter((x) => x.hasPage);
    const hasSlr = pages.some((t) => t.id === "slr");
    cards.push({ file: cardPath(c.slug), title: c.name + " County", topic: null, line: lineFor(hasSlr ? "chooser" : "chooserFloodOnly") });
    for (const t of pages) cards.push({ file: cardPath(c.slug, t.slug), title: c.name + " County", topic: t.label, line: lineFor(t.id) });
  }
  return cards;
}

const el = (type, style, children) => ({ type, props: { style: { display: "flex", ...style }, children } });
const dataUri = (svg) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
// The hero's contour lines, across the full width (decoration only, no text).
const CONTOURS = dataUri('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
  + [470, 500, 530, 560, 590].map((y, i) => '<path d="M0 ' + y + " Q 150 " + (y - 40) + " 300 " + y + " T 600 " + y + " T 900 " + y + " T 1200 " + y + '" stroke="#F3EFE0" stroke-opacity="' + (0.16 - i * 0.02) + '" stroke-width="2" fill="none"/>').join("")
  + "</svg>");

function cardTree({ title, topic, line }, logo, { lineSize = LINE_SIZES[0], bare = false } = {}) {
  const nameSize = title.length > 20 ? 58 : title.length > 14 ? 66 : 76;
  // `bare` draws the text alone on a transparent ground, for measuring where the ink falls (safeAreaProblems).
  return el("div", { width: WIDTH, height: HEIGHT, display: "flex", position: "relative", fontFamily: "IBM Plex Sans", ...(bare ? {} : { backgroundColor: C.bg, backgroundImage: "linear-gradient(180deg, " + C.bg + " 0%, " + C.bg2 + " 100%)" }) }, [
    ...(bare ? [] : [
      { type: "img", props: { src: CONTOURS, width: WIDTH, height: HEIGHT, style: { position: "absolute", left: 0, top: 0 } } },
      el("div", { position: "absolute", left: 0, top: 0, width: WIDTH, height: 8, backgroundColor: C.teal }, []),
    ]),
    el("div", { position: "absolute", left: (WIDTH - SAFE) / 2, top: 56, width: SAFE, height: HEIGHT - 112, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", textAlign: "center" }, [
      el("div", { display: "flex", flexDirection: "column", alignItems: "center" }, [
        el("div", { color: C.teal, fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase" }, seo.label),
        el("div", { width: 64, height: 3, backgroundColor: C.teal, marginTop: 18, marginBottom: 26 }, []),
        el("div", { color: C.cream, fontFamily: "Spectral", fontWeight: 600, fontSize: nameSize, lineHeight: 1.08, display: "flex", justifyContent: "center", textAlign: "center", width: SAFE }, title),
        ...(topic ? [el("div", { color: C.teal, fontSize: 34, fontWeight: 600, marginTop: 18 }, topic)] : []),
        el("div", { color: C.soft, fontSize: lineSize, lineHeight: 1.35, marginTop: 22, display: "flex", justifyContent: "center", textAlign: "center", width: SAFE }, line),
      ]),
      el("div", { display: bare ? "none" : "flex", alignItems: "center" }, [
        { type: "img", props: { src: logo, width: 44, height: 44, style: { marginRight: 14, borderRadius: 4 } } },
        el("div", { color: C.cream, fontSize: 26, fontWeight: 600 }, site.name),
      ]),
    ]),
  ]);
}

let renderer = null;
async function getRenderer() {
  if (renderer) return renderer;
  const satori = (await import("satori")).default;
  const { Resvg } = require("@resvg/resvg-js");
  const fonts = FONTS.map((f) => ({ name: f.name, weight: f.weight, style: "normal", data: fs.readFileSync(path.join(FONT_DIR, f.file)) }));
  const logo = dataUri(fs.readFileSync(path.join(__dirname, "..", "..", "..", "site", "img", "casca-logo.svg"), "utf8"));
  const draw = async (card, opts) => new Resvg(await satori(cardTree(card, logo, opts), { width: WIDTH, height: HEIGHT, fonts }), { fitTo: { mode: "width", value: WIDTH }, font: { loadSystemFonts: false } }).render();
  // The card at the largest line size whose text fits the safe area; throws if even the smallest does not.
  renderer = async (card, measureOnly) => {
    if (measureOnly) {
      for (const lineSize of LINE_SIZES) { const img = await draw(card, { lineSize, bare: true }); if (!safeAreaProblems(img).length || lineSize === LINE_SIZES[LINE_SIZES.length - 1]) return { lineSize, ...inkBounds(img) }; }
    }
    let problems = [];
    for (const lineSize of LINE_SIZES) {
      problems = safeAreaProblems(await draw(card, { lineSize, bare: true }));
      if (!problems.length) return { png: (await draw(card, { lineSize })).asPng(), lineSize };
    }
    throw new Error("preview card " + card.file + ": text leaves the safe area even at " + LINE_SIZES[LINE_SIZES.length - 1] + " px (" + problems.join("; ") + ")");
  };
  return renderer;
}

// The ink of a bare render (text only, transparent ground): its bounds, and those bounds against SAFE_BOX.
function inkBounds(image) {
  const px = image.pixels, w = image.width, h = image.height;
  let left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 16) { if (x < left) left = x; if (x > right) right = x; if (y > bottom) bottom = y; }
  }
  return { left, right, bottom };
}
function safeAreaProblems(image) {
  const { left, right, bottom } = inkBounds(image);
  const p = [];
  if (left < SAFE_BOX.left || right > SAFE_BOX.right) p.push("ink spans x " + left + " to " + right + ", safe " + SAFE_BOX.left + " to " + SAFE_BOX.right);
  if (bottom > SAFE_BOX.bottom) p.push("ink reaches y " + bottom + ", safe to " + SAFE_BOX.bottom);
  return p;
}

// What a card depends on: its text, the shared words, the fonts, the logo and the layout version.
let staticHash = null;
function cardHash(card) {
  if (!staticHash) {
    const h = crypto.createHash("sha256");
    for (const f of FONTS) h.update(fs.readFileSync(path.join(FONT_DIR, f.file)));
    h.update(fs.readFileSync(path.join(__dirname, "..", "..", "..", "site", "img", "casca-logo.svg")));
    staticHash = h.digest("hex");
  }
  return crypto.createHash("sha256").update(JSON.stringify([CARD_VERSION, staticHash, seo, site.name, card.title, card.topic, card.line])).digest("hex").slice(0, 20);
}

// Draws (or copies from the cache) every card into <outputDir>/img/og/. Returns {drawn, cached}.
async function buildCards(outputDir, countyProfiles) {
  const outDir = path.join(outputDir, OG_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  let drawn = 0, cached = 0;
  const stepped = [];
  const used = new Set();
  for (const card of cardList(countyProfiles)) {
    const cacheFile = path.join(CACHE, cardHash(card) + ".png");
    used.add(path.basename(cacheFile));
    if (fs.existsSync(cacheFile)) cached++;
    else {
      const r = await (await getRenderer())(card);
      fs.writeFileSync(cacheFile, r.png);
      drawn++;
      if (r.lineSize !== LINE_SIZES[0]) stepped.push(card.file + " (" + r.lineSize + " px)");
    }
    fs.copyFileSync(cacheFile, path.join(outputDir, card.file));
  }
  // A card whose inputs changed leaves its old file behind; drop those so the cache holds only current cards.
  for (const f of fs.readdirSync(CACHE)) if (!used.has(f)) fs.rmSync(path.join(CACHE, f));
  return { drawn, cached, stepped };
}

// Every County Profiles page's og:image is a file in the built site, a 1200 by 630 PNG under 1 MB.
function checkCards(outputDir) {
  const pages = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === "index.html") pages.push(p); } })(path.join(outputDir, "county-profiles"));
  const bad = [];
  for (const page of pages) {
    const rel = path.relative(outputDir, page);
    const m = fs.readFileSync(page, "utf8").match(/<meta property="og:image" content="([^"]*)">/);
    if (!m) { bad.push(rel + ": no og:image"); continue; }
    if (!m[1].startsWith(site.url + "/")) { bad.push(rel + ": og:image " + m[1] + " is not on " + site.url); continue; }
    const file = path.join(outputDir, m[1].slice(site.url.length));
    if (!fs.existsSync(file)) { bad.push(rel + ": og:image " + m[1] + " does not exist"); continue; }
    const buf = fs.readFileSync(file);
    const isPng = buf.slice(1, 4).toString() === "PNG";
    const w = isPng ? buf.readUInt32BE(16) : 0, h = isPng ? buf.readUInt32BE(20) : 0;
    if (!isPng || w !== WIDTH || h !== HEIGHT) bad.push(rel + ": og:image " + m[1] + " is " + (isPng ? w + " by " + h : "not a PNG") + ", not " + WIDTH + " by " + HEIGHT);
    if (buf.length >= MAX_BYTES) bad.push(rel + ": og:image " + m[1] + " is " + buf.length + " bytes, over 1 MB");
  }
  if (bad.length) throw new Error("County Profiles preview cards:\n  " + bad.join("\n  "));
  return pages.length;
}

const measureCard = async (card) => (await getRenderer())(card, true);

module.exports = { cardPath, cardList, buildCards, checkCards, measureCard, CARD_VERSION };

if (require.main === module) {
  (async () => {
    const dir = process.env.SITE_DIR || path.join(__dirname, "..", "..", "..", "_site");
    if (process.argv.includes("--measure")) {
      // Every card's text bounds and line size, widest first, against the safe area.
      const rows = [];
      for (const card of cardList(require("../../../site/_data/countyProfiles.js"))) rows.push({ file: card.file, ...(await (await getRenderer())(card, true)) });
      rows.sort((a, b) => (a.left - b.left) || (b.bottom - a.bottom));
      console.log("safe area: x " + SAFE_BOX.left + " to " + SAFE_BOX.right + ", text bottom at most " + SAFE_BOX.bottom);
      for (const r of rows.slice(0, 8)) console.log("  " + r.file + ": x " + r.left + " to " + r.right + ", bottom " + r.bottom + ", line " + r.lineSize + " px");
      console.log("  deepest: " + rows.slice().sort((a, b) => b.bottom - a.bottom).slice(0, 3).map((r) => r.file + " bottom " + r.bottom).join("; "));
      console.log("  line sizes used: " + [...new Set(rows.map((r) => r.lineSize))].join(", ") + " px");
      return;
    }
    if (!process.argv.includes("--check")) {
      const t = Date.now();
      const r = await buildCards(dir, require("../../../site/_data/countyProfiles.js"));
      console.log("cards: " + r.drawn + " drawn, " + r.cached + " from cache, in " + (Date.now() - t) + " ms" + (r.stepped.length ? "; line stepped down on " + r.stepped.join(", ") : ""));
    }
    console.log("cards ok: " + checkCards(dir) + " County Profiles pages have a valid og:image");
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
