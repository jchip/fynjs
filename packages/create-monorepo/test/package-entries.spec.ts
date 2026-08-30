import { describe, it, expect } from "vitest";
import Fs from "fs";
import Path from "path";

// FPO-32: this package declared `main: "index.js"` with no such file. Nothing consulted it,
// so it went unnoticed - but it breaks `require("@fynjs/create-monorepo")` and misleads
// anyone reading the manifest. This package is CLI-only, so `bin` is the entry.
describe("package.json entry points (FPO-32)", () => {
  const pkgDir = Path.join(__dirname, "..");
  const pkg = JSON.parse(Fs.readFileSync(Path.join(pkgDir, "package.json"), "utf8"));

  it("declares no main, since this is a bin-only package", () => {
    expect(pkg.main).toBeUndefined();
  });

  it("points every bin at a file that exists", () => {
    const bins = Object.values<string>(pkg.bin || {});
    expect(bins.length).toBeGreaterThan(0);

    for (const bin of bins) {
      expect(Fs.existsSync(Path.join(pkgDir, bin)), `bin ${bin} does not exist`).toBe(true);
    }
  });

  it("resolves the directory require() that the bin actually uses", () => {
    // bin/create-monorepo.js does `require("../dist")`, which resolves via dist/index.js
    // regardless of `main` - that is why dropping `main` is safe here
    expect(Fs.existsSync(Path.join(pkgDir, "dist", "index.js"))).toBe(true);
  });
});
