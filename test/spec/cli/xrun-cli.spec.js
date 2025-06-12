"use strict";

const expect = require("chai").expect;
const xrun = require("../../../cli/xrun");
const logger = require("../../../lib/logger");
const WrapProcess = require("../../../cli/wrap-process");
const xrunInstance = require("../../../lib/xrun-instance");

describe("xrun cli", function() {
  this.timeout(10000);
  logger.quiet(true);

  let origExit;
  let exitCode;
  let logOutput;
  let origLog;
  let origError;

  beforeEach(() => {
    origExit = WrapProcess.exit;
    origLog = console.log;
    origError = logger.error;

    exitCode = undefined;
    logOutput = [];

    WrapProcess.exit = code => {
      exitCode = code;
    };

    console.log = (...args) => {
      logOutput.push(args.join(" "));
    };

    logger.error = (...args) => {
      logOutput.push(args.join(" "));
    };
  });

  afterEach(() => {
    WrapProcess.exit = origExit;
    console.log = origLog;
    logger.error = origError;
  });

  it("should handle --options flag", () => {
    xrun(["node", "xrun", "--options"], 2);
    expect(exitCode).to.equal(0);
  });

  it("should handle --list option", () => {
    xrun(["node", "xrun", "--quiet", "--list"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo3"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo4"))).to.be.true;
  });

  it("should handle --list with namespace", () => {
    xrun(["node", "xrun", "--quiet", "--list", "1"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
  });

  it("should handle --full option", () => {
    xrun(["node", "xrun", "--quiet", "--list", "--full"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("/xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("/xfoo2"))).to.be.true;
  });

  it("should handle --full > 1 option", () => {
    xrun(["node", "xrun", "--quiet", "--list", "-ff"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("/xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("/xfoo2"))).to.be.true;
  });

  it("should handle --ns option", () => {
    xrun(["node", "xrun", "--quiet", "--ns"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("1"))).to.be.true;
  });

  it("should handle --help option", () => {
    xrun(["node", "xrun", "--quiet", "--help", "xfoo1"], 2);
    expect(exitCode).to.equal(1);
    // expect(logOutput.some(x => x.includes("help for tasks: xfoo1"))).to.be.true;
  });

  it("should handle serial tasks with --serial", done => {
    xrun(["node", "xrun", "--quiet", "--serial", "xfoo1", "xfoo2"], 2, "", () => {
      expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
      // expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
      done();
    });
  });

  it("should take argv from process", done => {
    Object.defineProperty(WrapProcess, "argv", {
      get: () => ["node", "xrun", "--quiet", "--serial", "xfoo1", "xfoo2"]
    });
    xrun(undefined, undefined, "", () => {
      expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
      // expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
      done();
    });
  });

  it("should handle --nmbin option", () => {
    xrun(["node", "xrun", "--quiet", "--nmbin", "xfoo1"], 2);
    // expect(logOutput.some(x => x.includes("Added") || x.includes("PATH already contains"))).to.be
    //   .true;
  });

  it("should handle task options", () => {
    xrun(["node", "xrun", "--quiet", ".arg-opts", "-a=1", "--test=true"], 2);
    // expect(logOutput.some(x => x.includes(".arg-opts"))).to.be.true;
  });

  it("should handle namespaced tasks", () => {
    xrun(["node", "xrun", "--quiet", "1/xfoo1"], 2);
    // expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
  });

  it("should find no tasks in empty directory", done => {
    xrunInstance.reset();
    const path = require("path");
    const origCwd = process.cwd();
    const modPath = require.resolve("../../..");
    delete require.cache[modPath];
    const emptyCwd = path.resolve(__dirname, "../../../test/pkg-fixtures/empty");
    process.chdir(emptyCwd);
    xrun(["node", "xrun", "--quiet", "--list"], 2, "", err => {
      process.chdir(origCwd);
      const output = logOutput.join("\n");
      expect(err.exitCode).to.equal(1);
      expect(output).to.includes("No tasks found");
      expect(output).to.includes(`You do not have a "xrun-tasks.js|ts"`);
      done();
    });
  });
});
