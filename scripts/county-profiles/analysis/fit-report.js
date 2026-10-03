#!/usr/bin/env node
// Display-target report: loads every slide of each county's four topics at several viewport sizes and reports
// slides whose content is taller than the viewport (the slide would need the deck to scroll), wider than it,
// or that hide content (clipped, or an inner scrollbar). Run after `npm run build`.
//
//   node scripts/county-profiles/analysis/fit-report.js [--counties santa-barbara,san-francisco,humboldt] [--out file.md]
//
// Needs `playwright-core` on NODE_PATH (it is not a repo dependency) and an installed Chrome or Edge
// (set CHROME to its path); it downloads nothing. It serves _site/ itself.
const fs = require("fs");
const path = require("path");
const http = require("http");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const counties = arg("counties", "santa-barbara,san-francisco,humboldt").split(",");
const out = arg("out", null);
const TOPICS = ["flood-hazard", "sea-level-rise", "total-economy", "marine-economy"];
const VIEWPORTS = [[1280, 650], [1366, 768], [1440, 900], [1920, 1080]];
const ROOT = path.resolve(process.env.SITE_DIR || path.join(__dirname, "../../../_site"));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/opt/pw-browsers/chromium/chrome"];
  const f = c.find((p) => fs.existsSync(p));
  if (!f) throw new Error("no Chrome or Edge found; set CHROME");
  return f;
}

// In-page: one entry per slide that does not fit, per view state.
function measure() {
  const deck = document.querySelector("[data-cpd-deck]");
  const H = deck.clientHeight, W = deck.clientWidth;
  const res = [];
  deck.querySelectorAll(".cpd-slide").forEach((sl) => {
    const id = sl.id;
    if (id === "s-title") return;
    const problems = [];
    const r = sl.getBoundingClientRect();
    if (Math.round(r.height) > H + 1) problems.push("taller by " + Math.round(r.height - H) + "px (slide " + Math.round(r.height) + " vs " + H);
    if (sl.scrollWidth > sl.clientWidth + 1) problems.push("wider by " + (sl.scrollWidth - sl.clientWidth) + "px");
    sl.querySelectorAll("*").forEach((el) => {
      if (el.closest(".sr-only") || el.closest("svg")) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return;
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) {
        const kind = /auto|scroll/.test(cs.overflowY) ? "inner scroll" : "clipped";
        problems.push(kind + " in ." + String(el.className).split(" ")[0] + " (" + (el.scrollHeight - el.clientHeight) + "px hidden)");
      }
    });
    if (problems.length) res.push({ id, problems });
  });
  return res;
}

(async () => {
  const { chromium } = require("playwright-core");
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: chromePath() });
  const lines = [];
  let bad = 0, total = 0;
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    lines.push("", "### " + w + " × " + h);
    for (const c of counties) for (const t of TOPICS) {
      const url = "http://localhost:" + port + "/county-profiles/county/" + c + "/" + t + "/";
      // A county without this topic has no built page: skipped. A page that is built but will not load is a problem.
      if (!fs.existsSync(path.join(ROOT, "county-profiles/county", c, t, "index.html"))) continue;
      const r = await page.goto(url).catch(() => null);
      if (!r || r.status() !== 200) { bad++; lines.push("- " + c + "/" + t + ": built page failed to load"); continue; }
      await page.waitForTimeout(150);
      const views = [{ name: "", fn: null }];
      const hasTiming = await page.$("[data-cpd-timing-view]");
      if (hasTiming) ["table", "horizons"].forEach((v) => views.push({ name: "/" + v, fn: v }));
      for (const v of views) {
        if (v.fn) await page.click("[data-cpd-timing-view] [data-show=\"" + v.fn + "\"]");
        const slidesN = await page.$$eval("[data-cpd-deck] .cpd-slide", (s) => s.length - 2);
        let res = await page.evaluate(measure);
        // The other views only change the timing slide; every other slide is the same as in the default view.
        if (v.fn) res = res.filter((s) => s.id === "s-when-to-act");
        total += v.fn ? 1 : slidesN;
        res.forEach((s) => { bad++; lines.push("- " + c + "/" + t + "#" + s.id.replace("s-", "") + v.name + ": " + s.problems.join("; ")); });
      }
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  const head = ["Slide-fit report (" + counties.join(", ") + "; " + TOPICS.length + " topics; viewports " + VIEWPORTS.map((v) => v.join("×")).join(", ") + ")", "", bad + " problem" + (bad === 1 ? "" : "s") + " over " + total + " slide checks (the SLR timing slide also checked in its Table and 2050 / 2100 views)."];
  const text = head.concat(lines).join("\n") + "\n";
  if (out) fs.writeFileSync(out, text);
  console.log(text);
})().catch((e) => { console.error(e); process.exit(1); });
