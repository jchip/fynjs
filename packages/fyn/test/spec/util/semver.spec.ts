import { describe, it, expect } from "vitest";
import * as semver from "../../../lib/util/semver";

describe("semver", function() {
  describe("split", function() {
    it("should split", () => {
      expect(semver.split("0.8.3")).toStrictEqual(["0.8.3"]);
      expect(semver.split("0.8.3", "-")).toStrictEqual(["0.8.3"]);
      expect(semver.split("0.8.3", "-", 1)).toStrictEqual(["0.8.3"]);
      expect(semver.split("0.8.3--rc")).toStrictEqual(["0.8.3--rc"]);
      expect(semver.split("0.8.3--rc", "-")).toStrictEqual(["0.8.3", "-rc"]);

      expect(semver.split("@foo/bar", "@", 1)).toStrictEqual(["@foo/bar"]);
      expect(semver.split("@foo/bar", "@")).toStrictEqual(["", "foo/bar"]);
      expect(semver.split("@foo/bar@0.8.3", "@", 1)).toStrictEqual(["@foo/bar", "0.8.3"]);
    });
  });

  describe("simpleCompare", function() {
    it("should sort a release ahead of its prerelease (release is newer)", () => {
      // per semver 0.8.3 > 0.8.3-<pre>, so in descending order the release
      // sorts first (negative = a is newer)
      expect(semver.simpleCompare("0.8.3", "0.8.3--rc")).toBe(-1);
      expect(semver.simpleCompare("0.8.3--rc", "0.8.3")).toBe(1);
      expect(semver.simpleCompare("1.0.0", "1.0.0-alpha")).toBe(-1);
      expect(semver.simpleCompare("1.0.0-alpha", "1.0.0")).toBe(1);
    });

    it("should handle both have suffix", () => {
      expect(semver.simpleCompare("0.8.3-a", "0.8.3-b")).toBe(1);
      expect(semver.simpleCompare("0.8.3-b", "0.8.3-a")).toBe(-1);
    });

    it("orders prerelease identifiers numerically, not lexically", () => {
      // alpha.9 < alpha.10 per semver; descending => alpha.10 first
      expect(semver.simpleCompare("1.0.0-alpha.9", "1.0.0-alpha.10")).toBe(1);
      expect(semver.simpleCompare("1.0.0-alpha.10", "1.0.0-alpha.9")).toBe(-1);
    });

    it("should handle identical/same versions", () => {
      expect(semver.simpleCompare("0.8.3", "0.8.3")).toBe(0);
      expect(semver.simpleCompare("10.08.003", "010.8.03")).toBe(0);
    });

    it("should handle numerical diff versions", () => {
      expect(semver.simpleCompare("0.8.4", "0.8.3")).toBe(-1);
      expect(semver.simpleCompare("0.09.3", "0.8.3")).toBe(-1);
      expect(semver.simpleCompare("01.8.3", "0.8.3")).toBe(-1);

      expect(semver.simpleCompare("0.8.3", "0.8.4")).toBe(1);
      expect(semver.simpleCompare("0.8.3", "0.09.3")).toBe(1);
      expect(semver.simpleCompare("0.8.3", "01.8.3")).toBe(1);
    });
  });

  describe("localify", function() {
    it("should add tag", () => {
      const x = semver.localify("0.1.1");
      expect(x).toBe("0.1.1-fynlocal");
      expect(semver.isLocal(x)).toBe(true);
    });

    it("should add tag with hash", () => {
      const x = semver.localify("0.1.1", false, "xyz");
      expect(x).toBe("0.1.1-fynlocalxyz");
      expect(semver.isLocal(x)).toBe(true);
    });
  });

  describe("unlocalify", function() {
    it("should remove tag", () => {
      expect(semver.unlocalify("0.1.1-fynlocal")).toBe("0.1.1");
    });

    it("should remove tag with hash", () => {
      expect(semver.unlocalify("0.1.1-fynlocalxyz")).toBe("0.1.1");
    });

    it("should do nothing if there's no tag", () => {
      expect(semver.unlocalify("0.1.1")).toBe("0.1.1");
    });
  });

  describe("equal", function() {
    it("should return true for one fynlocal versions", () => {
      expect(semver.equal("0.1.1-fynlocal", "0.1.1")).toBe(true);
    });

    it("should return true for two fynlocal versions", () => {
      expect(semver.equal("0.1.1-fynlocal", "0.1.1-fynlocal")).toBe(true);
    });

    it("should return false for two fynlocal diff versions", () => {
      expect(semver.equal("0.1.1-fynlocal", "0.1.2-fynlocal")).toBe(false);
    });

    it("should return false for two versions with diff fynlocals", () => {
      expect(semver.equal("0.1.1-fynlocalxyz", "0.1.1-fynlocalabc")).toBe(false);
    });
  });

  describe("satisfies", function() {
    it("should return true for non fynlocal version", () => {
      expect(semver.satisfies("0.1.1", "^0.1.0")).toBe(true);
    });

    it("should return true for fynlocal version", () => {
      expect(semver.satisfies("0.1.1-fynlocal123", "^0.1.0")).toBe(true);
    });

    it("should return false for unmatch fynlocal version", () => {
      expect(semver.satisfies("0.1.1-fynlocal123", "^0.2.0")).toBe(false);
    });

    it("should return false for unmatch  version", () => {
      expect(semver.satisfies("0.1.1", "^0.2.0")).toBe(false);
    });
  });

  describe("clean", function() {
    it("should clean 3001.0001.0000-dev-harmony-fb", () => {
      expect(semver.clean("3001.0001.0000-dev-harmony-fb")).toBe("3001.1.0-dev-harmony-fb");
    });

    it("should clean 2.1.17+deprecated", () => {
      expect(semver.clean("2.1.17+deprecated")).toBe("2.1.17");
    });
  });
});
