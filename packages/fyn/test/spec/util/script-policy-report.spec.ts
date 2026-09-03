import { describe, it } from "vitest";
import { expect } from "chai";
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
  formatBlockedScriptsSummary
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
  ...over
});

describe("script-policy-report", function () {
  describe("makeBlockedRecord", function () {
    it("captures what the summary and install-scripts ls need", () => {
      const record = makeBlockedRecord(
        { name: "esbuild", version: "0.28.2" },
        { key: "esbuild@^0.28.0", urlType: undefined, reason: "review", topLevel: true, local: false },
        ["postinstall"]
      );
      expect(record).to.deep.equal({
        name: "esbuild",
        version: "0.28.2",
        key: "esbuild@^0.28.0",
        scripts: ["postinstall"],
        urlType: undefined,
        reason: "review",
        topLevel: true,
        local: false
      });
    });

    it("copies the blocked list so later mutation cannot reach it", () => {
      const blocked = ["install"];
      const record = makeBlockedRecord({ name: "a", version: "1.0.0" }, {}, blocked);
      blocked.push("postinstall");
      expect(record.scripts).to.deep.equal(["install"]);
    });
  });

  describe("allowScriptsKey / makeAllowEntry", function () {
    it("keys every entry by the bare package name", () => {
      expect(allowScriptsKey(mkRecord())).to.equal("sharp");
      expect(allowScriptsKey(mkRecord({ name: "@scope/pkg" }))).to.equal("@scope/pkg");
    });

    it("scopes the approval to the reviewed release line by default", () => {
      expect(makeAllowEntry(mkRecord())).to.deep.equal({
        semver: "^0.34.4",
        scripts: ["install"]
      });
    });

    it("omits semver when pinning is off - every version", () => {
      expect(makeAllowEntry(mkRecord(), false)).to.deep.equal({ scripts: ["install"] });
    });

    it("omits scripts when every install script is approved", () => {
      const record = mkRecord({ scripts: ["preinstall", "install", "postinstall"] });
      expect(makeAllowEntry(record)).to.deep.equal({ semver: "^0.34.4" });
      expect(makeAllowEntry(record, false)).to.deep.equal({});
    });
  });

  describe("normalizeScriptsValue", function () {
    it("collapses a full set to the wildcard", () => {
      expect(normalizeScriptsValue(["postinstall", "install", "preinstall"])).to.deep.equal(["*"]);
      expect(normalizeScriptsValue(["*"])).to.deep.equal(["*"]);
      expect(normalizeScriptsValue(true)).to.deep.equal(["*"]);
      expect(normalizeScriptsValue([])).to.deep.equal([]);
    });

    it("orders a partial set by lifecycle order", () => {
      expect(normalizeScriptsValue(["postinstall", "preinstall"])).to.deep.equal([
        "preinstall",
        "postinstall"
      ]);
    });
  });

  describe("addVersionToRange", function () {
    it("leaves a range that already covers the version alone", () => {
      expect(addVersionToRange("^1.2.0", "1.3.0")).to.equal("^1.2.0");
    });

    it("unions a version the range does not cover", () => {
      expect(addVersionToRange("^1.2.0", "2.0.1")).to.equal("^1.2.0 || ^2.0.1");
    });

    it("accepts a single pipe and writes the semver double pipe", () => {
      expect(addVersionToRange("^1.2.0 | ^2.0.0", "3.0.0")).to.equal(
        "^1.2.0 || ^2.0.0 || ^3.0.0"
      );
    });
  });

  describe("toAllowEntry", function () {
    it("reads npm's version form as a semver constraint", () => {
      expect(toAllowEntry("1.2.3")).to.deep.equal({ semver: "1.2.3" });
      expect(toAllowEntry("^1.2.3")).to.deep.equal({ semver: "^1.2.3" });
    });

    it("reads fyn's script forms", () => {
      expect(toAllowEntry(["install"])).to.deep.equal({ scripts: ["install"] });
      expect(toAllowEntry("postinstall")).to.deep.equal({ scripts: ["postinstall"] });
      expect(toAllowEntry(true)).to.deep.equal({});
      expect(toAllowEntry("*")).to.deep.equal({});
    });

    it("passes the object form through", () => {
      const entry = { semver: "^1.0.0", scripts: ["install"] };
      expect(toAllowEntry(entry)).to.equal(entry);
    });
  });

  describe("mergeAllowEntry", function () {
    it("widens semver for a second version of the same package", () => {
      const first = makeAllowEntry(mkRecord());
      const merged = mergeAllowEntry(first, mkRecord({ version: "1.0.0" }));
      expect(merged).to.deep.equal({ semver: "^0.34.4 || ^1.0.0", scripts: ["install"] });
    });

    it("does not widen for a version the range already covers", () => {
      const merged = mergeAllowEntry({ semver: "^0.34.0", scripts: ["install"] }, mkRecord());
      expect(merged.semver).to.equal("^0.34.0");
    });

    it("keeps every version when the existing entry had no semver", () => {
      const merged = mergeAllowEntry({ scripts: ["install"] }, mkRecord());
      expect(merged).to.deep.equal({ scripts: ["install"] });
    });

    it("unions the scripts, dropping the field once it is all of them", () => {
      const merged = mergeAllowEntry({ semver: "^0.34.4", scripts: ["install"] }, mkRecord({
        scripts: ["preinstall", "postinstall"]
      }));
      expect(merged).to.deep.equal({ semver: "^0.34.4" });
    });

    it("merges into an entry npm wrote", () => {
      const merged = mergeAllowEntry("0.34.0", mkRecord());
      expect(merged).to.deep.equal({ semver: "0.34.0 || ^0.34.4" });
    });
  });

  describe("buildAllowScriptsPatch", function () {
    it("writes one entry per package, in the object form", () => {
      expect(buildAllowScriptsPatch([mkRecord()])).to.deep.equal({
        sharp: { semver: "^0.34.4", scripts: ["install"] }
      });
    });

    it("covers every version when pinning is off", () => {
      expect(buildAllowScriptsPatch([mkRecord()], { pin: false })).to.deep.equal({
        sharp: { scripts: ["install"] }
      });
    });

    it("folds a second version of the same package into one entry", () => {
      const patch = buildAllowScriptsPatch([mkRecord(), mkRecord({ version: "1.0.0" })]);
      expect(patch).to.deep.equal({
        sharp: { semver: "^0.34.4 || ^1.0.0", scripts: ["install"] }
      });
    });

    it("merges the scripts of records that share a package", () => {
      const patch = buildAllowScriptsPatch([
        mkRecord({ scripts: ["install"] }),
        mkRecord({ scripts: ["postinstall"] })
      ]);
      expect(patch.sharp.scripts).to.deep.equal(["install", "postinstall"]);
    });
  });

  describe("dedupeBlockedRecords", function () {
    it("merges the same package's scripts and sorts by name", () => {
      const merged = dedupeBlockedRecords([
        mkRecord({ name: "zlib-sync", scripts: ["install"] }),
        mkRecord({ scripts: ["install"] }),
        mkRecord({ scripts: ["postinstall"] })
      ]);
      expect(merged.map(r => r.name)).to.deep.equal(["sharp", "zlib-sync"]);
      expect(merged[0].scripts).to.deep.equal(["install", "postinstall"]);
    });

    it("keeps different versions of a package apart", () => {
      const merged = dedupeBlockedRecords([mkRecord(), mkRecord({ version: "0.33.0" })]);
      expect(merged).to.have.length(2);
    });
  });

  describe("blockedReasonText", function () {
    it("names each reason", () => {
      expect(blockedReasonText(mkRecord({ reason: "off" }))).to.match(/off/);
      expect(blockedReasonText(mkRecord({ reason: "denied" }))).to.match(/denied/);
      expect(blockedReasonText(mkRecord({ reason: "review" }))).to.match(/not reviewed/);
      expect(
        blockedReasonText(mkRecord({ reason: "untrusted-source", urlType: "github" }))
      ).to.match(/github/);
    });
  });

  describe("formatBlockedScriptsSummary", function () {
    it("says nothing when nothing was blocked", () => {
      expect(formatBlockedScriptsSummary([])).to.deep.equal([]);
    });

    it("lists each package once with the config to paste", () => {
      const lines = formatBlockedScriptsSummary(
        [mkRecord(), mkRecord({ name: "canvas", version: "5.0.1", scripts: ["install"] })],
        { mode: "review" }
      );
      const text = lines.join("\n");
      expect(text).to.match(/2 packages did not run/);
      expect(text).to.include("sharp@0.34.4");
      expect(text).to.include("canvas@5.0.1");
      // the remediation is part of the same warning, not hidden behind verbose
      expect(text).to.include('"sharp":{"semver":"^0.34.4","scripts":["install"]}');
      expect(text).to.include("fyn install-scripts approve");
    });

    it("suggests unpinned keys when pinning is off", () => {
      const text = formatBlockedScriptsSummary([mkRecord()], { pin: false }).join("\n");
      expect(text).to.include('"sharp":{"scripts":["install"]}');
    });

    it("offers allowTopLevelScripts only when a direct dep was blocked", () => {
      const withTop = formatBlockedScriptsSummary([mkRecord({ topLevel: true })]).join("\n");
      expect(withTop).to.include("allowTopLevelScripts");
      expect(formatBlockedScriptsSummary([mkRecord()]).join("\n")).to.not.include(
        "allowTopLevelScripts"
      );
    });

    it("does not suggest approving a package that was explicitly denied", () => {
      const text = formatBlockedScriptsSummary([
        mkRecord({ reason: "denied" }),
        mkRecord({ name: "canvas", version: "5.0.1" })
      ]).join("\n");
      expect(text).to.include("sharp@0.34.4");
      // canvas is offered, sharp is not - a denial is not undone by approving
      expect(text).to.include('"canvas"');
      expect(text).to.not.include('"sharp":{');
    });

    it('offers no allowlist under "off" - the mode is the reason', () => {
      const text = formatBlockedScriptsSummary([mkRecord({ reason: "off" })], {
        mode: "off"
      }).join("\n");
      expect(text).to.include("sharp@0.34.4");
      expect(text).to.not.include("To allow them");
    });
  });
});
