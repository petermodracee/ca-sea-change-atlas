// Rewrites only the `gauge` block of every snapshot in site/data/county-profiles/latest/ from the spine
// and the committed OPC reference file, leaving every computed figure untouched. Use it when the gauge
// assignments or the Appendix F table change, without re-running the network pipeline.
//   node scripts/county-profiles/pipeline/refresh-gauge.js

const fs = require("fs");
const path = require("path");
const { gaugeBlock } = require("./snapshot");
const { validateSnapshot } = require("../validate");

const ROOT = path.join(__dirname, "..", "..", "..");
const dir = path.join(ROOT, "site/data/county-profiles/latest");
const spine = require(path.join(ROOT, "site/_data/countySpine.json"));
const schema = require(path.join(ROOT, "site/data/countyProfileSchema.json"));

let changed = 0;
for (const entry of spine.counties) {
  const file = path.join(dir, entry.fips + ".json");
  const snap = JSON.parse(fs.readFileSync(file, "utf8"));
  const next = { ...snap, gauge: gaugeBlock(entry, spine) };
  if (JSON.stringify(next.gauge) === JSON.stringify(snap.gauge)) continue;
  validateSnapshot(next, { schema, spine, file: path.basename(file) });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  changed++;
}
console.log("updated " + changed + " of " + spine.counties.length + " snapshots");
