import { describe, it, expect } from "vitest";
import { sortObjKeys, sortPackageDeps } from "../src/utils.js";

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

});
