import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fs from "fs";
import Path from "path";
import { execFileSync } from "child_process";
import { verify } from "run-verify";
import { FynpoDepGraph } from "@fynpo/base";
import { getNewCommits, collateCommitsPackages } from "../src/utils/git-list-commits";

// git diff-tree --stdin skips a last line with no newline. The last id fynpo feeds it is the
// oldest commit in the range, so that commit must still map to its package.
describe("collating the oldest commit in range", () => {
  let dir: string;

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const write = (name: string, content: string) => {
    const pkgDir = Path.join(dir, "packages", name);
    Fs.mkdirSync(pkgDir, { recursive: true });
    Fs.writeFileSync(Path.join(pkgDir, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
    Fs.writeFileSync(Path.join(pkgDir, "index.js"), content);
  };
  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const collate = async (latestTag?: string) => {
    const graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
    const opts = { cwd: dir, graph, fynpoRc: {}, changeLogFile: Path.join(dir, "CHANGELOG.md") };
    return collateCommitsPackages(await getNewCommits(opts, { latestTag }));
  };

  beforeEach(() => {
    const tempDir = Path.resolve(import.meta.dirname, "../../../.temp");
    Fs.mkdirSync(tempDir, { recursive: true });
    dir = Fs.mkdtempSync(Path.join(tempDir, "collate-oldest-"));
    git("init", "-q", "-b", "main");
    git("config", "user.name", "fynpo test");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
  });

  afterEach(() => Fs.rmSync(dir, { recursive: true, force: true }));

  it("maps the only commit of a new repo to its packages", () =>
    verify({ timeout: 5000 })
      .step(() => {
        write("a", "module.exports = 1;\n");
        write("b", "module.exports = 1;\n");
        return commit("feat: initial packages");
      })
      .step(async (id: string) => ({ id, collated: await collate() }))
      .step(({ id, collated }: any) => {
        expect(collated.realPackages.sort()).toEqual(["a", "b"]);
        expect(collated.packages.a.msgs).toEqual([{ m: "feat: initial packages", id }]);
      }));

  it("keeps the oldest commit after the release tag", () =>
    verify({ timeout: 5000 })
      .step(() => {
        write("a", "module.exports = 1;\n");
        write("b", "module.exports = 1;\n");
        commit("[Publish]");
        git("tag", "fynpo-rel-20261007-test");
        write("a", "module.exports = 2;\n");
        const oldest = commit("feat: change a");
        write("b", "module.exports = 2;\n");
        commit("fix: change b");
        return oldest;
      })
      .step(async (oldest: string) => ({ oldest, collated: await collate("fynpo-rel-20261007-test") }))
      .step(({ oldest, collated }: any) => {
        expect(collated.realPackages.sort()).toEqual(["a", "b"]);
        expect(collated.packages.a.msgs).toEqual([{ m: "feat: change a", id: oldest }]);
      }));
});
