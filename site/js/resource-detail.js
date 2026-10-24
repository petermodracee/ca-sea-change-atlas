// Resolves resourceDetailSchema against resources. Shared by the build (resource.njk via the
// `resourceSections` filter and _data/resourceTagMasters.js) and the browser (compare.js).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ResourceDetail = factory();
})(this, function () {
  const getPath = (obj, path) =>
    path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

  const isEmpty = (v) =>
    v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Distinct, sorted values of every tag field the schema's tag-tables use, across all resources
  // (the same set js/sources.js builds for the filter checkboxes).
  function tagMasters(resources, schema) {
    const masters = {};
    for (const s of schema) {
      if (s.kind !== "tag-table") continue;
      masters[s.tagField] = [...new Set(resources.flatMap((t) => t[s.tagField] || []))].sort();
    }
    return masters;
  }

  // One row for one resource, or null if it has nothing to show.
  function resolveRow(resource, row) {
    let value = getPath(resource, row.field);
    if (isEmpty(value) && row.fallbackField) value = getPath(resource, row.fallbackField);

    if (row.kind === "link") {
      if (!isEmpty(value)) return { label: row.label, kind: "link", href: value };
      // Only the main resource URL is "unverified" when null; other links are simply omitted.
      if (row.field === "url" && value === null) return { label: row.label, kind: "text", text: "Link unverified" };
      return null;
    }
    if (isEmpty(value)) return null;
    if (row.kind === "list") return { label: row.label, kind: "list", items: value };
    return { label: row.label, kind: "text", text: value };
  }

  // Every master tag as Yes/No for one resource, or null if the resource has no tags in that field.
  function resolveTags(resource, section, masters) {
    const has = resource[section.tagField] || [];
    if (has.length === 0) return null;
    const details = resource[section.detailField] || {};
    return (masters[section.tagField] || []).map((tag) => ({
      label: tag,
      yes: has.includes(tag),
      detail: has.includes(tag) ? details[tag] || "" : "",
    }));
  }

  // One section for one resource, or null if it has nothing to show.
  function resolveSection(resource, section, masters) {
    const base = { id: slug(section.title), title: section.title };
    if (section.kind === "tag-table") {
      const tags = resolveTags(resource, section, masters);
      return tags ? { ...base, tags } : null;
    }
    const rows = (section.rows || []).map((r) => resolveRow(resource, r)).filter(Boolean);
    return rows.length ? { ...base, rows } : null;
  }

  function resourceSections(resource, schema, masters) {
    return schema.map((s) => resolveSection(resource, s, masters)).filter(Boolean);
  }

  return { getPath, isEmpty, slug, tagMasters, resolveRow, resolveSection, resourceSections };
});
