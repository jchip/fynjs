import { describe, expect, it, vi } from "vitest";
import { filterScanDir, filterScanDirSync } from "../../src/index.js";

describe.each([
  ["sync", filterScanDirSync],
  ["async", filterScanDir],
] as const)("%s grouping", (_name, scan) => {
  it("should finalize nested groups only once", async () => {
    const assign = vi.spyOn(Object, "assign");
    let result;
    let finalizations;

    try {
      result = await scan({
        cwd: "test/fixture-1",
        fullStat: false,
        grouping: true,
        filter: (_file, _path, extras) => (extras.ext === ".js" ? "js" : true),
      });
      finalizations = assign.mock.calls.filter(
        ([target, source]) => "files" in target && Array.isArray(target.files) && source?.js,
      ).length;
    } finally {
      assign.mockRestore();
    }

    expect(result.files.sort()).toEqual(["a.json", "dir1/b.blah", "dir1/d.json"]);
    expect(result.js.sort()).toEqual(["a.js", "c.js", "dir1/b.js"]);
    expect(finalizations).toBe(1);
  });

  it("should include an empty default group when every file has a group", async () => {
    const result = await scan({
      cwd: "test/fixture-1",
      fullStat: false,
      grouping: true,
      filterExt: ".js",
      filter: () => "js",
    });

    expect(result.files).toEqual([]);
    expect(result.js.sort()).toEqual(["a.js", "c.js", "dir1/b.js"]);
  });

  it("should return an empty default group when every file is excluded", async () => {
    expect(
      await scan({
        cwd: "test/fixture-1",
        fullStat: false,
        grouping: true,
        filter: () => false,
      }),
    ).toEqual({ files: [] });
  });
});
