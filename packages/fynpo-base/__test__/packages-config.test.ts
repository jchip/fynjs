import { describe, it, expect } from "vitest";

import { resolvePackagesConfig, discoveryPatterns } from "../src/packages-config";

describe("resolvePackagesConfig", () => {
  it("defaults to auto-search on, respectGitignore off, nothing else set", () => {
    const c = resolvePackagesConfig(undefined);

    expect(c.autoSearch).toEqual({ enable: true, respectGitignore: false });
    expect(c.include).toEqual([]);
    expect(c.exclude).toEqual([]);
    expect(c.publishInclude).toEqual([]);
    expect(c.publishExclude).toEqual([]);
  });

  // FPO-17: the historical shape. It used to drive discovery; now it only narrows publish.
  it("treats an array as publishInclude, with auto-search still on", () => {
    const c = resolvePackagesConfig(["packages/*", "_w/*"]);

    // entries are coerced to path refs - see the dedicated describe below for why
    expect(c.publishInclude).toEqual(["path:packages/*", "path:_w/*"]);
    expect(c.include).toEqual([]);
    expect(c.autoSearch).toEqual({ enable: true, respectGitignore: false });
  });

  it("reads the object form", () => {
    const c = resolvePackagesConfig({
      autoSearch: { enable: true, respectGitignore: true },
      include: ["libs/*"],
      exclude: ["**/fixtures/**"],
      publishInclude: ["libs/a"],
      publishExclude: ["libs/b"],
    });

    expect(c.autoSearch).toEqual({ enable: true, respectGitignore: true });
    expect(c.include).toEqual(["libs/*"]);
    expect(c.exclude).toEqual(["**/fixtures/**"]);
    expect(c.publishInclude).toEqual(["libs/a"]);
    expect(c.publishExclude).toEqual(["libs/b"]);
  });

  it("accepts autoSearch as a boolean", () => {
    expect(resolvePackagesConfig({ autoSearch: true }).autoSearch.enable).toBe(true);
    expect(resolvePackagesConfig({ autoSearch: false }).autoSearch.enable).toBe(false);
  });

  it("defaults respectGitignore to off even when autoSearch is an object", () => {
    expect(resolvePackagesConfig({ autoSearch: { enable: true } }).autoSearch.respectGitignore).toBe(
      false
    );
  });

  it("falls back to packages/* when auto-search is off and no include is given", () => {
    const c = resolvePackagesConfig({ autoSearch: false });

    expect(c.include).toEqual(["packages/*"]);
  });

  it("keeps an explicit include when auto-search is off", () => {
    const c = resolvePackagesConfig({ autoSearch: false, include: ["libs/*"] });

    expect(c.include).toEqual(["libs/*"]);
  });

  it("tolerates a bare string and drops empty or non-string entries", () => {
    const c = resolvePackagesConfig({
      include: "libs/*",
      publishInclude: ["a", "", "   ", null, 42, "b"],
    });

    expect(c.include).toEqual(["libs/*"]);
    expect(c.publishInclude).toEqual(["a", "b"]);
  });
});

describe("discoveryPatterns", () => {
  it("returns null to signal auto-search when nothing is declared", () => {
    expect(discoveryPatterns(resolvePackagesConfig(undefined))).toBeNull();
  });

  it("still auto-searches for the array shape - it does not narrow discovery", () => {
    expect(discoveryPatterns(resolvePackagesConfig(["packages/*"]))).toBeNull();
  });

  it("uses explicit include when given", () => {
    expect(discoveryPatterns(resolvePackagesConfig({ include: ["libs/*"] }))).toEqual(["libs/*"]);
  });

  it("explicit include wins over auto-search", () => {
    const c = resolvePackagesConfig({ autoSearch: true, include: ["libs/*"] });

    expect(discoveryPatterns(c)).toEqual(["libs/*"]);
  });

  it("falls back to packages/* with auto-search off", () => {
    expect(discoveryPatterns(resolvePackagesConfig({ autoSearch: false }))).toEqual(["packages/*"]);
  });
});

// The array form has always held PATH globs, but PackageRef reads a bare string as a NAME.
// Passing them through unchanged made every ref match nothing, and since a non-empty allow
// list fails closed, that silently made the whole repo unpublishable.
describe("resolvePackagesConfig - legacy array entries are path refs", () => {
  it("prefixes bare globs with path:", () => {
    const c = resolvePackagesConfig(["packages/*", "_w/*"]);

    expect(c.publishInclude).toEqual(["path:packages/*", "path:_w/*"]);
  });

  it("leaves an entry that already declares its type alone", () => {
    const c = resolvePackagesConfig(["path:core/*", "name:fyn", "id:esm-react@19.2.8"]);

    expect(c.publishInclude).toEqual(["path:core/*", "name:fyn", "id:esm-react@19.2.8"]);
  });

  it("does not coerce the object form, where refs are written explicitly", () => {
    const c = resolvePackagesConfig({ publishInclude: ["fyn"] });

    expect(c.publishInclude).toEqual(["fyn"]);
  });
});
