"use strict";
const xsh = require("../..");
const chai = require("chai");
const expect = chai.expect;
const Path = require("path");

describe("path-cwd-nmdir", function() {
  it("should leave path w/o cwd as is", function() {
    expect(xsh.pathCwdNm.remove("/test/foo/blah")).to.equal("/test/foo/blah");
  });

  it("remove cwd/node_modules from path", function() {
    expect(xsh.pathCwdNm.remove(Path.resolve("node_modules", "foo", "bar"))).to.equal(
      Path.normalize("/foo/bar")
    );
  });

  it("remove all cwd/node_modules from path with g flag", function() {
    const x = Path.resolve("node_modules", "foo", "bar");
    const e = Path.normalize("/foo/bar");

    expect(xsh.pathCwdNm.remove(`${x} ${x}`, "g")).to.equal(`${e} ${e}`);
  });

  it("replace cwd/node_modules from path", function() {
    expect(xsh.pathCwdNm.replace(Path.resolve("node_modules", "foo", "bar"))).to.equal(
      Path.normalize("CWD/~/foo/bar")
    );
    expect(
      xsh.pathCwdNm.replace(Path.resolve("node_modules", "foo", "bar"), Path.join("$", "~"))
    ).to.equal(Path.normalize("$/~/foo/bar"));
  });

  it("replace all cwd/node_modules from path with g flag", function() {
    const x = Path.resolve("node_modules", "foo", "bar");
    const e1 = Path.normalize("CWD/~/foo/bar");
    const e2 = Path.normalize("$/~/foo/bar");

    expect(xsh.pathCwdNm.replace(`${x} ${x}`, false, "g")).to.equal(`${e1} ${e1}`);
    expect(xsh.pathCwdNm.replace(`${x} ${x}`, Path.normalize("$/~"), "g")).to.equal(`${e2} ${e2}`);
  });

  it("replace all CWD and /node_modules/ from path with g flag", function() {
    const x = Path.resolve("test", "node_modules", "foo", "node_modules", "bar");
    const e1 = Path.normalize("CWD/test/~/foo/~/bar");
    const e2 = Path.normalize("CWD/test/~/foo/~/bar");

    expect(xsh.pathCwdNm.replace(`${x} ${x}`, false, "g")).to.equal(`${e1} ${e1}`);
    expect(xsh.pathCwdNm.replace(`${x} ${x}`, Path.normalize("$/~"), "g")).to.equal(`${e2} ${e2}`);
  });
});
