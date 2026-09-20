// Resolves toolDetailSchema against one tool into render-ready sections.
// Sections, rows and tags with nothing to show are dropped.

const getPath = (obj, path) =>
  path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const isEmpty = (v) =>
  v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

function resolveRow(tool, row) {
  let value = getPath(tool, row.field);
  if (isEmpty(value) && row.fallbackField) value = getPath(tool, row.fallbackField);

  if (row.kind === "link") {
    if (!isEmpty(value)) return { label: row.label, kind: "link", href: value };
    // Only the main tool URL is "unverified" when null; other links are simply omitted.
    if (row.field === "url" && value === null) return { label: row.label, kind: "text", text: "Link unverified" };
    return null;
  }
  if (isEmpty(value)) return null;
  if (row.kind === "list") return { label: row.label, kind: "list", items: value };
  return { label: row.label, kind: "text", text: value };
}

function resolveTagTable(tool, section, masters) {
  const has = tool[section.tagField] || [];
  if (has.length === 0) return null;
  const details = tool[section.detailField] || {};
  return (masters[section.tagField] || []).map((tag) => ({
    label: tag,
    yes: has.includes(tag),
    detail: has.includes(tag) ? details[tag] || "" : "",
  }));
}

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

module.exports = function toolSections(tool, schema, masters) {
  const out = [];
  for (const section of schema) {
    if (section.kind === "tag-table") {
      const tags = resolveTagTable(tool, section, masters);
      if (tags) out.push({ id: slug(section.title), title: section.title, tags });
    } else {
      const rows = (section.rows || []).map((r) => resolveRow(tool, r)).filter(Boolean);
      if (rows.length) out.push({ id: slug(section.title), title: section.title, rows });
    }
  }
  return out;
};
