import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import Fs from "fs";
import Os from "os";
import Path from "path";
import {
  parseAllowKey,
  approveEntries,
  denyEntries,
  pruneEntries,
  selectRecords,
  resolveTarget,
  InstallScripts
} from "../../lib/install-scripts";

/**
 * @param {object} [over] fields to override
 * @returns {object} a blocked-scripts record
 */
const mkRecord = (over = {}) => ({
  name: "sharp",
  version: "0.34.4",
  key: "sharp@^0.34.0",
  scripts: ["install"],
  reason: "review",
  topLevel: false,
  local: false,
  ...over
});

describe("install-scripts", function () {
  describe("parseAllowKey", function () {
    it("splits a plain name and spec", () => {
      expect(parseAllowKey("sharp@0.34.4")).to.deep.equal({ name: "sharp", spec: "0.34.4" });
      expect(parseAllowKey("sharp")).to.deep.equal({ name: "sharp", spec: undefined });
    });

    it("does not split a scope off a scoped name", () => {
      expect(parseAllowKey("@scope/pkg")).to.deep.equal({ name: "@scope/pkg", spec: undefined });
      expect(parseAllowKey("@scope/pkg@1.0.0")).to.deep.equal({
        name: "@scope/pkg",
        spec: "1.0.0"
      });
    });
  });

  describe("approveEntries", function () {
    it("writes a version-pinned key with only the blocked scripts", () => {
      const { allowScripts, approved } = approveEntries({}, [mkRecord()]);
      expect(allowScripts).to.deep.equal({ "sharp@0.34.4": ["install"] });
      expect(approved).to.deep.equal(["sharp@0.34.4"]);
    });

    it("writes a bare name when pinning is off", () => {
      const { allowScripts } = approveEntries({}, [mkRecord()], { pin: false });
      expect(allowScripts).to.deep.equal({ sharp: ["install"] });
    });

    it("does not undo an existing denial", () => {
      const { allowScripts, approved, skipped } = approveEntries({ sharp: false }, [mkRecord()]);
      expect(allowScripts).to.deep.equal({ sharp: false });
      expect(approved).to.deep.equal([]);
      expect(skipped).to.deep.equal(["sharp@0.34.4"]);
    });

    it("unions with scripts already approved for the same key", () => {
      const { allowScripts } = approveEntries({ "sharp@0.34.4": ["postinstall"] }, [mkRecord()]);
      expect(allowScripts["sharp@0.34.4"]).to.deep.equal(["postinstall", "install"]);
    });

    it("leaves the input map alone", () => {
      const before = {};
      approveEntries(before, [mkRecord()]);
      expect(before).to.deep.equal({});
    });
  });

  describe("denyEntries", function () {
    it("denies against the bare name so it covers every version", () => {
      const { allowScripts, denied } = denyEntries({ "malware@1.0.0": true }, ["malware@1.0.0"]);
      expect(allowScripts).to.deep.equal({ "malware@1.0.0": true, malware: false });
      expect(denied).to.deep.equal(["malware"]);
    });
  });

  describe("pruneEntries", function () {
    it("drops entries whose package is not installed", () => {
      const { allowScripts, removed } = pruneEntries(
        { "sharp@0.34.4": ["install"], "gone@1.0.0": true, "@scope/kept": true },
        ["sharp", "@scope/kept"]
      );
      expect(allowScripts).to.deep.equal({ "sharp@0.34.4": ["install"], "@scope/kept": true });
      expect(removed).to.deep.equal(["gone@1.0.0"]);
    });

    it("keeps a denial for an installed package", () => {
      const { removed } = pruneEntries({ malware: false }, ["malware"]);
      expect(removed).to.deep.equal([]);
    });
  });

  describe("selectRecords", function () {
    it("matches a named package against what the install recorded", () => {
      const { matched, unknown } = selectRecords(["sharp"], [mkRecord()]);
      expect(matched).to.have.length(1);
      expect(matched[0].version).to.equal("0.34.4");
      expect(unknown).to.deep.equal([]);
    });

    it("reports a package no install saw", () => {
      const { matched, unknown } = selectRecords(["ghost"], [mkRecord()]);
      expect(matched).to.deep.equal([]);
      expect(unknown).to.deep.equal(["ghost"]);
    });

    it("takes an explicit version even when no install saw it", () => {
      const { matched, unknown } = selectRecords(["ghost@2.0.0"], []);
      expect(unknown).to.deep.equal([]);
      expect(matched[0]).to.include({ name: "ghost", version: "2.0.0" });
    });
  });

  describe("resolveTarget / write", function () {
    let dir: string;

    beforeEach(() => {
      dir = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-is-")));
    });

    afterEach(() => {
      Fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * @param {object} [over] stub fyn fields
     * @returns {object} a stub Fyn
     */
    const mkFyn = (over: any = {}) => ({
      cwd: dir,
      allowScriptsPin: true,
      blockedScripts: [],
      pendingScripts: [],
      _fynpo: {},
      loadFvVersions: async () => ({}),
      ...over
    });

    it("defaults to the monorepo's fynpo.json inside a fynpo repo", () => {
      const target = resolveTarget(mkFyn({ _fynpo: { dir } }));
      expect(target).to.deep.equal({ file: Path.join(dir, "fynpo.json"), fynpo: true });
    });

    it("targets the package's own package.json with --local", () => {
      const target = resolveTarget(mkFyn({ _fynpo: { dir } }), true);
      expect(target).to.deep.equal({ file: Path.join(dir, "package.json"), fynpo: false });
    });

    it("targets package.json outside a fynpo repo", () => {
      expect(resolveTarget(mkFyn()).fynpo).to.equal(false);
    });

    it("approve writes the monorepo allowlist under fyn.options", async () => {
      Fs.writeFileSync(
        Path.join(dir, "fynpo.json"),
        JSON.stringify({ packages: ["packages/*"], fyn: { options: { layout: "detail" } } })
      );
      const fyn = mkFyn({ _fynpo: { dir }, blockedScripts: [mkRecord()] });
      const cmd = new InstallScripts({ fyn });

      expect(await cmd.approve(["sharp"])).to.deep.equal(["sharp@0.34.4"]);

      const written = JSON.parse(Fs.readFileSync(Path.join(dir, "fynpo.json"), "utf8"));
      expect(written.fyn.options.allowScripts).to.deep.equal({ "sharp@0.34.4": ["install"] });
      // the rest of the config is untouched
      expect(written.fyn.options.layout).to.equal("detail");
      expect(written.packages).to.deep.equal(["packages/*"]);
    });

    it("approve --local writes package.json under fyn.allowScripts", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({ name: "app", version: "1.0.0" })
      );
      const fyn = mkFyn({ _fynpo: { dir }, blockedScripts: [mkRecord()] });
      await new InstallScripts({ fyn }).approve(["sharp"], { local: true });

      const written = JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8"));
      expect(written.fyn.allowScripts).to.deep.equal({ "sharp@0.34.4": ["install"] });
      expect(written.name).to.equal("app");
    });

    it("approve --all takes everything awaiting review", async () => {
      Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify({ name: "app" }));
      const fyn = mkFyn({
        blockedScripts: [mkRecord()],
        pendingScripts: [mkRecord({ name: "canvas", version: "5.0.1" })]
      });
      const approved = await new InstallScripts({ fyn }).approve([], { all: true });
      expect(approved.sort()).to.deep.equal(["canvas@5.0.1", "sharp@0.34.4"]);
    });

    it("deny writes false and approve then leaves it alone", async () => {
      Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify({ name: "app" }));
      const fyn = mkFyn({ blockedScripts: [mkRecord({ name: "malware", version: "1.0.0" })] });
      const cmd = new InstallScripts({ fyn });

      await cmd.deny(["malware"]);
      expect(
        JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).fyn.allowScripts
      ).to.deep.equal({ malware: false });

      expect(await cmd.approve(["malware"])).to.deep.equal([]);
      expect(
        JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).fyn.allowScripts
      ).to.deep.equal({ malware: false });
    });

    it("prune drops approvals for packages no longer installed", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({
          name: "app",
          fyn: { allowScripts: { "sharp@0.34.4": ["install"], "gone@1.0.0": true } }
        })
      );
      const fyn = mkFyn({ loadFvVersions: async () => ({ sharp: ["0.34.4"] }) });
      expect(await new InstallScripts({ fyn }).prune()).to.deep.equal(["gone@1.0.0"]);
      expect(
        JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).fyn.allowScripts
      ).to.deep.equal({ "sharp@0.34.4": ["install"] });
    });

    it("prune refuses when nothing is installed, rather than clearing the list", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({ name: "app", fyn: { allowScripts: { "sharp@0.34.4": ["install"] } } })
      );
      expect(await new InstallScripts({ fyn: mkFyn() }).prune()).to.deep.equal([]);
      expect(
        JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).fyn.allowScripts
      ).to.deep.equal({ "sharp@0.34.4": ["install"] });
    });

    it("ls lists what the last install blocked and what is pending", async () => {
      const fyn = mkFyn({
        blockedScripts: [mkRecord()],
        pendingScripts: [mkRecord({ name: "canvas", version: "5.0.1" })]
      });
      const records = await new InstallScripts({ fyn }).ls();
      expect(records.map((r: any) => r.name)).to.deep.equal(["canvas", "sharp"]);
    });

    it("explains that a monorepo allowlist needs a fynpo.json", async () => {
      const fyn = mkFyn({ _fynpo: { dir }, blockedScripts: [mkRecord()] });
      let caught: Error | undefined;
      await new InstallScripts({ fyn }).approve(["sharp"]).catch((err: Error) => {
        caught = err;
      });
      expect(caught?.message).to.match(/needs a fynpo\.json/);
    });
  });
});
