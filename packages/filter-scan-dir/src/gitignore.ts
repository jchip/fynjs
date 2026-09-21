import Fs from "fs";
import Path from "path";

/** A caller-provided parser supplies Git ignore pattern semantics. */
export type GitignoreMatcher = {
  test(path: string): { ignored: boolean; unignored: boolean };
};
export type GitignoreParser = (contents: string) => GitignoreMatcher;

type Rule = { dir: string; matcher: GitignoreMatcher };

// Only inspect ancestors inside the nearest repository. Without a repository,
// the explicitly requested scan root establishes the rule scope.
function ancestorDirs(dir: string): string[] {
  const dirs = [dir];
  for (let current = dir; ;) {
    if (Fs.existsSync(Path.join(current, ".git"))) return dirs.reverse();
    const parent = Path.dirname(current);
    if (parent === current) return [dir];
    dirs.push(parent);
    current = parent;
  }
}

export class GitignoreRules {
  constructor(private rules: Rule[] = []) {}

  ignores(file: string, directory: boolean): boolean {
    let ignored = false;
    for (const { dir, matcher } of this.rules) {
      const relative = Path.relative(dir, file).split(Path.sep).join("/");
      if (!relative) continue;
      const result = matcher.test(relative + (directory ? "/" : ""));
      if (result.ignored) ignored = true;
      else if (result.unignored) ignored = false;
    }
    return ignored;
  }

  private add(dir: string, source: string, parse: GitignoreParser): GitignoreRules {
    return new GitignoreRules([...this.rules, { dir, matcher: parse(source) }]);
  }

  static loadSync(dir: string, parse: GitignoreParser, parent?: GitignoreRules): GitignoreRules {
    let rules = parent || new GitignoreRules();
    for (const base of parent ? [dir] : ancestorDirs(dir)) {
      // An explicit scan inside an ignored tree starts a new rule scope there.
      if (!parent && rules.ignores(base, true)) rules = new GitignoreRules();
      try {
        rules = rules.add(base, Fs.readFileSync(Path.join(base, ".gitignore"), "utf8"), parse);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      }
    }
    return rules;
  }

  static async load(
    dir: string,
    parse: GitignoreParser,
    parent?: GitignoreRules,
  ): Promise<GitignoreRules> {
    let rules = parent || new GitignoreRules();
    for (const base of parent ? [dir] : ancestorDirs(dir)) {
      if (!parent && rules.ignores(base, true)) rules = new GitignoreRules();
      try {
        rules = rules.add(
          base,
          await Fs.promises.readFile(Path.join(base, ".gitignore"), "utf8"),
          parse,
        );
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      }
    }
    return rules;
  }
}
