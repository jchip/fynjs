import { describe, it, expect } from "vitest";
import { extractFromObj, removeFromObj, renameFromObj, getPath, setPath, unsetPath } from "../src/utils.js";

describe("utils", () => {
  describe("extractFromObj", () => {
    it("should extract all types", () => {
      const sym1 = Symbol("abcdefg");
      const sym2 = Symbol("abcdefgdefgasdf");

      const output = extractFromObj(
        {
          hello: "world",
          test: { foo: "bar", home: "here" },
          blah: 50,
          oops: null,
          oops2: undefined,
          oops3: false,
          sym1,
          sym2,
          boo1: true,
          no1: { blah: "blah" },
          no2: true,
          no3: false,
          no5: {},
          no6: "qwerqwer",
          no7: 99999,
          re1: {
            abc1: "1",
            abc2: "2",
            mm1: 11,
            mm2: "12",
          },
        },
        [
          "hello",
          "sym1",
          "boo1",
          {
            test: ["foo"],
            oops: ["blah", "woo"],
            oops2: ["a", "b"],
            oops3: ["c", "d"],
            sym2: ["x", "y"],
            re1: ["/abc.*/", "mm1"],
          },
        ]
      );

      expect(output).toEqual({
        hello: "world",
        test: { foo: "bar" },
        oops: null,
        oops2: undefined,
        oops3: false,
        boo1: true,
        sym1,
        sym2,
        re1: {
          abc1: "1",
          abc2: "2",
          mm1: 11,
        },
      });
    });
  });

  describe("removeFromObj", () => {
    it("should remove specs that are string and object", () => {
      const testObj = {
        hello: {
          foo: 1,
          bar: 2,
        },
        test1: 10,
        test2: 11,
      };

      removeFromObj(testObj, ["test1", { hello: ["/.*/"] }]);
      expect(testObj).toEqual({ hello: {}, test2: 11 });
    });
  });

  describe("renameFromObj", () => {
    it("should rename fields in object", () => {
      const testObj = {
        hello: {
          foo: 1,
          bar: 2,
        },
        test1: 10,
        test2: 11,
      };

      renameFromObj(testObj, {
        test1: "test1-b",
        test2: ["x", "y", "z"],
        "hello.foo": "blah.foo",
      });

      expect(testObj).toEqual({
        hello: { bar: 2 },
        "test1-b": 10,
        x: { y: { z: 11 } },
        blah: { foo: 1 },
      });
    });
  });

  describe("getPath, setPath, unsetPath", () => {
    it("should get nested properties with dot and array paths", () => {
      const obj = { a: { b: { c: 42 } } };
      expect(getPath(obj, "a.b.c")).toBe(42);
      expect(getPath(obj, ["a", "b", "c"])).toBe(42);
      expect(getPath(obj, "a.b.nonexistent")).toBeUndefined();
      expect(getPath(null, "a.b")).toBeUndefined();
    });

    it("should set nested properties and guard against prototype pollution", () => {
      const obj: Record<string, any> = {};
      setPath(obj, "a.b.c", 123);
      expect(obj.a.b.c).toBe(123);

      setPath(obj, "__proto__.polluted", "bad");
      expect(({} as any).polluted).toBeUndefined();

      setPath(obj, "constructor.prototype.polluted", "bad");
      expect(({} as any).polluted).toBeUndefined();
    });

    it("should unset nested properties", () => {
      const obj: Record<string, any> = { a: { b: { c: 1, d: 2 } } };
      unsetPath(obj, "a.b.c");
      expect(obj).toEqual({ a: { b: { d: 2 } } });
      unsetPath(obj, ["a", "b", "d"]);
      expect(obj).toEqual({ a: { b: {} } });
    });
  });
});
