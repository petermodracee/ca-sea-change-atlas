/**
 * California tide-gauge sea-level projections from the 2022 Interagency Sea
 * Level Rise Technical Report, read live from the task force's Zenodo record
 * (CC BY 4.0). The record is a single 298 MB zip, so this fetches only what it
 * needs with HTTP range requests: the zip's directory, then the one 3.3 MB
 * NetCDF4/HDF5 entry (`Results/TR_local_projections.nc`), which it inflates and
 * reads with a pinned, SRI-checked h5wasm. Nothing is copied into this repo.
 *
 * Why not NASA's own scenario-tool feed: it sends no CORS header and is
 * undocumented. See docs/DECISIONS.md.
 */
import { loadScript } from "./load-script.js";

// Version 1.1 (Feb 2022) is the newest version of the record; Zenodo file contents are immutable per version.
const ZIP_URL = "https://zenodo.org/api/records/6067895/files/Interagency_Report.zip/content";
const ZIP_SIZE = 297593646; // Content-Length isn't exposed to cross-origin scripts, so it is pinned with the version
const ENTRY_NAME = "Results/TR_local_projections.nc";
const TAIL_BYTES = 70000; // holds the zip's end-of-central-directory record and the whole directory (34 KB)

const H5WASM = {
  src: "https://unpkg.com/h5wasm@0.8.8/dist/iife/h5wasm.js",
  integrity: "sha384-gsT2n8ZEzphX1iWV9ejofW/QP28dOARQURTFiqVno7S13e+7y4xPlM1FVDiUddMw"
};

/** Scenario keys as they appear in the file's variable names (`rsl_total_<key>`). */
export const SCENARIOS = [
  { key: "Low", label: "Low" },
  { key: "IntLow", label: "Intermediate-Low" },
  { key: "Int", label: "Intermediate" },
  { key: "IntHigh", label: "Intermediate-High" },
  { key: "High", label: "High" }
];

// Rough California bounding box; longitudes in the file may be 0–360.
const CA_BOUNDS = { south: 32, north: 42.1, west: -125.5, east: -114 };

async function rangeFetch(start, end){
  const response = await fetch(ZIP_URL, { headers: { Range: `bytes=${start}-${end}` } });
  if(response.status !== 206) throw new Error(`Zenodo range request returned ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Locates an entry in the zip's central directory (read from the tail) and returns its local-header offset and compressed size. */
function findEntry(tail, name){
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for(let i = tail.length - 22; i >= 0; i--){
    if(view.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error("Zip directory not found");
  const dirSize = view.getUint32(eocd + 12, true);
  const dirStart = tail.length - (ZIP_SIZE - view.getUint32(eocd + 16, true)); // directory offset, relative to the tail
  if(dirStart < 0 || dirStart + dirSize > tail.length) throw new Error("Zip directory outside the fetched range");
  const decoder = new TextDecoder();
  for(let p = dirStart; p < dirStart + dirSize && view.getUint32(p, true) === 0x02014b50;){
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    if(decoder.decode(tail.subarray(p + 46, p + 46 + nameLength)) === name){
      return { method: view.getUint16(p + 10, true), compressedSize: view.getUint32(p + 20, true), offset: view.getUint32(p + 42, true) };
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} not found in the zip`);
}

async function fetchNetcdf(){
  const tail = await rangeFetch(ZIP_SIZE - TAIL_BYTES, ZIP_SIZE - 1);
  const entry = findEntry(tail, ENTRY_NAME);
  if(entry.method !== 8) throw new Error("Unexpected zip compression method");
  // Local header is 30 bytes plus name and extra fields, which can differ from the directory's copy, so over-read a little.
  const chunk = await rangeFetch(entry.offset, entry.offset + entry.compressedSize + 512);
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const dataStart = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const deflated = chunk.subarray(dataStart, dataStart + entry.compressedSize);
  const stream = new Blob([deflated]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toGauges(file){
  const ids = file.get("PSMSL_id").value;
  const lats = file.get("lat").value;
  const lons = file.get("lon").value;
  const names = file.get("tg").value;
  const years = Array.from(file.get("years").value, Number);
  const gaugeCount = ids.length;
  const gauges = [];
  for(let i = 0; i < gaugeCount; i++){
    const lng = lons[i] > 180 ? lons[i] - 360 : lons[i];
    if(lats[i] < CA_BOUNDS.south || lats[i] > CA_BOUNDS.north || lng < CA_BOUNDS.west || lng > CA_BOUNDS.east) continue;
    gauges.push({ psmslId: ids[i], name: String(names[i]).trim(), lat: lats[i], lng, total: {} });
  }
  SCENARIOS.forEach(({ key }) => {
    const values = file.get(`rsl_total_${key}`).value; // [percentile 17/50/83][year][gauge], millimetres relative to 2000
    gauges.forEach(g => {
      const i = ids.indexOf(g.psmslId);
      g.total[key] = years.map((year, y) => [0, 1, 2].map(p => values[(p * years.length + y) * gaugeCount + i]));
    });
  });
  return { years, gauges };
}

let pending = null;
/**
 * Resolves to `{ years, gauges }`. Each gauge: `{ psmslId, name, lat, lng, total: { [scenarioKey]: [[p17, p50, p83] per year, in mm] } }`.
 * The download happens once; a failed attempt can be retried.
 */
export function loadCaliforniaProjections(){
  if(!pending){
    pending = (async () => {
      if(typeof DecompressionStream === "undefined") throw new Error("This browser can't unpack the projection file");
      const [, netcdf] = await Promise.all([loadScript(H5WASM), fetchNetcdf()]);
      const h5wasm = window.h5wasm;
      await h5wasm.ready;
      h5wasm.FS.writeFile("/tr_local.nc", netcdf);
      const file = new h5wasm.File("/tr_local.nc", "r");
      try { return toGauges(file); }
      finally { file.close(); h5wasm.FS.unlink("/tr_local.nc"); }
    })();
    pending.catch(() => { pending = null; });
  }
  return pending;
}
