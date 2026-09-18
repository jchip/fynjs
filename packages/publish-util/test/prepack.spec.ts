import { describe, it, expect, vi, afterEach } from "vitest";
import { prePackObj } from "../src/prepack.js";

describe("prePackObj", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports removed fields and installs a missing postpack script by default", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const pkg = { name: "test-pkg", custom: true, publishUtil: {} };

    prePackObj(pkg);

    expect(pkg).toEqual({ name: "test-pkg", scripts: { postpack: "publish-util-postpack" } });
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][1]).toBe("custom");
  });

  it("keeps selected fields after renaming and removing fields", () => {
    const pkg = { name: "test-pkg", source: "./dist/index.js", custom: { keep: true, remove: true } };

    prePackObj(pkg, {
      rename: { source: "main" },
      keep: [{ custom: ["keep"] }],
      remove: ["custom"],
      autoPostPack: false,
      silent: true
    });

    expect(pkg).toEqual({ name: "test-pkg", main: "./dist/index.js", custom: { keep: true } });
  });

  it("removes its own prepack script while preserving an existing postpack", () => {
    const pkg = { scripts: { prepack: "publish-util-prepack", postpack: "custom-postpack" } };

    prePackObj(pkg, { silent: true });

    expect(pkg.scripts).toEqual({ postpack: "custom-postpack" });
  });

  it("preserves custom prepack scripts and honors disabled automatic postpack", () => {
    const pkg = { scripts: { prepack: "custom-prepack" } };

    prePackObj(pkg, { autoPostPack: false, silent: true });

    expect(pkg.scripts).toEqual({ prepack: "custom-prepack" });
  });

  it("should keep standard consumer-facing fields and strip the rest", () => {
    const pkg: Record<string, unknown> = {
      name: "test-pkg",
      version: "1.0.0",
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      typings: "./dist/index.d.ts",
      typesVersions: { "*": { "*": ["dist/*"] } },
      sideEffects: false,
      exports: { ".": "./dist/index.js" },
      unpkg: "./dist/index.umd.js",
      jsdelivr: "./dist/index.umd.js",
      libc: ["glibc"],
      bundleDependencies: ["foo"],
      scripts: { postpack: "publish-util-postpack" },
      dependencies: { foo: "^1.0.0" },
      peerDependencies: { react: ">=18" },
      peerDependenciesMeta: { react: { optional: true } },
      devDependencies: { vitest: "^3.0.0" },
      prettier: { printWidth: 100 },
      nyc: { reporter: ["lcov"] },
      "@xarc/module-dev": { features: [] },
      fyn: { dependencies: {} },
    };

    prePackObj(pkg, { silent: true });

    expect(pkg.sideEffects).toBe(false);
    expect(pkg.typings).toBe("./dist/index.d.ts");
    expect(pkg.typesVersions).toEqual({ "*": { "*": ["dist/*"] } });
    expect(pkg.unpkg).toBe("./dist/index.umd.js");
    expect(pkg.jsdelivr).toBe("./dist/index.umd.js");
    expect(pkg.libc).toEqual(["glibc"]);
    expect(pkg.bundleDependencies).toEqual(["foo"]);
    expect(pkg.peerDependencies).toEqual({ react: ">=18" });
    expect(pkg.peerDependenciesMeta).toEqual({ react: { optional: true } });

    expect(pkg.devDependencies).toEqual({ vitest: "^3.0.0" });
    expect(pkg).not.toHaveProperty("prettier");
    expect(pkg).not.toHaveProperty("nyc");
    expect(pkg).not.toHaveProperty("@xarc/module-dev");
    expect(pkg).not.toHaveProperty("fyn");
  });

  it("should keep all dependency sections by default", () => {
    const pkg: Record<string, unknown> = {
      name: "test-pkg",
      version: "1.0.0",
      dependencies: { foo: "^1.0.0" },
      devDependencies: { vitest: "^3.0.0" },
      peerDependencies: { react: ">=18" },
      optionalDependencies: { fsevents: "^2.0.0" },
    };

    prePackObj(pkg, { silent: true });

    expect(pkg.dependencies).toEqual({ foo: "^1.0.0" });
    expect(pkg.devDependencies).toEqual({ vitest: "^3.0.0" });
    expect(pkg.peerDependencies).toEqual({ react: ">=18" });
    expect(pkg.optionalDependencies).toEqual({ fsevents: "^2.0.0" });
  });

  it("should still remove devDependencies when config asks for it", () => {
    const pkg: Record<string, unknown> = {
      name: "test-pkg",
      version: "1.0.0",
      dependencies: { foo: "^1.0.0" },
      devDependencies: { vitest: "^3.0.0" },
    };

    prePackObj(pkg, { silent: true, remove: ["devDependencies"] });

    expect(pkg).not.toHaveProperty("devDependencies");
    expect(pkg.dependencies).toEqual({ foo: "^1.0.0" });
  });

  it("should still remove dependencies when config asks for it", () => {
    const pkg: Record<string, unknown> = {
      name: "test-pkg",
      version: "1.0.0",
      dependencies: { foo: "^1.0.0" },
      devDependencies: { vitest: "^3.0.0" },
    };

    prePackObj(pkg, { silent: true, remove: ["dependencies"] });

    expect(pkg).not.toHaveProperty("dependencies");
    expect(pkg.devDependencies).toEqual({ vitest: "^3.0.0" });
  });

  it("should remove workspaces by default", () => {
    const pkg: Record<string, unknown> = {
      name: "test-pkg",
      version: "1.0.0",
      devDependencies: { vitest: "^3.0.0" },
      workspaces: ["packages/*"],
    };

    prePackObj(pkg, { silent: true });

    expect(pkg).not.toHaveProperty("workspaces");
    expect(pkg.devDependencies).toEqual({ vitest: "^3.0.0" });
  });

  it("should keep everything when removeExtraKeys is false", () => {
    const pkg: Record<string, unknown> = {
      name: "test-pkg",
      version: "1.0.0",
      devDependencies: { vitest: "^3.0.0" },
      workspaces: ["packages/*"],
      nyc: { reporter: ["lcov"] },
    };

    prePackObj(pkg, { silent: true, removeExtraKeys: false });

    expect(pkg.devDependencies).toEqual({ vitest: "^3.0.0" });
    expect(pkg.workspaces).toEqual(["packages/*"]);
    expect(pkg.nyc).toEqual({ reporter: ["lcov"] });
  });
});
