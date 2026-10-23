#!/usr/bin/env node
// Replace the data PR's change-detail comments with the ones data-pr.js just wrote. Used only when the PR body
// would pass GitHub's size limit (data-pr.js moves each county's detail to comments then). Every run deletes the
// earlier detail comments first, so a retry rebuilds them from the branch rather than adding to them; with no
// files in <dir> it only deletes.
//
//   node scripts/county-profiles/pipeline/pr-comments.js <pr number> <dir>
//
// Needs GITHUB_REPOSITORY and an authenticated `gh` (GH_TOKEN in the workflow).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { COMMENT_MARK } = require("./data-pr");

function main() {
  const [pr, dir] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY;
  if (!pr || !dir || !repo) throw new Error("usage: GITHUB_REPOSITORY=<owner/repo> pr-comments.js <pr number> <dir>");
  const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
  // Only the workflow's own comments that carry the mark, so a person's comment is never deleted.
  const ids = gh("api", "--paginate", "repos/" + repo + "/issues/" + pr + "/comments", "--jq", ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(" + JSON.stringify(COMMENT_MARK) + "))) | .id").split("\n").filter(Boolean);
  for (const id of ids) gh("api", "-X", "DELETE", "repos/" + repo + "/issues/comments/" + id);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
  for (const f of files) gh("pr", "comment", pr, "--repo", repo, "--body-file", path.join(dir, f));
  console.log("Change detail comments on #" + pr + ": " + ids.length + " deleted, " + files.length + " posted.");
}

if (require.main === module) main();
