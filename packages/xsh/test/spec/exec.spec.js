"use strict";
const xsh = require("../..");
const chai = require("chai");
const expect = chai.expect;
const Promise = require("bluebird");

describe("exec", function() {
  const expectUnknownCmdSig = process.platform === "win32" ? "is not recognized" : "not found";

  it("should failed for unknown command", function(done) {
    xsh.exec("unknown_command", function(err, output) {
      expect(err).to.be.ok;
      expect(err.output.stderr).equals(output.stderr);
      expect(output.stderr).includes(expectUnknownCmdSig);
      done();
    });
  });

  it("should failed for unknown command @Promise", function() {
    return xsh
      .exec("unknown_command")
      .promise.then(() => {
        throw new Error("expected failure");
      })
      .catch(err => {
        expect(err.output.stderr).includes(expectUnknownCmdSig);
      });
  });

  it("should execute command", function(done) {
    xsh.exec("echo hello, world", function(err, output) {
      expect(err).to.be.not.ok;
      expect(output.stdout.trim()).to.equal("hello, world");
      done();
    });
  });

  it("should execute command with output silent", function(done) {
    xsh.exec(false, "echo hello, world", function(err, output) {
      expect(err).to.be.not.ok;
      expect(output.stdout.trim()).to.equal("hello, world");
      done();
    });
  });

  it("should execute command @Promise", function() {
    return xsh.exec("echo hello, world").promise.then(output => {
      expect(output.stdout.trim()).to.equal("hello, world");
    });
  });

  it("should failed for empty arguments", function() {
    expect(() => xsh.exec()).to.throw(Error);
  });

  it("should failed for no command", function() {
    expect(() => xsh.exec(() => undefined)).to.throw(Error);
  });

  it("should exec command split in array", function(done) {
    xsh.exec(["echo", "hello,", "world"], function(err, output) {
      expect(err).to.be.not.ok;
      expect(output.stdout.trim()).to.equal("hello, world");
      done();
    });
  });

  it("should exec command split in multiple arrays", function(done) {
    xsh.exec(["echo", "hello, world"], ["my", "name", "is", "test"], function(err, output) {
      expect(err).to.be.not.ok;
      expect(output.stdout.trim()).to.equal("hello, world my name is test");
      done();
    });
  });

  it("should exec command split in arrays and strings", function(done) {
    xsh.exec(
      ["echo", "hello, world"],
      ["my", "name"],
      "is",
      "test",
      ["foo", "bar"],
      "more",
      "text",
      function(err, output) {
        expect(err).to.be.not.ok;
        expect(output.stdout.trim()).to.equal("hello, world my name is test foo bar more text");
        done();
      }
    );
  });

  it("should exec with user env", function(done) {
    let cmd;
    let expected;
    if (process.platform === "win32") {
      cmd = "echo FOO=%FOO% hello=%hello%";
      expected = "FOO=%FOO% hello=test";
    } else {
      cmd = "echo FOO=$FOO hello=$hello";
      expected = "FOO= hello=test";
    }
    process.env.FOO = "bar";
    xsh.exec(
      {
        env: {
          hello: "test",
          PATH: process.env.PATH
        }
      },
      cmd,
      function(err, output) {
        expect(err).to.be.not.ok;
        expect(output.stdout.trim()).includes(expected);
        delete process.env.FOO;
        done();
      }
    );
  });

  it("should fail if a command fragment is not array or string", function() {
    expect(() => xsh.exec("test", ["1", "2"], 1)).to.throw(
      "command fragment must be an array or string"
    );
  });

  it("should fail if options is not last or 2nd to last argument", () => {
    expect(() => xsh.exec("test", ["a"], true, "b", () => true)).to.throw(
      "options must be the first, last, or second to last argument"
    );
  });

  it("should emit stdout data before complete @callback", done => {
    let data = [];
    const onData = x => data.push(x.trim());
    const r = xsh.exec(true, "echo 1 && sleep 1 && echo 2", (err, output) => {
      expect(data).to.deep.equal(["1", "2"]);
      done();
    });
    r.stdout.on("data", onData);
  });

  it("should emit stdout data before complete @Promise", () => {
    let data = [];
    const onData = x => data.push(x.trim());
    const r = xsh.exec(true, "echo 1 && sleep 1 && echo 2");

    r.stdout.on("data", onData);

    return r.then(output => {
      expect(data).to.deep.equal(["1", "2"]);
    });
  });

  it("should provide catch for error", () => {
    let error;
    return xsh
      .exec(true, "blahblahblah")
      .catch(err => {
        error = err;
      })
      .then(() => {
        expect(error).to.exist;
        expect(error.output.stderr).includes(
          process.platform === "win32" ? "not recognized" : "not found"
        );
      });
  });

  it("should have its returned value be treated as a promise by bluebird", () => {
    return Promise.resolve("hello").then(() => xsh.exec("echo blah")).then(r => {
      expect(r.stdout.trim()).to.equal("blah");
      expect(r.stderr).to.equal("");
    });
  });

  it("should have its returned value be treated as a promise by global.Promise", () => {
    return global.Promise.resolve("hello").then(() => xsh.exec("echo blah")).then(r => {
      expect(r.stdout.trim()).to.equal("blah");
      expect(r.stderr).to.equal("");
    });
  });
});
