import { runInitPackage, generateNpmPackage } from "../src/index.js";
import { describe, it, expect } from "vitest";

describe("init-package", function () {
  it("should have runInitPackage", () => {
    expect(runInitPackage).toBeInstanceOf(Function);
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
