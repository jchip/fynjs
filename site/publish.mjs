// Publishes fynjs.pages.dev. This changes the LIVE site.
// Resets cf-pages to main, builds site-pub/ there, and force-pushes it as one commit on top of main.
// Cloudflare Pages serves cf-pages as is. Run `fyn bootstrap` first, since TypeDoc reads built packages.
// --dry-run does everything except the real push: it builds, commits to the local cf-pages, and
// runs `git push --dry-run`.
import { execFileSync } from "node:child_process";
import Path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = Path.join(import.meta.dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });

if (git("branch", "--show-current") !== "main") throw new Error("publish-site: run it from main");
// The build commit takes whatever is staged, so only site-pub may go in.
if (git("diff", "--cached", "--name-only")) throw new Error("publish-site: unstage your changes first");

// Unstaged edits carry over untouched, since cf-pages starts out identical to main.
git("checkout", "-B", "cf-pages", "main");
try {
  run("node", "site/build.mjs");
  run("git", "add", "-f", "site-pub");
  run("git", "commit", "-m", "chore(site): build");
  run("git", "push", "--force", ...(DRY_RUN ? ["--dry-run"] : []), "origin", "cf-pages");
} finally {
  // If a step fails, unstage site-pub so it does not follow us back to main.
  git("reset", "-q");
  git("checkout", "main");
}
