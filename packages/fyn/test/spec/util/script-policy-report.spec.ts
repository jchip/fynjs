import { describe, it } from "vitest";
import { expect } from "chai";
import {
  makeBlockedRecord,
  allowScriptsKey,
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

  describe("allowScriptsKey", function () {
    it("pins to the resolved version by default", () => {
      expect(allowScriptsKey(mkRecord())).to.equal("sharp@0.34.4");
    });

    it("uses the bare name when pinning is off", () => {
      expect(allowScriptsKey(mkRecord(), false)).to.equal("sharp");
    });
  });

  describe("buildAllowScriptsPatch", function () {
    it("suggests only the scripts that were blocked", () => {
      expect(buildAllowScriptsPatch([mkRecord()])).to.deep.equal({
        "sharp@0.34.4": ["install"]
      });
    });

    it("merges the scripts of records that share a key", () => {
      const patch = buildAllowScriptsPatch([
        mkRecord({ scripts: ["install"] }),
        mkRecord({ scripts: ["postinstall"] })
      ]);
      expect(patch).to.deep.equal({ "sharp@0.34.4": ["install", "postinstall"] });
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
      expect(text).to.include('"sharp@0.34.4":["install"]');
      expect(text).to.include("fyn install-scripts approve");
    });

    it("suggests unpinned keys when pinning is off", () => {
      const text = formatBlockedScriptsSummary([mkRecord()], { pin: false }).join("\n");
      expect(text).to.include('"sharp":["install"]');
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
      expect(text).to.include('"canvas@5.0.1":["install"]');
      expect(text).to.not.include('"sharp@0.34.4":["install"]');
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
