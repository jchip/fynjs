"use strict";

const stringArray = require("../..");

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

  it("should handle trailing , and empty elements", () => {
    expect(stringArray.parse(" [ hello, world, 1, , 3 ]")).to.deep.equal({
      prefix: "",
      array: ["hello", "world", "1", "", "3"],
      remain: ""
    });
  });

  it("should handle nested array", () => {
    expect(stringArray.parse(" [ hello, [ world, [], , [1, ,], 3 ], foo, [bar] ] ")).to.deep.equal({
      prefix: "",
      array: ["hello", ["world", [], "", ["1", ""], "3"], "foo", ["bar"]],
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
});
