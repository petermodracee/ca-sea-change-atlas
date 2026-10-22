// BEA state GDP by industry (SAGDP2, current dollars), California.
//
// Source: apps.bea.gov/regional/zip/SAGDP.zip, the Regional Economic Accounts download, file
// SAGDP2_CA_*.csv. Values are millions of current dollars, one row per BEA industry line, one column per
// year; "(NA)" and "(D)" mark values not yet published or withheld. BEA publishes the newest year for the
// broad sectors first and fills the detailed lines a year later, so the latest year with a value depends on
// the line: the marine sectors use detailed lines and therefore run a year behind QCEW.

const fs = require("fs");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { cachePath, cachedJson } = require("./http");
const { UA, splitCsv } = require("./qcew");

const URL_ZIP = "https://apps.bea.gov/regional/zip/SAGDP.zip";

// {lines: {classification: {year: millions}}, descriptions: {classification: text}}
async function fetchGdp(opts) {
  return cachedJson("bea-sagdp2-ca.json", async () => {
    const zip = cachePath("SAGDP.zip");
    if (!fs.existsSync(zip)) {
      const res = await fetch(URL_ZIP, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + URL_ZIP);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
    }
    const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split(/\r?\n/);
    const name = names.find((n) => /^SAGDP2_CA_/.test(n));
    if (!name) throw new Error("SAGDP.zip has no SAGDP2 California file");
    execFileSync("unzip", ["-o", "-q", zip, name, "-d", cachePath("bea")]);
    const lines = fs.readFileSync(cachePath("bea/" + name), "latin1").split(/\r?\n/).filter(Boolean);
    const head = splitCsv(lines[0]);
    const iClass = head.indexOf("IndustryClassification"), iDesc = head.indexOf("Description"), iUnit = head.indexOf("Unit");
    const yearCols = head.map((h, i) => [h, i]).filter(([h]) => /^\d{4}$/.test(h));
    const out = { lines: {}, descriptions: {}, unit: null };
    for (const l of lines.slice(1)) {
      const c = splitCsv(l);
      if (c.length < head.length || !c[iClass] || c[iClass] === "...") continue;
      const cls = c[iClass].trim();
      out.unit = c[iUnit];
      out.descriptions[cls] = c[iDesc].trim();
      out.lines[cls] = Object.fromEntries(yearCols.map(([y, i]) => [y, /^-?[\d.]+$/.test(c[i].trim()) ? Number(c[i]) : null]));
    }
    return out;
  }, opts);
}

module.exports = { fetchGdp };
