import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import Path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verify } from "run-verify";
import {
  REMOVE_DIRS,
  isBundlerOnlyEsnext,
  isFynInstalledLock,
  isLicenseFile,
  isNonRuntimeFile,
  isPackageRoot,
  isReviewableAsset,
  isTestFile,
  readManifestTargets,
  type ManifestTargets
} from "../../../lib/prod-prune/rules";

describe("isNonRuntimeFile", () => {
  it.each([
    ["index.d.ts", ".ts"],
    ["index.ts", ".ts"],
    // node loads .mjs and .cjs, never their TypeScript spellings
    ["index.d.mts", ".mts"],
    ["index.d.cts", ".cts"],
    ["index.mts", ".mts"],
    ["index.cts", ".cts"],
    ["Button.tsx", ".tsx"],
    ["Button.stories.TSX", ".TSX"],
    ["index.js.map", ".map"],
    ["README.md", ".md"],
    ["readme.MARKDOWN", ".MARKDOWN"],
    ["CHANGELOG", ""],
    ["changelog.txt", ".txt"],
    ["CONTRIBUTING", ""],
    ["CODE_OF_CONDUCT.txt", ".txt"],
    // YAML only by name: CI and tooling config
    [".travis.yml", ".yml"],
    [".gitlab-ci.yml", ".yml"],
    ["pnpm-lock.yaml", ".yaml"],
    [".borp.yaml", ".yaml"],
    [".airtap.yml", ".yml"],
    [".eslintrc.yml", ".yml"],
    ["HISTORY.md", ".md"],
    ["Authors", ""],
    [".eslintrc.json", ".json"],
    [".eslintignore", ""],
    [".prettierrc", ""],
    [".prettierignore", ""],
    [".taprc", ""],
    [".c8rc", ""],
    [".nojekyll", ""],
    [".runkit_example.js", ".js"],
    ["tsconfig.build.json", ".json"],
    [".editorconfig", ""],
    [".npmignore", ""],
    [".gitignore", ""],
    ["Makefile", ""],
    ["build.tsbuildinfo", ".tsbuildinfo"]
  ])("removes %s", (file, ext) => {
    expect(isNonRuntimeFile(file, ext)).toBe(true);
  });

  it.each([
    ["index.js", ".js"],
    ["index.mjs", ".mjs"],
    ["index.cjs", ".cjs"],
    ["db.json", ".json"],
    ["package.json", ".json"],
    ["binding.node", ".node"],
    ["parser.wasm", ".wasm"],
    // guards the *.md rule against eating a license, which the find rules did
    ["LICENSE.md", ".md"],
    // a package may read its own YAML at runtime
    ["config.yaml", ".yaml"],
    ["openapi.yml", ".yml"],
    ["action.yml", ".yml"],
    // doc prefixes are ordinary words; the history package loads this
    ["history.production.min.js", ".js"],
    ["authors.json", ".json"],
    ["changelog-parser.cjs", ".cjs"]
  ])("keeps %s", (file, ext) => {
    expect(isNonRuntimeFile(file, ext) && !isLicenseFile(file, ext)).toBe(false);
  });

  it.each([
    ["npm-debug.log", ".log"],
    ["build.tmp", ".tmp"],
    ["index.js.orig", ".orig"],
    ["patch.rej", ".rej"],
    [".DS_Store", ""]
  ])("removes residue %s", (file, ext) => {
    expect(isNonRuntimeFile(file, ext)).toBe(true);
  });

  it("removes whole directories only by dot or __x__ name", () => {
    return verify()
      .step(() =>
        [".git", ".github", ".turbo", ".vscode", ".nyc_output", "__tests__", "__mocks__", "__snapshots__"].filter(
          dir => !REMOVE_DIRS.has(dir)
        )
      )
      .step(missed => expect(missed).toEqual([]))
      .step(() =>
        ["doc", "docs", "test", "spec", "examples", "coverage", "lib", "dist", ".bin", ".f", ".pnpm", ".cache"].filter(dir =>
          REMOVE_DIRS.has(dir)
        )
      )
      .step(matched => expect(matched).toEqual([]));
  });
});

describe("isTestFile", () => {
  const root = Path.join(Path.sep, "app", "node_modules");
  const noTargets = () => ({ node: [], bundler: [] });
  const matches = (files: string[], targets: (dir: string) => ManifestTargets = noTargets) =>
    files.filter(file => isTestFile(root, Path.join(root, "pkg", ...file.split("/")), targets));

  it("removes the double extensions test tools look for", () => {
    const files = [
      "test/index.test.js",
      "test/a.b.spec.mjs",
      "spec/index.spec.cjs",
      "src/Button.test.jsx",
      "UPPER.TEST.JS",
      "benchmarks/basic.bench.js",
      "benchmarks/deep.benchmark.js",
      "src/Button.stories.jsx"
    ];
    return verify()
      .step(() => matches(files))
      .step(matched => expect(matched).toEqual(files));
  });

  it("keeps names that read like ordinary modules", () => {
    return verify()
      .step(() =>
        matches([
          "test.js",
          "spec.js",
          "is-test.js",
          "ab-test.js",
          "test-utils.js",
          "foo_test.js",
          "foo.test.helper.js",
          "foo.test.json",
          "react.production.min.js",
          "index.browser.js"
        ])
      )
      .step(matched => expect(matched).toEqual([]));
  });

  it("keeps a test-named file the manifest points at", () => {
    const pkgDir = Path.join(root, "pkg");
    const targets = (dir: string): ManifestTargets =>
      dir === pkgDir
        ? { node: ["./lib/openapi.spec.js", "bin/run.test.js", "main.spec"], bundler: ["./esm/index.spec.mjs"] }
        : { node: [], bundler: [] };
    return verify()
      .step(() =>
        matches(
          ["lib/openapi.spec.js", "bin/run.test.js", "main.spec.js", "esm/index.spec.mjs", "lib/other.spec.js"],
          targets
        )
      )
      .step(matched => expect(matched).toEqual(["lib/other.spec.js"]));
  });

  it("checks the manifest of the package the file is in, not an outer one", () => {
    const outer = Path.join(root, "pkg");
    const targets = (dir: string): ManifestTargets =>
      dir === outer ? { node: ["node_modules/inner/x.test.js"], bundler: [] } : { node: [], bundler: [] };
    return verify()
      .step(() => matches(["node_modules/inner/x.test.js"], targets))
      .step(matched => expect(matched).toEqual(["node_modules/inner/x.test.js"]));
  });
});

describe("isPackageRoot", () => {
  const root = Path.join(Path.sep, "app", "node_modules");
  const at = (...parts: string[]) => Path.join(root, ...parts);

  it.each([
    ["benchmark"],
    ["@scope", "test"],
    ["pkg", "node_modules", "docs"],
    ["pkg", "node_modules", "@scope", "spec"],
    [".f", "_", "benchmark"],
    [".f", "_", "@scope", "test"],
    [".f", "_", "benchmark", "2.1.4", "node_modules", "benchmark"]
  ])("treats %s as a package folder", (...parts) => {
    expect(isPackageRoot(root, at(...parts))).toBe(true);
  });

  it.each([
    ["pkg", "test"],
    ["pkg", "lib", "docs"],
    ["@scope", "pkg", "examples"],
    [".f", "_", "pkg", "1.0.0", "node_modules", "pkg", "test"]
  ])("treats %s as a folder inside a package", (...parts) => {
    expect(isPackageRoot(root, at(...parts))).toBe(false);
  });
});

describe("isFynInstalledLock", () => {
  const root = Path.join(Path.sep, "app", "node_modules");

  it("matches only fyn's .f/lock.yaml at the tree root", () => {
    expect(isFynInstalledLock(root, Path.join(root, ".f", "lock.yaml"))).toBe(true);
    expect(isFynInstalledLock(root, Path.join(root, ".f", ".fyn.json"))).toBe(false);
    expect(isFynInstalledLock(root, Path.join(root, "pkg", ".f", "lock.yaml"))).toBe(false);
    expect(isFynInstalledLock(root, Path.join(root, "pkg", "lock.yaml"))).toBe(false);
  });
});

describe("isLicenseFile", () => {
  it.each([
    ["LICENSE", ""],
    ["LICENSE.md", ".md"],
    ["license", ""],
    ["LICENCE.txt", ".txt"],
    ["NOTICE", ""],
    ["COPYING", ""]
  ])("collects %s", (file, ext) => {
    expect(isLicenseFile(file, ext)).toBe(true);
  });

  it.each([
    ["license.js", ".js"],
    ["licenseChecker.mjs", ".mjs"],
    ["LICENSE-3rdparty.csv", ".csv"],
    ["index.js", ".js"]
  ])("does not collect %s", (file, ext) => {
    expect(isLicenseFile(file, ext)).toBe(false);
  });
});

describe("isReviewableAsset", () => {
  it.each([".png", ".JPG", ".zip", ".woff2", ".mp4", ".pdf"])("reports %s", ext => {
    expect(isReviewableAsset(ext)).toBe(true);
  });

  it.each([".node", ".wasm", ".so", ".dylib", ".js"])("does not report %s", ext => {
    expect(isReviewableAsset(ext)).toBe(false);
  });
});

describe("readManifestTargets", () => {
  let root: string;
  const pkg = (name: string, manifest: object) => {
    const dir = Path.join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(Path.join(dir, "package.json"), JSON.stringify(manifest));
    return dir;
  };

  beforeAll(() => {
    root = mkdtempSync(Path.join(tmpdir(), "fyn-prod-prune-rules-"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("splits exports conditions into what node resolves and what only a bundler does", () => {
    const dir = pkg("conditions", {
      name: "conditions",
      main: "./build/src/index.js",
      module: "./build/esm/index.js",
      exports: {
        ".": {
          esnext: "./build/esnext/index.js",
          module: "./build/esm/index.js",
          types: "./build/src/index.d.ts",
          default: "./build/src/index.js"
        }
      }
    });
    const targets = readManifestTargets(dir);
    expect(targets.node).toContain("./build/src/index.js");
    expect(targets.bundler).toContain("./build/esnext/index.js");
    expect(targets.bundler).toContain("./build/esm/index.js");
    // `types` is a tooling hint, not a runtime target either way
    expect(targets.node).not.toContain("./build/src/index.d.ts");
  });

  it("treats bin entries as reachable by node", () => {
    const dir = pkg("with-bin", { name: "with-bin", bin: { tool: "./cli/run.js" } });
    expect(readManifestTargets(dir).node).toContain("./cli/run.js");
  });

  it("returns empty lists when there is no readable manifest", () => {
    expect(readManifestTargets(Path.join(root, "nope"))).toEqual({ node: [], bundler: [] });
  });
});

describe("isBundlerOnlyEsnext", () => {
  let root: string;
  const targets = (dir: string) => readManifestTargets(dir);

  const build = (name: string, manifest: object, dirs: string[]) => {
    const pkgDir = Path.join(root, name);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(Path.join(pkgDir, "package.json"), JSON.stringify(manifest));
    for (const dir of dirs) {
      mkdirSync(Path.join(pkgDir, dir), { recursive: true });
      writeFileSync(Path.join(pkgDir, dir, "index.js"), "export const a = 1;\n");
    }
    return pkgDir;
  };

  beforeAll(() => {
    root = mkdtempSync(Path.join(tmpdir(), "fyn-prod-prune-esnext-"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("removes esnext when an esm sibling claims it and only `main` is reachable", () => {
    const dir = build(
      "sibling",
      { name: "sibling", main: "build/src/index.js", module: "build/esm/index.js" },
      ["build/src", "build/esm", "build/esnext"]
    );
    const esnext = Path.join(dir, "build", "esnext");
    expect(isBundlerOnlyEsnext(esnext, ["src", "esm", "esnext"], targets)).toBe(true);
  });

  it("removes esnext when a bundler-only exports condition claims it", () => {
    const dir = build(
      "condition",
      {
        name: "condition",
        exports: { ".": { esnext: "./esnext/index.js", default: "./src/index.js" } }
      },
      ["src", "esnext"]
    );
    expect(isBundlerOnlyEsnext(Path.join(dir, "esnext"), ["src", "esnext"], targets)).toBe(true);
  });

  it("keeps esnext that node's `import` condition resolves into", () => {
    const dir = build(
      "live",
      {
        name: "live",
        exports: { ".": { import: "./esnext/index.js", require: "./cjs/index.js" } }
      },
      ["cjs", "esm", "esnext"]
    );
    // even with an esm sibling present, reachability wins
    expect(isBundlerOnlyEsnext(Path.join(dir, "esnext"), ["cjs", "esm", "esnext"], targets)).toBe(
      false
    );
  });

  it("keeps esnext that `main` points into", () => {
    const dir = build("main-esnext", { name: "main-esnext", main: "esnext/index.js" }, [
      "esm",
      "esnext"
    ]);
    expect(isBundlerOnlyEsnext(Path.join(dir, "esnext"), ["esm", "esnext"], targets)).toBe(false);
  });

  it("keeps an unclaimed esnext with no esm sibling", () => {
    const dir = build("unclaimed", { name: "unclaimed", main: "src/index.js" }, ["src", "esnext"]);
    expect(isBundlerOnlyEsnext(Path.join(dir, "esnext"), ["src", "esnext"], targets)).toBe(false);
  });

  it("never considers a directory that is not named esnext", () => {
    const dir = build("esm-only", { name: "esm-only", main: "src/index.js", module: "esm/index.js" }, [
      "src",
      "esm"
    ]);
    expect(isBundlerOnlyEsnext(Path.join(dir, "esm"), ["src", "esm"], targets)).toBe(false);
  });
});
