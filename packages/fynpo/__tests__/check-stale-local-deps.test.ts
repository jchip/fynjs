import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import {
  RESOLUTION_FIELDS,
  isLocalLink,
  diffResolutionFields,
  findStaleLocalDeps,
  formatStaleLocalDeps,
  diffInstalledFiles,
} from "../src/utils/check-stale-local-deps";

describe("isLocalLink", () => {
  const srcDir = "/repo/packages/foo";

  it("matches when dist.fullPath is the source dir", () => {
    expect(isLocalLink({ dist: { fullPath: srcDir } }, srcDir)).toBe(true);
  });

  it("normalizes the path before comparing", () => {
    expect(isLocalLink({ dist: { fullPath: "/repo/packages/bar/../foo" } }, srcDir)).toBe(true);
  });

  //
  // The discriminator that keeps this feature honest. A workspace name can also resolve to a
  // registry package of the same name at another version - in this monorepo `bluebird` is pinned
  // off local resolution and xarc-run takes `xaa@^1` from npm while the workspace holds 2.0.0.
  // Diffing either against the workspace source reports a large fake change.
  //
  it("rejects a registry copy of the same name", () => {
    expect(isLocalLink({ _id: "xaa@1.8.0", dist: { tarball: "https://..." } }, srcDir)).toBe(false);
    expect(isLocalLink({ _id: "bluebird@3.7.2" }, srcDir)).toBe(false);
  });

  it("falls back to the fynlocal marker in _id when dist has no local path", () => {
    expect(isLocalLink({ _id: "@fynjs/cli-args@1.0.0-fynlocal_h" }, srcDir)).toBe(true);
  });

  it("rejects a manifest carrying neither marker", () => {
    expect(isLocalLink({}, srcDir)).toBe(false);
  });

  it("rejects a link pointing at a different source dir", () => {
    expect(isLocalLink({ dist: { fullPath: "/repo/packages/other" } }, srcDir)).toBe(false);
  });
});

describe("diffResolutionFields", () => {
  it("reports nothing when the resolution fields match", () => {
    const src = { name: "a", version: "1.0.0", main: "./dist/index.js" };
    expect(diffResolutionFields(src, { ...src })).toEqual([]);
  });

  //
  // fyn writes a reduced manifest for installed packages: devDependencies/prettier/publishUtil
  // dropped, scripts trimmed to lifecycle entries, dist/_fyn/_from/_id added. Treating those
  // normalizations as changes made a full compare flag ~100 of 114 pairs in this monorepo.
  //
  it("ignores the fields fyn strips or adds when installing", () => {
    const src = {
      version: "1.0.0",
      main: "./dist/index.js",
      devDependencies: { vitest: "^3" },
      prettier: { printWidth: 100 },
      publishUtil: { remove: ["dependencies"] },
      scripts: { build: "tsc", test: "vitest run" },
    };
    const installed = {
      version: "1.0.0",
      main: "./dist/index.js",
      scripts: { postpack: "publish-util-postpack" },
      dist: { localPath: "../foo" },
      _from: "foo@../foo",
      _id: "foo@1.0.0-fynlocal_h",
    };

    expect(diffResolutionFields(src, installed)).toEqual([]);
  });

  //
  // fyn declares publishUtil.remove: ["dependencies"] because it bundles everything, so its
  // installed copy never carries dependencies. That is normalization, not drift.
  //
  it("ignores a field the source asks publish-util to remove", () => {
    const src = { dependencies: { a: "^1" }, publishUtil: { remove: ["dependencies"] } };
    expect(diffResolutionFields(src, { name: "fyn" })).toEqual([]);
  });

  it("still compares a removed field the installed copy does carry", () => {
    const src = { dependencies: { a: "^2" }, publishUtil: { remove: ["dependencies"] } };
    expect(diffResolutionFields(src, { dependencies: { a: "^1" } })).toEqual(["dependencies"]);
  });

  // the original FJM-64 failure: entry point moved from dist-cjs/ to dist/
  it("catches a changed entry point", () => {
    expect(
      diffResolutionFields({ main: "./dist/index.js" }, { main: "dist-cjs/index.cjs" })
    ).toEqual(["main"]);
  });

  it("catches a field added at the source", () => {
    expect(diffResolutionFields({ type: "module" }, {})).toEqual(["type"]);
  });

  it("catches a field removed at the source", () => {
    expect(diffResolutionFields({}, { type: "commonjs" })).toEqual(["type"]);
  });

  it("reports every differing field, in declaration order", () => {
    const diff = diffResolutionFields(
      { version: "2.0.0", main: "./dist/index.js", exports: { ".": "./dist/index.js" } },
      { version: "1.0.0", main: "./lib/index.js", exports: { ".": "./lib/index.js" } }
    );
    expect(diff).toEqual(["version", "main", "exports"]);
  });

  it("compares dependencies structurally, not by reference", () => {
    expect(diffResolutionFields({ dependencies: { a: "^1" } }, { dependencies: { a: "^1" } })).toEqual([]);
    expect(diffResolutionFields({ dependencies: { a: "^2" } }, { dependencies: { a: "^1" } })).toEqual([
      "dependencies",
    ]);
  });

  it("covers the fields that break module resolution", () => {
    for (const field of ["main", "exports", "type", "types", "bin", "version", "dependencies"]) {
      expect(RESOLUTION_FIELDS).toContain(field);
    }
  });
});

describe("diffInstalledFiles", () => {
  let dir: string;
  let srcDir: string;
  let copyDir: string;

  const write = (base: string, rel: string, content: string) => {
    const file = Path.join(base, rel);
    Fs.mkdirSync(Path.dirname(file), { recursive: true });
    Fs.writeFileSync(file, content);
  };

  beforeAll(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-files-"));
    srcDir = Path.join(dir, "src-pkg");
    copyDir = Path.join(dir, "copy-pkg");
  });

  afterAll(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports nothing when the copy holds the same bytes at the same mtime", () => {
    write(srcDir, "dist/a.js", "same");
    write(copyDir, "dist/a.js", "same");
    const when = new Date(1700000000000);
    Fs.utimesSync(Path.join(srcDir, "dist/a.js"), when, when);
    Fs.utimesSync(Path.join(copyDir, "dist/a.js"), when, when);

    expect(diffInstalledFiles(srcDir, copyDir)).toEqual([]);
  });

  //
  // The links only break when something rewrote the source, and that write stamps a new mtime -
  // so a differing mtime is taken as not-current without reading the file. The one place this
  // over-reports is fyn's copyFile fallback, which does not carry the source mtime over.
  //
  it("reports a copy whose mtime no longer matches, without reading it", () => {
    write(srcDir, "dist/touched.js", "identical");
    write(copyDir, "dist/touched.js", "identical");
    Fs.utimesSync(Path.join(srcDir, "dist/touched.js"), new Date(1700000000000), new Date(1700000000000));
    Fs.utimesSync(Path.join(copyDir, "dist/touched.js"), new Date(1600000000000), new Date(1600000000000));

    expect(diffInstalledFiles(srcDir, copyDir, 20)).toContain("dist/touched.js");
  });

  it("reports a file whose content moved on at the source", () => {
    write(srcDir, "dist/b.js", "new build");
    write(copyDir, "dist/b.js", "old build");

    // the fixture dirs accumulate across the cases in this block, so assert on membership
    expect(diffInstalledFiles(srcDir, copyDir, 20)).toContain("dist/b.js");
  });

  //
  // The CI failure that made this stop using mtime as a shortcut: "new build" and "old build"
  // are the same length, and the two writes landed inside one filesystem timestamp tick, so a
  // size+mtime match declared a stale copy current. Forced here so it fails on any filesystem.
  //
  it("reports differing content even when size and mtime match", () => {
    write(srcDir, "dist/tick.js", "new build");
    write(copyDir, "dist/tick.js", "old build");
    const when = new Date(1700000000000);
    Fs.utimesSync(Path.join(srcDir, "dist/tick.js"), when, when);
    Fs.utimesSync(Path.join(copyDir, "dist/tick.js"), when, when);

    expect(diffInstalledFiles(srcDir, copyDir, 20)).toContain("dist/tick.js");
  });

  //
  // fyn hardlinks a local install where it can: same inode, so it is the same file and current
  // by definition - even with the mtime of the source's last rebuild.
  //
  it("treats a hardlinked copy as current", () => {
    write(srcDir, "dist/linked.js", "shared bytes");
    Fs.linkSync(Path.join(srcDir, "dist/linked.js"), Path.join(copyDir, "dist/linked.js"));

    expect(diffInstalledFiles(srcDir, copyDir, 20)).not.toContain("dist/linked.js");
  });

  it("reports a file the source no longer has", () => {
    write(copyDir, "dist/gone.js", "left behind");

    expect(diffInstalledFiles(srcDir, copyDir)).toContain("dist/gone.js");
  });

  //
  // fyn rewrites the installed package.json (stamping _id/_from, trimming scripts), so it always
  // differs. diffResolutionFields is what compares that file, on the fields that matter.
  //
  it("ignores package.json", () => {
    write(srcDir, "package.json", JSON.stringify({ name: "p" }));
    write(copyDir, "package.json", JSON.stringify({ name: "p", _id: "p@1.0.0-fynlocal_h" }));

    expect(diffInstalledFiles(srcDir, copyDir)).not.toContain("package.json");
  });

  it("does not descend into a nested node_modules or dot dir", () => {
    write(copyDir, "node_modules/dep/index.js", "nested");
    write(copyDir, ".cache/x.js", "hidden");

    const diffs = diffInstalledFiles(srcDir, copyDir, 20);
    expect(diffs.some((d) => d.startsWith("node_modules/"))).toBe(false);
    expect(diffs.some((d) => d.startsWith(".cache/"))).toBe(false);
  });

  it("stops at the limit so the message stays short", () => {
    const many = Path.join(dir, "many-copy");
    for (let i = 0; i < 6; i++) {
      write(many, `dist/f${i}.js`, "only in the copy");
    }

    expect(diffInstalledFiles(Path.join(dir, "many-src"), many)).toHaveLength(3);
    expect(diffInstalledFiles(Path.join(dir, "many-src"), many, 5)).toHaveLength(5);
  });
});

describe("findStaleLocalDeps", () => {
  let cwd: string;

  /** write a package dir with a source manifest */
  const writeSrc = (relPath: string, pkgJson: Record<string, any>) => {
    const dir = Path.join(cwd, relPath);
    Fs.mkdirSync(dir, { recursive: true });
    Fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify(pkgJson));
  };

  /** write the copy fyn would have installed into a consumer's node_modules */
  const writeInstalled = (
    consumerPath: string,
    name: string,
    srcRelPath: string,
    pkgJson: Record<string, any>
  ) => {
    const dir = Path.join(cwd, consumerPath, "node_modules", name);
    Fs.mkdirSync(dir, { recursive: true });
    Fs.writeFileSync(
      Path.join(dir, "package.json"),
      JSON.stringify({
        ...pkgJson,
        dist: { localPath: `../${srcRelPath}`, fullPath: Path.join(cwd, srcRelPath) },
        _id: `${name}@${pkgJson.version}-fynlocal_h`,
      })
    );
  };

  const depData = (name: string, path: string, localDeps: { name: string; path: string }[]) => ({
    pkgInfo: { name, path } as any,
    localDepsByPath: Object.fromEntries(
      localDeps.map((d) => [d.path, { name: d.name, path: d.path, version: "1.0.0" } as any])
    ),
    dependentsByPath: {},
  });

  beforeAll(() => {
    cwd = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-stale-"));

    // dep-a: source moved to dist/, consumer still has the dist-cjs/ snapshot -> stale
    writeSrc("packages/dep-a", { name: "dep-a", version: "1.0.0", main: "./dist/index.js" });
    writeInstalled("packages/app", "dep-a", "packages/dep-a", {
      name: "dep-a",
      version: "1.0.0",
      main: "dist-cjs/index.cjs",
    });
    writeInstalled("packages/other", "dep-a", "packages/dep-a", {
      name: "dep-a",
      version: "1.0.0",
      main: "dist-cjs/index.cjs",
    });

    // dep-b: installed copy matches -> not stale
    writeSrc("packages/dep-b", { name: "dep-b", version: "2.0.0", main: "./index.js" });
    writeInstalled("packages/app", "dep-b", "packages/dep-b", {
      name: "dep-b",
      version: "2.0.0",
      main: "./index.js",
    });

    // dep-c: consumer resolved it from the registry at another version -> must be skipped
    writeSrc("packages/dep-c", { name: "dep-c", version: "2.0.0", main: "./dist/index.js" });
    const registryDir = Path.join(cwd, "packages/app/node_modules/dep-c");
    Fs.mkdirSync(registryDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(registryDir, "package.json"),
      JSON.stringify({
        name: "dep-c",
        version: "1.8.0",
        main: "dist/index.js",
        _id: "dep-c@1.8.0",
        dist: { tarball: "https://registry.npmjs.org/dep-c/-/dep-c-1.8.0.tgz" },
      })
    );

    // dep-d: declared local dep that was never installed under this consumer
    writeSrc("packages/dep-d", { name: "dep-d", version: "1.0.0", main: "./index.js" });

    //
    // dep-e: the FPO-59 shape - the manifest is identical, only the built output moved on.
    // Nothing in a manifest diff can see this, and it is what a bundler reads.
    //
    writeSrc("packages/dep-e", { name: "dep-e", version: "1.0.0", main: "./dist/index.js" });
    Fs.mkdirSync(Path.join(cwd, "packages/dep-e/dist"), { recursive: true });
    Fs.writeFileSync(Path.join(cwd, "packages/dep-e/dist/index.js"), "export const fixed = true;");
    writeInstalled("packages/app", "dep-e", "packages/dep-e", {
      name: "dep-e",
      version: "1.0.0",
      main: "./dist/index.js",
    });
    Fs.mkdirSync(Path.join(cwd, "packages/app/node_modules/dep-e/dist"), { recursive: true });
    Fs.writeFileSync(
      Path.join(cwd, "packages/app/node_modules/dep-e/dist/index.js"),
      "export const fixed = false;"
    );
  });

  afterAll(() => {
    Fs.rmSync(cwd, { recursive: true, force: true });
  });

  const packages = () => [
    depData("app", "packages/app", [
      { name: "dep-a", path: "packages/dep-a" },
      { name: "dep-b", path: "packages/dep-b" },
      { name: "dep-c", path: "packages/dep-c" },
      { name: "dep-d", path: "packages/dep-d" },
    ]),
    depData("other", "packages/other", [{ name: "dep-a", path: "packages/dep-a" }]),
  ];

  it("finds only the package whose installed copy drifted", () => {
    const stale = findStaleLocalDeps(packages() as any, cwd);
    expect(stale.map((s) => s.name)).toEqual(["dep-a"]);
    expect(stale[0].fields).toEqual(["main"]);
  });

  //
  // One workspace package linked into N consumers is one problem with one fix, so it must read
  // as one warning naming all of them - not N warnings.
  //
  it("groups consumers under a single entry", () => {
    const stale = findStaleLocalDeps(packages() as any, cwd);
    expect(stale).toHaveLength(1);
    expect(stale[0].consumers).toEqual(["packages/app", "packages/other"]);
  });

  it("skips a registry copy that shares a workspace package name", () => {
    const stale = findStaleLocalDeps(packages() as any, cwd);
    expect(stale.map((s) => s.name)).not.toContain("dep-c");
  });

  it("skips a local dep not installed under the consumer", () => {
    const stale = findStaleLocalDeps(packages() as any, cwd);
    expect(stale.map((s) => s.name)).not.toContain("dep-d");
  });

  it("returns nothing when every copy is current", () => {
    const onlyFresh = [depData("app", "packages/app", [{ name: "dep-b", path: "packages/dep-b" }])];
    expect(findStaleLocalDeps(onlyFresh as any, cwd)).toEqual([]);
  });

  //
  // FPO-59: fynpo@3.0.3 was bundled from a copy of @fynpo/base whose manifest matched perfectly
  // and whose dist was one build behind, and the release reported nothing.
  //
  it("finds a copy whose build output is behind, with an identical manifest", () => {
    const stale = findStaleLocalDeps(
      [depData("app", "packages/app", [{ name: "dep-e", path: "packages/dep-e" }])] as any,
      cwd
    );

    expect(stale.map((s) => s.name)).toEqual(["dep-e"]);
    expect(stale[0].fields).toEqual([]);
    expect(stale[0].files).toEqual(["dist/index.js"]);
  });

  it("tolerates an empty package list", () => {
    expect(findStaleLocalDeps([], cwd)).toEqual([]);
  });

  it("tolerates dep data with no local deps", () => {
    expect(findStaleLocalDeps([depData("app", "packages/app", [])] as any, cwd)).toEqual([]);
  });
});

describe("formatStaleLocalDeps", () => {
  it("says nothing when nothing is stale", () => {
    expect(formatStaleLocalDeps([])).toEqual([]);
  });

  it("names the package, the fields and the consumers, and gives the remedy", () => {
    const lines = formatStaleLocalDeps([
      { name: "string-array", consumers: ["packages/xarc-run"], fields: ["main", "exports"], files: [] },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("1 local package changed");
    expect(lines[0]).toContain("fynpo bootstrap");
    expect(lines[1]).toContain("string-array");
    expect(lines[1]).toContain("main, exports");
    expect(lines[1]).toContain("packages/xarc-run");
  });

  it("names the changed files alongside the fields", () => {
    const lines = formatStaleLocalDeps([
      { name: "@fynpo/base", consumers: ["packages/fynpo"], fields: [], files: ["dist/fynpo-dep-graph.js"] },
    ]);

    expect(lines[1]).toContain("@fynpo/base");
    expect(lines[1]).toContain("dist/fynpo-dep-graph.js");
    expect(lines[1]).toContain("packages/fynpo");
  });

  it("pluralizes for more than one stale package", () => {
    const lines = formatStaleLocalDeps([
      { name: "a", consumers: ["packages/x"], fields: ["main"], files: [] },
      { name: "b", consumers: ["packages/y"], fields: ["main"], files: [] },
    ]);

    expect(lines[0]).toContain("2 local packages changed");
    expect(lines).toHaveLength(3);
  });
});
