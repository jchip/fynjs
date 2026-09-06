import { describe, it, beforeEach, afterAll, expect } from "vitest";
import fs from "fs";
import path from "path";

import PkgBinLinkerWin32 from "../../lib/pkg-bin-linker-win32";

describe("pkg-bin-linker-win32", function () {
  const testDir = path.join(__dirname, "../.pkg-bin-linker-win32");
  const binDir = path.join(testDir, "bin");
  const target = path.join(testDir, "packages/g1/node_modules/.bin/foo");

  const cleanup = () => {
    fs.rmSync(testDir, { recursive: true, force: true });
  };

  beforeEach(() => {
    cleanup();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "");
  });

  afterAll(() => {
    cleanup();
  });

  it("should create and remove both shim files for explicit bin dirs", async () => {
    const linker = new PkgBinLinkerWin32({ binDir });
    const relTarget = path.relative(binDir, target);

    await linker.linkBinPath(target, "foo");

    expect(fs.readFileSync(path.join(binDir, "foo"), "utf8")).toContain(relTarget);
    expect(fs.readFileSync(path.join(binDir, "foo.cmd"), "utf8")).toContain(relTarget);
    expect(await linker.matchesBinPath("foo", target)).toBe(true);

    await linker.removeBinLink("foo");

    expect(fs.existsSync(path.join(binDir, "foo"))).toBe(false);
    expect(fs.existsSync(path.join(binDir, "foo.cmd"))).toBe(false);
  });

  it("_cleanLink keeps a live bin but removes one whose target is gone", async () => {
    const linker: any = new PkgBinLinkerWin32({ binDir });

    // live bin: target exists (created in beforeEach)
    await linker.linkBinPath(target, "foo");

    // stale bin: link it, then delete its target package
    const staleTarget = path.join(testDir, "packages/g2/node_modules/.bin/bar");
    fs.mkdirSync(path.dirname(staleTarget), { recursive: true });
    fs.writeFileSync(staleTarget, "");
    await linker.linkBinPath(staleTarget, "bar");
    fs.rmSync(path.join(testDir, "packages/g2"), { recursive: true, force: true });

    // live bin is kept
    expect(await linker._cleanLink("foo")).toBe(false);
    expect(fs.existsSync(path.join(binDir, "foo.cmd"))).toBe(true);

    // stale bin is removed (the base Fs.access check would wrongly keep the
    // regular-file wrapper because the wrapper itself still exists)
    expect(await linker._cleanLink("bar")).toBe(true);
    expect(fs.existsSync(path.join(binDir, "bar"))).toBe(false);
    expect(fs.existsSync(path.join(binDir, "bar.cmd"))).toBe(false);
  });
});
