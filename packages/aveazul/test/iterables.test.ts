import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

// Collection methods accept any iterable, not just arrays.

function* gen() {
  yield 1;
  yield AveAzul.resolve(2);
  yield 3;
}

describe("collection methods with non-array iterables", () => {
  test("static map() over a Set", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.map(new Set([1, 2, 3]), (x) => x * 2))
      .step((result) => expect(result).toEqual([2, 4, 6]));
  });

  test("static map() over a generator", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.map(gen(), (x) => x * 2))
      .step((result) => expect(result).toEqual([2, 4, 6]));
  });

  test("static mapSeries() over a Set", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.mapSeries(new Set([1, 2, 3]), (x) => x * 2))
      .step((result) => expect(result).toEqual([2, 4, 6]));
  });

  test("instance map() over a Set", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(new Set([1, 2, 3])).map((x: number) => x * 2))
      .step((result) => expect(result).toEqual([2, 4, 6]));
  });

  test("static each() visits every Set item", () => {
    const seen: number[] = [];
    return verify({ timeout: 1000 })
      .step(() => AveAzul.each(new Set([1, 2, 3]), (x) => seen.push(x)))
      .step(() => expect(seen).toEqual([1, 2, 3]));
  });

  test("static each() over a Set resolves with the items, not fn results", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.each(new Set([1, 2, 3]), (x) => x * 10))
      .step((result) => expect(result).toEqual([1, 2, 3]));
  });

  test("instance each() visits every generator item", () => {
    const seen: number[] = [];
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(gen()).each((x: number) => seen.push(x)))
      .step(() => expect(seen).toEqual([1, 2, 3]));
  });

  test("static reduce() over a Set", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.reduce(new Set([1, 2, 3]), (acc: number, x) => acc + x, 0))
      .step((result) => expect(result).toBe(6));
  });

  test("instance reduce() over a generator without initial value", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve(gen()).reduce((acc: number, x: number) => acc + x)
      )
      .step((result) => expect(result).toBe(6));
  });

  test("static filter() over a Set", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.filter(new Set([1, 2, 3]), (x) => x > 1))
      .step((result) => expect(result).toEqual([2, 3]));
  });

  test("instance filter() over a generator", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(gen()).filter((x: number) => x > 1))
      .step((result) => expect(result).toEqual([2, 3]));
  });

  test("map() rejects a non-iterable with TypeError", () => {
    return verify({ timeout: 1000 })
      .expectErrorToBe(TypeError)
      .step(() => AveAzul.resolve(5 as unknown as number[]).map((x: number) => x));
  });
});
