"use strict";

const stringArray = require("../..");
const parseArray = stringArray.parse;

describe("stringArray.parse", function() {
  const emptyResult = { prefix: "", array: [], remain: "" };
  it("should handle empties", () => {
    expect(stringArray.parse("")).to.deep.equal(emptyResult);
    expect(stringArray.parse("   ")).to.deep.equal(emptyResult);
    expect(stringArray.parse("[]")).to.deep.equal(emptyResult);
    expect(stringArray.parse("  [  ]  ")).to.deep.equal(emptyResult);
  });

  it("should handle simple array", () => {
    expect(stringArray.parse(" [ hello, world, 1, 2, 3 ]")).to.deep.equal({
      prefix: "",
      array: ["hello", "world", "1", "2", "3"],
      remain: ""
    });
  });

  it("should handle array elements with quotes", () => {
    expect(stringArray.parse(` [ 'hello, "world", 1', 2, 3 ]`)).to.deep.equal({
      prefix: "",
      array: ["'hello", `"world"`, "1'", "2", "3"],
      remain: ""
    });
  });

  it("should handle trailing , and empty elements", () => {
    expect(stringArray.parse(" [ hello, world, 1, , 3 ]")).to.deep.equal({
      prefix: "",
      array: ["hello", "world", "1", "", "3"],
      remain: ""
    });
  });

  it("should handle nested array", () => {
    expect(
      stringArray.parse(" [ hello, [ world, [], , [1, ,], 3 ], [[[2]]], foo, [bar] ] ")
    ).to.deep.equal({
      prefix: "",
      array: ["hello", ["world", [], "", ["1", ""], "3"], [[["2"]]], "foo", ["bar"]],
      remain: ""
    });
  });

  it("should handle prefix", () => {
    expect(stringArray.parse(" blah [ hello, world, 1, 2, 3 ]")).to.deep.equal({
      prefix: "blah",
      array: ["hello", "world", "1", "2", "3"],
      remain: ""
    });
  });

  it("should handle noPrefix", () => {
    expect(() => stringArray.parse(" blah [ hello, world, 1, 2, 3 ]", true)).to.throw(
      "array missing ["
    );
  });

  it("should handle extra trailing text", () => {
    expect(stringArray.parse(" blah [ hello, world, 1, 2, 3 ]  foo bar [ ")).to.deep.equal({
      prefix: "blah",
      array: ["hello", "world", "1", "2", "3"],
      remain: "foo bar ["
    });
  });

  it("should handle noExtra", () => {
    expect(() =>
      stringArray.parse(" blah [ hello, world, 1, 2, 3 ]  foo bar [ ", false, true)
    ).to.throw("extra data at end of array");
  });

  it("should handle nesting complex arrays", () => {
    const r = parseArray("[[.,a, b, c, [d, [1, 2, [3, 4]], e], f, [g]]]");
    expect(r.array).to.deep.equal([
      [".", "a", "b", "c", ["d", ["1", "2", ["3", "4"]], "e"], "f", ["g"]]
    ]);
  });

  it("should handle simple nesting array", () => {
    expect(parseArray("[[[a]]]")).to.deep.equal({ prefix: "", array: [[["a"]]], remain: "" });
  });

  it("should handle simple single element array", () => {
    expect(parseArray("[123]")).to.deep.equal({ prefix: "", array: ["123"], remain: "" });
  });

  it("should handle trailing ,", () => {
    expect(parseArray("[123,]")).to.deep.equal({ prefix: "", array: ["123"], remain: "" });
  });

  it("should dangling ,", () => {
    expect(parseArray("[ ,]")).to.deep.equal({ prefix: "", array: [""], remain: "" });
  });

  it("should handle empty nesting arrays", () => {
    expect(parseArray("[123,[a],b,c,[],[],[555]]")).to.deep.equal({
      prefix: "",
      array: ["123", ["a"], "b", "c", [], [], ["555"]],
      remain: ""
    });
  });

  it("should handle extra spaces", () => {
    expect(
      parseArray("[ [    [ a  , ] , b ,   [ , [  c]  ,d , [ e, ] , h ,f  ,g ]]]")
    ).to.deep.equal({
      prefix: "",
      array: [[["a"], "b", ["", ["c"], "d", ["e"], "h", "f", "g"]]],
      remain: ""
    });
  });
});
