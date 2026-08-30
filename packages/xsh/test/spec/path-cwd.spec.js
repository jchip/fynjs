"use strict";
const xsh = require("../..");
const chai = require("chai");
const expect = chai.expect;
const Path = require("path");

describe("path-cwd", function() {
  it("should leave path w/o cwd as is", function() {
    expect(xsh.pathCwd.remove("/test/foo/blah")).to.equal("/test/foo/blah");
  });

  it("remove cwd from path", function() {
    expect(xsh.pathCwd.remove(Path.resolve("foo", "bar"))).to.equal(Path.normalize("/foo/bar"));
  });

  it("remove all cwd from path with g flag", function() {
    const x = Path.resolve("foo", "bar");
    const e = Path.normalize("/foo/bar");

    expect(xsh.pathCwd.remove(`${x} ${x}`, "g")).to.equal(`${e} ${e}`);
  });

  it("replace cwd from path", function() {
    expect(xsh.pathCwd.replace(Path.resolve("foo", "bar"))).to.equal(Path.normalize("CWD/foo/bar"));
    expect(xsh.pathCwd.replace(Path.resolve("foo", "bar"), "$")).to.equal(
      Path.normalize("$/foo/bar")
    );
  });

  it("replace all cwd from path with g flag", function() {
    const x = Path.resolve("foo", "bar");
    const e1 = Path.normalize("CWD/foo/bar");
    const e2 = Path.normalize("$/foo/bar");

    expect(xsh.pathCwd.replace(`${x} ${x}`, false, "g")).to.equal(`${e1} ${e1}`);
    expect(xsh.pathCwd.replace(`${x} ${x}`, "$", "g")).to.equal(`${e2} ${e2}`);
  });

  it("remove should strip leading /", function() {
    expect(xsh.pathCwd.remove(Path.resolve("foo"), "", true)).to.equal("foo");
  });
});
