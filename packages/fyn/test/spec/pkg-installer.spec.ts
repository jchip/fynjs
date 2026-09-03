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

  describe("blocked install scripts", function () {
    /**
     * @param {object} [over] stub fyn fields to override
     * @returns {object} a PkgInstaller with a stub `_fyn`
     */
    const mkInstaller = (over = {}) => {
      const installer: any = Object.create(PkgInstaller.prototype);
      installer.blockedScripts = [];
      installer.pendingScripts = [];
      installer._fyn = {
        scriptPolicy: "review",
        allowScriptsPin: true,
        allowScriptsPending: false,
        saved: undefined,
        savedPending: undefined,
        setBlockedScripts(blocked: unknown, pending: unknown) {
          installer._fyn.saved = blocked;
          installer._fyn.savedPending = pending;
        },
        ...over
      };
      return installer;
    };

    it("records a blocked package instead of warning per package", () => {
      const installer = mkInstaller();
      installer._recordBlockedScripts(
        { name: "sharp", version: "0.34.4" },
        { key: "sharp@^0.34.0", reason: "review", topLevel: false, local: false },
        ["install"]
      );
      expect(installer.blockedScripts).to.have.length(1);
      expect(installer.blockedScripts[0]).to.include({ name: "sharp", version: "0.34.4" });
      expect(installer.blockedScripts[0].scripts).to.deep.equal(["install"]);
    });

    it("hands the records to fyn so install-scripts ls can list them", () => {
      const installer = mkInstaller();
      installer._recordBlockedScripts(
        { name: "sharp", version: "0.34.4" },
        { key: "sharp@^0.34.0", reason: "review", topLevel: false, local: false },
        ["install"]
      );
      installer._reportBlockedScripts();
      expect(installer._fyn.saved).to.equal(installer.blockedScripts);
    });

    it("saves an empty set when nothing was blocked", () => {
      const installer = mkInstaller();
      installer._reportBlockedScripts();
      expect(installer._fyn.saved).to.deep.equal([]);
    });

    it("records nothing pending unless --allow-scripts-pending is on", () => {
      const installer = mkInstaller();
      installer._recordPendingReview({ name: "sharp", version: "0.34.4" }, { install: "node x" });
      expect(installer.pendingScripts).to.deep.equal([]);
    });

    it("records what review mode would block, while the install still runs", () => {
      const installer = mkInstaller({
        scriptPolicy: "source",
        allowScriptsPending: true,
        allowScripts: {},
        scriptPolicyOptions: { mode: "source", allowTopLevel: false, reviewLocalPackages: false }
      });
      installer._recordPendingReview(
        { name: "sharp", version: "0.34.4" },
        { install: "node install.js", hasPI: false }
      );
      expect(installer.pendingScripts).to.have.length(1);
      expect(installer.pendingScripts[0].scripts).to.deep.equal(["install"]);
    });

    it("records nothing pending for a package already approved", () => {
      const installer = mkInstaller({
        scriptPolicy: "source",
        allowScriptsPending: true,
        allowScripts: { sharp: true },
        scriptPolicyOptions: { mode: "source", allowTopLevel: false, reviewLocalPackages: false }
      });
      installer._recordPendingReview(
        { name: "sharp", version: "0.34.4" },
        { install: "node install.js" }
      );
      expect(installer.pendingScripts).to.deep.equal([]);
    });

    /**
     * Drive the real `_gatherPkg` script gating for one registry package that
     * has a postinstall - the seam where the policy decides what gets queued.
     *
     * @param {object} fynOver stub fyn fields
     * @param {object} [depOver] depInfo fields
     * @returns {Promise<object>} the installer, after gathering
     */
    const gatherOne = async (fynOver: any, depOver: any = {}) => {
      const installer: any = Object.create(PkgInstaller.prototype);
      installer.blockedScripts = [];
      installer.pendingScripts = [];
      installer._blockedDeps = [];
      installer.preInstall = [];
      installer.postInstall = [];
      installer.toLink = [];
      installer._fyn = {
        allowScripts: {},
        allowScriptsPin: true,
        allowScriptsPending: false,
        scriptPolicy: "source",
        scriptPolicyOptions: { mode: "source", allowTopLevel: false, reviewLocalPackages: false },
        setBlockedScripts() {},
        ...fynOver
      };

      const depInfo: any = {
        name: "sharp",
        version: "0.34.4",
        dir: "/nowhere",
        json: { name: "sharp", version: "0.34.4", scripts: { postinstall: "node install.js" } },
        ...depOver
      };
      depInfo[SEMVER] = "^0.34.0";

      await installer._gatherPkg(depInfo);
      return installer;
    };

    it('queues a registry package\'s postinstall under "source"', async () => {
      const installer = await gatherOne({});
      expect(installer.postInstall).to.have.length(1);
      expect(installer.blockedScripts).to.deep.equal([]);
    });

    it('blocks and records it under "review"', async () => {
      const installer = await gatherOne({
        scriptPolicy: "review",
        scriptPolicyOptions: { mode: "review", allowTopLevel: false, reviewLocalPackages: false }
      });
      expect(installer.postInstall).to.deep.equal([]);
      expect(installer.blockedScripts).to.have.length(1);
      expect(installer.blockedScripts[0].scripts).to.deep.equal(["postinstall"]);
      // still linked - only the script is withheld
      expect(installer.toLink).to.have.length(1);
    });

    it('runs it under "review" once allowlisted', async () => {
      const installer = await gatherOne({
        allowScripts: { "sharp@0.34.4": ["postinstall"] },
        scriptPolicy: "review",
        scriptPolicyOptions: { mode: "review", allowTopLevel: false, reviewLocalPackages: false }
      });
      expect(installer.postInstall).to.have.length(1);
      expect(installer.blockedScripts).to.deep.equal([]);
    });

    it('blocks it under "off" even when allowlisted', async () => {
      const installer = await gatherOne({
        allowScripts: { sharp: true },
        scriptPolicy: "off",
        scriptPolicyOptions: { mode: "off", allowTopLevel: false, reviewLocalPackages: false }
      });
      expect(installer.postInstall).to.deep.equal([]);
      expect(installer.blockedScripts).to.have.length(1);
    });

    it("blocks it when explicitly denied", async () => {
      const installer = await gatherOne({ allowScripts: { sharp: false } });
      expect(installer.postInstall).to.deep.equal([]);
      expect(installer.blockedScripts[0].reason).to.equal("denied");
    });
  
    it("keeps the blocked packages so an approval can queue them", async () => {
      const installer = await gatherOne({
        scriptPolicy: "review",
        scriptPolicyOptions: { mode: "review", allowTopLevel: false, reviewLocalPackages: false }
      });
      expect(installer._blockedDeps).to.have.length(1);
      expect(installer._blockedDeps[0].candidates).to.deep.equal(["postinstall"]);
    });

    it("queues the scripts an approval allowed, without re-gathering", async () => {
      const installer = await gatherOne({
        scriptPolicy: "review",
        scriptPolicyOptions: { mode: "review", allowTopLevel: false, reviewLocalPackages: false }
      });
      expect(installer.postInstall).to.deep.equal([]);

      // what the review prompt does: write the approval, then requeue
      installer._fyn.allowScripts = { sharp: {} };
      installer._requeueApproved();

      expect(installer.postInstall).to.have.length(1);
      expect(installer.postInstall[0].install).to.deep.equal(["postinstall"]);
      expect(installer.blockedScripts).to.deep.equal([]);
      expect(installer._blockedDeps).to.deep.equal([]);
    });

    it("keeps a package blocked when the approval did not cover it", async () => {
      const installer = await gatherOne({
        scriptPolicy: "review",
        scriptPolicyOptions: { mode: "review", allowTopLevel: false, reviewLocalPackages: false }
      });

      installer._fyn.allowScripts = { sharp: { scripts: ["preinstall"] } };
      installer._requeueApproved();

      expect(installer.postInstall).to.deep.equal([]);
      expect(installer.blockedScripts).to.have.length(1);
      expect(installer._blockedDeps).to.have.length(1);
    });

    it("does not queue a package twice when only some scripts were approved", async () => {
      const installer = await gatherOne(
        {
          scriptPolicy: "review",
          allowScripts: { sharp: { scripts: ["install"] } },
          scriptPolicyOptions: { mode: "review", allowTopLevel: false, reviewLocalPackages: false }
        },
        { json: { scripts: { install: "node a.js", postinstall: "node b.js" } } }
      );
      expect(installer.postInstall).to.have.length(1);
      expect(installer.postInstall[0].install).to.deep.equal(["install"]);

      installer._fyn.allowScripts = { sharp: {} };
      installer._requeueApproved();

      expect(installer.postInstall).to.have.length(1);
      expect(installer.postInstall[0].install).to.deep.equal(["install", "postinstall"]);
    });
  });
});
