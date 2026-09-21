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
});
