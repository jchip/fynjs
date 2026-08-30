import Fs from "fs";
import Path from "path";

import ignore, { Ignore } from "ignore";

//
// Gitignore matching, used for two separate things (FPO-17):
//
// 1. `packages.autoSearch.respectGitignore` - opt-in, default off. When on, auto-search skips
//    gitignored paths.
// 2. The publish veto - ALWAYS on. A gitignored package is never in publish jurisdiction, even
//    when respectGitignore is off and even if `publishInclude` names it. A gitignored package
//    is typically a nested clone of some other repo; publishing it from here is never right.
//
// Because of (2) the matcher is built regardless of the flag. In a directory with no gitignore
// rules - or no git at all - nothing matches and both behaviors are no-ops.
//
// Scope: the repo root `.gitignore` and `.git/info/exclude`. Nested `.gitignore` files deeper
// in the tree are NOT consulted, nor is the user's global excludesfile. That covers the case
// this exists for (a top-level ignored directory holding cloned repos) without shelling out to
// git, at the cost of missing rules declared further down.
//

const IGNORE_SOURCES = [".gitignore", Path.join(".git", "info", "exclude")];

/** matches paths against a repo's gitignore rules */
export type GitignoreMatcher = {
  /** true if the given repo-relative path is ignored by git */
  ignores(relPath: string): boolean;
  /** true if any rule was actually loaded - false means every check is a no-op */
  hasRules: boolean;
};

const NO_RULES: GitignoreMatcher = {
  ignores: () => false,
  hasRules: false,
};

const readIfPresent = (file: string): string | undefined => {
  try {
    return Fs.readFileSync(file, "utf8");
  } catch (err: any) {
    if (err?.code !== "ENOENT" && err?.code !== "ENOTDIR") {
      throw err;
    }
    return undefined;
  }
};

/**
 * Build a gitignore matcher for a repo root.
 *
 * Never throws for a missing or unreadable ignore file - a repo with no rules simply matches
 * nothing.
 *
 * @param cwd - repo root to read ignore rules from
 * @returns a matcher; {@link GitignoreMatcher.hasRules} is false when nothing was loaded
 */
export function makeGitignoreMatcher(cwd: string): GitignoreMatcher {
  const sources = IGNORE_SOURCES.map((f) => readIfPresent(Path.join(cwd, f))).filter(Boolean);

  if (sources.length === 0) {
    return NO_RULES;
  }

  const ig: Ignore = ignore().add(sources.join("\n"));

  return {
    hasRules: true,
    ignores(relPath: string): boolean {
      // `ignore` rejects absolute paths and anything outside the root, and refuses "."
      if (!relPath || relPath === "." || Path.isAbsolute(relPath)) {
        return false;
      }

      // it wants posix separators relative to the root
      const normalized = relPath.split(Path.sep).join("/").replace(/^\.\//, "");

      if (!normalized || normalized.startsWith("..")) {
        return false;
      }

      return ig.ignores(normalized);
    },
  };
}
