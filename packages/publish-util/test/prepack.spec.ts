import { describe, it, expect } from "vitest";
import { prePackObj } from "../src/prepack.js";

describe("prePackObj", () => {
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
