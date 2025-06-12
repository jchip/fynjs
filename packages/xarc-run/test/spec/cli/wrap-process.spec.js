"use strict";

const expect = require("chai").expect;
const Path = require("path");
const WrapProcess = require("../../../cli/wrap-process");

describe("wrap-process", function() {
  let originalExit;
  let originalCwd;
  let originalChdir;
  let exitCode;
  let cwdCalled;
  let chdirDir;

  beforeEach(() => {
    originalExit = process.exit;
    originalCwd = process.cwd;
    originalChdir = process.chdir;
    exitCode = undefined;
    cwdCalled = false;
    chdirDir = undefined;

    process.exit = code => {
      exitCode = code;
    };
    process.cwd = () => {
      cwdCalled = true;
      return "/test/dir";
    };
    process.chdir = dir => {
      chdirDir = dir;
    };
  });

  afterEach(() => {
    process.exit = originalExit;
    process.cwd = originalCwd;
    process.chdir = originalChdir;
  });

  it("should wrap process.exit", () => {
    WrapProcess.exit(0);
    expect(exitCode).to.equal(0);
    WrapProcess.exit(1);
    expect(exitCode).to.equal(1);
  });

  it("should wrap process.cwd", () => {
    const dir = WrapProcess.cwd();
    expect(cwdCalled).to.equal(true);
    expect(dir).to.equal("/test/dir");
  });

  it("should wrap process.chdir", () => {
    WrapProcess.chdir("/new/dir");
    expect(chdirDir).to.equal("/new/dir");
  });
});
