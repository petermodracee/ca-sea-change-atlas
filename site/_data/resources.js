const fs = require("fs");
const path = require("path");
const { resources } = require("../data/resources.json");

// Fail the build early on a malformed `screenshots` entry (see docs/RESOURCES.md).
for (const resource of resources) {
  if (resource.screenshots === undefined) continue;
  const fail = (msg) => { throw new Error("data/resources.json: " + resource.id + " screenshots: " + msg); };
  if (!Array.isArray(resource.screenshots) || resource.screenshots.length > 2) fail("must be an array of at most 2");
  resource.screenshots.forEach((s, i) => {
    for (const key of ["src", "alt", "caption", "credit", "capturedOn"]) {
      if (typeof s[key] !== "string" || !s[key].trim()) fail("#" + (i + 1) + " needs a non-empty " + key);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.capturedOn)) fail("#" + (i + 1) + " capturedOn must be YYYY-MM-DD");
    if (!s.src.startsWith("/img/")) fail("#" + (i + 1) + " src must start with /img/");
    if (!fs.existsSync(path.join(__dirname, "..", s.src))) fail("#" + (i + 1) + " file not found: " + s.src);
  });
}

module.exports = resources;
