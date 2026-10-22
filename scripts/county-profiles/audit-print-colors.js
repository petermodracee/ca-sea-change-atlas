// Dev script (not run in CI, blocks nothing): checks that every legend swatch in the print layout
// is the same colour as the marks it names. Run it after any change to print CSS colour rules or
// to a chart's colour scale:
//
//   npm run build
//   node scripts/county-profiles/audit-print-colors.js [county-slug ...]
//
// It serves the built `_site/`, opens each county's four topic pages under print-media emulation,
// and for every `.cpd-swatch` compares its computed background with the computed fill of the first
// SVG mark sharing one of its series classes (cp-bar-*, cp-sec-*, cpd-ramp-*, cpd-dot-*). It prints
// each distinct (section, class, swatch, mark) pair with a count, and exits 1 if any pair differs.
// Not compared, by design: the dashed "extra" outlines (a translucent fill and a border, not a
// solid colour) and the greyscale pattern pairs (a hatch or dot pattern in both mark and swatch).
//
// Needs Playwright, which is deliberately not a project dependency (the site build has no headless
// browser): `npm i --no-save playwright-core`. Set BROWSER_PATH to a Chromium-based browser's
// executable, or leave it unset to try the installed Chrome then Edge.

const http = require("http");
const fs = require("fs");
const path = require("path");

let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch (e) {
  console.error("playwright-core is not installed. Run: npm i --no-save playwright-core");
  process.exit(2);
}

const ROOT = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(__dirname, "..", "..", "_site");
const TOPICS = ["flood-hazard", "sea-level-rise", "total-economy", "marine-economy"];
const DEFAULT_COUNTIES = ["orange", "contra-costa", "san-mateo", "sacramento", "lake", "del-norte", "humboldt", "san-diego", "los-angeles"];
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

if (!fs.existsSync(path.join(ROOT, "county-profiles"))) {
  console.error("No _site/county-profiles. Run `npm run build` first.");
  process.exit(2);
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream");
  res.end(fs.readFileSync(file));
});

async function launch() {
  if (process.env.BROWSER_PATH) return chromium.launch({ executablePath: process.env.BROWSER_PATH });
  for (const channel of ["chrome", "msedge"]) {
    try { return await chromium.launch({ channel }); } catch (e) { /* try the next */ }
  }
  console.error("No Chrome or Edge found. Set BROWSER_PATH to a Chromium-based browser's executable.");
  process.exit(2);
}

// Runs in the page. One row per (swatch class, first mark with that class) in each section.
function collectPairs() {
  const rows = [];
  document.querySelectorAll(".cpp .cpp-section").forEach((sec) => {
    const title = (sec.querySelector("h1,h2,h3") || {}).textContent;
    sec.querySelectorAll(".cpd-legend .cpd-swatch").forEach((sw) => {
      [...sw.classList].filter((c) => /^(cp-bar|cp-sec|cpd-ramp|cpd-dot|cpd-swatch-extra)/.test(c)).forEach((cls) => {
        const mark = sec.querySelector("svg ." + CSS.escape(cls));
        if (!mark) return;
        const s = getComputedStyle(sw), m = getComputedStyle(mark);
        rows.push({ title, cls, swatch: s.backgroundColor, swatchImage: s.backgroundImage !== "none", fill: m.fill });
      });
    });
  });
  return rows;
}

(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const counties = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_COUNTIES;
  const browser = await launch();
  const pairs = new Map();
  let pages = 0;
  for (const county of counties) {
    for (const topic of TOPICS) {
      const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
      // A topic a county has no page for (a delta county's total economy) answers 404: skip it.
      const res = await page.goto(`http://localhost:${port}/county-profiles/county/${county}/${topic}/`).catch(() => null);
      if (res && res.status() === 200 && (await page.$(".cpp"))) {
        pages++;
        await page.emulateMedia({ media: "print" });
        for (const r of await page.evaluate(collectPairs)) {
          const patterned = r.swatchImage || /^url\(/.test(r.fill);
          const dashedOutline = /extra/.test(r.cls);
          const skip = patterned || dashedOutline;
          const same = r.swatch === r.fill;
          const key = [r.title, r.cls, r.swatch, r.fill, skip ? "skipped" : same ? "ok" : "MISMATCH"].join(" | ");
          pairs.set(key, (pairs.get(key) || 0) + 1);
        }
      }
      await page.close();
    }
  }
  await browser.close();
  server.close();

  let bad = 0;
  console.log(pages + " pages checked (print media)");
  for (const [key, n] of pairs) {
    if (key.endsWith("MISMATCH")) bad += n;
    console.log(n + "x " + key);
  }
  console.log(bad ? bad + " legend/mark colour mismatch(es)" : "legend swatches match their marks");
  process.exit(bad ? 1 : 0);
})();
