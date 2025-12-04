"use strict";

const expect = require("chai").expect;
const WrapProcess = require("../../../cli/wrap-process");

describe("wrap-process", function() {
  let originalProcess;

  beforeEach(() => {
    originalProcess = WrapProcess._process;
    WrapProcess._process = {
      exit: code => {
        WrapProcess._process.exitCode = code;
      },
      cwd: () => "/test/dir",
      chdir: dir => {
        WrapProcess._process.chdirDir = dir;
      },
      argv: ["node", "xrun", "--test"],
      env: { TEST: "value" }
    };
  });

  afterEach(() => {
    WrapProcess._process = originalProcess;
  });

  it("should wrap process.exit", () => {
    WrapProcess.exit(0);
    expect(WrapProcess._process.exitCode).to.equal(0);
    WrapProcess.exit(1);
    expect(WrapProcess._process.exitCode).to.equal(1);
  });

  it("should wrap process.cwd", () => {
    const dir = WrapProcess.cwd();
    expect(dir).to.equal("/test/dir");
  });

  it("should wrap process.chdir", () => {
    WrapProcess.chdir("/new/dir");
    expect(WrapProcess._process.chdirDir).to.equal("/new/dir");
  });

  it("should wrap process.argv", () => {
    expect(WrapProcess.argv).to.deep.equal(["node", "xrun", "--test"]);
    const newArgv = ["node", "xrun", "--quiet"];
    WrapProcess.argv = newArgv;
    expect(WrapProcess._process.argv).to.deep.equal(newArgv);
  });

  it("should wrap process.env", () => {
    expect(WrapProcess.env).to.deep.equal({ TEST: "value" });
    const newEnv = { NEW: "test" };
    WrapProcess.env = newEnv;
    expect(WrapProcess._process.env).to.deep.equal(newEnv);
  });
});
