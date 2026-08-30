import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { execFileSync } from "child_process";
import { FynpoDepGraph } from "@fynpo/base";

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { getUpdatedPackages } from "../src/utils/get-updated-packages";

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
 * Change detection used to compute the git pathspec with `Path.relative(cwd, pkg.path)`,
 * which resolves a relative `pkg.path` against **process.cwd()** rather than against `cwd`.
 * Running fynpo from anywhere but the monorepo root turned `packages/xaa` into
 * `packages/xaa/packages/xaa`, git matched nothing, and every package came back unchanged -
 * a clean "No changed packages!" on a repo full of unreleased work (FPO-47).
 *
 * This test never chdir's, so process.cwd() is the fynpo package while the repo under test
 * lives in a temp dir - exactly the mismatch that used to break it.
 */
describe("change detection with process.cwd() away from the repo (FPO-47)", () => {
  let dir: string;
  let graph: FynpoDepGraph;

  beforeAll(async () => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-subdir-"));

    git(dir, "init", "-q", "-b", "main");
    writePkg(dir, "touched");
    writePkg(dir, "untouched");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "init");
    git(dir, "tag", "fynpo-rel-20260816-baseline");

    writePkg(dir, "touched", { description: "changed after the release" });
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "touched: a change worth releasing");

    graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
  });

  afterAll(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("finds the changed package instead of reporting none", () => {
    expect(process.cwd()).not.toBe(dir);

    const changed: any = getUpdatedPackages(graph, {
      cwd: dir,
      fynpoRc: {},
      versionLockMap: {},
      forcePublish: [],
    });

    expect(changed.latestTag).toBe("fynpo-rel-20260816-baseline");
    expect(changed.pkgs).toEqual(["touched"]);
  });
});
