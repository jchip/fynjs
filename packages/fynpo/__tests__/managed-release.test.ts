import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import { execFileSync } from "child_process";
import { FynpoDepGraph } from "@fynpo/base";

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { getUpdatedPackages } from "../src/utils/get-updated-packages";
import { determinePackageVersions } from "../src/utils/get-package-version";
import { updateChangelog } from "../src/utils/update-changelog-file";
import { updatePackageVersions } from "../src/utils/update-package-versions";

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=fynpo test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" }
  ).trim();

describe("releasing a managed package with a higher-version unmanaged duplicate", () => {
  let cwd: string;
  let graph: FynpoDepGraph;
  let since: string;
  const widgetPath = "packages/widget";
  const fixturePath = "packages/widget/test/fixture";

  const writePackage = (dir: string, pkg: Record<string, unknown>) => {
    const absDir = Path.join(cwd, dir);
    Fs.mkdirSync(absDir, { recursive: true });
    Fs.writeFileSync(Path.join(absDir, "package.json"), JSON.stringify(pkg, null, 2));
  };

  const readPackage = (dir: string) =>
    JSON.parse(Fs.readFileSync(Path.join(cwd, dir, "package.json"), "utf8"));

  const makeCollated = () => ({
    opts: {
      cwd,
      graph,
      fynpoRc: {},
      versionLockMap: {},
      changeLogFile: Path.join(cwd, "CHANGELOG.md"),
      changeLog: "",
    },
    realPackages: ["widget"],
    packages: { widget: { msgs: [{ m: "fix: update widget", id: "abc123" }] } },
    changed: { forceUpdated: [], verLocks: {}, depMap: {} },
    samples: {},
    others: {},
    files: {},
  });

  beforeEach(async () => {
    const tempDir = Path.resolve(import.meta.dirname, "../../../.temp");
    Fs.mkdirSync(tempDir, { recursive: true });
    cwd = Fs.mkdtempSync(Path.join(tempDir, "fynpo-managed-release-"));
    writePackage("", { name: "root", version: "0.0.0", private: true });
    writePackage(widgetPath, { name: "widget", version: "1.0.0" });
    writePackage(fixturePath, { name: "widget", version: "9.0.0" });
    writePackage("packages/consumer", {
      name: "consumer",
      version: "1.0.0",
      dependencies: { widget: "^1.0.0" },
    });
    git(cwd, "init", "-q", "-b", "main");
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", "initial packages");
    since = git(cwd, "rev-parse", "HEAD");
    Fs.writeFileSync(Path.join(cwd, widgetPath, "index.js"), "module.exports = 1;\n");
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", "fix: update widget");

    graph = new FynpoDepGraph({
      cwd,
      packages: {
        autoSearch: { stopOnPackageJsonFound: false },
        include: ["packages/*"],
      },
    });
    await graph.resolve();
  });

  afterEach(() => {
    Fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("detects production edits and includes dependents of the managed package", () => {
    const changed = getUpdatedPackages(graph, {
      cwd,
      since,
      fynpoRc: {},
      versionLockMap: {},
    });

    expect(changed.pkgs).toEqual(["widget", "consumer"]);
    expect(changed.depMap).toEqual({ consumer: ["widget"] });
    expect(changed.depSections).toEqual({ consumer: { widget: "dep" } });
  });

  it("bumps the managed version while preserving semver lookup of the unmanaged version", async () => {
    expect(graph.resolvePackage("widget", "^9.0.0").path).toBe(fixturePath);
    expect(graph.resolvePackage("widget", "^1.0.0").path).toBe(widgetPath);

    const collated = await determinePackageVersions(makeCollated());

    expect(collated.packages.widget.version).toBe("1.0.0");
    expect(collated.packages.widget.newVersion).toBe("1.0.1");
  });

  it("does not release a managed package for its unmanaged duplicate's dependency", async () => {
    writePackage("packages/consumer", { name: "consumer", version: "1.0.0" });
    writePackage("packages/consumer/test/fixture", {
      name: "consumer",
      version: "9.0.0",
      dependencies: { widget: "^1.0.0" },
    });
    graph = new FynpoDepGraph({
      cwd,
      packages: {
        autoSearch: { stopOnPackageJsonFound: false },
        include: ["packages/*"],
      },
    });
    await graph.resolve();

    const changed = getUpdatedPackages(graph, {
      cwd,
      since,
      fynpoRc: {},
      versionLockMap: {},
    });

    expect(changed.pkgs).toEqual(["widget"]);
    expect(changed.depMap).toEqual({});
  });

  it("retains the managed package in the generated changelog and release tags", async () => {
    const collated = await determinePackageVersions(makeCollated());
    const release = await updateChangelog(collated);

    expect(release.versions).toEqual({ widget: "1.0.1" });
    expect(release.tags).toEqual(["widget@1.0.1"]);
    expect(Fs.readFileSync(collated.opts.changeLogFile, "utf8")).toContain(
      "`widget@1.0.1` `(1.0.0 => 1.0.1)`"
    );
  });

  it("writes the bumped managed manifest and leaves the duplicate version unchanged", async () => {
    const result = await updatePackageVersions({
      versions: { widget: "1.0.1", consumer: "1.0.1" },
      tags: ["widget@1.0.1", "consumer@1.0.1"],
      collated: makeCollated(),
    });

    expect(readPackage(widgetPath).version).toBe("1.0.1");
    expect(readPackage(fixturePath).version).toBe("9.0.0");
    expect(readPackage("packages/consumer")).toMatchObject({
      version: "1.0.1",
      dependencies: { widget: "^1.0.1" },
    });
    expect(result.packages).toContain(Path.join(widgetPath, "package.json"));
    expect(result.packages).not.toContain(Path.join(fixturePath, "package.json"));
  });

  it("does not bump unmanaged-only members of an indirect version lock", async () => {
    writePackage("packages/consumer/test/locked-fixture", {
      name: "locked-fixture",
      version: "1.0.0",
    });
    graph = new FynpoDepGraph({
      cwd,
      packages: {
        autoSearch: { stopOnPackageJsonFound: false },
        include: ["packages/*"],
      },
    });
    await graph.resolve();
    const input = makeCollated();
    input.opts.versionLockMap = { consumer: ["consumer", "locked-fixture"] };
    input.changed.depMap = { consumer: ["widget"] };

    const collated = await determinePackageVersions(input);

    expect(collated.indirectBumps).toEqual(["consumer"]);
    expect(collated.packages.consumer.newVersion).toBe("1.0.1");
    expect(collated.packages["locked-fixture"]).toBeUndefined();
  });
});
