import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { FynpoDepGraph } from "@fynpo/base";

vi.mock("../src/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const execSync = vi.fn();
vi.mock("../src/child-process", () => ({
  execSync: (...args: any[]) => execSync(...args),
}));

import { getUpdatedPackages } from "../src/utils/get-updated-packages";
import { determinePackageVersions } from "../src/utils/get-package-version";

/**
 * A monorepo with one package everything hangs off of, reached three different ways:
 *
 *   lib-a          <- the one with the [maj] commit
 *   app-runtime    <- depends on lib-a  (dependencies)
 *   app-dev        <- devDepends on lib-a (build time only)
 *   loner          <- no local deps at all
 *
 * `loner` is the control: it depends on nothing and nothing depends on it, so no other
 * package's breaking change has any business moving its version.
 */
const FIXTURE = {
  "lib-a": {},
  "app-runtime": { dependencies: { "lib-a": "^1.0.0" } },
  "app-dev": { devDependencies: { "lib-a": "^1.0.0" } },
  loner: {},
};

const writeFixture = (): string => {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-cascade-"));
  for (const [name, extra] of Object.entries(FIXTURE)) {
    const pkgDir = Path.join(dir, "packages", name);
    Fs.mkdirSync(pkgDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(pkgDir, "package.json"),
      `${JSON.stringify({ name, version: "1.0.0", ...extra }, null, 2)}\n`
    );
  }
  return dir;
};

/**
 * The shape `determinePackageVersions` consumes, as `collateCommitsPackages` would hand it
 * over: every changed package is real (has its own commits), and only lib-a's is breaking.
 */
const makeCollated = (graph: FynpoDepGraph, changed: any, fynpoRc: any = {}) => ({
  opts: { graph, fynpoRc, versionLockMap: {}, lockAll: false },
  changed,
  realPackages: [...changed.pkgs],
  packages: changed.pkgs.reduce((acc: any, name: string) => {
    acc[name] = {
      msgs: [{ m: name === "lib-a" ? "lib-a: drop the old API [maj]" : `${name}: tidy up` }],
    };
    return acc;
  }, {}),
});

describe("version bumps with no release tag (FPO-44)", () => {
  let dir: string;
  let graph: FynpoDepGraph;

  beforeAll(async () => {
    dir = writeFixture();
    graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
    // no `fynpo-rel-*` tag exists yet - this repo has never had a full release
    execSync.mockReturnValue("");
  });

  afterAll(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  const changedNoTag = (opts: any = {}) =>
    getUpdatedPackages(graph, {
      cwd: dir,
      fynpoRc: {},
      versionLockMap: {},
      forcePublish: [],
      ...opts,
    }) as any;

  it("does not lock every package to every other one", () => {
    const changed = changedNoTag();

    expect(changed.pkgs.sort()).toEqual(["app-dev", "app-runtime", "lib-a", "loner"]);
    // the bug: `verLocks[name] = <every package>` made all four share one bump type
    for (const name of changed.pkgs) {
      expect(changed.verLocks[name]).toEqual([]);
    }
  });

  it("still locks everything together when lockAll is set", () => {
    const changed = changedNoTag({ lockAll: true });

    for (const name of changed.pkgs) {
      expect(changed.verLocks[name].sort()).toEqual(["app-dev", "app-runtime", "lib-a", "loner"]);
    }
  });

  it("keeps one [maj] commit from majoring a package it has nothing to do with", async () => {
    const collated: any = await determinePackageVersions(makeCollated(graph, changedNoTag()));

    expect(collated.packages["lib-a"].newVersion).toBe("2.0.0");
    expect(collated.packages.loner.newVersion).toBe("1.0.1");
  });

  it("still majors everything when lockAll asks for it", async () => {
    const changed = changedNoTag({ lockAll: true });
    const collated: any = await determinePackageVersions(makeCollated(graph, changed));

    expect(
      Object.fromEntries(Object.entries(collated.packages).map(([n, p]: any) => [n, p.newVersion]))
    ).toEqual({
      "lib-a": "2.0.0",
      loner: "2.0.0",
      "app-runtime": "2.0.0",
      "app-dev": "2.0.0",
    });
  });
});
