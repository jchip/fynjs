import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import PkgBinLinkerWin32 from "../../lib/pkg-bin-linker-win32";
import { globalBinTargetPath, normalizeDeclaredBins } from "../../lib/fyn-global";

//
// Three Windows-only defects, all of which made a globally installed bin fail to execute while
// the install itself reported success. Verified on a real Windows 11 box (rdna-79); these tests
// pin the behavior so it cannot regress from a POSIX-only dev loop.
//
describe("win32 global bin", () => {
  describe("globalBinTargetPath", () => {
    //
    // Defect 1. The global wrapper runs `node <target>`. It used to target
    // `node_modules/.bin/<name>`, which on POSIX is a symlink to the JS entry but on Windows is
    // a `#!/bin/sh` cygwin script - so node parsed shell as JavaScript:
    //   SyntaxError: missing ) after argument list
    //     basedir=$(dirname "$(echo "$0" | sed -e 's,\,/,g')")
    //
    it("targets the package's own declared bin file, like a normal dep install", () => {
      const target = globalBinTargetPath("/g/packages/g1", "cowsay", "cli.js");
      expect(target).to.equal(Path.join("/g/packages/g1", "node_modules", "cowsay", "cli.js"));
    });

    it("never targets the .bin wrapper dir", () => {
      const target = globalBinTargetPath("/g/packages/g1", "cowsay", "cli.js");
      expect(target).to.not.include(`${Path.sep}.bin${Path.sep}`);
    });

    it("handles a scoped package", () => {
      const target = globalBinTargetPath("/g/packages/g1", "@scope/tool", "bin/run.js");
      expect(target).to.equal(
        Path.join("/g/packages/g1", "node_modules", "@scope/tool", "bin/run.js")
      );
    });
  });

  describe("normalizeDeclaredBins", () => {
    it("maps the object form through unchanged", () => {
      expect(normalizeDeclaredBins({ cowsay: "cli.js", cowthink: "cli.js" }, "cowsay")).to.deep.equal(
        { cowsay: "cli.js", cowthink: "cli.js" }
      );
    });

    it("names a string bin after the package", () => {
      expect(normalizeDeclaredBins("cli.js", "cowsay")).to.deep.equal({ cowsay: "cli.js" });
    });

    // matches PkgBinLinkerBase.linkBin, which uses Path.basename(name) / _.last(sym.split("/"))
    it("drops the scope, so the command is not named @scope/tool", () => {
      expect(normalizeDeclaredBins("cli.js", "@scope/tool")).to.deep.equal({ tool: "cli.js" });
      expect(normalizeDeclaredBins({ "@scope/tool": "cli.js" }, "@scope/tool")).to.deep.equal({
        tool: "cli.js"
      });
    });

    it("returns nothing for a package with no bin", () => {
      expect(normalizeDeclaredBins(undefined, "x")).to.deep.equal({});
      expect(normalizeDeclaredBins(null, "x")).to.deep.equal({});
    });
  });

  describe("wrapper generation", () => {
    let binDir: string;
    let tmp: string;

    beforeEach(() => {
      tmp = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-win32-bin-"));
      binDir = Path.join(tmp, "bin");
      Fs.mkdirSync(binDir, { recursive: true });
    });

    afterEach(() => {
      Fs.rmSync(tmp, { recursive: true, force: true });
    });

    const read = (name: string) => Fs.readFileSync(Path.join(binDir, name), "utf8");

    //
    // Defect 2. A `.cmd` is a regular file, so `%~dp0` is the directory used to INVOKE it. The
    // global bin dir is normally reached through the `global/bin` -> `v<N>/bin` symlink, where
    // `%~dp0\..\packages\...` lands on `.fyn\global\packages\...` - one level short - and every
    // bin died with "Cannot find module". An absolute target is immune to how it was reached.
    //
    it("bakes an absolute target with no %~dp0 prefix when absoluteTarget is set", async () => {
      const linker: any = new (PkgBinLinkerWin32 as any)({ binDir, absoluteTarget: true });
      const target = Path.join(tmp, "packages", "g1", "node_modules", "cowsay", "cli.js");

      await linker.linkBinPath(target, "cowsay");

      const cmd = read("cowsay.cmd");
      expect(cmd).to.include(`"${target}"`);
      expect(cmd).to.not.include(`%~dp0\\${target}`);
      // the node.exe probe still uses %~dp0 - that part is correct
      expect(cmd).to.include(`%~dp0\\node.exe`);
    });

    it("keeps a relative target for a normal node_modules/.bin, so the tree stays portable", async () => {
      const linker: any = new (PkgBinLinkerWin32 as any)({ binDir });
      const target = Path.join(tmp, "cowsay", "cli.js");

      await linker.linkBinPath(target, "cowsay");

      const cmd = read("cowsay.cmd");
      expect(cmd).to.include("%~dp0\\..");
      expect(cmd).to.not.include(`"${target}"`);
    });

    it("round-trips an absolute target back out of the wrapper", async () => {
      const linker: any = new (PkgBinLinkerWin32 as any)({ binDir, absoluteTarget: true });
      const target = Path.join(tmp, "packages", "g1", "node_modules", "cowsay", "cli.js");

      await linker.linkBinPath(target, "cowsay");

      expect(await linker._readBinLinkTarget(Path.join(binDir, "cowsay"))).to.equal(target);
    });

    it("round-trips a relative target back out of the wrapper", async () => {
      const linker: any = new (PkgBinLinkerWin32 as any)({ binDir });
      const target = Path.join(tmp, "cowsay", "cli.js");

      await linker.linkBinPath(target, "cowsay");

      const readBack = await linker._readBinLinkTarget(Path.join(binDir, "cowsay"));
      expect(Path.resolve(binDir, readBack)).to.equal(target);
    });

    it("matchesBinPath recognizes a link it just wrote with an absolute target", async () => {
      const linker: any = new (PkgBinLinkerWin32 as any)({ binDir, absoluteTarget: true });
      const target = Path.join(tmp, "packages", "g1", "node_modules", "cowsay", "cli.js");

      await linker.linkBinPath(target, "cowsay");

      expect(await linker.matchesBinPath("cowsay", target)).to.equal(true);
      expect(await linker.matchesBinPath("cowsay", Path.join(tmp, "other", "cli.js"))).to.equal(
        false
      );
    });

    it("removes both the cygwin script and the .cmd", async () => {
      const linker: any = new (PkgBinLinkerWin32 as any)({ binDir, absoluteTarget: true });
      const target = Path.join(tmp, "packages", "g1", "node_modules", "cowsay", "cli.js");

      await linker.linkBinPath(target, "cowsay");
      expect(Fs.existsSync(Path.join(binDir, "cowsay"))).to.equal(true);
      expect(Fs.existsSync(Path.join(binDir, "cowsay.cmd"))).to.equal(true);

      await linker.removeBinLink("cowsay");
      expect(Fs.existsSync(Path.join(binDir, "cowsay"))).to.equal(false);
      expect(Fs.existsSync(Path.join(binDir, "cowsay.cmd"))).to.equal(false);
    });

    it("_cleanLink keeps a wrapper whose absolute target exists, and drops a stale one", async () => {
      const linker: any = new (PkgBinLinkerWin32 as any)({ binDir, absoluteTarget: true });
      const pkgDir = Path.join(tmp, "packages", "g1", "node_modules", "cowsay");
      const target = Path.join(pkgDir, "cli.js");
      Fs.mkdirSync(pkgDir, { recursive: true });
      Fs.writeFileSync(target, "#!/usr/bin/env node\n");

      await linker.linkBinPath(target, "cowsay");
      expect(await linker._cleanLink("cowsay")).to.equal(false);

      Fs.rmSync(target);
      expect(await linker._cleanLink("cowsay")).to.equal(true);
      expect(Fs.existsSync(Path.join(binDir, "cowsay.cmd"))).to.equal(false);
    });
  });
});
