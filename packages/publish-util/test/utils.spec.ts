import { describe, it, expect } from "vitest";
import { extractFromObj, removeFromObj, renameFromObj } from "../src/utils.js";

describe("utils", () => {
  describe("extractFromObj", () => {
    it("copies primitive values selected with nested specs", () => {
      const obj = { number: 2, string: "value", boolean: true, bigint: BigInt(2) };
      expect(extractFromObj(obj, [{ number: [], string: [], boolean: [], bigint: [] }]))
        .toEqual(obj);
    });

    it("treats an incomplete regex spec as a literal field name", () => {
      expect(extractFromObj({ "/literal": 1, other: 2 }, ["/literal"]))
        .toEqual({ "/literal": 1 });
    });

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
    it("keeps fields not matched by a regex and removes literal slash-prefixed fields", () => {
      const obj = { removeMe: 1, keepMe: 2, "/literal": 3 };
      removeFromObj(obj, ["/^remove/", "/literal"]);
      expect(obj).toEqual({ keepMe: 2 });
    });

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
    it("ignores missing sources and empty destinations", () => {
      const obj = { keep: 1 };
      renameFromObj(obj, { missing: "new", keep: "" });
      expect(obj).toEqual({ keep: 1 });
    });

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

});
