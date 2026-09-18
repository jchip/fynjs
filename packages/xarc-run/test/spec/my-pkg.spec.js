import { expect, vi } from "vitest";
import Fs from "fs";
import Path from "path";

describe("my-pkg", () => {
  it("should skip a nested manifest belonging to another package", async () => {
    const packageDir = Path.resolve(import.meta.dirname, "../..");
    const nestedManifest = Path.join(packageDir, "lib/package.json");
    const ownManifest = JSON.parse(Fs.readFileSync(Path.join(packageDir, "package.json"), "utf8"));
    const existsSync = Fs.existsSync;
    const readFileSync = Fs.readFileSync;
    const existsSpy = vi.spyOn(Fs, "existsSync").mockImplementation(file =>
      file === nestedManifest || existsSync(file)
    );
    const readSpy = vi.spyOn(Fs, "readFileSync").mockImplementation((file, ...args) =>
      file === nestedManifest
        ? JSON.stringify({ name: "another-package" })
        : readFileSync(file, ...args)
    );

    try {
      vi.resetModules();
      const { default: myPkg, myPkgDir } = await import("../../lib/my-pkg.js");

      expect(myPkg).toEqual(ownManifest);
      expect(myPkgDir).toBe(packageDir);
      expect(readSpy).toHaveBeenCalledWith(nestedManifest, "utf8");
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      vi.resetModules();
    }
  });
});
