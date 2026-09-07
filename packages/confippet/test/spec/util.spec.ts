import { describe, it, expect } from "vitest";
import util, {
  replaceArray,
  unionArray,
  merge,
  uMerge,
  defaultsDeep,
  getPath
} from "../../src/util.js";

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
      expect(unionArray([1, 2], [3, 4])).toEqual([3, 4]);
    });

    it("should return undefined when b is not an array", () => {
      expect(unionArray([1, 2], "str", "+items")).toBeUndefined();
      expect(unionArray([1, 2], { a: 1 }, "+items")).toBeUndefined();
    });
  });

  describe("merge & uMerge", () => {
    it("should return target when target is null or not an object", () => {
      expect(merge(null, { a: 1 })).toBeNull();
      expect(merge(undefined, { a: 1 })).toBeUndefined();
      expect(merge(123, { a: 1 })).toBe(123);
    });

    it("should skip sources that are null or not an object", () => {
      const target = { a: 1 };
      expect(merge(target, null, undefined, 42, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

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
      expect("b" in target).toBe(true);
    });

    it("should guard against prototype pollution", () => {
      const target: any = {};
      const payload = JSON.parse(
        '{"__proto__": {"polluted": true}, "constructor": {"polluted": true}, "prototype": {"polluted": true}}'
      );
      merge(target, payload);
      expect((target as any).polluted).toBeUndefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect(target.__proto__).toBe(Object.prototype);
    });
  });

  describe("defaultsDeep", () => {
    it("should return target if null or not an object", () => {
      expect(defaultsDeep(null, { a: 1 })).toBeNull();
      expect(defaultsDeep(undefined, { a: 1 })).toBeUndefined();
      expect(defaultsDeep(123, { a: 1 })).toBe(123);
    });

    it("should skip non-object sources", () => {
      const target = { a: 1 };
      expect(defaultsDeep(target, null, undefined, 42, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it("should deep fill missing properties without overriding existing ones", () => {
      const target: any = {
        a: 1,
        b: { x: 10 },
        arr: [1, 2]
      };
      defaultsDeep(target, {
        a: 99,
        b: { x: 99, y: 20 },
        c: { nested: "val" },
        arr: [99]
      });
      expect(target).toEqual({
        a: 1,
        b: { x: 10, y: 20 },
        c: { nested: "val" },
        arr: [1, 2]
      });
    });

    it("should guard against prototype pollution in defaultsDeep", () => {
      const target: any = {};
      const payload = JSON.parse(
        '{"__proto__": {"polluted": true}, "constructor": {"polluted": true}, "prototype": {"polluted": true}}'
      );
      defaultsDeep(target, payload);
      expect((target as any).polluted).toBeUndefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe("getPath", () => {
    it("should return defaultValue if obj or path is null/undefined", () => {
      expect(getPath(null, "a", "def")).toBe("def");
      expect(getPath(undefined, "a", "def")).toBe("def");
      expect(getPath({ a: 1 }, undefined, "def")).toBe("def");
      expect(getPath({ a: 1 }, null, "def")).toBe("def");
    });

    it("should handle array paths", () => {
      const obj = { a: { b: [{ c: 42 }] } };
      expect(getPath(obj, ["a", "b", "0", "c"])).toBe(42);
      expect(getPath(obj, ["a", "missing", "c"], "fallback")).toBe("fallback");
      expect(getPath({ a: undefined }, ["a"], "fallback")).toBe("fallback");
      expect(getPath(obj, [])).toBeUndefined();
    });

    it("should handle non-string paths", () => {
      const obj: any = { 0: "zero", true: "bool" };
      expect(getPath(obj, 0)).toBe("zero");
      expect(getPath(obj, 1, "def")).toBe("def");
      expect(getPath(obj, true)).toBe("bool");
    });

    it("should handle empty string path", () => {
      expect(getPath({ a: 1 }, "", "def")).toBe("def");
    });

    it("should handle direct property match", () => {
      const obj = { "a.b": "direct" };
      expect(getPath(obj, "a.b")).toBe("direct");
      expect(getPath({ "a.b": undefined }, "a.b", "fallback")).toBe("fallback");
    });

    it("should handle dotted and bracket notation", () => {
      const obj = { a: { b: [{ c: 10 }] } };
      expect(getPath(obj, "a.b[0].c")).toBe(10);
      expect(getPath(obj, "a.b.0.c")).toBe(10);
      expect(getPath(obj, "a.b[0]['c']")).toBe(10);
      expect(getPath(obj, 'a.b[0]["c"]')).toBe(10);
      expect(getPath(obj, "a.missing.c", "none")).toBe("none");
    });
  });

  describe("default export", () => {
    it("should export util methods", () => {
      expect(util.merge).toBe(merge);
      expect(util.uMerge).toBe(uMerge);
      expect(util.replaceArray).toBe(replaceArray);
      expect(util.unionArray).toBe(unionArray);
      expect(util.defaultsDeep).toBe(defaultsDeep);
      expect(util.getPath).toBe(getPath);
    });
  });
});
