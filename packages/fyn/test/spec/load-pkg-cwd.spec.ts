import { describe, it, beforeEach, afterEach, expect } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import Fyn from "../../lib/fyn";
import fynTil from "../../lib/util/fyntil";

//
// FPM-74: fyn searches parent directories for the nearest package.json and makes that
// directory the install target.  That is a convenience for a bare `fyn install` typed
// from a subdirectory, but when the caller passed --cwd it silently overrides an explicit
// instruction - and hands the ancestor's directory to lifecycle scripts as INIT_CWD,
// which is how a postinstall came to rewrite an unrelated package's manifest (FPM-66).
//
describe("loadPkg cwd handling", () => {
  let root: string;
  let subDir: string;
  let saveExit;

  beforeEach(() => {
    // realpath: macOS tmpdir is a symlink, and the walk-up compares real paths
    root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-load-pkg-")));
    subDir = Path.join(root, "sub", "deeper");
    Fs.mkdirSync(subDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(root, "package.json"),
      JSON.stringify({ name: "the-ancestor", version: "1.0.0" }, null, 2)
    );

    saveExit = fynTil.exit;
    fynTil.exit = err => {
      throw err instanceof Error ? err : new Error(`exit ${err}`);
    };
  });

  afterEach(() => {
    fynTil.exit = saveExit;
    Fs.rmSync(root, { recursive: true, force: true });
  });

  const makeFyn = (cwd: string, cliSource = {}) =>
    new Fyn({ opts: { cwd, targetDir: "node_modules" }, _cliSource: cliSource, _fynpo: false });

  it("searches up when cwd was not given explicitly", async () => {
    const fyn = makeFyn(subDir);

    await fyn.loadPkg();

    expect(fyn["_pkgFile"]).toBe(Path.join(root, "package.json"));
    expect(fyn["_cwd"]).toBe(root);
  });

  it("searches up when cwd came from the default source", async () => {
    const fyn = makeFyn(subDir, { cwd: "default" });

    await fyn.loadPkg();

    expect(fyn["_pkgFile"]).toBe(Path.join(root, "package.json"));
    expect(fyn["_cwd"]).toBe(root);
  });

  it("fails instead of retargeting an ancestor when cwd came from the CLI", async () => {
    const fyn = makeFyn(subDir, { cwd: "cli" });

    await expect(fyn.loadPkg()).rejects.toThrow();

    // it looked only where it was told to look, and never moved the install target
    expect(fyn["_pkgFile"]).toBe(Path.join(subDir, "package.json"));
    expect(fyn["_cwd"]).toBe(subDir);
  });

  it("uses an explicit cwd that does have a package.json", async () => {
    Fs.writeFileSync(
      Path.join(subDir, "package.json"),
      JSON.stringify({ name: "the-target", version: "2.0.0" }, null, 2)
    );
    const fyn = makeFyn(subDir, { cwd: "cli" });

    await fyn.loadPkg();

    expect(fyn["_pkgFile"]).toBe(Path.join(subDir, "package.json"));
    expect(fyn["_cwd"]).toBe(subDir);
    expect(fyn._pkg.name).toBe("the-target");
  });
});
