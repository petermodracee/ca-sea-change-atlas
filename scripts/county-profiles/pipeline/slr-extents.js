#!/usr/bin/env node
// Writes slr-regions.json: the bounding box of each of NOAA's seven California SLR GeoPackages, so
// fetchSlr (sources.js) downloads only the regions a county's box touches. Run it after the regional
// zips have been downloaded and unzipped into the cache, e.g. when NOAA republishes a region:
//
//   node scripts/county-profiles/pipeline/slr-extents.js
//
// A region's extent is the union of its tables' rtree extents. The GeoPackages' own gpkg_contents
// extents are not used: Catalina's are all zero and SFBay's are partly zero. Each value is rounded
// outward to 4 decimal places, so the box never shrinks.

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { cachePath, today } = require("./http");
const { SLR_REGIONS } = require("./sources");

const OUT = path.join(__dirname, "slr-regions.json");
const floor4 = (v) => Math.floor(v * 1e4) / 1e4, ceil4 = (v) => Math.ceil(v * 1e4) / 1e4;

const regions = {};
for (const region of SLR_REGIONS) {
  const dir = cachePath("slr/" + region);
  const gpkg = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.endsWith(".gpkg"));
  if (!gpkg) throw new Error("no unzipped GeoPackage for " + region + " in " + dir + "; run the pipeline for a county in that region first");
  const db = new DatabaseSync(path.join(dir, gpkg), { readOnly: true });
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const rtrees = db.prepare("select name from sqlite_master where type = 'table' and name like 'rtree\\_%\\_Shape' escape '\\'").all().map((r) => r.name);
  for (const rt of rtrees) {
    const e = db.prepare(`select min(minx) a, min(miny) b, max(maxx) c, max(maxy) d from "${rt}"`).get();
    if (e.a === null) continue;
    box[0] = Math.min(box[0], e.a); box[1] = Math.min(box[1], e.b); box[2] = Math.max(box[2], e.c); box[3] = Math.max(box[3], e.d);
  }
  const changed = db.prepare("select max(last_change) m from gpkg_contents").get().m;
  db.close();
  if (!rtrees.length || !Number.isFinite(box[0])) throw new Error(region + ": no rtree extents in " + gpkg);
  const zip = cachePath("CA_" + region + "_slr_data_dist.zip");
  const downloaded = fs.existsSync(zip) ? fs.statSync(zip).mtime.toISOString().slice(0, 10) : null;
  regions[region] = { bbox: [floor4(box[0]), floor4(box[1]), ceil4(box[2]), ceil4(box[3])], gpkg, lastChange: changed, downloaded, tables: rtrees.length };
}

fs.writeFileSync(OUT, JSON.stringify({
  _comment: "Bounding boxes (lon/lat, [minx, miny, maxx, maxy]) of NOAA's California SLR GeoPackages, read by slr-extents.js from the union of each GeoPackage's rtree extents and rounded outward. fetchSlr in sources.js uses them to download only the regions a county's box touches. They are bounding boxes computed from the downloads, not NOAA data: no polygon is copied into the repo. lastChange is the GeoPackage's latest gpkg_contents.last_change, to tell when NOAA has republished a region; downloaded is the date the zip was fetched.",
  generated: today(),
  source: "https://chs.coast.noaa.gov/htdata/Inundation/SLR/BulkDownload/Sea_Level_Rise_Vectors/CA/",
  regions,
}, null, 2).replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (m, inner) => "[" + inner.split(/,\s*/).join(", ") + "]") + "\n");
console.log("wrote " + path.relative(process.cwd(), OUT));
