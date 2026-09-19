import Fs from "fs";
import Path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { filterScanDir, filterScanDirSync } from "../../src/index.js";

let cwd: string;

beforeAll(() => {
  Fs.mkdirSync(".temp", { recursive: true });
  cwd = Fs.mkdtempSync(Path.resolve(".temp/stop-"));
  for (const dir of ["a/inner", "b/inner"]) {
    Fs.mkdirSync(Path.join(cwd, dir), { recursive: true });
    Fs.writeFileSync(Path.join(cwd, dir, "deep.js"), "");
    Fs.writeFileSync(Path.join(cwd, dir, "../file.js"), "");
  }
});

afterAll(() => Fs.rmSync(cwd, { recursive: true, force: true }));

describe.each([true, false])("stop with fullStat=%s", (fullStat) => {
  for (const [name, scan, concurrency] of [
    ["sync", filterScanDirSync, 1],
    ["async sequential", filterScanDir, 1],
    ["async concurrent", filterScanDir, 2],
  ] as const) {
    describe(name, () => {
      it.each([false, true])("should stop globally from a nested file (skip=%s)", async (skip) => {
        const callbacksAfterStop: string[] = [];
        let stopped = false;
        const result = await scan({
          cwd,
          fullStat,
          concurrency,
          sortFiles: true,
          filter(file, path) {
            if (stopped) callbacksAfterStop.push(`${path}/${file}`);
            stopped = true;
            return { stop: true, skip };
          },
          filterDir(file, path) {
            if (stopped) callbacksAfterStop.push(`${path}/${file}`);
            return true;
          },
        });
        expect(stopped).toBe(true);
        expect(callbacksAfterStop).toEqual([]);
        expect(result).toHaveLength(skip ? 0 : 1);
      });

      it("should stop globally from a nested directory", async () => {
        const callbacksAfterStop: string[] = [];
        let stopped = false;
        await scan({
          cwd,
          fullStat,
          concurrency,
          sortFiles: true,
          includeDir: true,
          filter(file, path) {
            if (stopped) callbacksAfterStop.push(`${path}/${file}`);
            return true;
          },
          filterDir(file, path) {
            if (stopped) callbacksAfterStop.push(`${path}/${file}`);
            stopped = file === "inner";
            return { stop: stopped };
          },
        });
        expect(stopped).toBe(true);
        expect(callbacksAfterStop).toEqual([]);
      });
    });
  }
});
