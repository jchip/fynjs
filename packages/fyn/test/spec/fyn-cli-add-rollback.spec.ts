import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "../../lib/util/file-ops";
import Path from "path";
import Os from "os";
import FynCli from "../../cli/fyn-cli";
import fyntil from "../../lib/util/fyntil";

describe("fyn add rollback on install failure", () => {
  let tmpDir: string;
  let pkgFile: string;

  beforeEach(async () => {
    tmpDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), "fyn-add-test-"));
    pkgFile = Path.join(tmpDir, "package.json");
  });

  afterEach(async () => {
    await Fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("rolls back package.json when install fails after add", async () => {
    const originalPkg = JSON.stringify({ name: "my-app", version: "1.0.0" }, null, 2) + "\n";
    await Fs.promises.writeFile(pkgFile, originalPkg);

    const cli = new FynCli({ opts: { cwd: tmpDir }, noStartupInfo: true } as any);
    (cli as any).fyn._pkgFile = pkgFile;
    (cli as any).fyn._cwd = tmpDir;
    (cli as any).fyn._pkg = JSON.parse(originalPkg);

    // Mock fetchLocalItem / fetchMeta so _add thinks it found the package
    (cli as any).fyn._pkgSrcMgr = {
      getSemverAsFilepath: () => false,
      fetchLocalItem: async () => null,
      fetchMeta: async () => ({
        "dist-tags": { latest: "1.0.0" },
        versions: { "1.0.0": {} }
      })
    };

    const added = await (cli as any)._add({
      packages: ["dummy-pkg"]
    });
    expect(added).toBe(true);

    // Check that package.json on disk was modified by _add
    const modifiedPkg = JSON.parse(await Fs.promises.readFile(pkgFile, "utf8"));
    expect(modifiedPkg.dependencies).toHaveProperty("dummy-pkg");

    // Simulate install failure by calling fail() with the rollback hook attached
    const savedExit = fyntil.exit;
    (fyntil as any).exit = () => {};
    try {
      await cli.fail("install failed", new Error("gate failure"));
    } finally {
      (fyntil as any).exit = savedExit;
    }

    // After fail(), package.json must be restored to original
    const restoredPkg = await Fs.promises.readFile(pkgFile, "utf8");
    expect(restoredPkg).toBe(originalPkg);
  });

  it("rolls back package.json when install fails after remove", async () => {
    const originalPkg = JSON.stringify(
      { name: "my-app", version: "1.0.0", dependencies: { "dummy-pkg": "^1.0.0" } },
      null,
      2
    ) + "\n";
    await Fs.promises.writeFile(pkgFile, originalPkg);

    const cli = new FynCli({ opts: { cwd: tmpDir }, noStartupInfo: true } as any);
    (cli as any).fyn._pkgFile = pkgFile;
    (cli as any).fyn._cwd = tmpDir;
    (cli as any).fyn._pkg = JSON.parse(originalPkg);

    const removed = (cli as any)._remove({
      packages: ["dummy-pkg"]
    });
    expect(removed).toBe(true);

    // Check that package.json on disk was modified by _remove
    const modifiedPkg = JSON.parse(await Fs.promises.readFile(pkgFile, "utf8"));
    expect(modifiedPkg.dependencies).toBeUndefined();

    // Simulate install failure by calling fail()
    const savedExit = fyntil.exit;
    (fyntil as any).exit = () => {};
    try {
      await cli.fail("install failed", new Error("script error"));
    } finally {
      (fyntil as any).exit = savedExit;
    }

    // After fail(), package.json must be restored to original
    const restoredPkg = await Fs.promises.readFile(pkgFile, "utf8");
    expect(restoredPkg).toBe(originalPkg);
  });
});
