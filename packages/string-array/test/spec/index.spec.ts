import { describe, it, expect } from "vitest";
import { parse } from "../../src/index.ts";

describe("string-array parse", () => {
  const emptyResult = { prefix: "", array: [], remain: "" };

  it("should handle empties", () => {
    expect(parse("")).toEqual(emptyResult);
    expect(parse("   ")).toEqual(emptyResult);
    expect(parse("[]")).toEqual(emptyResult);
    expect(parse("  [  ]  ")).toEqual(emptyResult);
  });

  it("should handle simple array", () => {
    expect(parse(" [ hello, world, 1, 2, 3 ]")).toEqual({
      prefix: "",
      array: ["hello", "world", "1", "2", "3"],
      remain: ""
    });
  });

  it("should handle array elements with quotes", () => {
    expect(parse(` [ 'hello, "world", 1', 2, 3 ]`)).toEqual({
      prefix: "",
      array: ["'hello", `"world"`, "1'", "2", "3"],
      remain: ""
    });
  });

  it("should handle trailing , and empty elements", () => {
    expect(parse(" [ hello, world, 1, , 3 ]")).toEqual({
      prefix: "",
      array: ["hello", "world", "1", "", "3"],
      remain: ""
    });
  });

  it("should handle nested array", () => {
    expect(
      parse(" [ hello, [ world, [], , [1, ,], 3 ], [[[2]]], foo, [bar] ] ")
    ).toEqual({
      prefix: "",
      array: ["hello", ["world", [], "", ["1", ""], "3"], [[["2"]]], "foo", ["bar"]],
      remain: ""
    });
  });

  it("should handle prefix", () => {
    expect(parse(" blah [ hello, world, 1, 2, 3 ]")).toEqual({
      prefix: "blah",
      array: ["hello", "world", "1", "2", "3"],
      remain: ""
    });
  });

  it("should handle noPrefix", () => {
    expect(() => parse(" blah [ hello, world, 1, 2, 3 ]", true)).toThrow(
      "array missing ["
    );
  });

  it("should handle extra trailing text", () => {
    expect(parse(" blah [ hello, world, 1, 2, 3 ]  foo bar [ ")).toEqual({
      prefix: "blah",
      array: ["hello", "world", "1", "2", "3"],
      remain: "foo bar ["
    });
  });

  it("should handle noExtra", () => {
    expect(() =>
      parse(" blah [ hello, world, 1, 2, 3 ]  foo bar [ ", false, true)
    ).toThrow("extra data at end of array");
  });

  it("should handle nesting complex arrays", () => {
    const r = parse("[[.,a, b, c, [d, [1, 2, [3, 4]], e], f, [g]]]");
    expect(r.array).toEqual([
      [".", "a", "b", "c", ["d", ["1", "2", ["3", "4"]], "e"], "f", ["g"]]
    ]);
  });

  it("should handle simple nesting array", () => {
    expect(parse("[[[a]]]")).toEqual({ prefix: "", array: [[["a"]]], remain: "" });
  });

  it("should handle simple single element array", () => {
    expect(parse("[123]")).toEqual({ prefix: "", array: ["123"], remain: "" });
  });

  it("should handle trailing ,", () => {
    expect(parse("[123,]")).toEqual({ prefix: "", array: ["123"], remain: "" });
  });

  it("should dangling ,", () => {
    expect(parse("[ ,]")).toEqual({ prefix: "", array: [""], remain: "" });
  });

  it("should handle empty nesting arrays", () => {
    expect(parse("[123,[a],b,c,[],[],[555]]")).toEqual({
      prefix: "",
      array: ["123", ["a"], "b", "c", [], [], ["555"]],
      remain: ""
    });
  });

  it("should handle extra spaces", () => {
    expect(
      parse("[ [    [ a  , ] , b ,   [ , [  c]  ,d , [ e, ] , h ,f  ,g ]]]")
    ).toEqual({
      prefix: "",
      array: [[["a"], "b", ["", ["c"], "d", ["e"], "h", "f", "g"]]],
      remain: ""
    });
  });
});
