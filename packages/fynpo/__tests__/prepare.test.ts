import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Prepare, prepareOutcome } from "../src/prepare";
import path from "path";
import fs from "fs";
import shell from "shelljs";
import { makeSampleFixture, removeSampleFixture } from "./helpers/sample-fixture";

describe("fynpo prepare", () => {
  // this suite writes fynpo.json into cwd, so use a private copy of the sample - FPO-14
  const dir = makeSampleFixture("prepare");
  // Prepare now takes a FynpoDepGraph, so this is `packages.byName` shaped: one array of
  // FynpoPackageInfo per name (FJM-25).
  const graph = {
    packages: {
      byName: {
        pkg1: [
          {
            name: "pkg1",
            version: "1.0.0",
            path: path.join(dir, "packages/pkg1/package.json"),
          },
        ],
        pkg2: [
          {
            name: "pkg2",
            version: "1.0.0",
            path: path.join(dir, "packages/pkg2/package.json"),
          },
        ],
      },
    },
  };

  const fynpoConfigFile = path.join(dir, "fynpo.json");
  let prepare;
  beforeAll(() => {
    fs.writeFileSync(fynpoConfigFile, "{}\n");
    prepare = new Prepare({ cwd: dir, tag: true }, graph);
  });

  afterAll(() => {
    shell.rm("-f", fynpoConfigFile);
    removeSampleFixture(dir);
  });

  it("should initialize prepare class", () => {
    expect(prepare._graph).toStrictEqual(graph);
    expect(prepare._cwd).toStrictEqual(dir);
  });

  it("flattens graph.packages.byName into one package per name", () => {
    // exec() matches changelog entries against names, so it needs a name-keyed view
    expect(Object.keys(prepare._packages)).toEqual(["pkg1", "pkg2"]);
    expect(prepare._packages.pkg1.version).toBe("1.0.0");
    expect(prepare._packages.pkg2.name).toBe("pkg2");
  });

  it("should update dependencies", () => {
    const pkg = {
      dependencies: {
        test: "1.0.0",
        test1: "2.1.0",
      },
    };
    prepare.updateDep(pkg, "test", "1.0.2");
    expect(pkg.dependencies.test).toEqual("1.0.2");
  });

  it("should report whether updateDep changed anything", () => {
    // exec() uses the return value to decide which non-released dependents to stage
    const pkg = {
      dependencies: { released: "^1.0.0" },
      devDependencies: { unrelated: "^2.0.0" },
    };

    expect(prepare.updateDep(pkg, "released", "1.1.0")).toBe(true);
    expect(pkg.dependencies.released).toEqual("^1.1.0");

    // same value again is not a change
    expect(prepare.updateDep(pkg, "released", "1.1.0")).toBe(false);
    // a name this package does not depend on is not a change
    expect(prepare.updateDep(pkg, "not-a-dep", "9.9.9")).toBe(false);
  });

  it("should keep the semver prefix and rewrite across all dep sections", () => {
    const pkg = {
      dependencies: { a: "^0.0.1" },
      devDependencies: { a: "~0.0.1" },
      peerDependencies: { a: "0.0.1" },
      optionalDependencies: { a: "^0.0.1" },
    };

    expect(prepare.updateDep(pkg, "a", "0.0.2")).toBe(true);
    // caret on a 0.0.x version means exactly that version, which is precisely why a
    // non-released dependent still has to be rewritten when its dep is published
    expect(pkg.dependencies.a).toEqual("^0.0.2");
    expect(pkg.devDependencies.a).toEqual("~0.0.2");
    expect(pkg.peerDependencies.a).toEqual("0.0.2");
    expect(pkg.optionalDependencies.a).toEqual("^0.0.2");
  });

  it("should leave non-numeric ranges alone", () => {
    const pkg = { dependencies: { a: "workspace:*", b: "file:../b" } };
    expect(prepare.updateDep(pkg, "a", "1.2.3")).toBe(false);
    expect(prepare.updateDep(pkg, "b", "1.2.3")).toBe(false);
    expect(pkg.dependencies.a).toEqual("workspace:*");
    expect(pkg.dependencies.b).toEqual("file:../b");
  });

  it("should set tag in publish config", () => {
    prepare._fynpoRc = {
      command: {
        publish: {
          tags: {
            next: {
              packages: {
                pkg1: {},
              },
            },
          },
        },
      },
    };

    const pkg = {
      pkgJson: {
        name: "pkg1",
        version: "2.0.0",
        publishConfig: {
          tag: "latest",
        },
      },
    };
    prepare._checkNupdateTag(pkg, "3.0.0");
    expect(pkg.pkgJson.version).toEqual("3.0.0");
    expect(pkg.pkgJson.publishConfig.tag).toEqual("next");
  });

  it("should set versionTagging as tag in publish config", () => {
    prepare._fynpoRc = {
      command: {
        publish: {
          versionTagging: {
            pkg1: {},
          },
        },
      },
    };

    const pkg = {
      pkgJson: {
        name: "pkg1",
        version: "2.0.0",
        publishConfig: {
          tag: "latest",
        },
      },
    };
    prepare._checkNupdateTag(pkg, "3.0.1");
    expect(pkg.pkgJson.version).toEqual("3.0.1");
    expect(pkg.pkgJson.publishConfig.tag).toEqual("ver3");
  });

  it("marks the publish commit selective when --only narrowed the release (FJM-153)", async () => {
    const selective = new Prepare({ cwd: dir, commit: true, tag: false, only: ["pkg1"] }, graph);
    selective._gitClean = true;
    const shSpy = vi.spyOn(selective, "_sh").mockResolvedValue("");

    await selective.commitAndTagUpdates(["package.json"]);

    expect(shSpy).toHaveBeenCalledWith(expect.stringContaining(`-m "[Publish][Selective]"`));

    vi.restoreAllMocks();
  });

  it("leaves the publish commit subject alone for a full release", async () => {
    const full = new Prepare({ cwd: dir, commit: true, tag: false }, graph);
    full._gitClean = true;
    const shSpy = vi.spyOn(full, "_sh").mockResolvedValue("");

    await full.commitAndTagUpdates(["package.json"]);

    expect(shSpy).toHaveBeenCalledWith(expect.stringContaining(`-m "[Publish]"`));
    expect(shSpy).not.toHaveBeenCalledWith(expect.stringContaining("[Selective]"));

    vi.restoreAllMocks();
  });

  it("read changelog", () => {
    prepare.readChangelog();
    expect(prepare._tags).toStrictEqual(["pkg1@3.0.1", "pkg2@2.0.0"]);
    expect(prepare._versions).toStrictEqual({ pkg1: "3.0.1", pkg2: "2.0.0" });
  });
});

describe("prepareOutcome (FPO-49)", () => {
  it("does not claim a commit that was skipped", () => {
    // --no-commit and a dirty tree both land here, right after commitAndTagUpdates warned
    const outcome = prepareOutcome(3, 5, false, 0);

    expect(outcome.level).toBe("warning");
    expect(outcome.message).not.toContain("committed and");
    expect(outcome.message).toContain("not committed");
    expect(outcome.message).toContain("3 package versions");
    expect(outcome.message).toContain("5 files");
  });

  it("does not claim updates when nothing was written", () => {
    // the changelog named versions the packages already had, so no file was staged
    const outcome = prepareOutcome(0, 0, false, 0);

    expect(outcome.level).toBe("warning");
    expect(outcome.message).toContain("Nothing to update");
    expect(outcome.message).not.toContain("Updated");
  });

  it("reports a real commit", () => {
    const outcome = prepareOutcome(2, 4, true, 0);

    expect(outcome.level).toBe("success");
    expect(outcome.message).toBe("Updated 2 package versions across 4 files and committed");
  });

  it("mentions tags only when tags were created", () => {
    expect(prepareOutcome(2, 2, true, 2).message).toContain("2 tags created");
    expect(prepareOutcome(2, 2, true, 0).message).not.toContain("tag");
  });

  it("counts one of something without an s", () => {
    expect(prepareOutcome(1, 1, true, 1).message).toBe(
      "Updated 1 package version across 1 file, committed and 1 tag created"
    );
  });

  it("still reports files staged for a dependency-range rewrite alone", () => {
    // a dependent not being released still gets its range pointed at what was
    const outcome = prepareOutcome(0, 3, true, 0);

    expect(outcome.level).toBe("success");
    expect(outcome.message).toContain("0 package versions across 3 files");
  });
});
