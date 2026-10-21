#!/usr/bin/env node
// County Profiles preview cards (og:image): 1200 by 630 PNGs drawn at build time with Satori (layout to SVG)
// and @resvg/resvg-js (SVG to PNG), no headless browser. Run from .eleventy.js after every build, and on its own:
//   SITE_DIR=<dir> node scripts/county-profiles/og/cards.js           draw the cards into <dir>/img/og/ and check
//   SITE_DIR=<dir> node scripts/county-profiles/og/cards.js --check   check only
//
// One card per county chooser (<slug>.png), one per topic deck (<slug>-<topic slug>.png) and one generic card
// (county-profiles.png) for the index, About and print pages. A card names the county and the topic and carries
// no figures and no date, so it never goes stale and a dated page shares its current page's card. The words are
// in site/_data/countyProfileSeo.json (`card`); the layout is cardTree() below. Change CARD_VERSION with the
// layout: a card is redrawn only when the hash of its inputs (its text, the fonts and CARD_VERSION) changes, and
// otherwise copied from the cache in scripts/county-profiles/.cache/og/ (gitignored).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const site = require("../../../site/_data/site.js");
const seo = require("../../../site/_data/countyProfileSeo.json").card;

const CARD_VERSION = 1;
const WIDTH = 1200, HEIGHT = 630;
const SAFE = 560; // text column width: inside a centred 630 by 630 square crop, with margins
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

// Every card the site uses: {file, title, topic}. `countyProfiles` is site/_data/countyProfiles.js.
function cardList(countyProfiles) {
  const cards = [{ file: cardPath(null), title: seo.genericTitle, topic: null }];
  for (const c of countyProfiles.counties) {
    if (!c.profile) continue;
    cards.push({ file: cardPath(c.slug), title: c.name + " County", topic: null });
    for (const t of c.coverage.filter((x) => x.hasPage)) cards.push({ file: cardPath(c.slug, t.slug), title: c.name + " County", topic: t.label });
  }
  return cards;
}

const el = (type, style, children) => ({ type, props: { style: { display: "flex", ...style }, children } });
const dataUri = (svg) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
// The hero's contour lines, across the full width (decoration only, no text).
const CONTOURS = dataUri('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
  + [470, 500, 530, 560, 590].map((y, i) => '<path d="M0 ' + y + " Q 150 " + (y - 40) + " 300 " + y + " T 600 " + y + " T 900 " + y + " T 1200 " + y + '" stroke="#F3EFE0" stroke-opacity="' + (0.16 - i * 0.02) + '" stroke-width="2" fill="none"/>').join("")
  + "</svg>");

function cardTree({ title, topic }, logo) {
  const nameSize = title.length > 20 ? 58 : title.length > 14 ? 66 : 76;
  return el("div", { width: WIDTH, height: HEIGHT, display: "flex", position: "relative", backgroundColor: C.bg, backgroundImage: "linear-gradient(180deg, " + C.bg + " 0%, " + C.bg2 + " 100%)", fontFamily: "IBM Plex Sans" }, [
    { type: "img", props: { src: CONTOURS, width: WIDTH, height: HEIGHT, style: { position: "absolute", left: 0, top: 0 } } },
    el("div", { position: "absolute", left: 0, top: 0, width: WIDTH, height: 8, backgroundColor: C.teal }, []),
    el("div", { position: "absolute", left: (WIDTH - SAFE) / 2, top: 56, width: SAFE, height: HEIGHT - 112, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", textAlign: "center" }, [
      el("div", { display: "flex", flexDirection: "column", alignItems: "center" }, [
        el("div", { color: C.teal, fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase" }, seo.label),
        el("div", { width: 64, height: 3, backgroundColor: C.teal, marginTop: 18, marginBottom: 26 }, []),
        el("div", { color: C.cream, fontFamily: "Spectral", fontWeight: 600, fontSize: nameSize, lineHeight: 1.08, display: "flex", justifyContent: "center", textAlign: "center", width: SAFE }, title),
        ...(topic ? [el("div", { color: C.teal, fontSize: 34, fontWeight: 600, marginTop: 18 }, topic)] : []),
        el("div", { color: C.soft, fontSize: 25, lineHeight: 1.35, marginTop: 22, display: "flex", justifyContent: "center", textAlign: "center", width: SAFE }, seo.toolLine),
      ]),
      el("div", { display: "flex", alignItems: "center" }, [
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
  renderer = async (card) => {
    const svg = await satori(cardTree(card, logo), { width: WIDTH, height: HEIGHT, fonts });
    return new Resvg(svg, { fitTo: { mode: "width", value: WIDTH }, font: { loadSystemFonts: false } }).render().asPng();
  };
  return renderer;
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
  return crypto.createHash("sha256").update(JSON.stringify([CARD_VERSION, staticHash, seo, site.name, card.title, card.topic])).digest("hex").slice(0, 20);
}

// Draws (or copies from the cache) every card into <outputDir>/img/og/. Returns {drawn, cached}.
async function buildCards(outputDir, countyProfiles) {
  const outDir = path.join(outputDir, OG_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  let drawn = 0, cached = 0;
  const used = new Set();
  for (const card of cardList(countyProfiles)) {
    const cacheFile = path.join(CACHE, cardHash(card) + ".png");
    used.add(path.basename(cacheFile));
    if (fs.existsSync(cacheFile)) cached++;
    else { fs.writeFileSync(cacheFile, await (await getRenderer())(card)); drawn++; }
    fs.copyFileSync(cacheFile, path.join(outputDir, card.file));
  }
  // A card whose inputs changed leaves its old file behind; drop those so the cache holds only current cards.
  for (const f of fs.readdirSync(CACHE)) if (!used.has(f)) fs.rmSync(path.join(CACHE, f));
  return { drawn, cached };
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

module.exports = { cardPath, cardList, buildCards, checkCards, CARD_VERSION };

if (require.main === module) {
  (async () => {
    const dir = process.env.SITE_DIR || path.join(__dirname, "..", "..", "..", "_site");
    if (!process.argv.includes("--check")) {
      const t = Date.now();
      const r = await buildCards(dir, require("../../../site/_data/countyProfiles.js"));
      console.log("cards: " + r.drawn + " drawn, " + r.cached + " from cache, in " + (Date.now() - t) + " ms");
    }
    console.log("cards ok: " + checkCards(dir) + " County Profiles pages have a valid og:image");
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
