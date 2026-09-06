import { describe, it, expect } from "vitest";
import DepItem from "../../../lib/dep-item";
import {
  isNonRegistryUrlType,
  isValidRegistrySpec,
  violatesRegistryPolicy,
} from "../../../lib/util/registry-dep-policy";

/**
 * Build a real DepItem from a dependency spec - exercises the same
 * `semverUtil.analyze` path the resolver uses, so the policy's `urlType` /
 * `localType` / `semver` reads are validated end-to-end.
 *
 * @param {string} spec the dependency spec
 * @param {string} [name] package name
 * @param {object} [parent] declaring dependency item
 * @returns {object} a DepItem
 */
function mkItem(spec, name = "foo", parent = null) {
  return new DepItem({ name, semver: spec, src: "dep", dsrc: "dep" }, parent);
}

describe("registry-dep-policy", function () {
  describe("isNonRegistryUrlType", function () {
    it("flags git/github/url types as non-registry", () => {
      ["github", "git", "git+ssh", "git+https", "git+http", "git+file", "http", "https"].forEach(
        (t) => {
          expect(isNonRegistryUrlType(t), t).toBe(true);
        },
      );
    });

    it("treats the npm: alias as registry-backed", () => {
      expect(isNonRegistryUrlType("npm")).toBe(false);
    });

    it("treats empty/undefined urlType (registry/local) as registry", () => {
      expect(isNonRegistryUrlType(undefined)).toBe(false);
      expect(isNonRegistryUrlType("")).toBe(false);
    });
  });

  describe("isValidRegistrySpec", function () {
    it("accepts semver ranges and exact versions", () => {
      ["^1.2.3", "~1.0.0", "1.x", ">=1 <2", "1.2.3", "1.2.3-beta.1"].forEach((s) =>
        expect(isValidRegistrySpec(s), s).toBe(true),
      );
    });

    it("accepts the wildcard and empty spec", () => {
      ["*", "x", "", "   "].forEach((s) =>
        expect(isValidRegistrySpec(s), JSON.stringify(s)).toBe(true),
      );
    });

    it("accepts npm dist-tags", () => {
      ["latest", "next", "beta", "canary-1.2"].forEach((s) =>
        expect(isValidRegistrySpec(s), s).toBe(true),
      );
    });

    it("rejects unparseable garbage", () => {
      ["@@@", "!!nope!!", "->"].forEach((s) => expect(isValidRegistrySpec(s), s).toBe(false));
      expect(isValidRegistrySpec(undefined)).toBe(false);
      expect(isValidRegistrySpec(null)).toBe(false);
    });
  });

  describe("violatesRegistryPolicy (plain objects)", function () {
    it("rejects non-registry url sources", () => {
      expect(
        violatesRegistryPolicy({ name: "foo", semver: "github:u/r", urlType: "github" }),
      ).toStrictEqual({ kind: "url", urlType: "github" });
    });

    it("accepts the npm: alias", () => {
      expect(violatesRegistryPolicy({ name: "foo", semver: "npm:bar@^1", urlType: "npm" })).toBe(
        null,
      );
    });

    it("accepts local file/link/sym deps", () => {
      expect(violatesRegistryPolicy({ name: "foo", semver: "file:../x", localType: "hard" })).toBe(
        null,
      );
      expect(violatesRegistryPolicy({ name: "foo", semver: "../x", localType: "hard" })).toBe(null);
      expect(violatesRegistryPolicy({ name: "foo", semver: "x", localType: "sym" })).toBe(null);
    });

    it("accepts valid registry semver and dist-tags", () => {
      expect(violatesRegistryPolicy({ name: "foo", semver: "^1.0.0" })).toBe(null);
      expect(violatesRegistryPolicy({ name: "foo", semver: "latest" })).toBe(null);
    });

    it("rejects an unparseable registry semver", () => {
      expect(violatesRegistryPolicy({ name: "foo", semver: "@@@" })).toStrictEqual({
        kind: "semver",
        semver: "@@@",
      });
    });
  });

  describe("violatesRegistryPolicy (real DepItem instances)", function () {
    it("rejects github shorthand, github:/git/git+*/http(s)", () => {
      [
        "github:user/repo",
        "user/repo",
        "git+https://x.com/a/b.git",
        "git+ssh://git@x.com/a/b.git",
        "git://x.com/a/b.git",
        "https://x.com/a/b-1.0.0.tgz",
        "http://x.com/a/b-1.0.0.tgz",
      ].forEach((spec) => {
        const v = violatesRegistryPolicy(mkItem(spec));
        expect(v, spec).toBeInstanceOf(Object);
        expect(Array.isArray(v), spec).toBe(false);
        expect(v.kind, spec).toBe("url");
      });
    });

    it("accepts an npm: alias DepItem", () => {
      expect(violatesRegistryPolicy(mkItem("npm:bar@^1.0.0"))).toBe(null);
    });

    it("accepts local DepItems (file:/link:/relative)", () => {
      ["file:../bar", "link:../bar", "../bar", "./bar"].forEach((spec) =>
        expect(violatesRegistryPolicy(mkItem(spec)), spec).toBe(null),
      );
    });

    it("rejects a local dep declared by a non-registry parent", () => {
      const parent = mkItem("github:evil/parent", "parent");
      expect(violatesRegistryPolicy(mkItem("file:./payload", "payload", parent))).toStrictEqual({
        kind: "local",
        urlType: "github",
      });
    });

    it("accepts a local dep declared by a registry parent", () => {
      const parent = mkItem("^1.0.0", "parent");
      expect(violatesRegistryPolicy(mkItem("file:./sibling", "sibling", parent))).toBe(null);
    });

    it("rejects a nested local dep whose nearest non-local ancestor is untrusted", () => {
      const remote = mkItem("github:evil/parent", "parent");
      const local = mkItem("file:./middle", "middle", remote);
      expect(violatesRegistryPolicy(mkItem("file:./payload", "payload", local))).toStrictEqual({
        kind: "local",
        urlType: "github",
      });
    });

    it("accepts registry semver/range/tag DepItems", () => {
      ["^1.2.3", "1.x", "latest", "*"].forEach((spec) =>
        expect(violatesRegistryPolicy(mkItem(spec)), spec).toBe(null),
      );
    });
  });
});
