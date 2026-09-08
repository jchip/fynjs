"use strict";

const xstdout = require("../..");
const expect = require("chai").expect;

describe("xstdout", function() {
  it("should silently capture stdout & stderr", () => {
    const intercept = xstdout.intercept(true);
    process.stdout.write("hello");
    process.stderr.write("blah");
    intercept.restore();
    expect(intercept.stdout[0]).to.equal("hello");
    expect(intercept.stderr[0]).to.equal("blah");
  });

  it("should silently capture stdout & stderr to same interceptor", () => {
    const stdout = [];
    const restore = xstdout.interceptStdouterr(msg => {
      stdout.push(msg);
      return false;
    });
    process.stdout.write("hello");
    process.stderr.write("blah");
    restore();
    expect(stdout[0]).to.equal("hello");
    expect(stdout[1]).to.equal("blah");
  });

  it("should allow capture only stdout w/o stderr", () => {
    const stdout = [];
    const restore = xstdout.interceptStdout(msg => {
      stdout.push(msg);
      return false;
    });
    process.stdout.write("hello");
    process.stderr.write("blah");
    restore();
    expect(stdout[0]).to.equal("hello");
    expect(stdout[1]).to.equal(undefined);
  });

  it("should catch error from interceptor", () => {
    const restore = xstdout.interceptStdout(msg => {
      throw new Error("oh no");
    });
    process.stdout.write("hello");
    restore();
  });

  it("should unsilently capture stdout & stderr", () => {
    const intercept = xstdout.intercept(false);
    process.stdout.write("hello\n");
    process.stderr.write("blah\n");
    intercept.restore();
    expect(intercept.stdout[0]).to.equal("hello\n");
    expect(intercept.stderr[0]).to.equal("blah\n");
  });

  it("should unsilently capture stderr", () => {
    const intercept = xstdout.intercept(true, false);
    process.stdout.write("hello\n");
    process.stderr.write("blah\n");
    intercept.restore();
    expect(intercept.stdout[0]).to.equal("hello\n");
    expect(intercept.stderr[0]).to.equal("blah\n");
  });

  it("should replace string to console", () => {
    const stdout = [];
    const stderr = [];
    const restore = xstdout.interceptStdouterr(
      msg => {
        stdout.push(msg);
        return "test";
      },
      msg => {
        stderr.push(msg);
        return "test-err";
      }
    );
    process.stdout.write("foo");
    console.log("hello");
    restore();
    expect(stdout[0]).to.equal("foo");
    expect(stdout[1]).to.equal("hello\n");
  });
});
