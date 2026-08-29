import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prepare } from "../src/prepare";
import path from "path";
import fs from "fs";
import shcmd from "shcmd";

describe("fynpo prepare", () => {
  const dir = path.join(__dirname, "../test/sample");
  const data = {
    packages: {
      pkg1: {
        name: "pkg1",
        version: "1.0.0",
        path: path.join(dir, "packages/pkg1/package.json"),
      },
      pkg2: {
        name: "pkg2",
        version: "1.0.0",
        path: path.join(dir, "packages/pkg2/package.json"),
      },
    },
  };

  const fynpoConfigFile = path.join(dir, "fynpo.json");
  let prepare;
  beforeAll(() => {
    fs.writeFileSync(fynpoConfigFile, "{}\n");
    prepare = new Prepare({ cwd: dir, tag: true }, data);
  });

  afterAll(() => {
    shcmd.rm("-f", fynpoConfigFile);
  });

  it("should initialize prepare class", () => {
    expect(prepare._data).toStrictEqual(data);
    expect(prepare._cwd).toStrictEqual(dir);
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

  it("read changelog", () => {
    prepare.readChangelog();
    expect(prepare._tags).toStrictEqual(["pkg1@3.0.1", "pkg2@2.0.0"]);
    expect(prepare._versions).toStrictEqual({ pkg1: "3.0.1", pkg2: "2.0.0" });
  });
});
