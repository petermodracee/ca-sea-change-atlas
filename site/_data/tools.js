const fs = require("fs");
const path = require("path");
const { tools } = require("../data/tools.json");

// Fail the build early on a malformed `screenshots` entry (see docs/TOOLS.md).
for (const tool of tools) {
  if (tool.screenshots === undefined) continue;
  const fail = (msg) => { throw new Error("data/tools.json: " + tool.id + " screenshots: " + msg); };
  if (!Array.isArray(tool.screenshots) || tool.screenshots.length > 2) fail("must be an array of at most 2");
  tool.screenshots.forEach((s, i) => {
    for (const key of ["src", "alt", "caption", "credit", "capturedOn"]) {
      if (typeof s[key] !== "string" || !s[key].trim()) fail("#" + (i + 1) + " needs a non-empty " + key);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.capturedOn)) fail("#" + (i + 1) + " capturedOn must be YYYY-MM-DD");
    if (!s.src.startsWith("/img/")) fail("#" + (i + 1) + " src must start with /img/");
    if (!fs.existsSync(path.join(__dirname, "..", s.src))) fail("#" + (i + 1) + " file not found: " + s.src);
  });
}

module.exports = tools;
