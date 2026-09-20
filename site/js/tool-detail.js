// Resolves toolDetailSchema against tools. Shared by the build (tool.njk via the
// `toolSections` filter and _data/toolTagMasters.js) and the browser (compare.js).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ToolDetail = factory();
})(this, function () {
  const getPath = (obj, path) =>
    path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

  const isEmpty = (v) =>
    v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Distinct, sorted values of every tag field the schema's tag-tables use, across all tools
  // (the same set js/sources.js builds for the filter checkboxes).
  function tagMasters(tools, schema) {
    const masters = {};
    for (const s of schema) {
      if (s.kind !== "tag-table") continue;
      masters[s.tagField] = [...new Set(tools.flatMap((t) => t[s.tagField] || []))].sort();
    }
    return masters;
  }

  // One row for one tool, or null if it has nothing to show.
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

  // Every master tag as Yes/No for one tool, or null if the tool has no tags in that field.
  function resolveTags(tool, section, masters) {
    const has = tool[section.tagField] || [];
    if (has.length === 0) return null;
    const details = tool[section.detailField] || {};
    return (masters[section.tagField] || []).map((tag) => ({
      label: tag,
      yes: has.includes(tag),
      detail: has.includes(tag) ? details[tag] || "" : "",
    }));
  }

  // One section for one tool, or null if it has nothing to show.
  function resolveSection(tool, section, masters) {
    const base = { id: slug(section.title), title: section.title };
    if (section.kind === "tag-table") {
      const tags = resolveTags(tool, section, masters);
      return tags ? { ...base, tags } : null;
    }
    const rows = (section.rows || []).map((r) => resolveRow(tool, r)).filter(Boolean);
    return rows.length ? { ...base, rows } : null;
  }

  function toolSections(tool, schema, masters) {
    return schema.map((s) => resolveSection(tool, s, masters)).filter(Boolean);
  }

  return { getPath, isEmpty, slug, tagMasters, resolveRow, resolveSection, toolSections };
});
