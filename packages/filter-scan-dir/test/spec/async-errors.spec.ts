import Fs from "fs";
import Path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("async error settlement", () => {
  for (const failure of ["readdir", "lstat", "filter", "filterDir"]) {
    for (const rethrowError of [false, true]) {
      it(`settles started work after ${failure} fails with rethrowError=${rethrowError}`, async () => {
        const cwd = Path.resolve("virtual-errors");
        const error = new Error(`${failure} failed`);
        let releaseRead: () => void;
        let active = 0;
        let settled = false;
        const visited: string[] = [];
        const stat = (path: string) => ({
          isDirectory: () => path === Path.join(cwd, "a") || path === Path.join(cwd, "b"),
          isSymbolicLink: () => false,
        });

        vi.spyOn(Fs, "readdir").mockImplementation(((path, _options, callback) => {
          const dir = String(path);
          if (dir === cwd) {
            callback(null, ["a", "b"]);
          } else if (dir === Path.join(cwd, "a")) {
            active++;
            releaseRead = () => {
              active--;
              callback(null, ["ok.txt"]);
            };
          } else if (failure === "readdir") {
            callback(error);
          } else {
            callback(null, ["fail.txt", "skipped.txt"]);
          }
        }) as typeof Fs.readdir);
        vi.spyOn(Fs, "lstat").mockImplementation(((path, callback) => {
          const file = String(path);
          callback(failure === "lstat" && file.endsWith("fail.txt") ? error : null, stat(file));
        }) as typeof Fs.lstat);

        const { filterScanDir } = await import("../../src/index.js");
        const scan = filterScanDir({
          cwd,
          concurrency: Infinity,
          fullStat: true,
          rethrowError,
          filterDir: (file) => {
            if (failure === "filterDir" && file === "b") throw error;
            return true;
          },
          filter: (file, path) => {
            visited.push(`${path}/${file}`);
            if (failure === "filter" && file === "fail.txt") throw error;
            return true;
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

        await nextTurn();
        const settledBeforeRead = settled;
        const activeBeforeRead = active;
        releaseRead!();
        const result = await outcome;
        await nextTurn();

        expect(activeBeforeRead).toBe(1);
        expect(settledBeforeRead).toBe(false);
        expect(active).toBe(0);
        expect(visited).not.toContain("b/skipped.txt");
        if (rethrowError) {
          expect(result.error).toBe(error);
        } else {
          expect(result.error).toBeUndefined();
          expect(result.files).toEqual(["a/ok.txt"]);
          const returnedFiles = [...result.files!];
          await nextTurn();
          expect(result.files).toEqual(returnedFiles);
        }
      });
    }
  }

  it("attaches rejection handlers before starting another directory", async () => {
    const cwd = Path.resolve("virtual-rejections");
    const error = new Error("third directory failed");
    const reads = new Map<string, () => void>();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    vi.spyOn(Fs, "readdir").mockImplementation(((path, _options, callback) => {
      const dir = String(path);
      if (dir === cwd) {
        callback(null, ["a", "b", "c"].map((name) => ({
          name,
          isDirectory: () => true,
        })));
      } else if (dir.endsWith("c")) {
        callback(error);
      } else {
        reads.set(dir, () => callback(null, []));
      }
    }) as typeof Fs.readdir);

    try {
      const { filterScanDir } = await import("../../src/index.js");
      const scan = filterScanDir({ cwd, fullStat: false, concurrency: 2, rethrowError: true });
      const outcome = scan.catch((caught: unknown) => caught);
      await nextTurn();
      await nextTurn();
      for (const release of reads.values()) release();
      expect(await outcome).toBe(error);
      await nextTurn();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
