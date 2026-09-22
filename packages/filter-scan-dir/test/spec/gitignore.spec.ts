import Fs from "fs";
import Path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cwd: string;

beforeEach(() => {
  const temp = Path.resolve("../../.temp");
  Fs.mkdirSync(temp, { recursive: true });
  cwd = Fs.mkdtempSync(Path.join(temp, "fsd16-gitignore-"));
  Fs.mkdirSync(Path.join(cwd, ".git"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  Fs.rmSync(cwd, { recursive: true, force: true });
});

function write(file: string, text = "source") {
  Fs.mkdirSync(Path.dirname(Path.join(cwd, file)), { recursive: true });
  Fs.writeFileSync(Path.join(cwd, file), text);
}

// Canned parser results exercise scanner scope and precedence, not Git syntax.
function writeRules(file: string, results: Record<string, boolean>) {
  write(file, JSON.stringify(results));
}

function parseRules(contents: string) {
  const results = JSON.parse(contents) as Record<string, boolean>;
  return {
    test: (path: string) => ({
      ignored: results[path] === true,
      unignored: results[path] === false,
    }),
  };
}

describe("gitignore parser", () => {
  it("does not pass the rule directory itself to the matcher", async () => {
    const { GitignoreRules } = await import("../../src/gitignore.js");
    const matcher = { test: vi.fn(() => ({ ignored: true, unignored: false })) };
    const rules = new GitignoreRules([{ dir: cwd, matcher }]);

    expect(rules.ignores(cwd, true)).toBe(false);
    expect(matcher.test).not.toHaveBeenCalled();
    expect(rules.ignores(Path.join(cwd, "source.ts"), false)).toBe(true);
    expect(matcher.test).toHaveBeenCalledExactlyOnceWith("source.ts");
  });

  for (const mode of ["sync", "async"] as const) {
    for (const fullStat of [true, false]) {
      const loadScan = async () => {
        const api = await import("../../src/index.js");
        return mode === "sync" ? api.filterScanDirSync : api.filterScanDir;
      };
      const options = () => ({
        cwd,
        fullStat,
        gitignore: parseRules,
        ignoreDirs: ".git",
        rethrowError: true,
      });

      it(`${mode}, fullStat=${fullStat}: prunes ignored directories before metadata and descent`, async () => {
        writeRules(".gitignore", {
          "scratch/": true,
          "nested/scratch/": true,
          "nested/skip.generated": true,
        });
        write("scratch/deep/hidden.ts");
        write("nested/scratch/deep/hidden.ts");
        write("nested/source.ts");
        write("nested/skip.generated");
        write("nested/keep.generated");
        write("scratch-file/scratch");
        const stat = vi.spyOn(Fs, mode === "sync" ? "lstatSync" : "lstat");
        const read = vi.spyOn(Fs, mode === "sync" ? "readdirSync" : "readdir");
        const scan = await loadScan();
        const result = await scan(options());
        expect(result.sort()).toEqual([
          ".gitignore",
          "nested/keep.generated",
          "nested/source.ts",
          "scratch-file/scratch",
        ]);
        expect(read.mock.calls.map(([dir]) => Path.relative(cwd, String(dir))).sort()).toEqual([
          "",
          "nested",
          "scratch-file",
        ]);
        const stats = stat.mock.calls.map(([file]) => Path.relative(cwd, String(file)));
        expect(stats).not.toContain("scratch");
        expect(stats).not.toContain("nested/scratch");
        expect(stats).not.toContain("nested/skip.generated");
        if (!fullStat) expect(stats).toEqual([]);
      });

      it(`${mode}, fullStat=${fullStat}: inherits repository rules and applies nested negations in their scope`, async () => {
        writeRules(".gitignore", {
          "packages/app/keep.generated": true,
          "packages/app/skip.generated": true,
          "packages/app/nested/skip.generated": true,
          "packages/app/other/skip.generated": true,
          "packages/app/blocked/": true,
          "root-only.ts": true,
        });
        writeRules("packages/app/.gitignore", { "keep.generated": false, "local-only.ts": true });
        write("packages/app/keep.generated");
        write("packages/app/skip.generated");
        write("packages/app/root-only.ts");
        write("packages/app/local-only.ts");
        writeRules("packages/app/nested/.gitignore", { "skip.generated": false });
        write("packages/app/nested/skip.generated");
        write("packages/app/nested/local-only.ts");
        write("packages/app/other/skip.generated");
        writeRules("packages/app/blocked/.gitignore", { "source.ts": false });
        write("packages/app/blocked/source.ts");
        const scan = await loadScan();
        expect((await scan({ ...options(), cwd: Path.join(cwd, "packages/app") })).sort()).toEqual([
          ".gitignore",
          "keep.generated",
          "nested/.gitignore",
          "nested/local-only.ts",
          "nested/skip.generated",
          "root-only.ts",
        ]);
        expect((await scan({ ...options(), prefix: "packages/app" })).sort()).toEqual([
          "packages/app/.gitignore",
          "packages/app/keep.generated",
          "packages/app/nested/.gitignore",
          "packages/app/nested/local-only.ts",
          "packages/app/nested/skip.generated",
          "packages/app/root-only.ts",
        ]);
      });

      it(`${mode}, fullStat=${fullStat}: explicitly scans ignored roots using their own rules`, async () => {
        writeRules(".gitignore", { "_w/": true, "_w/local/source.ts": true });
        writeRules("_w/local/.gitignore", { "output/": true });
        write("_w/local/source.ts");
        write("_w/local/output/generated.ts");
        const scan = await loadScan();
        expect((await scan({ ...options(), cwd: Path.join(cwd, "_w/local") })).sort()).toEqual([
          ".gitignore",
          "source.ts",
        ]);
      });

      it(`${mode}, fullStat=${fullStat}: does not read rules by default and refreshes rules on each scan`, async () => {
        writeRules(".gitignore", { "source.ts": true });
        write("source.ts");
        const scan = await loadScan();
        const reads =
          mode === "sync" ? vi.spyOn(Fs, "readFileSync") : vi.spyOn(Fs.promises, "readFile");
        expect((await scan({ ...options(), gitignore: undefined })).sort()).toEqual([
          ".gitignore",
          "source.ts",
        ]);
        expect(reads).not.toHaveBeenCalled();
        expect(await scan(options())).toEqual([".gitignore"]);
        writeRules(".gitignore", { "source.ts": false });
        expect((await scan(options())).sort()).toEqual([".gitignore", "source.ts"]);
      });

      it(`${mode}, fullStat=${fullStat}: honors the nearest .git file boundary`, async () => {
        writeRules(".gitignore", { "source.ts": true });
        write("worktree/.git", "gitdir: ../.git/worktrees/example\n");
        writeRules("worktree/.gitignore", { "output/": true });
        write("worktree/source.ts");
        write("worktree/output/generated.ts");
        const scan = await loadScan();
        expect(
          (
            await scan({
              ...options(),
              cwd: Path.join(cwd, "worktree"),
              filter: (name) => name !== ".git",
            })
          ).sort(),
        ).toEqual([".gitignore", "source.ts"]);
      });

      it(`${mode}, fullStat=${fullStat}: scopes rules to the scan root outside a repository`, async () => {
        writeRules(".gitignore", { "standalone/source.ts": true });
        writeRules("standalone/.gitignore", { "output/": true });
        write("standalone/source.ts");
        write("standalone/output/generated.ts");
        const scan = await loadScan();
        // The fixture lives inside this repository; simulate no .git in its ancestry.
        vi.spyOn(Fs, "existsSync").mockReturnValue(false);
        const parser = vi.fn(parseRules);

        expect(
          (await scan({ ...options(), cwd: Path.join(cwd, "standalone"), gitignore: parser })).sort(),
        ).toEqual([".gitignore", "source.ts"]);
        expect(parser).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ "output/": true }));
      });

      it(`${mode}, fullStat=${fullStat}: scans directories without rule files`, async () => {
        write("nested/source.ts");
        const parser = vi.fn(parseRules);
        const scan = await loadScan();
        expect(await scan({ ...options(), gitignore: parser })).toEqual(["nested/source.ts"]);
        expect(parser).not.toHaveBeenCalled();
      });

      for (const rethrowError of [true, false]) {
        it(`${mode}, fullStat=${fullStat}: applies rethrowError=${rethrowError} to parser errors`, async () => {
          write(".gitignore", "rules");
          write("source.ts");
          const error = new Error("parser failed");
          const scan = await loadScan();
          const run = () =>
            scan({
              ...options(),
              rethrowError,
              gitignore: () => {
                throw error;
              },
            });
          if (!rethrowError) expect(await run()).toEqual([]);
          else if (mode === "sync") expect(run).toThrow(error);
          else await expect(run()).rejects.toBe(error);
        });
      }
    }
  }
});
