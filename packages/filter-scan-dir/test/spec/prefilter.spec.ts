import Fs from "fs";
import Path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let cwd: string;
let extensionCwd: string;
let symlinkCwd: string;

beforeAll(() => {
  const temp = Path.resolve("../../.temp");
  Fs.mkdirSync(temp, { recursive: true });
  cwd = Fs.mkdtempSync(Path.join(temp, "fsd12-prefilter-"));
  extensionCwd = Fs.mkdtempSync(Path.join(temp, "fsd12-extensions-"));
  for (const name of [".env", "README", "file.", ".config.ts", "source.ts", "source.js"]) {
    Fs.writeFileSync(Path.join(extensionCwd, name), "test");
  }
  for (const file of [
    "a.ts",
    "b.txt",
    "node_modules.txt",
    "node_modules/hidden.ts",
    "nested/keep.ts",
    "nested/node_modules/hidden.ts",
    "skip-tree/hidden.ts",
  ]) {
    Fs.mkdirSync(Path.dirname(Path.join(cwd, file)), { recursive: true });
    Fs.writeFileSync(Path.join(cwd, file), "test");
  }
  symlinkCwd = Fs.mkdtempSync(Path.join(temp, "fsd12-symlinks-"));
  Fs.symlinkSync(Path.join(cwd, "nested"), Path.join(symlinkCwd, "node_modules"), "dir");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

afterAll(() => {
  Fs.rmSync(cwd, { recursive: true, force: true });
  Fs.rmSync(extensionCwd, { recursive: true, force: true });
  Fs.rmSync(symlinkCwd, { recursive: true, force: true });
});

describe("early filtering", () => {
  for (const mode of ["sync", "async"] as const) {
    const loadScan = async () => {
      const api = await import("../../src/index.js");
      return mode === "sync" ? api.filterScanDirSync : api.filterScanDir;
    };

    for (const withPrefilter of [false, true]) {
      it(`${mode}: treats explicit fullStat:undefined as the default with prefilter=${withPrefilter}`, async () => {
        const scan = await loadScan();
        const seen: string[] = [];
        const files = await scan({
          cwd: extensionCwd,
          fullStat: undefined,
          prefilter: withPrefilter ? () => true : undefined,
          rethrowError: true,
          filter: (name, _dir, { stat }) => {
            expect(stat).toBeInstanceOf(Fs.Stats);
            expect(stat.size).toBe(4);
            seen.push(name);
            return true;
          },
        });
        expect(files.length).toBe(6);
        expect(seen.sort()).toEqual(files.sort());
      });
    }

    for (const rethrowError of [undefined, false, true]) {
      it(`${mode}: rejects prefilter with fullStat:false before I/O, rethrowError=${rethrowError}`, async () => {
        const reads = [
          vi.spyOn(Fs, "readdir"),
          vi.spyOn(Fs, "readdirSync"),
          vi.spyOn(Fs, "lstat"),
          vi.spyOn(Fs, "lstatSync"),
        ];
        const scan = await loadScan();
        expect(() => scan({ cwd, fullStat: false, prefilter: () => true, rethrowError })).toThrow(
          TypeError,
        );
        for (const read of reads) expect(read).not.toHaveBeenCalled();
      });
    }

    it(`${mode}: prunes rejected entries before metadata reads and preserves Stats callbacks`, async () => {
      const lstat = vi.spyOn(Fs, mode === "sync" ? "lstatSync" : "lstat");
      const readdir = vi.spyOn(Fs, mode === "sync" ? "readdirSync" : "readdir");
      const scan = await loadScan();
      const early: string[] = [];
      const late: string[] = [];
      const files = await scan({
        cwd,
        ignoreDirs: ["node_modules"],
        prefilter: (name, dir, entry) => {
          expect(entry).toBeInstanceOf(Fs.Dirent);
          expect(entry.name).toBe(name);
          early.push(Path.posix.join(dir, name));
          return name !== "skip-tree" && (entry.isDirectory() || name.endsWith(".ts"));
        },
        filter: (name, dir, { stat, files }) => {
          expect(stat).toBeInstanceOf(Fs.Stats);
          expect(stat.size).toBe(4);
          expect(files).toContain(name);
          if (dir === "") expect(files).toContain("b.txt");
          else expect(files).toContain("node_modules");
          late.push(Path.posix.join(dir, name));
          return true;
        },
        filterDir: (name, _dir, { stat, files }) => {
          expect(stat).toBeInstanceOf(Fs.Stats);
          expect(files).toContain(name);
          expect(files).toContain("skip-tree");
          return true;
        },
      });
      expect(files.sort()).toEqual(["a.ts", "nested/keep.ts"]);
      expect(late.sort()).toEqual(["a.ts", "nested/keep.ts"]);
      expect(early.sort()).toEqual([
        "a.ts",
        "b.txt",
        "nested",
        "nested/keep.ts",
        "node_modules.txt",
        "skip-tree",
      ]);
      expect(lstat.mock.calls.map(([file]) => Path.relative(cwd, String(file))).sort()).toEqual([
        "a.ts",
        "nested",
        "nested/keep.ts",
      ]);
      expect(readdir.mock.calls.map(([dir]) => Path.relative(cwd, String(dir))).sort()).toEqual([
        "",
        "nested",
      ]);
    });

    for (const fullStat of [false, true]) {
      it(`${mode}: does not ignore or follow symlink targets with fullStat=${fullStat}`, async () => {
        const readdir = vi.spyOn(Fs, mode === "sync" ? "readdirSync" : "readdir");
        const scan = await loadScan();
        const filterDir = vi.fn(() => true);
        const prefilter = vi.fn((_name, _dir, entry: Fs.Dirent) => {
          expect(entry.isSymbolicLink()).toBe(true);
          return true;
        });
        expect(
          await scan({
            cwd: symlinkCwd,
            fullStat,
            ignoreDirs: "node_modules",
            includeSymlink: true,
            ...(fullStat ? { prefilter } : {}),
            filterDir,
            filter: (_name, _dir, { stat }) => stat.isSymbolicLink(),
          }),
        ).toEqual(["node_modules"]);
        expect(filterDir).not.toHaveBeenCalled();
        expect(prefilter).toHaveBeenCalledTimes(fullStat ? 1 : 0);
        expect(readdir.mock.calls.map(([dir]) => String(dir))).toEqual([symlinkCwd]);
      });

      it(`${mode}: ignores an exact directory basename at every depth with fullStat=${fullStat}`, async () => {
        const scan = await loadScan();
        const dirs: string[] = [];
        const files = await scan({
          cwd,
          fullStat,
          ignoreDirs: "node_modules",
          filterDir: (name) => {
            dirs.push(name);
            return true;
          },
          filter: (name, _dir, { stat, files }) => {
            expect(stat).toBeInstanceOf(fullStat ? Fs.Stats : Fs.Dirent);
            if (fullStat) expect(files).toContain(name);
            else {
              for (const entry of files) expect(entry).toBeInstanceOf(Fs.Dirent);
              expect(files.map((entry) => (entry as Fs.Dirent).name)).toContain(name);
            }
            return true;
          },
        });
        expect(files.sort()).toEqual([
          "a.ts",
          "b.txt",
          "nested/keep.ts",
          "node_modules.txt",
          "skip-tree/hidden.ts",
        ]);
        expect(dirs.sort()).toEqual(["nested", "skip-tree"]);
      });
    }

    it(`${mode}: treats ignoreDirs values literally, without path or glob matching`, async () => {
      const scan = await loadScan();
      const files = await scan({
        cwd,
        ignoreDirs: ["nested/node_modules", "skip*"],
        prefilter: () => true,
      });
      expect(files.sort()).toEqual([
        "a.ts",
        "b.txt",
        "nested/keep.ts",
        "nested/node_modules/hidden.ts",
        "node_modules.txt",
        "node_modules/hidden.ts",
        "skip-tree/hidden.ts",
      ]);
    });

    it(`${mode}: applies extension filters before lstat while preserving directory traversal`, async () => {
      const lstat = vi.spyOn(Fs, mode === "sync" ? "lstatSync" : "lstat");
      const scan = await loadScan();
      const early: string[] = [];
      const late: string[] = [];
      const files = await scan({
        cwd,
        ignoreDirs: ["node_modules", "skip-tree"],
        ignoreExt: ".txt",
        filterExt: "*.ts",
        prefilter: (name) => {
          early.push(name);
          return true;
        },
        filter: (name) => {
          late.push(name);
          return true;
        },
      });
      expect(files.sort()).toEqual(["a.ts", "nested/keep.ts"]);
      expect(early.sort()).toEqual(["a.ts", "b.txt", "keep.ts", "nested", "node_modules.txt"]);
      expect(late.sort()).toEqual(["a.ts", "keep.ts"]);
      expect(lstat.mock.calls.map(([file]) => Path.relative(cwd, String(file))).sort()).toEqual([
        "a.ts",
        "nested",
        "nested/keep.ts",
      ]);
    });

    it(`${mode}: skips metadata for extension rejects without a prefilter`, async () => {
      const lstat = vi.spyOn(Fs, mode === "sync" ? "lstatSync" : "lstat");
      const scan = await loadScan();
      expect(await scan({ cwd, maxLevel: 0, filterExt: ".ts" })).toEqual(["a.ts"]);
      expect(lstat.mock.calls.map(([file]) => Path.basename(String(file))).sort()).toEqual([
        "a.ts",
        "nested",
        "node_modules",
        "skip-tree",
      ]);
    });

    for (const fullStat of [false, true]) {
      it(`${mode}: keeps extension normalization and dotfile semantics with fullStat=${fullStat}`, async () => {
        const scan = await loadScan();
        expect((await scan({ cwd: extensionCwd, fullStat, filterExt: "*.ts" })).sort()).toEqual([
          ".config.ts",
          "source.ts",
        ]);
        expect(
          (await scan({ cwd: extensionCwd, fullStat, ignoreExt: ["ts", ".js"] })).sort(),
        ).toEqual([".env", "README", "file."]);
        expect(await scan({ cwd: extensionCwd, fullStat, filterExt: ".env" })).toEqual([]);
        expect(
          await scan({ cwd: extensionCwd, fullStat, ignoreExt: "ts", filterExt: ".ts" }),
        ).toEqual([]);
      });
    }

    it(`${mode}: preserves sorting, grouping, formatting, and relative prefixes`, async () => {
      const scan = await loadScan();
      const entries: string[] = [];
      const result = await scan({
        cwd,
        prefix: "nested",
        fullStat: true,
        sortFiles: true,
        grouping: true,
        includeDir: true,
        prefilter: (name, dir) => {
          entries.push(`${dir}/${name}`);
          return true;
        },
        filter: (name, _dir, { stat }) => ({ group: "source", formatName: `${name}:${stat.size}` }),
      });
      expect(result).toEqual({
        files: ["nested/node_modules"],
        source: ["keep.ts:4", "hidden.ts:4"],
      });
      expect(entries).toEqual([
        "nested/keep.ts",
        "nested/node_modules",
        "nested/node_modules/hidden.ts",
      ]);
    });

    for (const rethrowError of [false, true]) {
      it(`${mode}: handles prefilter errors with rethrowError=${rethrowError}`, async () => {
        const scan = await loadScan();
        const error = new Error("prefilter failed");
        const callbacks: string[] = [];
        const run = () =>
          scan({
            cwd,
            sortFiles: true,
            rethrowError,
            prefilter: (name) => {
              callbacks.push(name);
              if (name === "b.txt") throw error;
              return true;
            },
          });
        if (rethrowError) {
          if (mode === "sync") expect(run).toThrow(error);
          else await expect(run()).rejects.toBe(error);
        } else {
          expect(await run()).toEqual(["a.ts"]);
        }
        expect(callbacks).toEqual(["a.ts", "b.txt"]);
      });
    }
  }

  for (const rethrowError of [false, true]) {
    it(`drains in-flight directory reads after prefilter throws with rethrowError=${rethrowError}`, async () => {
      const virtualCwd = Path.resolve("virtual-prefilter-errors");
      const error = new Error("prefilter failed");
      const entry = (name: string, directory = false) => ({
        name,
        isDirectory: () => directory,
        isSymbolicLink: () => false,
      });
      let releaseRead: () => void;
      let active = 0;
      let settled = false;
      const visited: string[] = [];

      vi.spyOn(Fs, "readdir").mockImplementation(((path, _options, callback) => {
        const dir = String(path);
        if (dir === virtualCwd) callback(null, [entry("a", true), entry("b", true)]);
        else if (dir === Path.join(virtualCwd, "a")) {
          active++;
          releaseRead = () => {
            active--;
            callback(null, [entry("ok.ts")]);
          };
        } else callback(null, [entry("fail.ts"), entry("skipped.ts")]);
      }) as typeof Fs.readdir);
      const lstat = vi.spyOn(Fs, "lstat").mockImplementation(((path, callback) => {
        callback(null, entry(Path.basename(String(path)), !String(path).endsWith(".ts")));
      }) as typeof Fs.lstat);
      const { filterScanDir } = await import("../../src/index.js");
      const outcome = filterScanDir({
        cwd: virtualCwd,
        concurrency: 2,
        rethrowError,
        prefilter: (name, dir) => {
          visited.push(Path.posix.join(dir, name));
          if (name === "fail.ts") throw error;
          return true;
        },
      }).then(
        (files) => {
          settled = true;
          return { files, error: undefined };
        },
        (caught: unknown) => {
          settled = true;
          return { files: undefined, error: caught };
        },
      );

      await new Promise<void>((resolve) => setImmediate(resolve));
      const settledBeforeRead = settled;
      const activeBeforeRead = active;
      releaseRead!();
      const result = await outcome;

      expect(settledBeforeRead).toBe(false);
      expect(activeBeforeRead).toBe(1);
      expect(active).toBe(0);
      expect(visited).not.toContain("b/skipped.ts");
      expect(lstat.mock.calls.map(([file]) => Path.basename(String(file)))).not.toContain(
        "fail.ts",
      );
      if (rethrowError) {
        expect(result.error).toBe(error);
        expect(visited).not.toContain("a/ok.ts");
      } else {
        expect(result.error).toBeUndefined();
        expect(result.files).toEqual(["a/ok.ts"]);
        expect(visited).toContain("a/ok.ts");
      }
    });
  }
});
