import { cachedFetch } from "./request-cache.js";

/**
 * Renders one "legend-block" div (title + colored/hatched swatch rows)
 * from static color/label config — the BCDC-style legend shape, where
 * colors and class-break labels are known ahead of time rather than
 * fetched live.
 *
 * @param {{label: string, colors: string[], labels: string[], line?: boolean, hatch?: boolean}} item
 * @returns {HTMLElement}
 */
export function renderSwatchLegendBlock(item){
  const block = document.createElement("div");
  block.className = "legend-block";
  const title = document.createElement("div");
  title.className = "legend-block-title";
  title.textContent = item.label;
  block.appendChild(title);
  item.colors.forEach((color, i) => {
    const row = document.createElement("div");
    row.className = "legend-block-row";
    const sw = document.createElement("span");
    sw.className = "legend-block-swatch" + (item.line ? " line" : "") + (item.hatch ? " hatch" : "");
    if(item.hatch){ sw.style.color = color; } else { sw.style.background = color; }
    const lbl = document.createElement("span");
    lbl.textContent = item.labels[i];
    row.appendChild(sw);
    row.appendChild(lbl);
    block.appendChild(row);
  });
  return block;
}

/**
 * Renders one "legend-block" with a continuous colour ramp (title, bar, low and high labels),
 * for layers whose colour encodes a smooth quantity such as density.
 *
 * @param {{label: string, gradient: Object<number, string>, low: string, high: string}} item - `gradient` maps stop (0 to 1) to colour.
 * @returns {HTMLElement}
 */
export function renderGradientLegendBlock(item){
  const block = document.createElement("div");
  block.className = "legend-block";
  const title = document.createElement("div");
  title.className = "legend-block-title";
  title.textContent = item.label;
  const bar = document.createElement("div");
  bar.className = "legend-block-gradient";
  // Object.entries lists integer-like keys ("1") before fractional ones ("0.2"), so order the stops by position.
  const stops = Object.entries(item.gradient).sort(([a], [b]) => Number(a) - Number(b)).map(([at, color]) => `${color} ${Number(at) * 100}%`);
  bar.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
  const ends = document.createElement("div");
  ends.className = "legend-block-gradient-labels";
  [item.low, item.high].forEach(text => { const span = document.createElement("span"); span.textContent = text; ends.appendChild(span); });
  block.append(title, bar, ends);
  return block;
}

/**
 * Fetches an Esri REST `/legend?f=json` endpoint and returns one sublayer's
 * entries (`{label, contentType, imageData}`; the image is a base64 swatch).
 *
 * @param {string} url - the service's base MapServer URL (no trailing slash).
 * @param {number} layerId - the sublayer id whose legend entries to use.
 * @returns {Promise<object[]>}
 */
export async function fetchLegendItems(url, layerId){
  const json = await cachedFetch(`${url}/legend?f=json`, res => res.json());
  return ((json.layers || []).find(l => l.layerId === layerId) || {}).legend || [];
}

/**
 * Fetches an Esri REST `/legend?f=json` endpoint and renders one
 * "legend-block" div (title + base64 image swatch rows) from it — the
 * shape shared by FEMA NFHL, all three simple CFEM hazard layers, and
 * CFEM storm surge, each of which previously hand-rolled this same
 * fetch-and-render pattern.
 *
 * @param {string} url - the service's base MapServer URL (no trailing slash).
 * @param {number} layerId - the sublayer id whose legend entries to use.
 * @param {string} title - legend block title; empty for none.
 * @param {string[]} [labels] - replaces the service's own row labels, in order.
 * @returns {Promise<HTMLElement>}
 */
export async function renderImageLegendBlock(url, layerId, title, labels){
  const items = await fetchLegendItems(url, layerId);
  const block = document.createElement("div");
  block.className = "legend-block";
  if(title){
    const titleEl = document.createElement("div");
    titleEl.className = "legend-block-title";
    titleEl.textContent = title;
    block.appendChild(titleEl);
  }
  items.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "legend-block-row";
    const sw = document.createElement("img");
    sw.src = `data:${item.contentType};base64,${item.imageData}`;
    sw.className = "fema-legend-swatch";
    sw.alt = ""; // decorative: the label beside it carries the meaning
    const lbl = document.createElement("span");
    lbl.textContent = labels && labels[i] ? labels[i] : item.label.trim();
    row.appendChild(sw);
    row.appendChild(lbl);
    block.appendChild(row);
  });
  return block;
}
