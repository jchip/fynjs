import { describe, it, expect } from "vitest";
import { sortObjKeys, sortPackageDeps, merge } from "../src/utils.js";

describe("utils", () => {
  describe("sortObjKeys", () => {
    it("should sort keys in alphabetical order", () => {
      const input = { z: 1, a: 2, m: 3, c: 4 };
      const output = sortObjKeys(input);
      expect(Object.keys(output)).toEqual(["a", "c", "m", "z"]);
      expect(output).toEqual({ a: 2, c: 4, m: 3, z: 1 });
    });

    it("should handle empty object", () => {
      expect(sortObjKeys({})).toEqual({});
    });
  });

  describe("sortPackageDeps", () => {
    it("should sort dependencies and omit '-' values", () => {
      const pkg = {
        dependencies: {
          zebra: "^1.0.0",
          apple: "^2.0.0",
          banana: "-",
        },
        devDependencies: {
          vitest: "^5.0.0",
          chalk: "^4.0.0",
        },
      };

      sortPackageDeps(pkg);

      expect(Object.keys(pkg.dependencies)).toEqual(["apple", "zebra"]);
      expect(pkg.dependencies).toEqual({ apple: "^2.0.0", zebra: "^1.0.0" });
      expect(Object.keys(pkg.devDependencies)).toEqual(["chalk", "vitest"]);
    });
  });

  describe("merge", () => {
    it("should shallow merge simple objects", () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = merge(target, source);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
      expect(result).toBe(target);
    });

    it("should deep merge nested objects", () => {
      const target = { scripts: { test: "run test", build: "run build" }, num: 1 };
      const source = { scripts: { prepare: "husky install", test: "vitest" }, extra: "yes" };
      const result = merge(target, source);
      expect(result).toEqual({
        scripts: { test: "vitest", build: "run build", prepare: "husky install" },
        num: 1,
        extra: "yes",
      });
    });

    it("should merge multiple sources in order", () => {
      const base = { a: { x: 1 }, b: 2 };
      const s1 = { a: { y: 2 }, c: 3 };
      const s2 = { a: { z: 3, x: 10 }, d: 4 };
      const result = merge({}, base, s1, s2);
      expect(result).toEqual({
        a: { x: 10, y: 2, z: 3 },
        b: 2,
        c: 3,
        d: 4,
      });
    });

    it("should ignore null and non-object sources", () => {
      const target = { a: 1 };
      expect(merge(target, null, undefined, "str", 123)).toEqual({ a: 1 });
    });
  });
});
