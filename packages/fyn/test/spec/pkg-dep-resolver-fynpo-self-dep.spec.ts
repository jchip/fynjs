import { describe, it } from "vitest";
import { expect } from "chai";
import Path from "path";
import PkgDepResolver from "../../lib/pkg-dep-resolver";
import DepItem from "../../lib/dep-item";
import { PACKAGE_RAW_INFO } from "../../lib/types";

//
// A local package can indirectly depend on itself, ie: one of its deps resolves back
// to its own copy in the monorepo.  fyn must not record that as a dep relation, or
// fynpo sees a bogus circular dep when it replays the relations from .fynpo-data.json
//
describe("pkg-dep-resolver fynpo self dep", function() {
  const fynpoDir = Path.resolve("/test-fynpo");
  const selfDir = Path.join(fynpoDir, "_w", "npm-packlist");
  const otherDir = Path.join(fynpoDir, "packages", "ignore-walk");
  const selfPath = Path.relative(fynpoDir, selfDir);
  const otherPath = Path.relative(fynpoDir, otherDir);

  const makeResolver = () => {
    const selfPkg = { name: "npm-packlist", version: "11.3.0", path: selfPath };
    const otherPkg = { name: "ignore-walk", version: "7.0.0", path: otherPath };
    const byPath = { [selfPath]: selfPkg, [otherPath]: otherPkg };
    const byName = { "npm-packlist": [selfPkg], "ignore-walk": [otherPkg] };
    const added = [];
    const indirects = [];

    const graph = {
      packages: { byPath, byName },
      getPackageByName: name => byName[name] && byName[name][0],
      resolvePackage: name => byName[name] && byName[name][0],
      // pretend the graph has no self dep guard, so this test only covers fyn's own
      addDep: (fromPkg, toPkg, section, steps) => {
        added.push({ from: fromPkg.path, to: toPkg.path, section, steps });
        return true;
      }
    };

    const resolver = Object.create(PkgDepResolver.prototype);
    resolver._options = { deDuping: false };
    resolver._fyn = {
      cwd: selfDir,
      fynlocal: true,
      isFynpo: true,
      enforceRegistryDeps: false,
      _shownMissingFiles: new Set(),
      _fynpo: { dir: fynpoDir, graph, indirects },
      checkNoFynLocal: () => false
    };

    return { resolver, added, indirects };
  };

  const makeDepItem = () => {
    const depItem = new DepItem({ name: "npm-packlist", semver: "11.3.0", dsrc: "dep" });
    depItem.fullPath = selfDir;
    return depItem;
  };

  it("should not record a dep relation from a package to itself", () => {
    const { resolver, added, indirects } = makeResolver();
    const pkg = {
      name: "npm-packlist",
      version: "11.3.0",
      // pacote pulls npm-packlist@^11.2.0, which matches the monorepo's own copy
      dependencies: { "npm-packlist": "^11.2.0" },
      [PACKAGE_RAW_INFO]: { dir: selfDir, str: "" }
    };

    resolver.makePkgDepItems(pkg, makeDepItem(), false, true);

    expect(added).to.deep.equal([]);
    expect(indirects).to.deep.equal([]);
  });

  it("should still record a dep relation on another local package", () => {
    const { resolver, added, indirects } = makeResolver();
    const pkg = {
      name: "npm-packlist",
      version: "11.3.0",
      dependencies: { "ignore-walk": "^7.0.0" },
      [PACKAGE_RAW_INFO]: { dir: selfDir, str: "" }
    };

    resolver.makePkgDepItems(pkg, makeDepItem(), false, true);

    expect(added).to.have.lengthOf(1);
    expect(added[0].from).to.equal(selfPath);
    expect(added[0].to).to.equal(otherPath);
    expect(indirects).to.have.lengthOf(1);
    expect(indirects[0].onPkg.name).to.equal("ignore-walk");
  });
});
