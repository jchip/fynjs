import { describe, it } from "vitest";
import { expect } from "chai";
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
  strictestScriptPolicy
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
  parent
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

describe("lifecycle-script-policy", function() {
  describe("getUrlType / isTrustedScriptSource", function() {
    it("treats registry semver as trusted (no urlType)", () => {
      const dep = mkDep({ spec: "^1.2.3" });
      expect(getUrlType(dep)).to.equal(undefined);
      expect(isTrustedScriptSource(dep)).to.equal(true);
    });

    it("treats local file: deps as trusted", () => {
      const dep = mkDep({ spec: "file:../bar" });
      expect(getUrlType(dep)).to.equal(undefined);
      expect(isTrustedScriptSource(dep)).to.equal(true);
    });

    it("treats local link: deps as trusted", () => {
      const dep = mkDep({ spec: "link:../bar" });
      expect(isTrustedScriptSource(dep)).to.equal(true);
    });

    it("treats relative path deps as trusted", () => {
      const dep = mkDep({ spec: "../bar" });
      expect(isTrustedScriptSource(dep)).to.equal(true);
    });

    it("treats npm: aliases as trusted (resolves from registry)", () => {
      const dep = mkDep({ spec: "npm:bar@^1.0.0" });
      expect(getUrlType(dep)).to.equal("npm");
      expect(isTrustedScriptSource(dep)).to.equal(true);
    });

    it("treats github: deps as untrusted", () => {
      const dep = mkDep({ spec: "github:user/repo" });
      expect(getUrlType(dep)).to.equal("github");
      expect(isTrustedScriptSource(dep)).to.equal(false);
    });

    it("treats github shorthand (user/repo) as untrusted", () => {
      const dep = mkDep({ spec: "user/repo", depItem: false });
      expect(getUrlType(dep)).to.equal("github");
      expect(isTrustedScriptSource(dep)).to.equal(false);
    });

    it("treats git+https deps as untrusted", () => {
      const dep = mkDep({ urlType: "git+https", spec: "git+https://x.com/a/b.git" });
      expect(isTrustedScriptSource(dep)).to.equal(false);
    });

    it("treats http(s) tarball URLs as untrusted", () => {
      const dep = mkDep({ spec: "https://x.com/a/b-1.0.0.tgz" });
      expect(getUrlType(dep)).to.equal("https");
      expect(isTrustedScriptSource(dep)).to.equal(false);
    });

    it("derives urlType from spec when no DepItem is present", () => {
      const dep = mkDep({ spec: "github:user/repo", depItem: false });
      expect(getUrlType(dep)).to.equal("github");
    });
  });

  describe("makeAllowKeys", function() {
    it("includes the spec, the resolved version, and the bare name keys", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo#v1" });
      expect(makeAllowKeys(dep)).to.deep.equal(["foo@github:user/foo#v1", "foo@2.3.0", "foo"]);
    });

    it("does not duplicate when spec equals version", () => {
      const dep = mkDep({ name: "foo", version: "1.0.0", spec: "1.0.0" });
      expect(makeAllowKeys(dep)).to.deep.equal(["foo@1.0.0", "foo"]);
    });
  });

  describe("evaluateScriptPolicy / isScriptAllowed", function() {
    it("allows all scripts for trusted (registry) packages", () => {
      const dep = mkDep({ spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, {});
      expect(policy.trusted).to.equal(true);
      expect(isScriptAllowed(policy, "preinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });

    it("blocks local deps declared by a non-registry parent", () => {
      const parent = { semver: "github:evil/parent", urlType: "github" };
      const dep = mkDep({ spec: "file:./payload", parent });
      const policy = evaluateScriptPolicy(dep, {});
      expect(policy.trusted).to.equal(false);
      expect(policy.urlType).to.equal("github");
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("allows local deps declared by a registry parent", () => {
      const parent = { semver: "^1.0.0" };
      const dep = mkDep({ spec: "file:./sibling", parent });
      expect(evaluateScriptPolicy(dep, {}).trusted).to.equal(true);
    });

    it("blocks nested local deps under a non-registry ancestor", () => {
      const remote = { semver: "github:evil/parent", urlType: "github" };
      const local = { semver: "file:./middle", parent: remote };
      const dep = mkDep({ spec: "file:./payload", parent: local });
      expect(evaluateScriptPolicy(dep, {}).trusted).to.equal(false);
    });

    it("blocks all scripts for untrusted packages with no whitelist", () => {
      const dep = mkDep({ spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, {});
      expect(policy.trusted).to.equal(false);
      expect(isScriptAllowed(policy, "preinstall")).to.equal(false);
      expect(isScriptAllowed(policy, "install")).to.equal(false);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("allows whitelisted scripts matched by spec", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, {
        "foo@github:user/foo": ["install", "postinstall"]
      });
      expect(isScriptAllowed(policy, "install")).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "preinstall")).to.equal(false);
    });

    it("allows whitelisted scripts matched by resolved version", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@2.3.0": ["install"] });
      expect(isScriptAllowed(policy, "install")).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("matches script names case-insensitively", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo": ["postInstall"] });
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });

    it("supports the wildcard '*' to allow all scripts", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo": ["*"] });
      expect(policy.allowAll).to.equal(true);
      expect(isScriptAllowed(policy, "preinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });

    it("supports boolean true to allow all scripts", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo": true });
      expect(isScriptAllowed(policy, "install")).to.equal(true);
    });

    it("suggests the spec key for warnings when nothing matched", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo" });
      const policy = evaluateScriptPolicy(dep, {});
      expect(policy.key).to.equal("foo@github:user/foo");
    });

    it("ignores a whitelist for trusted packages (stays trusted)", () => {
      const dep = mkDep({ name: "foo", version: "1.0.0", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { "foo@^1.0.0": [] });
      expect(policy.trusted).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });
  });

  describe("isTopLevelDep", function() {
    it("is true when depInfo.top is set", () => {
      expect(isTopLevelDep(mkDep({ top: true }))).to.equal(true);
    });

    it("is false when depInfo.top is unset/falsy", () => {
      expect(isTopLevelDep(mkDep({}))).to.equal(false);
      expect(isTopLevelDep(mkDep({ top: false }))).to.equal(false);
      expect(isTopLevelDep(undefined)).to.equal(false);
    });
  });

  describe("evaluateScriptPolicy with allowTopLevelScripts (opt-in)", function() {
    it("reports topLevel on the policy result", () => {
      const top = mkDep({ spec: "github:user/foo", top: true });
      const transitive = mkDep({ spec: "github:user/foo" });
      expect(evaluateScriptPolicy(top, {}).topLevel).to.equal(true);
      expect(evaluateScriptPolicy(transitive, {}).topLevel).to.equal(false);
    });

    it("stays blocked by default (no option) even for top-level deps", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(dep, {});
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("allows all scripts for a top-level dep when allowTopLevel is true", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(dep, {}, { allowTopLevel: true });
      expect(policy.allowAll).to.equal(true);
      expect(isScriptAllowed(policy, "preinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });

    it("supports the wildcard '*' for allowTopLevel", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(dep, {}, { allowTopLevel: "*" });
      expect(isScriptAllowed(policy, "install")).to.equal(true);
    });

    it("restricts to listed script names when allowTopLevel is an array", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(dep, {}, { allowTopLevel: ["postinstall"] });
      expect(policy.allowAll).to.equal(false);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "preinstall")).to.equal(false);
    });

    it("does NOT allow transitive (non-top-level) deps even when allowTopLevel is true", () => {
      const dep = mkDep({ spec: "github:user/foo", top: false });
      const policy = evaluateScriptPolicy(dep, {}, { allowTopLevel: true });
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("treats allowTopLevel false/undefined as off", () => {
      const dep = mkDep({ spec: "github:user/foo", top: true });
      expect(isScriptAllowed(evaluateScriptPolicy(dep, {}, { allowTopLevel: false }), "install")).to.equal(false);
      expect(isScriptAllowed(evaluateScriptPolicy(dep, {}, {}), "install")).to.equal(false);
    });

    it("unions allowTopLevel with a per-package allowScripts entry", () => {
      const dep = mkDep({ name: "foo", version: "2.3.0", spec: "github:user/foo", top: true });
      const policy = evaluateScriptPolicy(
        dep,
        { "foo@github:user/foo": ["preinstall"] },
        { allowTopLevel: ["postinstall"] }
      );
      expect(isScriptAllowed(policy, "preinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "install")).to.equal(false);
    });

    it("does not affect trusted (registry) top-level deps", () => {
      const dep = mkDep({ spec: "^1.0.0", top: true });
      const policy = evaluateScriptPolicy(dep, {}, { allowTopLevel: true });
      expect(policy.trusted).to.equal(true);
      expect(policy.topLevel).to.equal(true);
    });
  });

  describe("scriptPolicy modes", function() {
    it("defaults to source and rejects an unknown mode", () => {
      expect(normalizeScriptPolicy(undefined)).to.equal("source");
      expect(normalizeScriptPolicy("")).to.equal("source");
      expect(normalizeScriptPolicy("REVIEW")).to.equal("review");
      expect(() => normalizeScriptPolicy("strict")).to.throw(/not valid/);
    });

    it("picks the strictest of the modes given", () => {
      expect(strictestScriptPolicy("source", "review")).to.equal("review");
      expect(strictestScriptPolicy("review", "off")).to.equal("off");
      expect(strictestScriptPolicy(undefined, undefined)).to.equal("source");
      expect(strictestScriptPolicy("off", undefined, "source")).to.equal("off");
    });

    it('"off" blocks everything and does not consult the allowlist', () => {
      const dep = mkDep({ name: "foo", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { foo: true }, { mode: "off" });
      expect(policy.denied).to.equal(true);
      expect(policy.reason).to.equal("off");
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it('"review" blocks a registry package that has no allowlist entry', () => {
      const dep = mkDep({ name: "foo", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "review" });
      expect(policy.trusted).to.equal(false);
      expect(policy.reason).to.equal("review");
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it('"review" runs a registry package that is allowlisted', () => {
      const dep = mkDep({ name: "foo", version: "1.2.3", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { foo: true }, { mode: "review" });
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });

    it('"source" still runs a registry package with no entry', () => {
      const dep = mkDep({ name: "foo", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, {}, { mode: "source" });
      expect(policy.trusted).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });
  });

  describe("explicit denial (false)", function() {
    it("denies a registry package in source mode", () => {
      const dep = mkDep({ name: "malware", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { malware: false });
      expect(policy.denied).to.equal(true);
      expect(policy.reason).to.equal("denied");
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("wins over a wildcard entry on another matching key", () => {
      const dep = mkDep({ name: "malware", version: "1.0.0", spec: "^1.0.0" });
      const policy = evaluateScriptPolicy(dep, { malware: false, "malware@1.0.0": true });
      expect(isScriptAllowed(policy, "install")).to.equal(false);
    });

    it("wins over allowTopLevelScripts", () => {
      const dep = mkDep({ name: "malware", spec: "github:x/malware", urlType: "github", top: true });
      const policy = evaluateScriptPolicy(dep, { malware: false }, { allowTopLevel: true });
      expect(isScriptAllowed(policy, "preinstall")).to.equal(false);
    });
  });

  describe("npm value forms", function() {
    it("allows all scripts for a matching version pin", () => {
      const dep = mkDep({ name: "canvas", version: "5.0.1", spec: "^5.0.0" });
      const policy = evaluateScriptPolicy(dep, { canvas: "5.0.1" }, { mode: "review" });
      expect(isScriptAllowed(policy, "install")).to.equal(true);
    });

    it("does not allow a version the pin does not match", () => {
      const dep = mkDep({ name: "canvas", version: "5.1.0", spec: "^5.0.0" });
      const policy = evaluateScriptPolicy(dep, { canvas: "5.0.1" }, { mode: "review" });
      expect(isScriptAllowed(policy, "install")).to.equal(false);
    });

    it("still reads a lifecycle script name as a script name", () => {
      const dep = mkDep({ name: "esbuild", version: "0.28.2", spec: "^0.28.0" });
      const policy = evaluateScriptPolicy(dep, { esbuild: "postinstall" }, { mode: "review" });
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
      expect(isScriptAllowed(policy, "preinstall")).to.equal(false);
    });

    it("matches a bare-name key", () => {
      const dep = mkDep({ name: "sharp", version: "0.34.0", spec: "^0.34.0" });
      const policy = evaluateScriptPolicy(dep, { sharp: ["install"] }, { mode: "review" });
      expect(isScriptAllowed(policy, "install")).to.equal(true);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });
  });

  describe("workspace-local exemption", function() {
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
      expect(isLocalSource(mkLocal())).to.equal(true);
      expect(isLocalSource(mkDep({ spec: "^1.0.0" }))).to.equal(false);
    });

    it("runs local package scripts in review mode", () => {
      const policy = evaluateScriptPolicy(mkLocal(), {}, { mode: "review" });
      expect(policy.trusted).to.equal(true);
      expect(policy.reason).to.equal("local");
      expect(isScriptAllowed(policy, "postinstall")).to.equal(true);
    });

    it("blocks local package scripts when reviewLocalPackages is on", () => {
      const policy = evaluateScriptPolicy(mkLocal(), {}, {
        mode: "review",
        reviewLocalPackages: true
      });
      expect(policy.trusted).to.equal(false);
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("still blocks a local path declared by a git package", () => {
      const dep = mkDep({ name: "nested", version: "1.0.0", spec: "../nested" });
      dep[DEP_ITEM].localType = "sym";
      dep[DEP_ITEM].parent = { urlType: "github", semver: "github:user/evil" };
      dep.local = "sym";
      const policy = evaluateScriptPolicy(dep, {}, { mode: "review" });
      expect(policy.urlType).to.equal("github");
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it("a denial still applies to a local package", () => {
      const policy = evaluateScriptPolicy(mkLocal(), { sib: false }, { mode: "source" });
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
    });

    it('"off" blocks local packages too', () => {
      const policy = evaluateScriptPolicy(mkLocal(), {}, { mode: "off" });
      expect(isScriptAllowed(policy, "postinstall")).to.equal(false);
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
        { mode: "review" }
      );

    it("matches a bare-name key against every version", () => {
      expect(isScriptAllowed(review({ sharp: ["install"] }), "install")).to.equal(true);
    });

    it("matches a range in the key against the resolved version", () => {
      expect(isScriptAllowed(review({ "sharp@^0.34.0": ["install"] }), "install")).to.equal(true);
      expect(isScriptAllowed(review({ "sharp@^0.33.0": ["install"] }), "install")).to.equal(false);
    });

    it("matches a range union in the key, with either pipe form", () => {
      const both = { "sharp@^0.33.0 || ^0.34.0": ["install"] };
      const single = { "sharp@^0.33.0 | ^0.34.0": ["install"] };
      expect(isScriptAllowed(review(both), "install")).to.equal(true);
      expect(isScriptAllowed(review(single), "install")).to.equal(true);
    });

    it("still matches a git spec literally, where there is no version to range over", () => {
      const dep = mkDep({
        name: "foo",
        version: "1.0.0",
        spec: "github:user/foo#v1",
        urlType: "github"
      });
      const policy = evaluateScriptPolicy(dep, { "foo@github:user/foo#v1": ["install"] });
      expect(isScriptAllowed(policy, "install")).to.equal(true);
    });

    it("reads the object form, with both fields optional", () => {
      expect(
        isScriptAllowed(review({ sharp: { semver: "^0.34.0", scripts: ["install"] } }), "install")
      ).to.equal(true);
      // wrong version
      expect(
        isScriptAllowed(review({ sharp: { semver: "^0.33.0", scripts: ["install"] } }), "install")
      ).to.equal(false);
      // wrong script
      expect(
        isScriptAllowed(review({ sharp: { semver: "^0.34.0", scripts: ["install"] } }), "postinstall")
      ).to.equal(false);
      // no semver - every version; no scripts - every script
      expect(isScriptAllowed(review({ sharp: { scripts: ["install"] } }), "install")).to.equal(true);
      expect(isScriptAllowed(review({ sharp: { semver: "^0.34.0" } }), "postinstall")).to.equal(true);
      expect(isScriptAllowed(review({ sharp: {} }), "postinstall")).to.equal(true);
    });

    it("applies both constraints when the key and the value each carry one", () => {
      const allow = { "sharp@^0.34.0": { semver: "^0.34.4", scripts: ["install"] } };
      expect(isScriptAllowed(review(allow), "install")).to.equal(true);
      expect(isScriptAllowed(review(allow, { version: "0.34.1" }), "install")).to.equal(false);
    });

    it("keeps reading npm's value form", () => {
      expect(isScriptAllowed(review({ sharp: "0.34.4" }), "postinstall")).to.equal(true);
      expect(isScriptAllowed(review({ sharp: "0.33.0" }), "postinstall")).to.equal(false);
    });

    it("lets a denial under any matching key win", () => {
      expect(
        isScriptAllowed(review({ "sharp@^0.34.0": false, sharp: { scripts: ["install"] } }), "install")
      ).to.equal(false);
    });
  });
});
