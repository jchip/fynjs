import { describe, it, expect } from "vitest";
import {
  makeBlockedRecord,
  allowScriptsKey,
  makeAllowEntry,
  mergeAllowEntry,
  toAllowEntry,
  normalizeScriptsValue,
  addVersionToRange,
  buildAllowScriptsPatch,
  dedupeBlockedRecords,
  blockedReasonText,
  formatBlockedScriptsSummary,
} from "../../../lib/util/script-policy-report";

/**
 * @param {object} [over] fields to override
 * @returns {object} a blocked-scripts record
 */
const mkRecord = (over = {}) => ({
  name: "sharp",
  version: "0.34.4",
  key: "sharp@^0.34.0",
  scripts: ["install"],
  urlType: undefined,
  reason: "review",
  topLevel: false,
  local: false,
  ...over,
});

describe("script-policy-report", function () {
  describe("makeBlockedRecord", function () {
    it("captures what the summary and install-scripts ls need", () => {
      const record = makeBlockedRecord(
        { name: "esbuild", version: "0.28.2" },
        {
          key: "esbuild@^0.28.0",
          urlType: undefined,
          reason: "review",
          topLevel: true,
          local: false,
        },
        ["postinstall"],
      );
      expect(record).toStrictEqual({
        name: "esbuild",
        version: "0.28.2",
        key: "esbuild@^0.28.0",
        scripts: ["postinstall"],
        urlType: undefined,
        reason: "review",
        topLevel: true,
        local: false,
      });
    });

    it("copies the blocked list so later mutation cannot reach it", () => {
      const blocked = ["install"];
      const record = makeBlockedRecord({ name: "a", version: "1.0.0" }, {}, blocked);
      blocked.push("postinstall");
      expect(record.scripts).toStrictEqual(["install"]);
    });
  });

  describe("allowScriptsKey / makeAllowEntry", function () {
    it("keys every entry by the bare package name", () => {
      expect(allowScriptsKey(mkRecord())).toBe("sharp");
      expect(allowScriptsKey(mkRecord({ name: "@scope/pkg" }))).toBe("@scope/pkg");
    });

    it("scopes the approval to the reviewed release line by default", () => {
      expect(makeAllowEntry(mkRecord())).toStrictEqual({
        semver: "^0.34.4",
        scripts: ["install"],
      });
    });

    it("omits semver when pinning is off - every version", () => {
      expect(makeAllowEntry(mkRecord(), false)).toStrictEqual({ scripts: ["install"] });
    });

    it("omits scripts when every install script is approved", () => {
      const record = mkRecord({ scripts: ["preinstall", "install", "postinstall"] });
      expect(makeAllowEntry(record)).toStrictEqual({ semver: "^0.34.4" });
      expect(makeAllowEntry(record, false)).toStrictEqual({});
    });
  });

  describe("normalizeScriptsValue", function () {
    it("collapses a full set to the wildcard", () => {
      expect(normalizeScriptsValue(["postinstall", "install", "preinstall"])).toStrictEqual(["*"]);
      expect(normalizeScriptsValue(["*"])).toStrictEqual(["*"]);
      expect(normalizeScriptsValue(true)).toStrictEqual(["*"]);
      expect(normalizeScriptsValue([])).toStrictEqual([]);
    });

    it("orders a partial set by lifecycle order", () => {
      expect(normalizeScriptsValue(["postinstall", "preinstall"])).toStrictEqual([
        "preinstall",
        "postinstall",
      ]);
    });
  });

  describe("addVersionToRange", function () {
    it("leaves a range that already covers the version alone", () => {
      expect(addVersionToRange("^1.2.0", "1.3.0")).toBe("^1.2.0");
    });

    it("unions a version the range does not cover", () => {
      expect(addVersionToRange("^1.2.0", "2.0.1")).toBe("^1.2.0 || ^2.0.1");
    });

    it("accepts a single pipe and writes the semver double pipe", () => {
      expect(addVersionToRange("^1.2.0 | ^2.0.0", "3.0.0")).toBe("^1.2.0 || ^2.0.0 || ^3.0.0");
    });
  });

  describe("toAllowEntry", function () {
    it("reads npm's version form as a semver constraint", () => {
      expect(toAllowEntry("1.2.3")).toStrictEqual({ semver: "1.2.3" });
      expect(toAllowEntry("^1.2.3")).toStrictEqual({ semver: "^1.2.3" });
    });

    it("reads fyn's script forms", () => {
      expect(toAllowEntry(["install"])).toStrictEqual({ scripts: ["install"] });
      expect(toAllowEntry("postinstall")).toStrictEqual({ scripts: ["postinstall"] });
      expect(toAllowEntry(true)).toStrictEqual({});
      expect(toAllowEntry("*")).toStrictEqual({});
    });

    it("passes the object form through", () => {
      const entry = { semver: "^1.0.0", scripts: ["install"] };
      expect(toAllowEntry(entry)).toBe(entry);
    });
  });

  describe("mergeAllowEntry", function () {
    it("widens semver for a second version of the same package", () => {
      const first = makeAllowEntry(mkRecord());
      const merged = mergeAllowEntry(first, mkRecord({ version: "1.0.0" }));
      expect(merged).toStrictEqual({ semver: "^0.34.4 || ^1.0.0", scripts: ["install"] });
    });

    it("does not widen for a version the range already covers", () => {
      const merged = mergeAllowEntry({ semver: "^0.34.0", scripts: ["install"] }, mkRecord());
      expect(merged.semver).toBe("^0.34.0");
    });

    it("keeps every version when the existing entry had no semver", () => {
      const merged = mergeAllowEntry({ scripts: ["install"] }, mkRecord());
      expect(merged).toStrictEqual({ scripts: ["install"] });
    });

    it("unions the scripts, dropping the field once it is all of them", () => {
      const merged = mergeAllowEntry(
        { semver: "^0.34.4", scripts: ["install"] },
        mkRecord({
          scripts: ["preinstall", "postinstall"],
        }),
      );
      expect(merged).toStrictEqual({ semver: "^0.34.4" });
    });

    it("merges into an entry npm wrote", () => {
      const merged = mergeAllowEntry("0.34.0", mkRecord());
      expect(merged).toStrictEqual({ semver: "0.34.0 || ^0.34.4" });
    });
  });

  describe("buildAllowScriptsPatch", function () {
    it("writes one entry per package, in the object form", () => {
      expect(buildAllowScriptsPatch([mkRecord()])).toStrictEqual({
        sharp: { semver: "^0.34.4", scripts: ["install"] },
      });
    });

    it("covers every version when pinning is off", () => {
      expect(buildAllowScriptsPatch([mkRecord()], { pin: false })).toStrictEqual({
        sharp: { scripts: ["install"] },
      });
    });

    it("folds a second version of the same package into one entry", () => {
      const patch = buildAllowScriptsPatch([mkRecord(), mkRecord({ version: "1.0.0" })]);
      expect(patch).toStrictEqual({
        sharp: { semver: "^0.34.4 || ^1.0.0", scripts: ["install"] },
      });
    });

    it("merges the scripts of records that share a package", () => {
      const patch = buildAllowScriptsPatch([
        mkRecord({ scripts: ["install"] }),
        mkRecord({ scripts: ["postinstall"] }),
      ]);
      expect(patch.sharp.scripts).toStrictEqual(["install", "postinstall"]);
    });
  });

  describe("dedupeBlockedRecords", function () {
    it("merges the same package's scripts and sorts by name", () => {
      const merged = dedupeBlockedRecords([
        mkRecord({ name: "zlib-sync", scripts: ["install"] }),
        mkRecord({ scripts: ["install"] }),
        mkRecord({ scripts: ["postinstall"] }),
      ]);
      expect(merged.map((r) => r.name)).toStrictEqual(["sharp", "zlib-sync"]);
      expect(merged[0].scripts).toStrictEqual(["install", "postinstall"]);
    });

    it("keeps different versions of a package apart", () => {
      const merged = dedupeBlockedRecords([mkRecord(), mkRecord({ version: "0.33.0" })]);
      expect(merged).toHaveLength(2);
    });
  });

  describe("blockedReasonText", function () {
    it("names each reason", () => {
      expect(blockedReasonText(mkRecord({ reason: "off" }))).toMatch(/off/);
      expect(blockedReasonText(mkRecord({ reason: "denied" }))).toMatch(/denied/);
      expect(blockedReasonText(mkRecord({ reason: "review" }))).toMatch(/not reviewed/);
      expect(
        blockedReasonText(mkRecord({ reason: "untrusted-source", urlType: "github" })),
      ).toMatch(/github/);
    });
  });

  describe("formatBlockedScriptsSummary", function () {
    it("says nothing when nothing was blocked", () => {
      expect(formatBlockedScriptsSummary([])).toStrictEqual([]);
    });

    it("lists each package once with the config to paste", () => {
      const lines = formatBlockedScriptsSummary(
        [mkRecord(), mkRecord({ name: "canvas", version: "5.0.1", scripts: ["install"] })],
        { mode: "review" },
      );
      const text = lines.join("\n");
      expect(text).toMatch(/2 packages did not run/);
      expect(text).toContain("sharp@0.34.4");
      expect(text).toContain("canvas@5.0.1");
      // the remediation is part of the same warning, not hidden behind verbose
      expect(text).toContain('"sharp":{"semver":"^0.34.4","scripts":["install"]}');
      expect(text).toContain("fyn install-scripts approve");
    });

    it("suggests unpinned keys when pinning is off", () => {
      const text = formatBlockedScriptsSummary([mkRecord()], { pin: false }).join("\n");
      expect(text).toContain('"sharp":{"scripts":["install"]}');
    });

    it("offers allowTopLevelScripts only when a direct dep was blocked", () => {
      const withTop = formatBlockedScriptsSummary([mkRecord({ topLevel: true })]).join("\n");
      expect(withTop).toContain("allowTopLevelScripts");
      expect(formatBlockedScriptsSummary([mkRecord()]).join("\n")).not.toContain(
        "allowTopLevelScripts",
      );
    });

    it("does not offer allowTopLevelScripts for a denied direct dep", () => {
      // a denial is checked before allowTopLevelScripts, so the suggestion
      // would be advice that provably changes nothing
      const text = formatBlockedScriptsSummary([
        mkRecord({ topLevel: true, reason: "denied" }),
      ]).join("\n");
      expect(text).toContain("sharp@0.34.4");
      expect(text).not.toContain("allowTopLevelScripts");
    });

    it("does not suggest approving a package that was explicitly denied", () => {
      const text = formatBlockedScriptsSummary([
        mkRecord({ reason: "denied" }),
        mkRecord({ name: "canvas", version: "5.0.1" }),
      ]).join("\n");
      expect(text).toContain("sharp@0.34.4");
      // canvas is offered, sharp is not - a denial is not undone by approving
      expect(text).toContain('"canvas"');
      expect(text).not.toContain('"sharp":{');
    });

    it('offers no allowlist under "off" - the mode is the reason', () => {
      const text = formatBlockedScriptsSummary([mkRecord({ reason: "off" })], {
        mode: "off",
      }).join("\n");
      expect(text).toContain("sharp@0.34.4");
      expect(text).not.toContain("To allow them");
    });
  });
});
