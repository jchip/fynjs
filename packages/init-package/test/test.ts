import { runInitPackage, safeDeepMerge, generateNpmPackage } from "../src/index.js";
import { describe, it, expect } from "vitest";

describe("init-package", function () {
  it("should have runInitPackage", () => {
    expect(runInitPackage).toBeInstanceOf(Function);
  });

  describe("safeDeepMerge", () => {
    it("should merge nested objects and replace arrays", () => {
      const target = { a: { b: 1, arr: [1, 2] }, c: "keep" };
      const source = { a: { b: 2, arr: [3] }, d: "new" };
      const result = safeDeepMerge(target, source);

      expect(result).toEqual({
        a: { b: 2, arr: [3] },
        c: "keep",
        d: "new",
      });
      // Ensure target was mutated
      expect(result).toBe(target);
    });

    it("should guard against prototype pollution", () => {
      const target: any = {};
      const payload = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}}');
      safeDeepMerge(target, payload);
      expect(({} as any).polluted).toBeUndefined();
    });
  });

  describe("generateNpmPackage", () => {
    it("generates package in yes mode", async () => {
      const template = {
        name: "default-name",
        version: "1.0.0",
        scripts: { test: "echo test" },
        files: ["src"],
      };
      const exist = {
        name: "@scope/my-pkg",
        version: "2.0.0",
        files: ["dist"],
        publishConfig: { access: "restricted" },
      };
      const pkg = await generateNpmPackage(true, template, exist);
      expect(pkg.name).toBe("@scope/my-pkg");
      expect(pkg.version).toBe("2.0.0");
      expect(pkg.files).toEqual(["dist"]);
      expect(pkg.publishConfig).toEqual({ access: "restricted" });
    });
  });
});
