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
    debug: vi.fn()
  }
}));

const execSync = vi.fn();
vi.mock("../src/child-process", () => ({
  execSync: (...args: any[]) => execSync(...args)
}));

import { determinePackageVersions } from "../src/utils/get-package-version";

const writeFixture = (fixture: Record<string, any>): string => {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-lock-indirect-"));
  for (const [name, extra] of Object.entries(fixture)) {
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
 * Only `lib` has commits of its own, so it is the sole real package - every other package
 * reaches the release set through the dependency cascade and the lock, which is the point.
 */
const makeCollated = (graph: FynpoDepGraph, lockGroup: string[], dependents: string[]) => ({
  opts: {
    graph,
    fynpoRc: {},
    versionLockMap: lockGroup.reduce((acc: any, name) => {
      acc[name] = lockGroup;
      return acc;
    }, {}),
    lockAll: false
  },
  changed: {
    pkgs: ["lib"],
    verLocks: {},
    forceUpdated: [],
    depMap: Object.fromEntries(dependents.map((name) => [name, ["lib"]])),
    depSections: Object.fromEntries(dependents.map((name) => [name, { lib: "dep" }]))
  },
  realPackages: ["lib"],
  packages: {
    lib: { msgs: [{ m: "lib: fix a thing" }] }
  }
});

/**
 * FPO-57. The shape of the fyn / fynpo / fynpo-cli release that exposed this:
 *
 *   lib          <- the only package with its own commits
 *   tool-a       <- depends on lib, so it bumps *indirectly*
 *   tool-b       <- depends on lib, so it bumps *indirectly*
 *   tool-cli     <- no commits, no dep on lib; only the version lock ties it in
 *
 * All three tools are one version-lock group. When a lock member moves purely as a
 * dependent, the indirect path runs - and it used to collect the package that *had* the
 * lock rather than the member it pulled in, so tool-cli was never released and tool-a /
 * tool-b were each pushed onto indirectBumps twice.
 */
describe("version locks on indirect bumps (FPO-57)", () => {
  const FIXTURE = {
    lib: {},
    "tool-a": { dependencies: { lib: "^1.0.0" } },
    "tool-b": { dependencies: { lib: "^1.0.0" } },
    "tool-cli": {}
  };
  const LOCK_GROUP = ["tool-a", "tool-b", "tool-cli"];

  let dir: string;
  let collated: any;

  beforeAll(async () => {
    dir = writeFixture(FIXTURE);
    const graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
    execSync.mockReturnValue("");
    collated = await determinePackageVersions(makeCollated(graph, LOCK_GROUP, ["tool-a", "tool-b"]));
  });

  afterAll(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("should release every member of the lock group", () => {
    const released = [...collated.directBumps, ...collated.indirectBumps];
    expect(released).toContain("tool-cli");
    for (const name of LOCK_GROUP) {
      expect(collated.packages[name].newVersion).toBe("1.0.1");
    }
  });

  it("should not list any package more than once", () => {
    const released = [...collated.directBumps, ...collated.indirectBumps];
    expect(released.length).toBe(new Set(released).size);
  });

  it("should carry the locked-in member as an indirect bump, not a direct one", () => {
    // realPackages is for packages with commits of their own; a locked-in member listed
    // there would show up as a direct bump as well, and be released twice
    expect(collated.indirectBumps).toContain("tool-cli");
    expect(collated.directBumps).not.toContain("tool-cli");
  });

  it("should still bump the package that actually changed", () => {
    expect(collated.packages.lib.newVersion).toBe("1.0.1");
    expect(collated.directBumps).toContain("lib");
  });
});

/**
 * The same defect had a third face that the fixture above cannot see: the inner loop used
 * to `return true` after the *first* missing member, and there only one member was ever
 * missing. Here a single carrier - tool-a - has to pull in two members at once, so any
 * early exit from the inner loop drops tool-gui on the floor.
 */
describe("version locks pulling in several members at once (FPO-57)", () => {
  const FIXTURE = {
    lib: {},
    "tool-a": { dependencies: { lib: "^1.0.0" } },
    "tool-cli": {},
    "tool-gui": {}
  };
  const LOCK_GROUP = ["tool-a", "tool-cli", "tool-gui"];

  let dir: string;
  let collated: any;

  beforeAll(async () => {
    dir = writeFixture(FIXTURE);
    const graph = new FynpoDepGraph({ cwd: dir, patterns: ["packages/*"] });
    await graph.resolve();
    execSync.mockReturnValue("");
    collated = await determinePackageVersions(makeCollated(graph, LOCK_GROUP, ["tool-a"]));
  });

  afterAll(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("should pull in every missing member in one pass", () => {
    for (const name of LOCK_GROUP) {
      expect(collated.indirectBumps).toContain(name);
      expect(collated.packages[name].newVersion).toBe("1.0.1");
    }
  });

  it("should not list any package more than once", () => {
    const released = [...collated.directBumps, ...collated.indirectBumps];
    expect(released.length).toBe(new Set(released).size);
  });
});
