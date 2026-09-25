import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import Path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clean } from "../../../lib/prod-prune/index";
import logger from "../../../lib/logger";

const MIT = `MIT License

Copyright (c) 2020 Keepme Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software, to deal in the Software without restriction.
`;

const ISC = `Copyright (c) 2021 Scoped Authors

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
appears in all copies.
`;

describe("clean", () => {
  let root: string;
  let tree: string;

  const write = (relative: string, contents = "x") => {
    const full = Path.join(tree, relative);
    mkdirSync(Path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  };
  const manifest = (relative: string, contents: object) => write(relative, JSON.stringify(contents, null, 2));
  const has = (relative: string) => existsSync(Path.join(tree, relative));

  beforeEach(() => {
    vi.spyOn(logger, "info").mockImplementation(() => logger);
    vi.spyOn(logger, "error").mockImplementation(() => logger);
    // matches logger's own `(...args: any[]) => this` signature; a bare `() => {}`
    // (closer to the source's console mock) would return `undefined` instead
    root = mkdtempSync(Path.join(tmpdir(), "fyn-prod-prune-clean-"));
    tree = Path.join(root, "node_modules");
    mkdirSync(tree, { recursive: true });
    manifest("../package.json", { name: "host", version: "1.0.0" });

    manifest("keepme/package.json", { name: "keepme", version: "1.0.0", main: "index.js" });
    write("keepme/index.js", "module.exports = 1;\n");
    write("keepme/index.d.ts", "export declare const a: number;\n");
    write("keepme/index.js.map", '{"version":3}');
    write("keepme/README.md", "# keepme\n");
    write("keepme/LICENSE", MIT);
    write("keepme/logo.png", "PNG");
    write("keepme/npm-debug.log", "noise");
    write("keepme/test/spec.js", "it works");
    write("keepme/docs/guide.md", "docs");
    write("keepme/.github/workflows/ci.yml", "on: push");
    // `types` is not a removal target — it is emptied only because the file
    // inside it is, which is what the empty-directory sweep is for
    write("keepme/types/index.d.ts", "export declare const a: number;\n");
    // and the sweep has to cascade: removing one file empties three levels
    write("keepme/internal/a/b/index.d.ts", "export declare const b: number;\n");
    // a sibling that keeps a real file, so the sweep does not overreach
    write("keepme/internal/c/index.js", "module.exports = 2;\n");

    // main points at build/src; esm and esnext are bundler-only
    manifest("otel-like/package.json", {
      name: "otel-like",
      version: "2.0.0",
      main: "build/src/index.js",
      module: "build/esm/index.js"
    });
    write("otel-like/build/src/index.js", "1");
    write("otel-like/build/esm/index.js", "1");
    write("otel-like/build/esnext/index.js", "1");

    // node's `import` condition resolves into esnext, so it must survive
    manifest("esnext-live/package.json", {
      name: "esnext-live",
      version: "3.0.0",
      exports: { ".": { import: "./esnext/index.js", require: "./cjs/index.js" } }
    });
    write("esnext-live/esnext/index.js", "1");
    write("esnext-live/esm/index.js", "1");
    write("esnext-live/cjs/index.js", "1");

    manifest("@scope/pkg/package.json", { name: "@scope/pkg", version: "4.0.0" });
    write("@scope/pkg/index.js", "1");
    write("@scope/pkg/LICENSE", ISC);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it("removes non-runtime files and keeps what node loads", async () => {
    await clean(tree, 0, 0);

    expect(has("keepme/index.js")).toBe(true);
    expect(has("otel-like/build/src/index.js")).toBe(true);
    expect(has("@scope/pkg/index.js")).toBe(true);

    expect(has("keepme/index.d.ts")).toBe(false);
    expect(has("keepme/index.js.map")).toBe(false);
    expect(has("keepme/README.md")).toBe(false);
    expect(has("keepme/npm-debug.log")).toBe(false);
    expect(has("keepme/test")).toBe(false);
    expect(has("keepme/docs")).toBe(false);
    expect(has("keepme/.github")).toBe(false);
  });

  it("reports media but never deletes it", async () => {
    await clean(tree, 0, 0);
    expect(has("keepme/logo.png")).toBe(true);
  });

  it("removes a bundler-only esnext build and leaves the reachable one", async () => {
    await clean(tree, 0, 0);
    expect(has("otel-like/build/esnext")).toBe(false);
    expect(has("otel-like/build/esm")).toBe(true);
    expect(has("esnext-live/esnext/index.js")).toBe(true);
  });

  describe("empty directories", () => {
    it("removes a directory left empty by the file rules", async () => {
      await clean(tree, 0, 0);
      expect(has("keepme/types")).toBe(false);
    });

    it("cascades up as each parent is emptied by its own children going", async () => {
      await clean(tree, 0, 0);
      expect(has("keepme/internal/a/b")).toBe(false);
      expect(has("keepme/internal/a")).toBe(false);
    });

    it("stops at a directory that still holds something", async () => {
      await clean(tree, 0, 0);
      expect(has("keepme/internal/c/index.js")).toBe(true);
      expect(has("keepme/internal/c")).toBe(true);
      expect(has("keepme/internal")).toBe(true);
      expect(has("keepme")).toBe(true);
    });
  });

  it("merges licenses into one file and deletes the originals", async () => {
    await clean(tree, 0, 0);

    expect(has("keepme/LICENSE")).toBe(false);
    expect(has("@scope/pkg/LICENSE")).toBe(false);

    const combined = readFileSync(Path.join(tree, "THIRD-PARTY-LICENSES.txt"), "utf8");
    expect(combined).toContain("MIT License  (MIT)");
    expect(combined).toContain("ISC License  (ISC)");
    // packages are named from their own manifest, with the version
    expect(combined).toContain("keepme@1.0.0");
    expect(combined).toContain("@scope/pkg@4.0.0");
    expect(combined).toContain("Copyright (c) 2020 Keepme Authors");
    expect(combined).toContain("Copyright (c) 2021 Scoped Authors");
  });

  it("counts the combined license file as the one that remains", async () => {
    const result = await clean(tree, 0, 0);
    expect(result.files).toBe(
      [
        "keepme/package.json",
        "keepme/index.js",
        "keepme/logo.png",
        "keepme/internal/c/index.js",
        "otel-like/package.json",
        "otel-like/build/src/index.js",
        "otel-like/build/esm/index.js",
        "esnext-live/package.json",
        "esnext-live/esnext/index.js",
        "esnext-live/esm/index.js",
        "esnext-live/cjs/index.js",
        "@scope/pkg/package.json",
        "@scope/pkg/index.js",
        "THIRD-PARTY-LICENSES.txt"
      ].length
    );
  });

  describe("prodPruning config", () => {
    it("takes budgets from the manifest beside the tree", async () => {
      manifest("../package.json", {
        name: "host",
        version: "1.0.0",
        prodPruning: { maxFiles: 1 }
      });
      const result = await clean(tree, 0, 0);
      expect(result.withinBudget).toBe(false);
    });

    it("passes when the tree is inside the declared budgets", async () => {
      manifest("../package.json", {
        name: "host",
        version: "1.0.0",
        prodPruning: { maxKb: 1000, maxFiles: 1000 }
      });
      const result = await clean(tree, 0, 0);
      expect(result.withinBudget).toBe(true);
    });

    it("names only the budget limits that are set", async () => {
      const logged = () =>
        vi
          .mocked(logger.info)
          .mock.calls.concat(vi.mocked(logger.error).mock.calls)
          .map(args => args.join(" "))
          .join("\n");

      await clean(tree, 0, 0);
      expect(logged()).toContain("(budget none)");

      vi.mocked(logger.info).mockClear();
      await clean(tree, 0, 1);
      expect(logged()).toContain("(budget 1 file)");
      expect(logged()).toContain("over the 1 file budget.");
      expect(logged()).not.toContain("0kB /");
    });

    it("lets a flag override the manifest", async () => {
      manifest("../package.json", {
        name: "host",
        version: "1.0.0",
        prodPruning: { maxFiles: 1 }
      });
      const result = await clean(tree, 0, 1000);
      expect(result.withinBudget).toBe(true);
    });

    it("spares a file named in keepPaths", async () => {
      manifest("../package.json", {
        name: "host",
        version: "1.0.0",
        prodPruning: { keepPaths: ["keepme/README.md"] }
      });
      await clean(tree, 0, 0);
      expect(has("keepme/README.md")).toBe(true);
      expect(has("keepme/index.d.ts")).toBe(false);
    });

    it("spares a directory named in keepPaths, and everything under it", async () => {
      manifest("../package.json", {
        name: "host",
        version: "1.0.0",
        prodPruning: { keepPaths: ["keepme/test", "otel-like/build/esnext"] }
      });
      await clean(tree, 0, 0);
      expect(has("keepme/test/spec.js")).toBe(true);
      expect(has("otel-like/build/esnext/index.js")).toBe(true);
      expect(has("keepme/docs")).toBe(false);
    });

    it("ignores a malformed prodPruning block rather than failing the build", async () => {
      manifest("../package.json", {
        name: "host",
        version: "1.0.0",
        prodPruning: { maxKb: "lots", keepPaths: "keepme" }
      });
      const result = await clean(tree, 0, 0);
      expect(result.withinBudget).toBe(true);
      expect(has("keepme/README.md")).toBe(false);
    });
  });

  describe("symlinked packages", () => {
    it("cleans a link whose target is inside the tree, by its real path", async () => {
      manifest("linked-target/package.json", { name: "linked-target", version: "1.0.0" });
      write("linked-target/index.js", "1");
      write("linked-target/README.md", "# docs\n");
      symlinkSync("../linked-target", Path.join(tree, "linker"), "dir");

      await clean(tree, 0, 0);

      expect(has("linked-target/index.js")).toBe(true);
      expect(has("linked-target/README.md")).toBe(false);
    });

    it("never deletes through a link that points out of the tree", async () => {
      // a workspace package linked into node_modules is somebody's checkout;
      // stripping files from it through the link would be destructive
      const outside = Path.join(root, "workspace-pkg");
      mkdirSync(outside, { recursive: true });
      writeFileSync(Path.join(outside, "package.json"), '{"name":"workspace-pkg"}');
      writeFileSync(Path.join(outside, "README.md"), "# not ours to delete\n");
      writeFileSync(Path.join(outside, "index.d.ts"), "export declare const a: number;\n");
      symlinkSync(outside, Path.join(tree, "workspace-pkg"), "dir");

      await clean(tree, 0, 0);

      expect(existsSync(Path.join(outside, "README.md"))).toBe(true);
      expect(existsSync(Path.join(outside, "index.d.ts"))).toBe(true);
    });
  });

  describe("runtime files that look like non-runtime ones", () => {
    it("keeps a package whose name is a removable directory name", async () => {
      manifest("benchmark/package.json", { name: "benchmark", version: "2.1.4" });
      write("benchmark/benchmark.js", "1");
      write("benchmark/test/run.js", "1");
      manifest("@scope/test/package.json", { name: "@scope/test", version: "1.0.0" });
      write("@scope/test/index.js", "1");
      await clean(tree, 0, 0);

      expect(has("benchmark/benchmark.js")).toBe(true);
      expect(has("benchmark/test")).toBe(false);
      expect(has("@scope/test/index.js")).toBe(true);
    });

    it("keeps a code file whose name starts with a document prefix", async () => {
      manifest("history/package.json", { name: "history", version: "5.3.0", main: "main.js" });
      write("history/main.js", "require('./umd/history.production.min.js')");
      write("history/umd/history.production.min.js", "1");
      write("history/HISTORY.md", "notes");
      await clean(tree, 0, 0);

      expect(has("history/umd/history.production.min.js")).toBe(true);
      expect(has("history/HISTORY.md")).toBe(false);
    });

    it("keeps YAML a package may read, and removes CI config", async () => {
      write("keepme/config/defaults.yaml", "a: 1");
      write("keepme/.travis.yml", "language: node_js");
      await clean(tree, 0, 0);

      expect(has("keepme/config/defaults.yaml")).toBe(true);
      expect(has("keepme/.travis.yml")).toBe(false);
    });

    it("prunes fyn's store and installed lock, and keeps its install config", async () => {
      write(".f/lock.yaml", "pkg: 1");
      write(".f/.fyn.json", "{}");
      manifest(".f/_/benchmark/2.1.4/node_modules/benchmark/package.json", {
        name: "benchmark",
        version: "2.1.4"
      });
      write(".f/_/benchmark/2.1.4/node_modules/benchmark/benchmark.js", "1");
      write(".f/_/benchmark/2.1.4/node_modules/benchmark/README.md", "docs");
      await clean(tree, 0, 0);

      expect(has(".f/lock.yaml")).toBe(false);
      expect(has(".f/.fyn.json")).toBe(true);
      expect(has(".f/_/benchmark/2.1.4/node_modules/benchmark/benchmark.js")).toBe(true);
      expect(has(".f/_/benchmark/2.1.4/node_modules/benchmark/README.md")).toBe(false);
    });
  });

  it("fails loudly on a directory that is not there", async () => {
    await expect(clean(Path.join(root, "missing"), 0, 0)).rejects.toThrow(/no such directory/);
  });
});
