import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fs from "node:fs";
import Os from "node:os";
import Path from "node:path";
import { scanFileStats } from "../../lib/util/stat-dir";

describe("scanFileStats", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-stat-dir-"));
  });

  afterEach(() => {
    Fs.rmSync(cwd, { recursive: true, force: true });
  });

  it.each([".temp", "src/.temp"])("ignores %s and its contents while detecting source changes", async tempDir => {
    const sourceDir = Path.join(cwd, "src");
    const sourceFile = Path.join(sourceDir, "index.ts");
    const generatedDir = Path.join(cwd, tempDir);
    const generatedFile = Path.join(generatedDir, "benchmark.txt");
    Fs.mkdirSync(sourceDir, { recursive: true });
    Fs.mkdirSync(generatedDir, { recursive: true });
    Fs.writeFileSync(sourceFile, "export const value = 1;\n");
    Fs.writeFileSync(generatedFile, "benchmark\n");

    const oldTime = new Date(1000);
    const sourceTime = new Date(2000);
    const generatedTime = new Date(3000);
    Fs.utimesSync(cwd, oldTime, oldTime);
    Fs.utimesSync(sourceDir, oldTime, oldTime);
    Fs.utimesSync(sourceFile, sourceTime, sourceTime);
    Fs.utimesSync(generatedDir, generatedTime, generatedTime);
    Fs.utimesSync(generatedFile, generatedTime, generatedTime);

    expect(await scanFileStats(cwd)).toStrictEqual({
      latestMtimeMs: sourceTime.getTime(),
      latestFile: sourceFile
    });
  });

  it("prunes gitignored directories and honors directory negation", async () => {
    Fs.writeFileSync(Path.join(cwd, ".gitignore"), "scratch/\ncache-*\n!cache-source/\n");
    for (const dir of ["scratch", "cache-generated", "cache-source"]) {
      Fs.mkdirSync(Path.join(cwd, dir));
      const file = Path.join(cwd, dir, "index.ts");
      Fs.writeFileSync(file, "source\n");
      const time = new Date(dir === "cache-source" ? 2000 : 3000);
      Fs.utimesSync(file, time, time);
      Fs.utimesSync(Path.join(cwd, dir), time, time);
    }
    Fs.utimesSync(Path.join(cwd, "cache-source"), new Date(1000), new Date(1000));
    Fs.utimesSync(Path.join(cwd, ".gitignore"), new Date(1000), new Date(1000));
    Fs.utimesSync(cwd, new Date(1000), new Date(1000));

    expect(await scanFileStats(cwd)).toStrictEqual({
      latestMtimeMs: 2000,
      latestFile: Path.join(cwd, "cache-source/index.ts")
    });
  });

  it("detects changes to the ignore rules themselves", async () => {
    const rules = Path.join(cwd, ".gitignore");
    Fs.writeFileSync(rules, "scratch/\n");
    Fs.utimesSync(rules, new Date(2000), new Date(2000));
    Fs.utimesSync(cwd, new Date(1000), new Date(1000));

    expect(await scanFileStats(cwd)).toStrictEqual({
      latestMtimeMs: 2000,
      latestFile: rules
    });
  });

  it.each(["package.json", "fyn-lock.yaml", "package-fyn.json", "fynpo.config.json"])("still inspects gitignored install input %s", async name => {
    Fs.writeFileSync(Path.join(cwd, ".gitignore"), `${name}\n`);
    const file = Path.join(cwd, name);
    Fs.writeFileSync(file, "{}\n");
    Fs.utimesSync(file, new Date(2000), new Date(2000));
    Fs.utimesSync(Path.join(cwd, ".gitignore"), new Date(1000), new Date(1000));
    Fs.utimesSync(cwd, new Date(1000), new Date(1000));

    expect(await scanFileStats(cwd)).toStrictEqual({
      latestMtimeMs: 2000,
      latestFile: file
    });
  });

  it("detects inherited rule changes when scanning a monorepo package", async () => {
    Fs.mkdirSync(Path.join(cwd, ".git"));
    const pkg = Path.join(cwd, "pkg");
    Fs.mkdirSync(pkg);
    const rules = Path.join(cwd, ".gitignore");
    Fs.writeFileSync(rules, "generated/\n");
    Fs.mkdirSync(Path.join(pkg, "generated"));
    const generated = Path.join(pkg, "generated/newest.ts");
    Fs.writeFileSync(generated, "generated\n");
    Fs.utimesSync(generated, new Date(4000), new Date(4000));
    Fs.utimesSync(Path.join(pkg, "generated"), new Date(4000), new Date(4000));
    Fs.utimesSync(rules, new Date(3000), new Date(3000));
    Fs.utimesSync(pkg, new Date(1000), new Date(1000));
    Fs.utimesSync(cwd, new Date(1000), new Date(1000));

    expect(await scanFileStats(pkg)).toStrictEqual({
      latestMtimeMs: 3000,
      latestFile: rules
    });
  });

  it("detects edits to nested rules even when those rules ignore themselves", async () => {
    const sourceDir = Path.join(cwd, "src");
    Fs.mkdirSync(sourceDir);
    const rules = Path.join(sourceDir, ".gitignore");
    Fs.writeFileSync(rules, "*\n!index.ts\n");
    const sourceFile = Path.join(sourceDir, "index.ts");
    Fs.writeFileSync(sourceFile, "source\n");
    Fs.utimesSync(sourceFile, new Date(2000), new Date(2000));
    Fs.utimesSync(rules, new Date(3000), new Date(3000));
    Fs.utimesSync(sourceDir, new Date(1000), new Date(1000));
    Fs.utimesSync(cwd, new Date(1000), new Date(1000));

    expect(await scanFileStats(cwd)).toStrictEqual({
      latestMtimeMs: 3000,
      latestFile: rules
    });
  });

  it("detects deletion of inherited rules that exposes older source files", async () => {
    Fs.mkdirSync(Path.join(cwd, ".git"));
    const pkg = Path.join(cwd, "pkg");
    Fs.mkdirSync(pkg);
    const rules = Path.join(cwd, ".gitignore");
    Fs.writeFileSync(rules, "*.generated\n");
    const file = Path.join(pkg, "source.generated");
    Fs.writeFileSync(file, "source\n");
    Fs.utimesSync(file, new Date(1000), new Date(1000));
    Fs.utimesSync(pkg, new Date(1000), new Date(1000));
    Fs.unlinkSync(rules);
    Fs.utimesSync(cwd, new Date(3000), new Date(3000));

    expect(await scanFileStats(pkg)).toStrictEqual({
      latestMtimeMs: 3000,
      latestFile: cwd
    });
  });

  it("still scans an explicitly requested local package inside an ignored directory", async () => {
    Fs.mkdirSync(Path.join(cwd, ".git"));
    const pkg = Path.join(cwd, "_w/pkg");
    Fs.mkdirSync(pkg, { recursive: true });
    const rules = Path.join(cwd, ".gitignore");
    Fs.writeFileSync(rules, "_w/\n");
    const file = Path.join(pkg, "index.ts");
    Fs.writeFileSync(file, "source\n");
    Fs.utimesSync(file, new Date(2000), new Date(2000));
    for (const entry of [cwd, Path.join(cwd, "_w"), pkg, rules]) {
      Fs.utimesSync(entry, new Date(1000), new Date(1000));
    }

    expect(await scanFileStats(pkg)).toStrictEqual({
      latestMtimeMs: 2000,
      latestFile: file
    });
  });
});
