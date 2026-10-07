import Path from "path";
import { filterScanDir, filterScanDirSync } from "../../src/index.js";
import { describe, it, expect } from "vitest";
import { verify } from "run-verify";

// An option set to `undefined` must fall back to its default, same as an absent key.
const fixtureFiles = ["a.js", "a.json", "c.js", "dir1/b.blah", "dir1/b.js", "dir1/d.json"];

const apis = [
  { name: "async", scan: (opts) => filterScanDir(opts) },
  { name: "sync", scan: (opts) => filterScanDirSync(opts) },
];

describe("options set to undefined", function () {
  for (const { name, scan } of apis) {
    describe(name, function () {
      it("maxLevel: undefined recurses into all levels", () => {
        return verify({ timeout: 500 })
          .step(() => scan({ cwd: "test/fixture-1", maxLevel: undefined }))
          .step((files: string[]) => [...files].sort())
          .keep.step((files) => expect(files).toEqual(fixtureFiles));
      });

      it("prefix: undefined scans from cwd", () => {
        return verify({ timeout: 500 })
          .step(() => scan({ cwd: "test/fixture-1", prefix: undefined }))
          .step((files: string[]) => [...files].sort())
          .keep.step((files) => expect(files).toEqual(fixtureFiles));
      });

      it("prependCwd: undefined keeps includeRoot: true", () => {
        const cwd = Path.resolve("test/fixture-1");
        return verify({ timeout: 500 })
          .step(() => scan({ cwd, includeRoot: true, prependCwd: undefined }))
          .step((files: string[]) => [...files].sort())
          .keep.step((files) => expect(files).toEqual(fixtureFiles.map((f) => `${cwd}/${f}`)));
      });

      it("pathSep: undefined still converts a backslash cwd", () => {
        return verify({ timeout: 500 })
          .step(() => scan({ cwd: "test\\fixture-1", pathSep: undefined }))
          .step((files: string[]) => [...files].sort())
          .keep.step((files) => expect(files).toEqual(fixtureFiles));
      });

      it("several undefined options together use their defaults", () => {
        return verify({ timeout: 500 })
          .step(() =>
            scan({
              cwd: "test/fixture-1",
              maxLevel: undefined,
              prefix: undefined,
              prependCwd: undefined,
              concurrency: undefined,
              fullStat: undefined,
              grouping: undefined,
            }),
          )
          .step((files: string[]) => [...files].sort())
          .keep.step((files) => expect(files).toEqual(fixtureFiles));
      });
    });
  }
});
