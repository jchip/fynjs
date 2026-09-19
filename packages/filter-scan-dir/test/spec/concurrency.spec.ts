import Fs from "fs";
import Path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("async directory concurrency", () => {
  for (const fullStat of [false, true]) {
    for (const nested of [false, true]) {
      for (const concurrency of [0, 1, 2, undefined, Infinity]) {
        it(`bounds active directories with fullStat=${fullStat}, nested=${nested}, concurrency=${concurrency}`, async () => {
          const cwd = Path.resolve("virtual-concurrency");
          const tree = new Map<string, string[]>();
          const expected: string[] = [];
          const children = Array.from({ length: 60 }, (_, ix) => `dir-${ix}`);
          tree.set(cwd, children);
          for (const child of children) {
            const dir = Path.join(cwd, child);
            const descendants = ["nested-0", "nested-1", "nested-2"];
            tree.set(dir, nested ? ["file.txt", ...descendants] : ["file.txt"]);
            expected.push(`${child}/file.txt`);
            if (nested) {
              for (const descendant of descendants) {
                tree.set(Path.join(dir, descendant), ["leaf.txt"]);
                expected.push(`${child}/${descendant}/leaf.txt`);
              }
            }
          }

          let active = 0;
          let peak = 0;
          const remaining = new Map<string, number>();
          const stat = (path: string) => ({
            name: Path.basename(path),
            isDirectory: () => tree.has(path),
            isSymbolicLink: () => false,
          });

          vi.spyOn(Fs, "readdir").mockImplementation(((path, _options, callback) => {
            const dir = String(path);
            const entries = tree.get(dir)!;
            active++;
            peak = Math.max(peak, active);
            remaining.set(dir, entries.length);
            setImmediate(() => {
              if (!fullStat || entries.length === 0) active--;
              callback(
                null,
                fullStat ? entries : entries.map((file) => stat(Path.join(dir, file))),
              );
            });
          }) as typeof Fs.readdir);
          vi.spyOn(Fs, "lstat").mockImplementation(((path, callback) => {
            const file = String(path);
            setImmediate(() => {
              const dir = Path.dirname(file);
              const left = remaining.get(dir)! - 1;
              remaining.set(dir, left);
              if (left === 0) active--;
              callback(null, stat(file));
            });
          }) as typeof Fs.lstat);

          const { filterScanDir } = await import("../../src/index.js");
          const files = await filterScanDir({
            cwd,
            fullStat,
            ...(concurrency === undefined ? {} : { concurrency }),
          });

          expect(files.sort()).toEqual(expected.sort());
          expect(active).toBe(0);
          const limit = concurrency === undefined ? 50 : Math.max(1, concurrency);
          expect(peak).toBeLessThanOrEqual(limit);
          if (limit > 1) expect(peak).toBeGreaterThan(1);
          if (concurrency === Infinity) expect(peak).toBeGreaterThan(50);
          if (!fullStat) expect(Fs.lstat).not.toHaveBeenCalled();
        });
      }
    }
  }

  for (const fullStat of [false, true]) {
    for (const failure of [false, true]) {
      it(`drains active work and cancels queued directories on ${failure ? "error" : "stop"} with fullStat=${fullStat}`, async () => {
        const cwd = Path.resolve("virtual-queued");
        const error = new Error("queued scan failed");
        const tree = new Map([
          [cwd, ["a", "b"]],
          [Path.join(cwd, "a"), ["x", "y", "z"]],
          [Path.join(cwd, "a", "x"), ["stop.txt"]],
          [Path.join(cwd, "a", "y"), ["queued.txt"]],
          [Path.join(cwd, "a", "z"), ["unscheduled.txt"]],
          [Path.join(cwd, "b"), ["late.txt"]],
        ]);
        const reads: string[] = [];
        const callbacks: string[] = [];
        let releaseTrigger: () => void;
        let releaseSibling: () => void;
        let pending = 0;
        let settled = false;
        const stat = (path: string) => ({
          name: Path.basename(path),
          isDirectory: () => tree.has(path),
          isSymbolicLink: () => false,
        });

        vi.spyOn(Fs, "readdir").mockImplementation(((path, _options, callback) => {
          const dir = String(path);
          reads.push(Path.relative(cwd, dir));
          const entries = tree.get(dir)!;
          const complete = () =>
            callback(null, fullStat ? entries : entries.map((name) => stat(Path.join(dir, name))));
          if (dir === Path.join(cwd, "a", "x")) {
            pending++;
            releaseTrigger = () => {
              pending--;
              complete();
            };
          } else if (!fullStat && dir === Path.join(cwd, "b")) {
            pending++;
            releaseSibling = () => {
              pending--;
              complete();
            };
          } else {
            complete();
          }
        }) as typeof Fs.readdir);
        vi.spyOn(Fs, "lstat").mockImplementation(((path, callback) => {
          const file = String(path);
          if (file === Path.join(cwd, "b", "late.txt")) {
            pending++;
            releaseSibling = () => {
              pending--;
              callback(null, stat(file));
            };
          } else {
            callback(null, stat(file));
          }
        }) as typeof Fs.lstat);

        const { filterScanDir } = await import("../../src/index.js");
        const scan = filterScanDir({
          cwd,
          fullStat,
          concurrency: 2,
          rethrowError: true,
          filterDir: (_file, _path, extras) => {
            callbacks.push(extras.dirFile);
            return true;
          },
          filter: (_file, _path, extras) => {
            callbacks.push(extras.dirFile);
            if (failure) throw error;
            return { stop: true };
          },
        });
        const outcome = scan.then(
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
        const pendingBeforeStop = pending;
        const queuedBeforeStop = callbacks.includes("a/y") && !reads.includes("a/y");
        releaseTrigger!();
        await new Promise<void>((resolve) => setImmediate(resolve));
        const settledBeforeSibling = settled;
        const callbacksAfterStop = [...callbacks];
        const readsAfterStop = [...reads];
        releaseSibling!();
        const result = await outcome;

        expect(pendingBeforeStop).toBe(2);
        expect(queuedBeforeStop).toBe(true);
        expect(settledBeforeSibling).toBe(false);
        expect(pending).toBe(0);
        expect(callbacks).toEqual(callbacksAfterStop);
        expect(reads).toEqual(readsAfterStop);
        expect(reads).not.toContain("a/y");
        expect(reads).not.toContain("a/z");
        if (failure) {
          expect(result.error).toBe(error);
        } else {
          expect(result.error).toBeUndefined();
          expect(result.files).toEqual(["a/x/stop.txt"]);
        }
      });
    }
  }
});
