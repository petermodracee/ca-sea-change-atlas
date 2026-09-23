// Number, date and vintage formatting shared by the section models (CommonJS) and the Eleventy
// filters (template-helpers.mjs). Pure functions only.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The figure shown centred in a ring. Zero is "0%" and a nonzero share too small to show at one
// decimal is "<0.1%", so a real but tiny share is never mistaken for none.
function shareText(pct) {
  if (pct === 0) return "0%";
  if (pct === 100) return "100%";
  if (pct < 0.05) return "<0.1%";
  return pct.toFixed(1) + "%";
}

const pct = (count, total) => shareText((count / total) * 100);

// Integers with thousands separators; non-integers to at most one decimal.
function num(n) {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");

function usdWords(n) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + " billion";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + " million";
  return usd(n);
}

// "2026-09-20" -> "2026, September 20" pieces for APA.
function apaDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return y + ", " + MONTHS[m - 1] + " " + d;
}

// A source's vintage by kind: what the data describes, not when it was fetched (that's `retrieved`
// and `verified`, shown only in the Data and method table). `short` is the inline form (years only
// for a period); `full` is the table form. A null vintage means the source publishes none.
function vintageText(v, mode) {
  if (!v) return "no published vintage";
  if (v.kind === "date") return v.date;
  if (v.kind === "year") return String(v.year);
  if (v.kind === "period") {
    if (mode === "full") return v.start + " to " + v.end;
    const a = v.start.slice(0, 4), b = v.end.slice(0, 4);
    return a === b ? a : a + "–" + b;
  }
  throw new Error("unknown vintage kind " + v.kind);
}

module.exports = { shareText, pct, num, usd, usdWords, apaDate, vintageText };
