"use strict";
const xsh = require("../..");
const chai = require("chai");
const expect = chai.expect;

describe("mkcmd", function() {
  it("join a single array", function() {
    expect(xsh.mkCmd(["a", "b", "c"])).to.equal("a b c");
  });

  it("join arguments", function() {
    expect(xsh.mkCmd("a", "b", "c")).to.equal("a b c");
  });
});
