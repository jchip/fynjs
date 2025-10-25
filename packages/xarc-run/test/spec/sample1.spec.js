"use strict";

const XRun = require("../../lib/xrun");
const sample1 = require("../fixtures/sample1");
const expect = require("chai").expect;
const { asyncVerify, expectError } = require("run-verify");
const xstdout = require("xstdout");

describe("sample1", function() {
  it("should run sample1:foo2 tasks", () => {
    const intercept = xstdout.intercept(true);
    const expectOutput = [
        "a direct shell command xfoo2",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "aaaaa",
        "anonymous",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "bbbb",
        "cccc",
        "cccc",
        "cccc",
        "concurrent anon",
        "function task for foo3",
        "hello, this is xfoo1",
        "hello, this is xfoo4",
        "hello, this is xfoo4",
        "hello, this is xfoo4",
        "test anon shell",
        "this is foo3Dep"
      ];
    const xrun = new XRun(sample1);
    return asyncVerify(
      next => xrun.run("foo2", next),
      () => {
        intercept.restore();
        const output = intercept.stdout.sort().map(x => x.trim());
        expect(output).to.deep.equal(expectOutput.sort());
      }
    );
  });

  it("should run sample1:foo2b tasks with failure", () => {
    let intercept = xstdout.intercept(true);
    const expectOutput = [
      "a direct shell command xfoo2",
      "aaaaa",
      "aaaaa",
      "aaaaa",
      "aaaaa",
      "aaaaa",
      "anonymous",
      "bbbb",
      "bbbb",
      "bbbb",
      "bbbb",
      "bbbb",
      "cccc",
      "concurrent anon",
      "function task for foo3",
      "hello, this is xfoo1",
      "test anon shell",
      "this is foo3Dep"
    ];
    const xrun = new XRun(sample1);
    return asyncVerify(
      expectError(next => xrun.run("foo2ba", next)),
      err => {
        intercept.restore();
        expect(err).to.exist;
        const output = intercept.stdout.sort().map(x => x.trim());
        expect(output).to.deep.equal(expectOutput.sort());
        intercept = xstdout.intercept(true);
      },
      next => xrun.waitAllPending(next),
      () => {
        intercept.restore();
      }
    );
  });

  it("should run sample1:foo2b tasks with stopOnError false", () => {
    let intercept = xstdout.intercept(true);
    const xrun = new XRun(sample1);
    xrun.stopOnError = false;
    return asyncVerify(
      expectError(next => xrun.run("foo2ba", next)),
      err => {
        intercept.restore();
        expect(err).to.exist;
        expect(err.more).to.exist;
        expect(err.more.length).to.equal(1);
        expect(err.message).to.equal("xerr");
        expect(err.more[0].message).to.equal("xerr");
        intercept = xstdout.intercept(true);
      },
      next => xrun.waitAllPending(next),
      () => {
        intercept.restore();
      }
    );
  });
});
