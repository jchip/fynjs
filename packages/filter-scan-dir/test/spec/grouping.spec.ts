import { describe, expect, it, vi } from "vitest";
import { filterScanDir, filterScanDirSync } from "../../src/index.js";

describe.each([
  ["sync", filterScanDirSync],
  ["async", filterScanDir],
] as const)("%s grouping", (_name, scan) => {
  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "should retain files grouped under %s without changing the result prototype",
    async (group) => {
      const result = await scan({
        cwd: "test/fixture-1",
        fullStat: false,
        grouping: true,
        filterExt: ".js",
        filter: () => group,
      });

      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(result, group)).toBe(true);
      expect(result[group].sort()).toEqual(["a.js", "c.js", "dir1/b.js"]);
      expect(result.files).toEqual([]);
    },
  );

  it("should finalize nested groups only once", async () => {
    const originalCreate = Object.create;
    let finalizations = 0;
    const create = vi.spyOn(Object, "create").mockImplementation((prototype, properties) => {
      const result = originalCreate(prototype, properties);
      return prototype === null
        ? new Proxy(result, {
            ownKeys(target) {
              finalizations++;
              return Reflect.ownKeys(target);
            },
          })
        : result;
    });
    let result;

    try {
      result = await scan({
        cwd: "test/fixture-1",
        fullStat: false,
        grouping: true,
        filter: (_file, _path, extras) => (extras.ext === ".js" ? "js" : true),
      });
    } finally {
      create.mockRestore();
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
