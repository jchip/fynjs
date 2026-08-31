import { describe, it, expect, vi, beforeEach } from "vitest";
import Path from "path";

const execute = vi.fn();

vi.mock("visual-exec", () => ({
  // a class, not vi.fn(arrow) - install-deps constructs it with `new`
  default: class FakeVisualExec {
    logFinalOutput: any;
    execute = execute;
  },
}));

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// the real one starts a meta memoizer server
vi.mock("../src/utils", () => ({
  getFynExecutable: () => "/fyn/bin/fyn.js",
  startFynMetaMemoizer: async () => "",
}));

import { InstallDeps } from "../src/install-deps";
import { logger } from "../src/logger";

describe("InstallDeps.runVisualInstall", () => {
  const topDir = Path.join(Path.sep, "repo");
  const pkgInfo: any = { name: "pkg-a", path: Path.join("packages", "pkg-a") };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the package and its debug log when the install fails", async () => {
    execute.mockRejectedValueOnce(new Error("install blew up"));

    const install = new InstallDeps(topDir, []);
    await expect(install.runVisualInstall(pkgInfo, "installing")).rejects.toThrow("install blew up");

    const logged = (logger.error as any).mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(logged).toContain("Failed to install dependencies for pkg-a");
    // fyn runs with --sl, whose default file is fyn-debug.log in the package dir
    expect(logged).toContain(Path.join(topDir, "packages", "pkg-a", "fyn-debug.log"));
  });

  it("attaches the install command to the error for reporting", async () => {
    const err: any = new Error("install blew up");
    execute.mockRejectedValueOnce(err);

    const install = new InstallDeps(topDir, []);
    await expect(install.runVisualInstall(pkgInfo, "installing")).rejects.toBe(err);
    expect(err.command).toContain("/fyn/bin/fyn.js");
    expect(err.command).toContain("--sl");
  });

  it("logs nothing when the install succeeds", async () => {
    execute.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const install = new InstallDeps(topDir, []);
    await install.runVisualInstall(pkgInfo, "installing");

    expect(logger.error).not.toHaveBeenCalled();
  });
});
