import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { execFileSync } from "child_process";
import { FynpoDepGraph } from "@fynpo/base";

const warn = vi.fn();
vi.mock("../src/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: (...args: any[]) => warn(...args),
    debug: vi.fn(),
  },
}));

import { getUpdatedPackages } from "../src/utils/get-updated-packages";

//
// This one drives real git on purpose. The bug it guards is a `git describe --first-parent`
// behavior, so a mocked execSync would only prove the fallback is wired up, not that the
// premise is real (FPO-46).
//

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=fynpo test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" }
  ).trim();

const writePkg = (dir: string, name: string, body: any = {}) => {
  const pkgDir = Path.join(dir, "packages", name);
  Fs.mkdirSync(pkgDir, { recursive: true });
  Fs.writeFileSync(
    Path.join(pkgDir, "package.json"),
    `${JSON.stringify({ name, version: "1.0.0", ...body }, null, 2)}\n`
  );
};

/**
 * Build the history shape that broke fynjs: a side branch carrying the release tag, merged
 * into main so the tagged commit is reachable only through the merge's SECOND parent.
 *
 *   main:  init ------------------- merge --- later work
 *                \                 /
 *   side:         released(TAG) --
 */
const makeRepoWithTagOffFirstParent = (): string => {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-fp-"));

  git(dir, "init", "-q", "-b", "main");
  writePkg(dir, "lib-a");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");

  git(dir, "checkout", "-q", "-b", "side");
  writePkg(dir, "lib-a", { description: "released state" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "release work");
  git(dir, "tag", "fynpo-rel-20260816-deadbeef");

  git(dir, "checkout", "-q", "main");
  writePkg(dir, "lib-b");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "unrelated main work");
  // --no-ff so main's first parent stays on main and the tag ends up on the second
  git(dir, "merge", "-q", "--no-ff", "-m", "Merge side", "side");

  // work after the merge - this is what a release should see as changed
  writePkg(dir, "lib-b", { description: "changed after the boundary" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "lib-b: change after the release");

  return dir;
};

describe("release tag that is not on the first-parent chain (FPO-46)", () => {
  let dir: string;
  let graph: FynpoDepGraph;

  beforeAll(async () => {
    dir = makeRepoWithTagOffFirstParent();
    graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
    warn.mockClear();
  });

  afterAll(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("confirms git itself cannot describe the tag with --first-parent", () => {
    // the premise: if this ever starts succeeding, the fallback below is dead code
    expect(() =>
      git(dir, "describe", "--tags", "--long", "--first-parent", "--match", "fynpo-rel-*")
    ).toThrow();

    expect(git(dir, "describe", "--tags", "--long", "--match", "fynpo-rel-*")).toMatch(
      /^fynpo-rel-20260816-deadbeef-\d+-g[0-9a-f]+$/
    );
  });

  it("uses the tag as the boundary instead of crashing", () => {
    const changed: any = getUpdatedPackages(graph, {
      cwd: dir,
      fynpoRc: {},
      versionLockMap: {},
      forcePublish: [],
    });

    expect(changed.latestTag).toBe("fynpo-rel-20260816-deadbeef");
    // the boundary held: only the package touched after the merge is changed
    expect(changed.pkgs).toEqual(["lib-b"]);
  });

  it("says why it settled for a tag off the first-parent line", () => {
    warn.mockClear();
    getUpdatedPackages(graph, { cwd: dir, fynpoRc: {}, versionLockMap: {}, forcePublish: [] });

    const said = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(said).toContain("fynpo-rel-20260816-deadbeef");
    expect(said).toContain("first-parent");
  });
});

describe("release tag on a branch that does not describe HEAD (FPO-46)", () => {
  let dir: string;
  let graph: FynpoDepGraph;

  beforeAll(async () => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-fp-off-"));
    git(dir, "init", "-q", "-b", "main");
    writePkg(dir, "lib-a");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "init");

    // tag lives on a branch that was never merged, so it describes nothing from main
    git(dir, "checkout", "-q", "-b", "abandoned");
    writePkg(dir, "lib-a", { description: "abandoned" });
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "abandoned work");
    git(dir, "tag", "fynpo-rel-20260816-abandoned");
    git(dir, "checkout", "-q", "main");

    graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
  });

  afterAll(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to no boundary and says so, rather than throwing", () => {
    warn.mockClear();
    const changed: any = getUpdatedPackages(graph, {
      cwd: dir,
      fynpoRc: {},
      versionLockMap: {},
      forcePublish: [],
    });

    expect(changed.latestTag).toBeUndefined();
    expect(changed.pkgs).toEqual(["lib-a"]);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("no release boundary");
  });
});
