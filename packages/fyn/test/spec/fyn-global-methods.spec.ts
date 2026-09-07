import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Exercises the registry, spec-parsing, and filesystem methods of FynGlobal that
 * do not require the network (install/update/fetch are covered elsewhere / need a
 * registry). Uses a throwaway global dir and mocks the bin linker + Fyn class.
 */

// shared call log the mocked classes record into (hoisted so the vi.mock
// factories below can reference it)
const { calls } = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("../../lib/pkg-bin-linker", () => {
  class FakePkgBinLinker {
    constructor(options) {
      calls.push({ type: "construct", options });
    }
    async hasBinLink(binName) {
      calls.push({ type: "has", binName });
      return false;
    }
    async linkBinPath(target, binName, options) {
      calls.push({ type: "link", target, binName, options });
    }
    async matchesBinPath(binName, target) {
      calls.push({ type: "match", binName, target });
      return true;
    }
    async removeBinLink(binName) {
      calls.push({ type: "remove", binName });
    }
  }
  return { default: FakePkgBinLinker };
});

vi.mock("../../lib/fyn", () => {
  class FakeFyn {
    constructor(config) {
      calls.push({ type: "fyn", opts: config.opts });
    }
  }
  return { default: FakeFyn };
});

import FynGlobal from "../../lib/fyn-global";

describe("fyn-global methods", function() {
  const globalDir = path.join(__dirname, "../.fyn-global-methods");
  const versionDir = path.join(globalDir, "v20");
  const packagesDir = path.join(versionDir, "packages");

  const cleanup = () => {
    fs.rmSync(globalDir, { recursive: true, force: true });
  };

  const makeGlobal = (options = {}) => new FynGlobal({ globalDir, nodeVersion: "20", ...options });

  beforeEach(() => {
    cleanup();
    calls.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  describe("constructor", () => {
    it("derives the version paths from globalDir + nodeVersion", () => {
      const g = makeGlobal();
      expect(g.globalRoot).toBe(globalDir);
      expect(g.versionDir).toBe(versionDir);
      expect(g.packagesDir).toBe(packagesDir);
      expect(g.installedJsonPath).toBe(path.join(versionDir, "installed.json"));
      expect(g.runtimePrefix).toBe("v");
      expect(g.interactive).toBe(true);
      expect(g.yes).toBe(false);
      expect(g.tag).toBe(null);
    });

    it("honors interactive:false, yes:true and tag options", () => {
      const g = makeGlobal({ interactive: false, yes: true, tag: "g3" });
      expect(g.interactive).toBe(false);
      expect(g.yes).toBe(true);
      expect(g.tag).toBe("g3");
    });
  });

  describe("_getVersionBinTargets", () => {
    it("maps declared bins to paths under the package .bin dir", () => {
      const g = makeGlobal();
      const bins = g._getVersionBinTargets({ dir: "g1", bins: ["foo", "bar"] });
      expect(bins.foo).toBe(path.join(packagesDir, "g1", "node_modules", ".bin", "foo"));
      expect(bins.bar).toBe(path.join(packagesDir, "g1", "node_modules", ".bin", "bar"));
    });

    it("returns an empty map when there are no bins", () => {
      const g = makeGlobal();
      expect(g._getVersionBinTargets({ dir: "g1" })).toStrictEqual({});
    });
  });

  describe("isLocalSpec", () => {
    it("detects local specs", () => {
      const g = makeGlobal();
      expect(g.isLocalSpec("file:../foo")).toBe(true);
      expect(g.isLocalSpec("/abs/path")).toBe(true);
      expect(g.isLocalSpec("./rel")).toBe(true);
      expect(g.isLocalSpec("../rel")).toBe(true);
      expect(g.isLocalSpec("some/dir")).toBe(true);
    });

    it("treats registry names (incl. scoped) as non-local", () => {
      const g = makeGlobal();
      expect(g.isLocalSpec("lodash")).toBe(false);
      expect(g.isLocalSpec("lodash@4.0.0")).toBe(false);
      expect(g.isLocalSpec("@scope/name")).toBe(false);
    });
  });

  describe("parsePackageName", () => {
    it("strips version and npm: alias for registry specs", async () => {
      const g = makeGlobal();
      expect(await g.parsePackageName("lodash@4.17.21")).toBe("lodash");
      expect(await g.parsePackageName("lodash")).toBe("lodash");
      expect(await g.parsePackageName("@scope/name@1.0.0")).toBe("@scope/name");
      expect(await g.parsePackageName("npm:lodash@4.0.0")).toBe("lodash");
    });

    it("reads name from package.json for a local spec", async () => {
      const g = makeGlobal();
      const pkgDir = path.join(globalDir, "localpkg");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "my-local" }));
      expect(await g.parsePackageName(`file:${pkgDir}`)).toBe("my-local");
    });

    it("throws a helpful error when a local package.json is missing", async () => {
      const g = makeGlobal();
      const pkgDir = path.join(globalDir, "no-pkg-here");
      let error;
      try {
        await g.parsePackageName(`file:${pkgDir}`);
      } catch (err) {
        error = err;
      }
      expect(error).toEqual(expect.anything());
      expect(error.message).toContain("Cannot read package.json");
    });
  });

  describe("installed.json registry", () => {
    it("readInstalledJson returns an empty registry when the file is absent", async () => {
      const g = makeGlobal();
      expect(await g.readInstalledJson()).toStrictEqual({ packages: {} });
    });

    it("writeInstalledJson creates the version dir and round-trips", async () => {
      const g = makeGlobal();
      const registry = { packages: { foo: { versions: [{ version: "1.0.0", dir: "g1" }] } } };
      await g.writeInstalledJson(registry);
      expect(fs.existsSync(g.installedJsonPath)).toBe(true);
      expect(await g.readInstalledJson()).toStrictEqual(registry);
    });

    it("getPackageVersions returns [] for unknown and the versions for known", async () => {
      const g = makeGlobal();
      expect(await g.getPackageVersions("nope")).toStrictEqual([]);
      await g.writeInstalledJson({ packages: { foo: { versions: [{ version: "1.0.0", dir: "g1" }] } } });
      expect(await g.getPackageVersions("foo")).toHaveLength(1);
    });

    it("getLinkedVersion returns the linked version or null", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({
        packages: {
          foo: {
            versions: [
              { version: "1.0.0", dir: "g1", linked: false },
              { version: "2.0.0", dir: "g2", linked: true }
            ]
          }
        }
      });
      expect((await g.getLinkedVersion("foo")).version).toBe("2.0.0");
      await g.writeInstalledJson({ packages: { bar: { versions: [{ version: "1.0.0", dir: "g3" }] } } });
      expect(await g.getLinkedVersion("bar")).toBe(null);
    });

    it("findByTag / validateTag locate an installation by its dir", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({ packages: { foo: { versions: [{ version: "1.0.0", dir: "g1" }] } } });
      const found = await g.findByTag("g1");
      expect(found.packageName).toBe("foo");
      expect(found.versionInfo.version).toBe("1.0.0");
      expect(await g.findByTag("nope")).toBe(null);

      const gt = makeGlobal({ tag: "g1" });
      await gt.writeInstalledJson({ packages: { foo: { versions: [{ version: "1.0.0", dir: "g1" }] } } });
      expect((await gt.validateTag()).packageName).toBe("foo");
    });

    it("validateTag returns null when no tag and throws for a missing tag", async () => {
      const g = makeGlobal();
      expect(await g.validateTag()).toBe(null);

      const gt = makeGlobal({ tag: "gX" });
      let error;
      try {
        await gt.validateTag();
      } catch (err) {
        error = err;
      }
      expect(error).toEqual(expect.anything());
      expect(error.message).toContain("not found");
    });

    it("addToRegistry appends new versions and replaces same-dir entries", async () => {
      const g = makeGlobal();
      await g.addToRegistry("foo", { version: "1.0.0", dir: "g1" });
      await g.addToRegistry("foo", { version: "2.0.0", dir: "g2" });
      expect(await g.getPackageVersions("foo")).toHaveLength(2);
      // same dir -> replace
      await g.addToRegistry("foo", { version: "1.0.1", dir: "g1" });
      const versions = await g.getPackageVersions("foo");
      expect(versions).toHaveLength(2);
      expect(versions.find(v => v.dir === "g1").version).toBe("1.0.1");
    });

    it("removeFromRegistry drops an entry by dir and prunes empty packages", async () => {
      const g = makeGlobal();
      await g.addToRegistry("foo", { version: "1.0.0", dir: "g1" });
      await g.addToRegistry("foo", { version: "2.0.0", dir: "g2" });
      await g.removeFromRegistry("foo", "g1");
      expect(await g.getPackageVersions("foo")).toHaveLength(1);
      expect((await g.getPackageVersions("foo"))[0].dir).toBe("g2");
      await g.removeFromRegistry("foo", "g2");
      const registry = await g.readInstalledJson();
      expect(registry.packages.foo).toBe(undefined);
      // no-op for unknown package
      await g.removeFromRegistry("ghost", "g1");
    });

    it("updateLinkedInRegistry links one version and unlinks the rest", async () => {
      const g = makeGlobal();
      await g.addToRegistry("foo", { version: "1.0.0", dir: "g1", linked: true });
      await g.addToRegistry("foo", { version: "2.0.0", dir: "g2", linked: false });
      await g.updateLinkedInRegistry("foo", "2.0.0", true);
      const versions = await g.getPackageVersions("foo");
      expect(versions.find(v => v.version === "1.0.0").linked).toBe(false);
      expect(versions.find(v => v.version === "2.0.0").linked).toBe(true);
      // no-op for unknown package
      await g.updateLinkedInRegistry("ghost", "1.0.0", true);
    });

    it("findInstalledPackage prefers the linked version", async () => {
      const g = makeGlobal();
      expect(await g.findInstalledPackage("foo")).toBe(null);
      await g.writeInstalledJson({
        packages: {
          foo: {
            versions: [
              { version: "1.0.0", dir: "g1", linked: false },
              { version: "2.0.0", dir: "g2", linked: true }
            ]
          }
        }
      });
      expect((await g.findInstalledPackage("foo")).dir).toBe("g2");
    });

    it("getAllGlobalPackages flattens the registry", async () => {
      const g = makeGlobal();
      await g.addToRegistry("foo", { version: "1.0.0", dir: "g1" });
      await g.addToRegistry("bar", { version: "2.0.0", dir: "g2" });
      const all = await g.getAllGlobalPackages();
      expect(all).toHaveLength(2);
      expect(all.map(p => p.meta.package).sort()).toStrictEqual(["bar", "foo"]);
    });

    it("findBinOwner returns the linked owner of a bin", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({
        packages: {
          foo: { versions: [{ version: "1.0.0", dir: "g1", bins: ["foo"], linked: true }] },
          bar: { versions: [{ version: "2.0.0", dir: "g2", bins: ["bar"], linked: false }] }
        }
      });
      expect(await g.findBinOwner("foo")).toBe("foo@1.0.0");
      expect(await g.findBinOwner("bar")).toBe(null); // present but not linked
      expect(await g.findBinOwner("baz")).toBe(null);
    });

    it("findPackageByLocalPath matches local installs by resolved spec", async () => {
      const g = makeGlobal();
      const localDir = path.join(globalDir, "src", "widget");
      const searchSpec = `file:${path.resolve(localDir)}`;
      await g.writeInstalledJson({
        packages: {
          widget: { versions: [{ version: "1.0.0", dir: "g1", local: true, semver: searchSpec }] }
        }
      });
      const found = await g.findPackageByLocalPath(localDir);
      expect(found.packageName).toBe("widget");
      expect(found.versions).toHaveLength(1);
      expect(await g.findPackageByLocalPath(path.join(globalDir, "src", "other"))).toBe(null);
    });
  });

  describe("getNextGlobalId", () => {
    it("returns g1 when packages dir is empty/absent", async () => {
      const g = makeGlobal();
      expect(await g.getNextGlobalId()).toBe("g1");
    });

    it("returns the next id past the highest existing gN", async () => {
      const g = makeGlobal();
      fs.mkdirSync(path.join(packagesDir, "g1"), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, "g5"), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, "not-a-pkg"), { recursive: true });
      expect(await g.getNextGlobalId()).toBe("g6");
    });
  });

  describe("discoverBins / getInstalledVersion", () => {
    const seedPkg = (dir, pkgName, { json, bins = [] }) => {
      const nm = path.join(dir, "node_modules");
      fs.mkdirSync(path.join(nm, pkgName), { recursive: true });
      fs.writeFileSync(path.join(nm, pkgName, "package.json"), JSON.stringify(json));
      const binDir = path.join(nm, ".bin");
      fs.mkdirSync(binDir, { recursive: true });
      for (const b of bins) {
        fs.writeFileSync(path.join(binDir, b), "#!/usr/bin/env node\n");
      }
    };

    it("discovers object-form bins that exist in .bin", async () => {
      const g = makeGlobal();
      const pkgDir = path.join(packagesDir, "g1");
      seedPkg(pkgDir, "foo", {
        json: { name: "foo", bin: { foo: "./bin/foo.js", extra: "./bin/extra.js" } },
        bins: ["foo"]
      });
      const bins = await g.discoverBins(pkgDir, "foo");
      expect(bins.foo).toBe(path.join(pkgDir, "node_modules", ".bin", "foo"));
      // "extra" declared but no file in .bin -> not included
      expect(bins.extra).toBe(undefined);
    });

    it("discovers string-form bin using the package name", async () => {
      const g = makeGlobal();
      const pkgDir = path.join(packagesDir, "g2");
      seedPkg(pkgDir, "bar", { json: { name: "bar", bin: "./cli.js" }, bins: ["bar"] });
      const bins = await g.discoverBins(pkgDir, "bar");
      expect(bins.bar).toBe(path.join(pkgDir, "node_modules", ".bin", "bar"));
    });

    it("returns {} when the package.json cannot be read", async () => {
      const g = makeGlobal();
      expect(await g.discoverBins(path.join(packagesDir, "ghost"), "ghost")).toStrictEqual({});
    });

    it("getInstalledVersion reads the version or returns null", async () => {
      const g = makeGlobal();
      const pkgDir = path.join(packagesDir, "g1");
      seedPkg(pkgDir, "foo", { json: { name: "foo", version: "3.2.1" } });
      expect(await g.getInstalledVersion(pkgDir, "foo")).toBe("3.2.1");
      expect(await g.getInstalledVersion(path.join(packagesDir, "ghost"), "ghost")).toBe(null);
    });
  });

  describe("ensureBinSymlink", () => {
    it("creates the current-version bin symlink and is idempotent", async () => {
      const g = makeGlobal();
      fs.mkdirSync(versionDir, { recursive: true });
      await g.ensureBinSymlink();
      const link = path.join(globalDir, "bin");
      expect(fs.readlinkSync(link)).toBe("v20/bin");
      // second call: already correct, should not throw
      await g.ensureBinSymlink();
      expect(fs.readlinkSync(link)).toBe("v20/bin");
    });
  });

  describe("promptYesNo", () => {
    it("auto-confirms when yes is set", async () => {
      const g = makeGlobal({ yes: true });
      expect(await g.promptYesNo("ok?")).toBe(true);
    });

    it("returns false in non-interactive mode", async () => {
      const g = makeGlobal({ interactive: false });
      expect(await g.promptYesNo("ok?")).toBe(false);
    });
  });

  describe("removeVersion / unlinkBinsForVersion", () => {
    it("removeVersion removes the dir, unlinks bins, and updates the registry", async () => {
      const g = makeGlobal();
      const pkgDir = path.join(packagesDir, "g1");
      fs.mkdirSync(pkgDir, { recursive: true });
      await g.writeInstalledJson({
        packages: { foo: { versions: [{ version: "1.0.0", dir: "g1", bins: ["foo"], linked: true }] } }
      });
      expect(await g.removeVersion("foo", "g1")).toBe(true);
      expect(fs.existsSync(pkgDir)).toBe(false);
      expect(await g.getPackageVersions("foo")).toStrictEqual([]);
      // unlink went through the fake linker
      expect(calls.some(c => c.type === "remove" && c.binName === "foo")).toBe(true);
    });

    it("removeVersion returns false for an unknown dir", async () => {
      const g = makeGlobal();
      expect(await g.removeVersion("foo", "g9")).toBe(false);
    });

    it("unlinkBinsForVersion is a no-op for an unknown dir", async () => {
      const g = makeGlobal();
      await g.unlinkBinsForVersion("foo", "g1");
      expect(calls.some(c => c.type === "remove")).toBe(false);
    });

    it("removes the intended tag dir, not the first entry sharing the version", async () => {
      // two tags at the SAME version: g1 linked (active), g2 unlinked
      const g = makeGlobal();
      const g1Dir = path.join(packagesDir, "g1");
      const g2Dir = path.join(packagesDir, "g2");
      fs.mkdirSync(g1Dir, { recursive: true });
      fs.mkdirSync(g2Dir, { recursive: true });
      await g.writeInstalledJson({
        packages: {
          foo: {
            versions: [
              { version: "1.0.0", dir: "g1", bins: ["foo"], linked: true },
              { version: "1.0.0", dir: "g2", bins: ["foo"], linked: false }
            ]
          }
        }
      });

      // remove the inactive duplicate (g2) — must NOT touch linked g1
      expect(await g.removeVersion("foo", "g2")).toBe(true);

      expect(fs.existsSync(g2Dir)).toBe(false);
      expect(fs.existsSync(g1Dir), "linked g1 must survive").toBe(true);
      const remaining = await g.getPackageVersions("foo");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].dir).toBe("g1");
      expect(remaining[0].linked).toBe(true);
      // g2 was unlinked, so no bin removal should have happened
      expect(calls.some(c => c.type === "remove"), "must not unlink g1's bins").toBe(false);
    });
  });

  describe("installGlobalPackage link-existing", () => {
    it("links an already-installed unlinked version with a single name@version spec", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({
        packages: { foo: { versions: [{ version: "1.0.0", dir: "g1", linked: false }] } }
      });
      g.promptYesNo = async () => true;
      const linkArgs = [];
      g.linkPackageVersion = async (...args) => {
        linkArgs.push(args);
        return true;
      };

      const result = await g.installGlobalPackage("foo@1.0.0");

      // the "already installed" path returns false
      expect(result).toBe(false);
      expect(linkArgs).toHaveLength(1);
      // must be a SINGLE spec arg carrying the version (the bug passed 2 args
      // and dropped the version, so nothing was linked)
      expect(linkArgs[0]).toHaveLength(1);
      expect(linkArgs[0][0]).toBe("foo@1.0.0");
    });
  });

  describe("removeGlobalPackage", () => {
    const seed = async g => {
      const registry = {
        packages: {
          foo: {
            versions: [
              { version: "1.0.0", dir: "g1", linked: false },
              { version: "2.0.0", dir: "g2", linked: true }
            ]
          }
        }
      };
      await g.writeInstalledJson(registry);
      fs.mkdirSync(path.join(packagesDir, "g1"), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, "g2"), { recursive: true });
    };

    it("reports when the package is not installed", async () => {
      const g = makeGlobal();
      expect(await g.removeGlobalPackage("ghost")).toBe(false);
    });

    it("removes an exact version", async () => {
      const g = makeGlobal();
      await seed(g);
      expect(await g.removeGlobalPackage("foo@1.0.0")).toBe(true);
      expect((await g.getPackageVersions("foo")).map(v => v.version)).toStrictEqual(["2.0.0"]);
    });

    it("errors on an exact version that is not installed", async () => {
      const g = makeGlobal();
      await seed(g);
      expect(await g.removeGlobalPackage("foo@9.9.9")).toBe(false);
    });

    it("removes versions matching a semver range but skips the linked one", async () => {
      const g = makeGlobal();
      await seed(g);
      // ">=1.0.0" matches both; linked 2.0.0 should be skipped, only g1 removed
      expect(await g.removeGlobalPackage("foo@>=1.0.0")).toBe(true);
      expect((await g.getPackageVersions("foo")).map(v => v.version)).toStrictEqual(["2.0.0"]);
    });

    it("errors when no version matches a semver range", async () => {
      const g = makeGlobal();
      await seed(g);
      expect(await g.removeGlobalPackage("foo@^5.0.0")).toBe(false);
    });

    it("removes all versions when confirmed (yes)", async () => {
      const g = makeGlobal({ yes: true });
      await seed(g);
      expect(await g.removeGlobalPackage("foo")).toBe(true);
      const registry = await g.readInstalledJson();
      expect(registry.packages.foo).toBe(undefined);
    });

    it("aborts removing all versions when not confirmed", async () => {
      const g = makeGlobal({ interactive: false }); // promptYesNo -> false
      await seed(g);
      expect(await g.removeGlobalPackage("foo")).toBe(false);
      expect(await g.getPackageVersions("foo")).toHaveLength(2);
    });

    it("removes a single-version package without prompting", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({ packages: { solo: { versions: [{ version: "1.0.0", dir: "g9" }] } } });
      fs.mkdirSync(path.join(packagesDir, "g9"), { recursive: true });
      expect(await g.removeGlobalPackage("solo")).toBe(true);
      expect((await g.readInstalledJson()).packages.solo).toBe(undefined);
    });

    it("removes by tag when --tag is set", async () => {
      const g = makeGlobal({ tag: "g1" });
      await seed(g);
      expect(await g.removeGlobalPackage("ignored")).toBe(true);
      expect((await g.getPackageVersions("foo")).map(v => v.version)).toStrictEqual(["2.0.0"]);
    });
  });

  describe("listGlobalPackages", () => {
    it("returns [] when nothing is installed", async () => {
      const g = makeGlobal();
      expect(await g.listGlobalPackages()).toStrictEqual([]);
    });

    it("lists all installed versions", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({
        packages: {
          foo: {
            versions: [
              { version: "1.0.0", dir: "g1", installedAt: Date.now(), linked: true, bins: ["foo"] },
              { version: "2.0.0", dir: "g2", installedAt: Date.now(), linked: false, local: true, semver: "file:/x" }
            ]
          }
        }
      });
      const result = await g.listGlobalPackages();
      expect(result).toHaveLength(2);
      expect(result.map(r => r.package)).toStrictEqual(["foo", "foo"]);
    });

    it("filters by name", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({
        packages: {
          foo: { versions: [{ version: "1.0.0", dir: "g1", installedAt: Date.now() }] },
          bar: { versions: [{ version: "2.0.0", dir: "g2", installedAt: Date.now() }] }
        }
      });
      const result = await g.listGlobalPackages("foo");
      expect(result.every(r => r.package === "foo")).toBe(true);
    });
  });

  describe("linkPackageVersion", () => {
    const seed = async g => {
      await g.writeInstalledJson({
        packages: {
          foo: {
            versions: [
              { version: "1.0.0", dir: "g1", bins: ["foo"], linked: true },
              { version: "2.0.0", dir: "g2", bins: ["foo"], linked: false }
            ]
          }
        }
      });
      // seed g2 package.json so discoverBins works
      const nm = path.join(packagesDir, "g2", "node_modules");
      fs.mkdirSync(path.join(nm, "foo"), { recursive: true });
      fs.writeFileSync(path.join(nm, "foo", "package.json"), JSON.stringify({ name: "foo", bin: { foo: "./f.js" } }));
      fs.mkdirSync(path.join(nm, ".bin"), { recursive: true });
      fs.writeFileSync(path.join(nm, ".bin", "foo"), "#!/usr/bin/env node\n");
    };

    it("errors when the package is not installed", async () => {
      const g = makeGlobal();
      expect(await g.linkPackageVersion("ghost@1.0.0")).toBe(false);
    });

    it("lists versions when none is specified", async () => {
      const g = makeGlobal();
      await seed(g);
      expect(await g.linkPackageVersion("foo")).toBe(false);
    });

    it("errors when the requested version is not installed", async () => {
      const g = makeGlobal();
      await seed(g);
      expect(await g.linkPackageVersion("foo@9.9.9")).toBe(false);
    });

    it("returns true immediately when the version is already linked", async () => {
      const g = makeGlobal();
      await seed(g);
      expect(await g.linkPackageVersion("foo@1.0.0")).toBe(true);
    });

    it("links a new version and updates the registry", async () => {
      const g = makeGlobal();
      await seed(g);
      expect(await g.linkPackageVersion("foo@2.0.0")).toBe(true);
      const versions = await g.getPackageVersions("foo");
      expect(versions.find(v => v.version === "2.0.0").linked).toBe(true);
      expect(versions.find(v => v.version === "1.0.0").linked).toBe(false);
    });
  });

  describe("cleanupPackage", () => {
    it("removes non-linked versions but keeps the linked one", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({
        packages: {
          foo: {
            versions: [
              { version: "1.0.0", dir: "g1", linked: false },
              { version: "2.0.0", dir: "g2", linked: true },
              { version: "0.9.0", dir: "g3", linked: false }
            ]
          }
        }
      });
      fs.mkdirSync(path.join(packagesDir, "g1"), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, "g3"), { recursive: true });
      const removed = await g.cleanupPackage("foo");
      expect(removed).toBe(2);
      expect((await g.getPackageVersions("foo")).map(v => v.version)).toStrictEqual(["2.0.0"]);
    });

    it("skips cleanup when there is no linked version", async () => {
      const g = makeGlobal();
      await g.writeInstalledJson({
        packages: { foo: { versions: [{ version: "1.0.0", dir: "g1", linked: false }] } }
      });
      expect(await g.cleanupPackage("foo")).toBe(0);
      expect(await g.getPackageVersions("foo")).toHaveLength(1);
    });

    it("reports when the package is not installed", async () => {
      const g = makeGlobal();
      expect(await g.cleanupPackage("ghost")).toBe(0);
    });
  });

  describe("showPathSetup", () => {
    const captureOutput = async (g) => {
      const lines: string[] = [];
      const saveLog = console.log;
      console.log = (...args) => lines.push(args.join(" "));
      try {
        await g.showPathSetup();
      } finally {
        console.log = saveLog;
      }
      return lines.join("\n");
    };

    it("runs without throwing", async () => {
      await makeGlobal().showPathSetup();
    });

    //
    // FPM-72: it used to print <globalRoot>/current/bin, which only `fyn global use`
    // creates - so following the instructions put a non-existent directory on PATH.
    //
    it("points at the maintained bin symlink, not a directory nothing creates", async () => {
      const g = makeGlobal();
      fs.mkdirSync(path.join(versionDir, "bin"), { recursive: true });
      await g.ensureBinSymlink();

      const output = await captureOutput(g);

      expect(output).toContain(path.join(globalDir, "bin"));
      expect(output).not.toContain(path.join(globalDir, "current"));
      // and every path it suggests must actually exist
      const suggested = path.join(globalDir, "bin");
      expect(fs.existsSync(suggested), `${suggested} should exist`).toBe(true);
    });

    it("falls back to the version bin dir when the symlink is not there", async () => {
      const g = makeGlobal();
      fs.mkdirSync(path.join(versionDir, "bin"), { recursive: true });

      const output = await captureOutput(g);

      expect(output).toContain(path.join(versionDir, "bin"));
      expect(output).not.toContain(path.join(globalDir, "current"));
    });
  });

  describe("fetchLatestVersion", () => {
    it("returns latest version and version list from registry", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            "dist-tags": { latest: "2.5.0" },
            versions: { "1.0.0": {}, "2.0.0": {}, "2.5.0": {} }
          })
        });

        const g = makeGlobal({ registry: "https://custom-registry.org" });
        const res = await g.fetchLatestVersion("@scope/my-pkg");

        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://custom-registry.org/@scope%2Fmy-pkg",
          expect.objectContaining({
            signal: expect.any(AbortSignal)
          })
        );
        const calledHeaders = (globalThis.fetch as any).mock.calls[0][1].headers;
        const accept = typeof calledHeaders.get === "function" ? calledHeaders.get("accept") : calledHeaders.accept;
        expect(accept).toBe("application/json");
        expect(res).toEqual({
          latest: "2.5.0",
          versions: ["1.0.0", "2.0.0", "2.5.0"]
        });
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("returns null when registry responds with non-200", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
        const g = makeGlobal();
        const res = await g.fetchLatestVersion("non-existent");
        expect(res).toBeNull();
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("returns null when fetch rejects with network error", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
        const g = makeGlobal();
        const res = await g.fetchLatestVersion("some-pkg");
        expect(res).toBeNull();
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});
