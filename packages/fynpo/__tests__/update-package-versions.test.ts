import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock logger
vi.mock("../src/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { updatePackageVersions } from "../src/utils/update-package-versions";
import { FynpoDepGraph } from "@fynpo/base";
import path from "path";
import fs from "fs";
import os from "os";

const writeJson = (file: string, obj: any) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
};

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf-8"));

describe("updatePackageVersions", () => {
  let cwd: string;

  const pkgAFile = () => path.join(cwd, "packages/pkg-a/package.json");
  const pkgBFile = () => path.join(cwd, "packages/pkg-b/package.json");

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fynpo-upv-"));
    writeJson(path.join(cwd, "package.json"), { name: "root", version: "0.0.0", private: true });
    writeJson(pkgAFile(), { name: "pkg-a", version: "1.0.0" });
    writeJson(pkgBFile(), {
      name: "pkg-b",
      version: "1.0.0",
      dependencies: { "pkg-a": "^1.0.0" },
    });
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const makeCollated = async () => {
    const graph = new FynpoDepGraph({ cwd, patterns: ["packages/*"] });
    await graph.resolve();
    return { opts: { graph, cwd, fynpoRc: {} } };
  };

  it("writes bumped versions to package.json files sourced from the dep graph", async () => {
    const collated = await makeCollated();
    const versions = { "pkg-a": "2.0.0", "pkg-b": "1.1.0" };
    const tags = ["pkg-a@2.0.0", "pkg-b@1.1.0"];

    const result: any = await updatePackageVersions({ versions, tags, collated });

    // regression: previously read the never-populated collated.opts.data and was a no-op
    expect(readJson(pkgAFile()).version).toBe("2.0.0");
    expect(readJson(pkgBFile()).version).toBe("1.1.0");
    // a dependent's semver range on a bumped dep is updated (preserving ^)
    expect(readJson(pkgBFile()).dependencies["pkg-a"]).toBe("^2.0.0");
    // returns the changed package.json paths + passes tags through
    expect(result.packages).toEqual(
      expect.arrayContaining([
        path.join("packages", "pkg-a", "package.json"),
        path.join("packages", "pkg-b", "package.json"),
      ])
    );
    expect(result.tags).toBe(tags);
  });

  it("skips a package whose new version equals its current version", async () => {
    const collated = await makeCollated();

    const result: any = await updatePackageVersions({
      versions: { "pkg-a": "1.0.0" },
      tags: [],
      collated,
    });

    expect(readJson(pkgAFile()).version).toBe("1.0.0");
    expect(result.packages).toEqual([]);
  });

  it("does not touch package.json for packages not in the versions map", async () => {
    const collated = await makeCollated();

    await updatePackageVersions({
      versions: { "pkg-a": "2.0.0" },
      tags: ["pkg-a@2.0.0"],
      collated,
    });

    expect(readJson(pkgAFile()).version).toBe("2.0.0");
    // pkg-b was not bumped - it keeps its original version and dep range
    expect(readJson(pkgBFile()).version).toBe("1.0.0");
    expect(readJson(pkgBFile()).dependencies["pkg-a"]).toBe("^1.0.0");
  });

  it("rewrites a private package's ranges on bumped packages without bumping it", async () => {
    // private packages are absent from `versions` (nothing publishes them), but their ranges
    // still have to track the workspace or the next install can't resolve them - FPO-52
    const pkgPFile = path.join(cwd, "packages/pkg-p/package.json");
    writeJson(pkgPFile, {
      name: "pkg-p",
      version: "0.1.0",
      private: true,
      dependencies: { "pkg-a": "^1.0.0" },
      devDependencies: { "pkg-b": "~1.0.0" },
    });

    const collated = await makeCollated();
    const result: any = await updatePackageVersions({
      versions: { "pkg-a": "2.0.0", "pkg-b": "1.1.0" },
      tags: [],
      collated,
    });

    const pkgP = readJson(pkgPFile);
    expect(pkgP.dependencies["pkg-a"]).toBe("^2.0.0");
    expect(pkgP.devDependencies["pkg-b"]).toBe("~1.1.0");
    // not published, so nothing about the package itself moves
    expect(pkgP.version).toBe("0.1.0");
    expect(pkgP.publishConfig).toBeUndefined();
    // and the file is staged so the release commit carries it
    expect(result.packages).toEqual(
      expect.arrayContaining([path.join("packages", "pkg-p", "package.json")])
    );
  });

  it("leaves a private package alone when it depends on nothing that bumped", async () => {
    const pkgPFile = path.join(cwd, "packages/pkg-p/package.json");
    writeJson(pkgPFile, { name: "pkg-p", version: "0.1.0", private: true });

    const collated = await makeCollated();
    const result: any = await updatePackageVersions({
      versions: { "pkg-a": "2.0.0" },
      tags: [],
      collated,
    });

    expect(result.packages).not.toContain(path.join("packages", "pkg-p", "package.json"));
  });

  it("returns undefined when there are no versions", async () => {
    const collated = await makeCollated();
    const result = await updatePackageVersions({ versions: {}, tags: [], collated });
    expect(result).toBeUndefined();
  });
});
