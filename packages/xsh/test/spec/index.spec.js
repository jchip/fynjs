"use strict";
const xsh = require("../..");
const chai = require("chai");
const expect = chai.expect;

describe("xsh", function() {
  it("should take a custom Promise", function() {
    xsh.Promise = "test";
    expect(xsh.Promise).to.equal("test");
    xsh.Promise = null;
    expect(xsh.Promise).to.equal(Promise);
  });
});
