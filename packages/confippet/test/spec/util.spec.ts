import { describe, it, expect } from "vitest";
import util, { replaceArray, unionArray, merge, uMerge } from "../../src/util.js";

describe("util", () => {
  describe("replaceArray", () => {
    it("should return array when b is an array", () => {
      expect(replaceArray([1], [2, 3])).toEqual([2, 3]);
      expect(replaceArray(undefined, [])).toEqual([]);
    });

    it("should return undefined when b is not an array", () => {
      expect(replaceArray([1], "not-array")).toBeUndefined();
      expect(replaceArray([1], { foo: "bar" })).toBeUndefined();
      expect(replaceArray([1], null)).toBeUndefined();
    });
  });

  describe("unionArray", () => {
    it("should union arrays when key starts with + and a is array", () => {
      expect(unionArray([1, 2], [2, 3], "+items")).toEqual([1, 2, 3]);
    });

    it("should return b when key starts with + but a is not an array", () => {
      expect(unionArray(undefined, [2, 3], "+items")).toEqual([2, 3]);
      expect(unionArray("not-array", [2, 3], "+items")).toEqual([2, 3]);
    });

    it("should return b when key does not start with +", () => {
      expect(unionArray([1, 2], [3, 4], "items")).toEqual([3, 4]);
    });

    it("should return undefined when b is not an array", () => {
      expect(unionArray([1, 2], "str", "+items")).toBeUndefined();
      expect(unionArray([1, 2], { a: 1 }, "+items")).toBeUndefined();
    });
  });

  describe("merge & uMerge", () => {
    it("should replace arrays in merge", () => {
      const target = { arr: [1, 2] };
      merge(target, { arr: [3] });
      expect(target.arr).toEqual([3]);
    });

    it("should union arrays under + keys in uMerge", () => {
      const target = { "+arr": [1, 2], regular: [1, 2] };
      uMerge(target, { "+arr": [2, 3], regular: [3] });
      expect(target["+arr"]).toEqual([1, 2, 3]);
      expect(target.regular).toEqual([3]);
    });

    it("should merge nested objects", () => {
      const target: any = { a: { b: 1, c: 2 }, d: 10 };
      merge(target, { a: { b: 3, e: 4 }, d: { nested: true } });
      expect(target).toEqual({
        a: { b: 3, c: 2, e: 4 },
        d: { nested: true }
      });
    });

    it("should ignore undefined source values when key exists in target", () => {
      const target: any = { a: 1 };
      merge(target, { a: undefined, b: undefined });
      expect(target.a).toBe(1);
      expect(target.b).toBeUndefined();
    });

    it("should guard against prototype pollution", () => {
      const target: any = {};
      const payload = JSON.parse('{"__proto__": {"polluted": true}}');
      merge(target, payload);
      expect((target as any).polluted).toBeUndefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe("default export", () => {
    it("should export util methods", () => {
      expect(util.merge).toBe(merge);
      expect(util.uMerge).toBe(uMerge);
      expect(util.replaceArray).toBe(replaceArray);
      expect(util.unionArray).toBe(unionArray);
    });
  });
});
