import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

// map and filter callbacks receive (item, index, length).

describe("collection callback arguments", () => {
  test("static map() passes the array length as third argument", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.map(["a", "b"], (x, i, len) => [x, i, len]))
      .step((result) => expect(result).toEqual([["a", 0, 2], ["b", 1, 2]]));
  });

  test("instance map() passes the array length as third argument", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve(["a", "b", "c"]).map((x: string, i: number, len: number) => len)
      )
      .step((result) => expect(result).toEqual([3, 3, 3]));
  });

  test("mapSeries() passes the array length as third argument", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.mapSeries(["a", "b"], (x, i, len) => len))
      .step((result) => expect(result).toEqual([2, 2]));
  });

  test("instance filter() passes (item, index, length)", () => {
    const calls: unknown[] = [];
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve(["a", "b"]).filter((x: string, i: number, len: number) => {
          calls.push([x, i, len]);
          return true;
        })
      )
      .step(() => expect(calls).toEqual([["a", 0, 2], ["b", 1, 2]]));
  });

  test("static filter() passes (item, index, length)", () => {
    const calls: unknown[] = [];
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.filter(["a", "b", "c"], (x, i, len) => {
          calls.push([x, i, len]);
          return i !== 1;
        })
      )
      .keep.step((result) => expect(result).toEqual(["a", "c"]))
      .step(() => expect(calls).toEqual([["a", 0, 3], ["b", 1, 3], ["c", 2, 3]]));
  });
});
