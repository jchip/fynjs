import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { verify } from "run-verify";
import logger from "../../lib/logger";
import {
  parseAllowKey,
  approveEntries,
  denyEntries,
  pruneEntries,
  selectRecords,
  resolveTarget,
  canPrompt,
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
      expect(parseAllowKey("sharp@0.34.4")).toStrictEqual({ name: "sharp", spec: "0.34.4" });
      expect(parseAllowKey("sharp")).toStrictEqual({ name: "sharp", spec: undefined });
    });

    it("does not split a scope off a scoped name", () => {
      expect(parseAllowKey("@scope/pkg")).toStrictEqual({ name: "@scope/pkg", spec: undefined });
      expect(parseAllowKey("@scope/pkg@1.0.0")).toStrictEqual({
        name: "@scope/pkg",
        spec: "1.0.0"
      });
    });
  });

  describe("approveEntries", function () {
    it("writes one entry per package, scoped to the reviewed release line", () => {
      const { allowScripts, approved } = approveEntries({}, [mkRecord()]);
      expect(allowScripts).toStrictEqual({
        sharp: { semver: "^0.34.4", scripts: ["install"] }
      });
      expect(approved).toStrictEqual(["sharp"]);
    });

    it("covers every version when pinning is off", () => {
      const { allowScripts } = approveEntries({}, [mkRecord()], { pin: false });
      expect(allowScripts).toStrictEqual({ sharp: { scripts: ["install"] } });
    });

    it("does not undo an existing denial", () => {
      const { allowScripts, approved, skipped } = approveEntries({ sharp: false }, [mkRecord()]);
      expect(allowScripts).toStrictEqual({ sharp: false });
      expect(approved).toStrictEqual([]);
      expect(skipped).toStrictEqual(["sharp"]);
    });

    it("does not undo a denial written under a ranged key", () => {
      const { approved, skipped } = approveEntries({ "sharp@^0.34.0": false }, [mkRecord()]);
      expect(approved).toStrictEqual([]);
      expect(skipped).toStrictEqual(["sharp"]);
    });

    it("does not approve what the deny list names", () => {
      const { allowScripts, approved, skipped } = approveEntries({}, [mkRecord()], {
        denyScripts: { sharp: {} }
      });
      expect(allowScripts).toStrictEqual({});
      expect(approved).toStrictEqual([]);
      expect(skipped).toStrictEqual(["sharp"]);
    });

    it("matches a deny-list entry that carries a spec", () => {
      const { approved } = approveEntries({}, [mkRecord()], {
        denyScripts: { "sharp@^0.34.0": {} }
      });
      expect(approved).toStrictEqual([]);
    });

    it("widens the semver of an entry it already wrote", () => {
      const first = approveEntries({}, [mkRecord()]).allowScripts;
      const { allowScripts } = approveEntries(first, [mkRecord({ version: "1.0.0" })]);
      expect(allowScripts.sharp).toStrictEqual({
        semver: "^0.34.4 || ^1.0.0",
        scripts: ["install"]
      });
    });

    it("unions with scripts already approved for the same package", () => {
      const { allowScripts } = approveEntries(
        { sharp: { semver: "^0.34.4", scripts: ["postinstall"] } },
        [mkRecord()]
      );
      expect(allowScripts.sharp.scripts).toStrictEqual(["install", "postinstall"]);
    });

    it("merges into an entry written in npm's form", () => {
      const { allowScripts } = approveEntries({ sharp: "0.33.0" }, [mkRecord()]);
      expect(allowScripts.sharp).toStrictEqual({ semver: "0.33.0 || ^0.34.4" });
    });

    it("leaves the input map alone", () => {
      const before = {};
      approveEntries(before, [mkRecord()]);
      expect(before).toStrictEqual({});
    });
  });

  describe("denyEntries", function () {
    it("denies against the bare name so it covers every version", () => {
      const { denyScripts, denied } = denyEntries({}, ["malware@1.0.0"]);
      expect(denyScripts).toStrictEqual({ malware: {} });
      expect(denied).toStrictEqual(["malware"]);
    });

    it("keeps one entry per package", () => {
      const { denyScripts, denied, already } = denyEntries({ malware: {} }, [
        "malware",
        "sketchy"
      ]);
      expect(denyScripts).toStrictEqual({ malware: {}, sketchy: {} });
      expect(denied).toStrictEqual(["sketchy"]);
      expect(already).toStrictEqual(["malware"]);
    });

    it("leaves the input map alone", () => {
      const before = { malware: {} };
      denyEntries(before, ["sketchy"]);
      expect(before).toStrictEqual({ malware: {} });
    });
  });

  describe("pruneEntries", function () {
    it("drops entries whose package is not installed", () => {
      const { allowScripts, removed } = pruneEntries(
        { "sharp@0.34.4": ["install"], "gone@1.0.0": true, "@scope/kept": true },
        ["sharp", "@scope/kept"]
      );
      expect(allowScripts).toStrictEqual({ "sharp@0.34.4": ["install"], "@scope/kept": true });
      expect(removed).toStrictEqual(["gone@1.0.0"]);
    });

    it("keeps a denial for an installed package", () => {
      const { removed } = pruneEntries({ malware: false }, ["malware"]);
      expect(removed).toStrictEqual([]);
    });
  });

  describe("selectRecords", function () {
    it("matches a named package against what the install recorded", () => {
      const { matched, unknown } = selectRecords(["sharp"], [mkRecord()]);
      expect(matched).toHaveLength(1);
      expect(matched[0].version).toBe("0.34.4");
      expect(unknown).toStrictEqual([]);
    });

    it("reports a package no install saw", () => {
      const { matched, unknown } = selectRecords(["ghost"], [mkRecord()]);
      expect(matched).toStrictEqual([]);
      expect(unknown).toStrictEqual(["ghost"]);
    });

    it("takes an explicit version even when no install saw it", () => {
      const { matched, unknown } = selectRecords(["ghost@2.0.0"], []);
      expect(unknown).toStrictEqual([]);
      expect(matched[0]).toMatchObject({ name: "ghost", version: "2.0.0" });
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
      getOutputDir: () => Path.join(dir, "node_modules"),
      allowScriptsPin: true,
      allowScripts: {},
      denyScripts: {},
      blockedScripts: [],
      pendingScripts: [],
      _fynpo: {},
      loadFvVersions: async () => ({}),
      ...over
    });

    /**
     * @param {string} file the file to read back
     * @returns {object} its parsed contents
     */
    const readJson = (file: string) => JSON.parse(Fs.readFileSync(Path.join(dir, file), "utf8"));

    it("defaults to the monorepo's fynpo.json inside a fynpo repo", () => {
      const target = resolveTarget(mkFyn({ _fynpo: { dir } }));
      expect(target).toStrictEqual({ file: Path.join(dir, "fynpo.json"), fynpo: true });
    });

    it("targets the package's own package.json with --local", () => {
      const target = resolveTarget(mkFyn({ _fynpo: { dir } }), true);
      expect(target).toStrictEqual({ file: Path.join(dir, "package.json"), fynpo: false });
    });

    it("targets package.json outside a fynpo repo", () => {
      expect(resolveTarget(mkFyn()).fynpo).toBe(false);
    });

    it("approve writes the monorepo allowlist under fyn.options", async () => {
      Fs.writeFileSync(
        Path.join(dir, "fynpo.json"),
        JSON.stringify({ packages: ["packages/*"], fyn: { options: { layout: "detail" } } })
      );
      const fyn = mkFyn({ _fynpo: { dir }, blockedScripts: [mkRecord()] });
      const cmd = new InstallScripts({ fyn });

      expect(await cmd.approve(["sharp"])).toStrictEqual(["sharp"]);

      const written = JSON.parse(Fs.readFileSync(Path.join(dir, "fynpo.json"), "utf8"));
      expect(written.fyn.options.allowScripts).toStrictEqual({
        sharp: { semver: "^0.34.4", scripts: ["install"] }
      });
      // the rest of the config is untouched
      expect(written.fyn.options.layout).toBe("detail");
      expect(written.packages).toStrictEqual(["packages/*"]);
    });

    it("approve --local writes package.json under fyn.allowScripts", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({ name: "app", version: "1.0.0" })
      );
      const fyn = mkFyn({ _fynpo: { dir }, blockedScripts: [mkRecord()] });
      await new InstallScripts({ fyn }).approve(["sharp"], { local: true });

      const written = JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8"));
      expect(written.fyn.allowScripts).toStrictEqual({
        sharp: { semver: "^0.34.4", scripts: ["install"] }
      });
      expect(written.name).toBe("app");
    });

    it("approve --all takes everything awaiting review", async () => {
      Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify({ name: "app" }));
      const fyn = mkFyn({
        blockedScripts: [mkRecord()],
        pendingScripts: [mkRecord({ name: "canvas", version: "5.0.1" })]
      });
      const approved = await new InstallScripts({ fyn }).approve([], { all: true });
      expect(approved.sort()).toStrictEqual(["canvas", "sharp"]);
    });

    it("deny writes fyn.denyScripts and approve then refuses", async () => {
      Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify({ name: "app" }));
      const fyn = mkFyn({ blockedScripts: [mkRecord({ name: "malware", version: "1.0.0" })] });
      const cmd = new InstallScripts({ fyn });

      expect(await cmd.deny(["malware"])).toStrictEqual(["malware"]);
      expect(readJson("package.json").fyn).toStrictEqual({ denyScripts: { malware: {} } });

      expect(await cmd.approve(["malware"])).toStrictEqual([]);
      // and nothing was written that would look like an approval
      expect(readJson("package.json").fyn).toStrictEqual({ denyScripts: { malware: {} } });
    });

    it("deny writes the monorepo blacklist under fyn.options", async () => {
      Fs.writeFileSync(
        Path.join(dir, "fynpo.json"),
        JSON.stringify({ packages: ["packages/*"], fyn: { options: { layout: "detail" } } })
      );
      const fyn = mkFyn({ _fynpo: { dir } });

      await new InstallScripts({ fyn }).deny(["malware@1.0.0"]);

      const written = readJson("fynpo.json");
      // denied against the bare name, so it covers every version
      expect(written.fyn.options.denyScripts).toStrictEqual({ malware: {} });
      expect(written.fyn.options.layout).toBe("detail");
      expect(written.packages).toStrictEqual(["packages/*"]);
    });

    it("deny is idempotent - denying twice is still one entry", async () => {
      Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify({ name: "app" }));
      const cmd = new InstallScripts({ fyn: mkFyn() });

      await cmd.deny(["malware"]);
      expect(await cmd.deny(["malware", "sketchy"])).toStrictEqual(["sketchy"]);

      expect(readJson("package.json").fyn.denyScripts).toStrictEqual({
        malware: {},
        sketchy: {}
      });
    });

    it("still honors a denial written in the old allowScripts false form", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({ name: "app", fyn: { allowScripts: { malware: false } } })
      );
      const fyn = mkFyn({ blockedScripts: [mkRecord({ name: "malware", version: "1.0.0" })] });

      expect(await new InstallScripts({ fyn }).approve(["malware"])).toStrictEqual([]);
      expect(readJson("package.json").fyn.allowScripts).toStrictEqual({ malware: false });
    });

    it("refuses to approve what another scope denied", async () => {
      Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify({ name: "app" }));
      // the deny came from the monorepo config, not the package.json being written
      const fyn = mkFyn({
        denyScripts: { malware: {} },
        blockedScripts: [mkRecord({ name: "malware", version: "1.0.0" })]
      });

      expect(await new InstallScripts({ fyn }).approve(["malware"], { local: true })).toStrictEqual(
        []
      );
      expect(readJson("package.json").fyn).toBe(undefined);
    });

    it("prune drops approvals for packages no longer installed", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({
          name: "app",
          fyn: {
            allowScripts: {
              sharp: { semver: "^0.34.4", scripts: ["install"] },
              "gone@1.0.0": true
            }
          }
        })
      );
      const fyn = mkFyn({ loadFvVersions: async () => ({ sharp: ["0.34.4"] }) });
      expect(await new InstallScripts({ fyn }).prune()).toStrictEqual(["gone@1.0.0"]);
      expect(
        JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).fyn.allowScripts
      ).toStrictEqual({ sharp: { semver: "^0.34.4", scripts: ["install"] } });
    });

    it("prune refuses when nothing is installed, rather than clearing the list", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({ name: "app", fyn: { allowScripts: { sharp: { semver: "^0.34.4" } } } })
      );
      expect(await new InstallScripts({ fyn: mkFyn() }).prune()).toStrictEqual([]);
      expect(
        JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).fyn.allowScripts
      ).toStrictEqual({ sharp: { semver: "^0.34.4" } });
    });

    it("ls lists what the last install blocked and what is pending", async () => {
      const fyn = mkFyn({
        blockedScripts: [mkRecord()],
        pendingScripts: [mkRecord({ name: "canvas", version: "5.0.1" })]
      });
      const records = await new InstallScripts({ fyn }).ls();
      expect(records.map((r: any) => r.name)).toStrictEqual(["canvas", "sharp"]);
    });

    it("does not suggest --allow-scripts-pending when review is already the mode", () => {
      // FPM-91: the flag previews what "review" would ask, so under "review" it
      // is a no-op and the suggestion reads as though review were off
      const lines: string[] = [];
      const spy = vi.spyOn(logger, "info").mockImplementation((...args: any[]) => {
        lines.push(args.join(" "));
      });

      return verify({ timeout: 500, cleanup: () => spy.mockRestore() })
        .step(() => new InstallScripts({ fyn: mkFyn({ scriptPolicy: "review" }) }).ls())
        .step(() => {
          expect(lines.join("\n")).toContain("No packages are awaiting install-script review.");
          expect(lines.join("\n")).not.toContain("--allow-scripts-pending");
        });
    });

    it("suggests --allow-scripts-pending from a looser mode", () => {
      const lines: string[] = [];
      const spy = vi.spyOn(logger, "info").mockImplementation((...args: any[]) => {
        lines.push(args.join(" "));
      });

      return verify({ timeout: 500, cleanup: () => spy.mockRestore() })
        .step(() => new InstallScripts({ fyn: mkFyn({ scriptPolicy: "source" }) }).ls())
        .step(() => {
          expect(lines.join("\n")).toContain("--allow-scripts-pending");
        });
    });

    it("explains that a monorepo allowlist needs a fynpo.json", () => {
      const fyn = mkFyn({ _fynpo: { dir }, blockedScripts: [mkRecord()] });
      return verify({ timeout: 500 })
        .expectErrorHas("needs a fynpo.json")
        .step(() => new InstallScripts({ fyn }).approve(["sharp"]));
    });
  
    it("approves nothing when there was nothing blocked", async () => {
      expect(await new InstallScripts({ fyn: mkFyn() }).review([])).toStrictEqual([]);
    });

    it("fails rather than skipping scripts when there is nobody to ask", () => {
      // vitest is not a terminal, so this is the CI / piped / hook path
      expect(canPrompt()).toBe(false);

      return verify({ timeout: 500 })
        .expectErrorHas("need approval to run their install scripts")
        .step(() => new InstallScripts({ fyn: mkFyn() }).review([mkRecord()]))
        .step((error) => {
          expect(error.message).toContain("sharp@0.34.4");
          // and it names the way out
          expect(error.message).toContain("--script-policy=source");
          expect(error.message).toContain("fyn install-scripts approve");
        });
    });
  
    it("prune keeps approvals for packages hoisted into node_modules", async () => {
      // FPM-89: the installed set used to be `.f/_` alone, which under the
      // hoisted layout holds only the versions that needed isolating - so every
      // hoisted package looked uninstalled and lost its approval
      const nm = Path.join(dir, "node_modules");
      Fs.mkdirSync(Path.join(nm, "hoisted"), { recursive: true });
      Fs.mkdirSync(Path.join(nm, "@scope", "scoped"), { recursive: true });
      Fs.mkdirSync(Path.join(nm, ".f", "_", "isolated"), { recursive: true });

      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({
          name: "app",
          fyn: {
            allowScripts: {
              hoisted: {},
              "@scope/scoped": {},
              isolated: {},
              gone: {}
            }
          }
        })
      );

      const fyn = mkFyn({ loadFvVersions: async () => ({ isolated: ["1.0.0"] }) });
      expect(await new InstallScripts({ fyn }).prune()).toStrictEqual(["gone"]);

      const written = JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8"));
      expect(Object.keys(written.fyn.allowScripts).sort()).toStrictEqual([
        "@scope/scoped",
        "hoisted",
        "isolated"
      ]);
    });

    it("installedPackageNames unions the store with the hoisted tree", async () => {
      const nm = Path.join(dir, "node_modules");
      Fs.mkdirSync(Path.join(nm, "hoisted"), { recursive: true });
      Fs.mkdirSync(Path.join(nm, "@scope", "scoped"), { recursive: true });
      Fs.mkdirSync(Path.join(nm, ".bin"), { recursive: true });

      const fyn = mkFyn({ loadFvVersions: async () => ({ isolated: ["1.0.0"] }) });
      const names = await new InstallScripts({ fyn }).installedPackageNames();

      expect([...names].sort()).toStrictEqual(["@scope/scoped", "hoisted", "isolated"]);
      // dot dirs are bookkeeping, not packages
      expect(names.has(".bin")).toBe(false);
    });

    it("prune still refuses when nothing is installed at all", async () => {
      Fs.writeFileSync(
        Path.join(dir, "package.json"),
        JSON.stringify({ name: "app", fyn: { allowScripts: { sharp: {} } } })
      );
      expect(await new InstallScripts({ fyn: mkFyn() }).prune()).toStrictEqual([]);
      expect(
        JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).fyn.allowScripts
      ).toStrictEqual({ sharp: {} });
    });
  });
});
