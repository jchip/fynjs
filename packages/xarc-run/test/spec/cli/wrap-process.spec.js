import { expect } from "vitest";
import WrapProcess from "../../../cli/wrap-process.js";

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
    expect(WrapProcess._process.exitCode).toBe(0);
    WrapProcess.exit(1);
    expect(WrapProcess._process.exitCode).toBe(1);
  });

  it("should wrap process.cwd", () => {
    const dir = WrapProcess.cwd();
    expect(dir).toBe("/test/dir");
  });

  it("should wrap process.chdir", () => {
    WrapProcess.chdir("/new/dir");
    expect(WrapProcess._process.chdirDir).toBe("/new/dir");
  });

  it("should wrap process.argv", () => {
    expect(WrapProcess.argv).toStrictEqual(["node", "xrun", "--test"]);
    const newArgv = ["node", "xrun", "--quiet"];
    WrapProcess.argv = newArgv;
    expect(WrapProcess._process.argv).toStrictEqual(newArgv);
  });

  it("should wrap process.env", () => {
    expect(WrapProcess.env).toStrictEqual({ TEST: "value" });
    const newEnv = { NEW: "test" };
    WrapProcess.env = newEnv;
    expect(WrapProcess._process.env).toStrictEqual(newEnv);
  });
});
