import { describe, it, expect } from "vitest";
import { SEMVER, DEP_ITEM } from "../../../lib/symbols";
import {
  getUrlType,
  isTrustedScriptSource,
  isLocalSource,
  isTopLevelDep,
  makeAllowKeys,
  evaluateScriptPolicy,
  isScriptAllowed,
  normalizeScriptPolicy,
  normalizeScriptPolicyIfSet,
  strictestScriptPolicy,
  mergeAllowScripts,
  foldDenyScripts,
  normalizeAllowScriptsConfig,
} from "../../../lib/util/lifecycle-script-policy";

/**
 * Build a fake resolved-package (depInfo) object.
 *
 * - `spec` is the original requested dependency spec (set on the SEMVER symbol).
 * - when `urlType` is provided it's attached via a fake DepItem on the
 *   DEP_ITEM symbol (primary detection path); otherwise the urlType is derived
 *   by analyzing `spec` (fallback path).
 *
 * @param {object} opts fields to build the fake depInfo from
 * @param {string} [opts.name] package name
 * @param {string} [opts.version] resolved version
 * @param {string} [opts.spec] original requested dependency spec
 * @param {string} [opts.urlType] explicit urlType for the fake DepItem
 * @param {boolean} [opts.depItem] whether to attach a DEP_ITEM symbol
 * @param {boolean} [opts.top] whether the dep was requested by the top-level
 *   package.json (sets `depInfo.top`, as the resolver does)
 * @param {object} [opts.parent] declaring dependency item
 * @returns {object} a fake depInfo carrying the SEMVER/DEP_ITEM symbols
 */
function mkDep({
  name = "foo",
  version = "1.0.0",
  spec,
  urlType,
  depItem = true,
  top,
  parent,
} = {}) {
  const depInfo = { name, version };
  if (spec !== undefined) {
    depInfo[SEMVER] = spec;
  }
  if (top !== undefined) {
    depInfo.top = top;
  }
  if (depItem && (urlType !== undefined || spec !== undefined)) {
    depInfo[DEP_ITEM] = { urlType, semver: spec, parent };
  }
  return depInfo;
}

describe("lifecycle-script-policy", function () {
  describe("getUrlType / isTrustedScriptSource", function () {
    it("treats registry semver as trusted (no urlType)", () => {
      const dep = mkDep({ spec: "^1.2.3" });
      expect(getUrlType(dep)).toBe(undefined);
      expect(isTrustedScriptSource(dep)).toBe(true);
    });

    it("treats local file: deps as trusted", () => {
      const dep = mkDep({ spec: "file:../bar" });
      expect(getUrlType(dep)).toBe(undefined);
      expect(isTrustedScriptSource(dep)).toBe(true);
    });

    it("treats local link: deps as trusted", () => {
      const dep = mkDep({ spec: "link:../bar" });
      expect(isTrustedScriptSource(dep)).toBe(true);
    });

    it("treats relative path deps as trusted", () => {
      const dep = mkDep({ spec: "../bar" });
      expect(isTrustedScriptSource(dep)).toBe(true);
    });

    it("treats npm: aliases as trusted (resolves from registry)", () => {
      const dep = mkDep({ spec: "npm:bar@^1.0.0" });
      expect(getUrlType(dep)).toBe("npm");
      expect(isTrustedScriptSource(dep)).toBe(true);
    });

    it("treats github: deps as untrusted", () => {
      const dep = mkDep({ spec: "github:user/repo" });
      expect(getUrlType(dep)).toBe("github");
      expect(isTrustedScriptSource(dep)).toBe(false);
    });

    it("treats github shorthand (user/repo) as untrusted", () => {
      const dep = mkDep({ spec: "user/repo", depItem: false });
      expect(getUrlType(dep)).toBe("github");
      expect(isTrustedScriptSource(dep)).toBe(false);
    });

    it("treats git+https deps as untrusted", () => {
      const dep = mkDep({ urlType: "git+https", spec: "git+https://x.com/a/b.git" });
      expect(isTrustedScriptSource(dep)).toBe(false);
    });

    it("treats http(s) tarball URLs as untrusted", () => {
      const dep = mkDep({ spec: "https://x.com/a/b-1.0.0.tgz" });
      expect(getUrlType(dep)).toBe("https");
      expect(isTrustedScriptSource(dep)).toBe(false);
    });

    it("derives urlType from spec when no DepItem is present", () => {
      const dep = mkDep({ spec: "github:user/repo", depItem: false });
      expect(getUrlType(dep)).toBe("github");
    });
  });

  describe("makeAllowKeys", function () {
    it("includes the spec, the resolved version, and the bare name keys", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo#v1" });
      expect(makeAllowKeys(dep)).toStrictEqual(["foo@github:user/foo#v1", "foo@2.3.0", "foo"]);
    });

    it("does not duplicate when spec equals version", () => {
      const dep = mkDep({ name: "foo", version: "1.0.0", spec: "1.0.0" });
      expect(makeAllowKeys(dep)).toStrictEqual(["foo@1.0.0", "foo"]);
    });
  });

  describe("evaluateScriptPolicy / isScriptAllowed", function () {
    it('allows all scripts for trusted (registry) packages under "source"', () => {
      const dep = mkDep({ spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "source" });
      expect(policy.trusted).toBe(true);
      expect(isScriptAllowed(policy, "preinstall")).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });

    it("blocks local deps declared by a non-registry parent", () => {
      const parent = { semver: "github:evil/parent", urlType: "github" };
      const dep = mkDep({ spec: "file:./payload", parent });
      const policy = evaluateScriptPolicy(dep, {});
      expect(policy.trusted).toBe(false);
      expect(policy.urlType).toBe("github");
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("allows local deps declared by a registry parent", () => {
      const parent = { semver: "^1.0.0" };
      const dep = mkDep({ spec: "file:./sibling", parent });
      expect(evaluateScriptPolicy(dep, {}).trusted).toBe(true);
    });

    it("blocks nested local deps under a non-registry ancestor", () => {
      const remote = { semver: "github:evil/parent", urlType: "github" };
      const local = { semver: "file:./middle", parent: remote };
      const dep = mkDep({ spec: "file:./payload", parent: local });
      expect(evaluateScriptPolicy(dep, {}).trusted).toBe(false);
    });

    it("blocks all scripts for untrusted packages with no whitelist", () => {
      const dep = mkDep({ spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, {});
      expect(policy.trusted).toBe(false);
      expect(isScriptAllowed(policy, "preinstall")).toBe(false);
      expect(isScriptAllowed(policy, "install")).toBe(false);
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("allows whitelisted scripts matched by spec", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, {
        "foo@github:user/foo": ["install", "postinstall"],
      });
      expect(isScriptAllowed(policy, "install")).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
      expect(isScriptAllowed(policy, "preinstall")).toBe(false);
    });

    it("allows whitelisted scripts matched by resolved version", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@2.3.0": ["install"] });
      expect(isScriptAllowed(policy, "install")).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("matches script names case-insensitively", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo": ["postInstall"] });
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });

    it("supports the wildcard '*' to allow all scripts", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo": ["*"] });
      expect(policy.allowAll).toBe(true);
      expect(isScriptAllowed(policy, "preinstall")).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });

    it("supports boolean true to allow all scripts", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo": true });
      expect(isScriptAllowed(policy, "install")).toBe(true);
    });

    it("suggests the spec key for warnings when nothing matched", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, {});
      expect(policy.key).toBe("foo@github:user/foo");
    });

    it('ignores a whitelist for trusted packages under "source" (stays trusted)', () => {
      const dep = mkDep({ name: "foo", version: "1.0.0", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { "foo@^1.0.0": [] }, { mode: "source" });
      expect(policy.trusted).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });
  });

  describe("isTopLevelDep", function () {
    it("is true when depInfo.top is set", () => {
      expect(isTopLevelDep(mkDep({ top: true }))).toBe(true);
    });

    it("is false when depInfo.top is unset/falsy", () => {
      expect(isTopLevelDep(mkDep({}))).toBe(false);
      expect(isTopLevelDep(mkDep({ top: false }))).toBe(false);
      expect(isTopLevelDep(undefined)).toBe(false);
    });
  });

  describe("evaluateScriptPolicy with allowTopLevelScripts (opt-in, source mode)", function () {
    it("reports topLevel on the policy result", () => {
      const top = mkDep({ spec: "github:user/foo", top: true });
      const transitive = mkDep({ spec: "github:user/foo" });
      expect(evaluateScriptPolicy(top, {}).topLevel).toBe(true);
      expect(evaluateScriptPolicy(transitive, {}).topLevel).toBe(false);
    });

    it("stays blocked by default (no option) even for top-level deps", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(dep, {});
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("allows all scripts for a top-level dep when allowTopLevel is true", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "source", allowTopLevel: true });
      expect(policy.allowAll).toBe(true);
      expect(isScriptAllowed(policy, "preinstall")).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });

    it("supports the wildcard '*' for allowTopLevel", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "source", allowTopLevel: "*" });
      expect(isScriptAllowed(policy, "install")).toBe(true);
    });

    it("restricts to listed script names when allowTopLevel is an array", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(
        dep,
        {},
        { mode: "source", allowTopLevel: ["postinstall"] },
      );
      expect(policy.allowAll).toBe(false);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
      expect(isScriptAllowed(policy, "preinstall")).toBe(false);
    });

    it("does NOT allow transitive (non-top-level) deps even when allowTopLevel is true", () => {
      const dep = mkDep({ spec: "github:user/foo", top: false });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "source", allowTopLevel: true });
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("treats allowTopLevel false/undefined as off", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      expect(
        isScriptAllowed(
          evaluateScriptPolicy(dep, {}, { mode: "source", allowTopLevel: false }),
          "install",
        ),
      ).toBe(false);
      expect(isScriptAllowed(evaluateScriptPolicy(dep, {}, {}), "install")).toBe(false);
    });

    it("unions allowTopLevel with a per-package allowScripts entry", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(
        dep,
        { "foo@github:user/foo": ["preinstall"] },
        { mode: "source", allowTopLevel: ["postinstall"] },
      );
      expect(isScriptAllowed(policy, "preinstall")).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
      expect(isScriptAllowed(policy, "install")).toBe(false);
    });

    it("does not affect trusted (registry) top-level deps", () => {
      const dep = mkDep({ spec: "^1.0.0", top: true });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "source", allowTopLevel: true });
      expect(policy.trusted).toBe(true);
      expect(policy.topLevel).toBe(true);
    });
  });

  describe("scriptPolicy modes", function () {
    it("defaults to review and rejects an unknown mode", () => {
      expect(normalizeScriptPolicy(undefined)).toBe("review");
      expect(normalizeScriptPolicy("")).toBe("review");
      expect(normalizeScriptPolicyIfSet(undefined)).toBe(undefined);
      expect(normalizeScriptPolicyIfSet("off")).toBe("off");
      expect(normalizeScriptPolicy("REVIEW")).toBe("review");
      expect(() => normalizeScriptPolicy("strict")).toThrow(/not valid/);
      expect(normalizeScriptPolicy("all")).toBe("all");
    });

    it("picks the strictest of the modes given", () => {
      expect(strictestScriptPolicy("source", "review")).toBe("review");
      expect(strictestScriptPolicy("review", "off")).toBe("off");
      expect(strictestScriptPolicy(undefined, undefined)).toBe("review");
      // an explicit mode looser than the default still wins
      expect(strictestScriptPolicy("source", undefined)).toBe("source");
      expect(strictestScriptPolicy("off", undefined, "source")).toBe("off");
    });

    it('"all" runs every package\'s scripts, whatever its source', () => {
      const registry = mkDep({ name: "foo", version: "1.0.0", spec: "^1.0.0" });
      const git = mkDep({ name: "bar", version: "1.0.0", spec: "github:x/bar", urlType: "github" });

      for (const dep of [registry, git]) {
        const policy = evaluateScriptPolicy(dep, {}, { mode: "all" });
        expect(policy.trusted).toBe(true);
        expect(policy.reason).toBe("all");
        expect(isScriptAllowed(policy, "preinstall")).toBe(true);
        expect(isScriptAllowed(policy, "postinstall")).toBe(true);
      }
    });

    it('"all" is a blacklist - an explicit false still denies', () => {
      const dep = mkDep({ name: "malware", version: "1.0.0", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { malware: false }, { mode: "all" });
      expect(policy.denied).toBe(true);
      expect(policy.reason).toBe("denied");
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);

      // and a package nobody denied still runs
      const other = mkDep({ name: "sharp", version: "1.0.0", spec: "^1.0.0" });
      expect(
        isScriptAllowed(
          evaluateScriptPolicy(other, { malware: false }, { mode: "all" }),
          "install",
        ),
      ).toBe(true);
    });

    it('"off" still wins over "all" when both scopes are in play', () => {
      expect(strictestScriptPolicy("all", "off")).toBe("off");
      expect(strictestScriptPolicy("all", "review")).toBe("review");
      expect(strictestScriptPolicy("all")).toBe("all");
    });

    it('"off" blocks everything and does not consult the allowlist', () => {
      const dep = mkDep({ name: "foo", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { foo: true }, { mode: "off" });
      expect(policy.denied).toBe(true);
      expect(policy.reason).toBe("off");
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it('does not honor allowTopLevelScripts under "review"', () => {
      // "I typed this name into package.json" is not "I read this code" - a
      // blanket exemption for direct deps would be the widest hole in review
      const dep = mkDep({ name: "foo", version: "1.0.0", spec: "^1.0.0", top: true });
      const allowTopLevel = { allowTopLevel: true };

      expect(
        isScriptAllowed(
          evaluateScriptPolicy(dep, {}, { mode: "source", ...allowTopLevel }),
          "install",
        ),
      ).toBe(true);
      expect(
        isScriptAllowed(
          evaluateScriptPolicy(dep, {}, { mode: "review", ...allowTopLevel }),
          "install",
        ),
      ).toBe(false);
    });

    it('does not honor allowTopLevelScripts for a git dep under "review" either', () => {
      const dep = mkDep({
        name: "foo",
        version: "1.0.0",
        spec: "github:user/foo",
        urlType: "github",
        top: true,
      });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "review", allowTopLevel: true });
      expect(isScriptAllowed(policy, "install")).toBe(false);
    });

    it('"review" blocks a registry package that has no allowlist entry', () => {
      const dep = mkDep({ name: "foo", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "review" });
      expect(policy.trusted).toBe(false);
      expect(policy.reason).toBe("review");
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it('"review" runs a registry package that is allowlisted', () => {
      const dep = mkDep({ name: "foo", version: "1.2.3", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { foo: true }, { mode: "review" });
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });

    it('"source" still runs a registry package with no entry', () => {
      const dep = mkDep({ name: "foo", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "source" });
      expect(policy.trusted).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });
  });

  describe("explicit denial (false)", function () {
    it("denies a registry package in source mode", () => {
      const dep = mkDep({ name: "malware", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { malware: false });
      expect(policy.denied).toBe(true);
      expect(policy.reason).toBe("denied");
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("wins over a wildcard entry on another matching key", () => {
      const dep = mkDep({ name: "malware", version: "1.0.0", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { malware: false, "malware@1.0.0": true });
      expect(isScriptAllowed(policy, "install")).toBe(false);
    });

    it("wins over allowTopLevelScripts", () => {
      const dep = mkDep({
        name: "malware",
        spec: "github:x/malware",
        urlType: "github",
        top: true,
      });
      const policy = evaluateScriptPolicy(
        dep,
        { malware: false },
        {
          mode: "source",
          allowTopLevel: true,
        },
      );
      expect(isScriptAllowed(policy, "preinstall")).toBe(false);
    });
  });

  describe("npm value forms", function () {
    it("allows all scripts for a matching version pin", () => {
      const dep = mkDep({ name: "canvas", version: "5.0.1", spec: "^5.0.0" });
      const policy = evaluateScriptPolicy(dep, { canvas: "5.0.1" }, { mode: "review" });
      expect(isScriptAllowed(policy, "install")).toBe(true);
    });

    it("does not allow a version the pin does not match", () => {
      const dep = mkDep({ name: "canvas", version: "5.1.0", spec: "^5.0.0" });
      const policy = evaluateScriptPolicy(dep, { canvas: "5.0.1" }, { mode: "review" });
      expect(isScriptAllowed(policy, "install")).toBe(false);
    });

    it("still reads a lifecycle script name as a script name", () => {
      const dep = mkDep({ name: "esbuild", version: "0.28.2", spec: "^0.28.0" });
      const policy = evaluateScriptPolicy(dep, { esbuild: "postinstall" }, { mode: "review" });
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
      expect(isScriptAllowed(policy, "preinstall")).toBe(false);
    });

    it("matches a bare-name key", () => {
      const dep = mkDep({ name: "sharp", version: "0.34.0", spec: "^0.34.0" });
      const policy = evaluateScriptPolicy(dep, { sharp: ["install"] }, { mode: "review" });
      expect(isScriptAllowed(policy, "install")).toBe(true);
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });
  });

  describe("workspace-local exemption", function () {
    /**
     * @param {object} [extra] extra depInfo fields
     * @returns {object} a fake local (fynpo sibling) depInfo
     */
    const mkLocal = (extra = {}) => {
      const dep = mkDep({ name: "sib", version: "1.0.0", spec: "../sib" });
      dep[DEP_ITEM].localType = "sym";
      dep.local = "sym";
      return Object.assign(dep, extra);
    };

    it("detects a local source", () => {
      expect(isLocalSource(mkLocal())).toBe(true);
      expect(isLocalSource(mkDep({ spec: "^1.0.0" }))).toBe(false);
    });

    it("runs local package scripts in review mode", () => {
      const policy = evaluateScriptPolicy(mkLocal(), {}, { mode: "review" });
      expect(policy.trusted).toBe(true);
      expect(policy.reason).toBe("local");
      expect(isScriptAllowed(policy, "postinstall")).toBe(true);
    });

    it("blocks local package scripts when reviewLocalPackages is on", () => {
      const policy = evaluateScriptPolicy(
        mkLocal(),
        {},
        {
          mode: "review",
          reviewLocalPackages: true,
        },
      );
      expect(policy.trusted).toBe(false);
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("still blocks a local path declared by a git package", () => {
      const dep = mkDep({ name: "nested", version: "1.0.0", spec: "../nested" });
      dep[DEP_ITEM].localType = "sym";
      dep[DEP_ITEM].parent = { urlType: "github", semver: "github:user/evil" };
      dep.local = "sym";
      const policy = evaluateScriptPolicy(dep, {}, { mode: "review" });
      expect(policy.urlType).toBe("github");
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it("a denial still applies to a local package", () => {
      const policy = evaluateScriptPolicy(mkLocal(), { sib: false }, { mode: "source" });
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });

    it('"off" blocks local packages too', () => {
      const policy = evaluateScriptPolicy(mkLocal(), {}, { mode: "off" });
      expect(isScriptAllowed(policy, "postinstall")).toBe(false);
    });
  });

  describe("key and value forms", function () {
    /**
     * @param {object} allowScripts the allowlist
     * @param {object} [dep] depInfo overrides
     * @returns {object} the policy for sharp@0.34.4 under review mode
     */
    const review = (allowScripts, dep = {}) =>
      evaluateScriptPolicy(
        mkDep({ name: "sharp", version: "0.34.4", spec: "^0.34.0", ...dep }),
        allowScripts,
        { mode: "review" },
      );

    it("matches a bare-name key against every version", () => {
      expect(isScriptAllowed(review({ sharp: ["install"] }), "install")).toBe(true);
    });

    it("matches a range in the key against the resolved version", () => {
      expect(isScriptAllowed(review({ "sharp@^0.34.0": ["install"] }), "install")).toBe(true);
      expect(isScriptAllowed(review({ "sharp@^0.33.0": ["install"] }), "install")).toBe(false);
    });

    it("matches a range union in the key, with either pipe form", () => {
      const both = { "sharp@^0.33.0 || ^0.34.0": ["install"] };
      const single = { "sharp@^0.33.0 | ^0.34.0": ["install"] };
      expect(isScriptAllowed(review(both), "install")).toBe(true);
      expect(isScriptAllowed(review(single), "install")).toBe(true);
    });

    it("matches a space-joined comparator range, the `>=x <y` form a widened allowlist uses", () => {
      // splitRange only breaks on `|`, so the comparators stay one AND range
      const bounded = { "sharp@>=0.33.0 <1": ["install"] };
      expect(isScriptAllowed(review(bounded), "install")).toBe(true);
      expect(isScriptAllowed(review(bounded, { version: "0.32.0" }), "install")).toBe(false);
      expect(isScriptAllowed(review(bounded, { version: "1.0.0" }), "install")).toBe(false);
      // and in the object form, where fynpo.json carries it
      const value = { sharp: { semver: ">=0.33.0 <1", scripts: ["install"] } };
      expect(isScriptAllowed(review(value), "install")).toBe(true);
      expect(isScriptAllowed(review(value, { version: "0.32.0" }), "install")).toBe(false);
    });

    it("still matches a git spec literally, where there is no version to range over", () => {
      const dep = mkDep({
        name: "foo",
        version: "1.0.0",
        spec: "github:user/foo#v1",
        urlType: "github",
      });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo#v1": ["install"] });
      expect(isScriptAllowed(policy, "install")).toBe(true);
    });

    it("reads the object form, with both fields optional", () => {
      expect(
        isScriptAllowed(review({ sharp: { semver: "^0.34.0", scripts: ["install"] } }), "install"),
      ).toBe(true);
      // wrong version
      expect(
        isScriptAllowed(review({ sharp: { semver: "^0.33.0", scripts: ["install"] } }), "install"),
      ).toBe(false);
      // wrong script
      expect(
        isScriptAllowed(
          review({ sharp: { semver: "^0.34.0", scripts: ["install"] } }),
          "postinstall",
        ),
      ).toBe(false);
      // no semver - every version; no scripts - every script
      expect(isScriptAllowed(review({ sharp: { scripts: ["install"] } }), "install")).toBe(true);
      expect(isScriptAllowed(review({ sharp: { semver: "^0.34.0" } }), "postinstall")).toBe(true);
      expect(isScriptAllowed(review({ sharp: {} }), "postinstall")).toBe(true);
    });

    it("applies both constraints when the key and the value each carry one", () => {
      const allow = { "sharp@^0.34.0": { semver: "^0.34.4", scripts: ["install"] } };
      expect(isScriptAllowed(review(allow), "install")).toBe(true);
      expect(isScriptAllowed(review(allow, { version: "0.34.1" }), "install")).toBe(false);
    });

    it("keeps reading npm's value form", () => {
      expect(isScriptAllowed(review({ sharp: "0.34.4" }), "postinstall")).toBe(true);
      expect(isScriptAllowed(review({ sharp: "0.33.0" }), "postinstall")).toBe(false);
    });

    it("lets a denial under any matching key win", () => {
      expect(
        isScriptAllowed(
          review({ "sharp@^0.34.0": false, sharp: { scripts: ["install"] } }),
          "install",
        ),
      ).toBe(false);
    });
  });

  describe("normalizeAllowScriptsConfig", function () {
    it("splits commas inside array entries, the shape --allow-scripts=a,b arrives in", () => {
      // nix-clap's variadic option hands `--allow-scripts=a,b` over as ["a,b"]
      expect(normalizeAllowScriptsConfig(["esbuild,sharp"])).toStrictEqual({
        esbuild: true,
        sharp: true,
      });
      expect(normalizeAllowScriptsConfig("esbuild, sharp")).toStrictEqual({
        esbuild: true,
        sharp: true,
      });
      expect(normalizeAllowScriptsConfig(["esbuild", "sharp"])).toStrictEqual({
        esbuild: true,
        sharp: true,
      });
    });

    it("passes a map through untouched", () => {
      const map = { sharp: { semver: "^1.0.0" } };
      expect(normalizeAllowScriptsConfig(map)).toBe(map);
    });
  });

  describe("denyScripts", function () {
    /**
     * @param {object} [over] depInfo overrides
     * @returns {object} a fake registry depInfo for sharp@0.34.4
     */
    const dep = (over = {}) =>
      mkDep({ name: "sharp", version: "0.34.4", spec: "^0.34.0", ...over });

    /**
     * @param {object} allowScripts the allowlist
     * @param {object} denyScripts the denylist
     * @param {object} [options] extra policy options
     * @returns {object} the policy
     */
    const policyFor = (allowScripts, denyScripts, options = {}) =>
      evaluateScriptPolicy(dep(), allowScripts, { mode: "review", denyScripts, ...options });

    describe("foldDenyScripts", function () {
      it("reads the same entry shape as allowScripts", () => {
        expect(foldDenyScripts(dep(), { sharp: {} }).denyAll).toBe(true);
        expect(foldDenyScripts(dep(), { sharp: { semver: "^0.34.0" } }).denyAll).toBe(true);
        expect(foldDenyScripts(dep(), { sharp: true }).denyAll).toBe(true);
      });

      it("denies only the named scripts when the entry names some", () => {
        const folded = foldDenyScripts(dep(), { sharp: { scripts: ["postinstall"] } });
        expect(folded.denyAll).toBe(false);
        expect([...folded.scripts]).toStrictEqual(["postinstall"]);
      });

      it("does not match a version the entry's semver excludes", () => {
        expect(foldDenyScripts(dep(), { sharp: { semver: "^0.33.0" } }).denyAll).toBe(false);
      });

      it("matches a range in the key, like the allowlist does", () => {
        expect(foldDenyScripts(dep(), { "sharp@^0.34.0": {} }).denyAll).toBe(true);
        expect(foldDenyScripts(dep(), { "sharp@^0.33.0": {} }).denyAll).toBe(false);
      });

      it("denies nothing for an absent or empty map", () => {
        expect(foldDenyScripts(dep(), undefined).denyAll).toBe(false);
        expect(foldDenyScripts(dep(), {}).denyAll).toBe(false);
      });
    });

    describe("deny beats every kind of approval", function () {
      const denyAll = { sharp: {} };

      it("beats an allowScripts approval", () => {
        expect(isScriptAllowed(policyFor({ sharp: {} }, denyAll), "install")).toBe(false);
      });

      it('beats "all" mode', () => {
        expect(isScriptAllowed(policyFor({}, denyAll, { mode: "all" }), "install")).toBe(false);
      });

      it('beats the registry exemption under "source"', () => {
        expect(isScriptAllowed(policyFor({}, denyAll, { mode: "source" }), "install")).toBe(false);
      });

      it("beats allowTopLevelScripts", () => {
        const policy = evaluateScriptPolicy(
          dep({ top: true }),
          {},
          {
            mode: "source",
            allowTopLevel: true,
            denyScripts: denyAll,
          },
        );
        expect(isScriptAllowed(policy, "install")).toBe(false);
      });

      it("beats the workspace-local exemption", () => {
        const local = dep({ spec: "../sharp" });
        local[DEP_ITEM].localType = "sym";
        local.local = "sym";
        const policy = evaluateScriptPolicy(
          local,
          {},
          {
            mode: "review",
            denyScripts: denyAll,
          },
        );
        expect(isScriptAllowed(policy, "postinstall")).toBe(false);
      });

      it("denying a bare name blocks a version-keyed approval", () => {
        expect(isScriptAllowed(policyFor({ "sharp@^0.34.0": {} }, { sharp: {} }), "install")).toBe(
          false,
        );
      });

      it("denying name@<range> blocks only the matching versions", () => {
        expect(isScriptAllowed(policyFor({ sharp: {} }, { "sharp@^0.34.0": {} }), "install")).toBe(
          false,
        );
        expect(isScriptAllowed(policyFor({ sharp: {} }, { "sharp@^0.33.0": {} }), "install")).toBe(
          true,
        );
      });
    });

    describe("a deny entry that names scripts", function () {
      it("denies those and leaves the rest allowed", () => {
        const policy = policyFor({ sharp: {} }, { sharp: { scripts: ["postinstall"] } });
        expect(isScriptAllowed(policy, "postinstall")).toBe(false);
        expect(isScriptAllowed(policy, "install")).toBe(true);
        expect(isScriptAllowed(policy, "preinstall")).toBe(true);
      });

      it("still denies a script the package was never approved for", () => {
        const policy = policyFor({}, { sharp: { scripts: ["postinstall"] } });
        expect(isScriptAllowed(policy, "postinstall")).toBe(false);
      });
    });
  });

  describe("per-script markers in allowScripts", function () {
    /**
     * @param {(string[]|object)} scripts the entry's scripts value
     * @param {string} name the lifecycle script to test
     * @returns {boolean} whether it is allowed
     */
    const allowed = (scripts, name) =>
      isScriptAllowed(
        evaluateScriptPolicy(
          mkDep({ name: "sharp", version: "0.34.4", spec: "^0.34.0" }),
          { sharp: { scripts } },
          { mode: "review" },
        ),
        name,
      );

    it("treats a bare name and +name the same", () => {
      expect(allowed(["install"], "install")).toBe(true);
      expect(allowed(["+install"], "install")).toBe(true);
      expect(allowed(["+install"], "postinstall")).toBe(false);
    });

    it("!name denies that script", () => {
      expect(allowed(["*", "!postinstall"], "postinstall")).toBe(false);
      expect(allowed(["*", "!postinstall"], "install")).toBe(true);
      expect(allowed(["*", "!postinstall"], "preinstall")).toBe(true);
    });

    it("a denial wins however the approval was spelled", () => {
      expect(allowed(["postinstall", "!postinstall"], "postinstall")).toBe(false);
      expect(allowed(["+postinstall", "!postinstall"], "postinstall")).toBe(false);
    });

    it("!* denies every script", () => {
      expect(allowed(["*", "!*"], "install")).toBe(false);
      expect(allowed(["install", "!*"], "install")).toBe(false);
    });

    it("markers work in the array shorthand too", () => {
      const policy = evaluateScriptPolicy(
        mkDep({ name: "sharp", version: "0.34.4", spec: "^0.34.0" }),
        { sharp: ["*", "!preinstall"] },
        { mode: "review" },
      );
      expect(isScriptAllowed(policy, "preinstall")).toBe(false);
      expect(isScriptAllowed(policy, "install")).toBe(true);
    });
  });
});
