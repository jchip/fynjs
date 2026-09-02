import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import Fs from "fs";
import Os from "os";
import Path from "path";
import PkgInstaller from "../../lib/pkg-installer";
import { SEMVER } from "../../lib/types";

describe("pkg-installer", function () {
  describe("_removeFailedOptional", function () {
    it("does not mutate the shared request-path arrays", async () => {
      const fyn: any = {
        _data: {},
        getInstalledPkgDir: () => "/no/such/dir/for-fyn-test"
      };
      const installer: any = new PkgInstaller({ fyn });
      // avoid touching the dep graph / disk beyond the request-path handling
      installer._removeDepsOf = async () => {};

      const depInfo = {
        name: "foo",
        version: "1.0.0",
        top: false,
        // the failing pkg is itself the opt in its own request path, so the
        // loop short-circuits (id === failedId) without walking the graph
        requests: [["dep;^1.0.0;bar@2.0.0", "opt;^1.0.0;foo@1.0.0"]]
      };
      const before = depInfo.requests.map(r => r.slice());

      await installer._removeFailedOptional(depInfo);

      // request arrays must be left in their original order
      expect(depInfo.requests).to.deep.equal(before);
    });
  });

  //
  // FPM-76: fyn hardlinks a local package's files into node_modules, and deliberately
  // unlinks the installed package.json before rewriting it so the write can't reach the
  // source manifest.  But that unlink lived below the "nothing changed" short circuit, so
  // whenever the resolved manifest already matched, the two were left sharing an inode -
  // and any in place write to the installed copy landed on the tracked source file.
  //
  describe("hardlinked package.json", function () {
    let root: string;
    let srcDir: string;
    let vdir: string;
    let srcPkgJson: string;
    let installedPkgJson: string;

    beforeEach(() => {
      root = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-detach-")));
      srcDir = Path.join(root, "src-pkg");
      vdir = Path.join(root, "installed", "pkg-a");
      Fs.mkdirSync(srcDir, { recursive: true });
      Fs.mkdirSync(vdir, { recursive: true });
      srcPkgJson = Path.join(srcDir, "package.json");
      installedPkgJson = Path.join(vdir, "package.json");
      Fs.writeFileSync(srcPkgJson, JSON.stringify({ name: "pkg-a", version: "1.0.0" }, null, 2));
      // this is what hardLinkDir.link leaves behind
      Fs.linkSync(srcPkgJson, installedPkgJson);
    });

    afterEach(() => {
      Fs.rmSync(root, { recursive: true, force: true });
    });

    const makeInstaller = () => {
      const fyn: any = { _data: {}, getInstalledPkgDir: () => vdir };
      return new PkgInstaller({ fyn }) as any;
    };

    it("_detachPkgJsonLink gives a linked manifest its own inode, same bytes", async () => {
      const content = Fs.readFileSync(installedPkgJson, "utf8");
      expect(Fs.statSync(installedPkgJson).nlink).to.equal(2);

      await makeInstaller()._detachPkgJsonLink(installedPkgJson);

      expect(Fs.readFileSync(installedPkgJson, "utf8")).to.equal(content);
      expect(Fs.readFileSync(srcPkgJson, "utf8")).to.equal(content);
      expect(Fs.statSync(installedPkgJson).ino).to.not.equal(Fs.statSync(srcPkgJson).ino);
      expect(Fs.statSync(srcPkgJson).nlink).to.equal(1);
    });

    it("_detachPkgJsonLink leaves an already unshared manifest alone", async () => {
      Fs.unlinkSync(installedPkgJson);
      Fs.writeFileSync(installedPkgJson, "{}");
      const before = Fs.statSync(installedPkgJson);

      await makeInstaller()._detachPkgJsonLink(installedPkgJson);

      const after = Fs.statSync(installedPkgJson);
      expect(after.ino).to.equal(before.ino);
      expect(after.mtimeMs).to.equal(before.mtimeMs);
    });

    it("_savePkgJson breaks the link even when it has nothing to write", async () => {
      const json: any = {
        name: "pkg-a",
        version: "1.0.0",
        _from: "pkg-a@^1.0.0",
        _id: "pkg-a@1.0.0"
      };
      const depInfo: any = {
        name: "pkg-a",
        version: "1.0.0",
        local: "hard",
        dir: srcDir,
        json,
        // already identical to what _savePkgJson would produce, so it takes the skip path
        str: JSON.stringify(json, null, 2),
        [SEMVER]: "^1.0.0"
      };

      const installer = makeInstaller();
      installer.toLink = [depInfo];
      const srcBefore = Fs.readFileSync(srcPkgJson, "utf8");

      await installer._savePkgJson();

      expect(Fs.statSync(installedPkgJson).ino).to.not.equal(Fs.statSync(srcPkgJson).ino);
      // and the source manifest was not rewritten in the process
      expect(Fs.readFileSync(srcPkgJson, "utf8")).to.equal(srcBefore);
    });
  });
});
