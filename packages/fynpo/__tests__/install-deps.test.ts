import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Path from "path";

const execute = vi.fn();
const visualExecOptions = vi.fn();

vi.mock("visual-exec", () => ({
  // a class, not vi.fn(arrow) - install-deps constructs it with `new`
  default: class FakeVisualExec {
    constructor(options: unknown) {
      visualExecOptions(options);
    }
    logFinalOutput: any;
    execute = execute;
  },
}));

vi.mock("fyn", () => ({
  getAuditFilePath: vi.fn(async (cwd: string) => Path.join(cwd, "node_modules", ".f", ".fyn-audit.json")),
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
import { getAuditFilePath } from "fyn";
import { execFileSync } from "node:child_process";

describe("InstallDeps.runVisualInstall", () => {
  const topDir = Path.join(Path.sep, "repo");
  const pkgInfo: any = { name: "pkg-a", path: Path.join("packages", "pkg-a") };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("writes the report under the package installation metadata directory", async () => {
    const install = new InstallDeps(topDir, []);
    await install.runVisualInstall(pkgInfo, "installing");

    expect(getAuditFilePath).toHaveBeenCalledWith(Path.join(topDir, pkgInfo.path), { rcfile: true });
    expect(visualExecOptions).toHaveBeenCalledWith(expect.objectContaining({
      cwd: Path.join(topDir, pkgInfo.path),
      command: expect.stringContaining(`--audit-file '${Path.join(topDir, pkgInfo.path, "node_modules", ".f", ".fyn-audit.json")}'`),
    }));
  });

  it("uses the same configured report path for the command and summary reader", async () => {
    const auditPath = Path.join(topDir, pkgInfo.path, "custom modules", ".f", ".fyn-audit.json");
    vi.mocked(getAuditFilePath).mockResolvedValueOnce(auditPath).mockResolvedValueOnce(auditPath);
    const install = new InstallDeps(topDir, ["--no-rcfile"]);

    expect(await install.getAuditFilePath(pkgInfo)).toBe(auditPath);
    expect(await install.getInstallCommand(pkgInfo)).toContain(`--audit-file '${auditPath}'`);
    expect(getAuditFilePath).toHaveBeenLastCalledWith(Path.join(topDir, pkgInfo.path), { rcfile: false });
  });

  it.skipIf(process.platform === "win32")("passes a report path containing shell metacharacters literally", async () => {
    const auditPath = Path.join(topDir, "it's $HOME `pwd` $(pwd)", ".f", ".fyn-audit.json");
    vi.mocked(getAuditFilePath).mockResolvedValueOnce(auditPath);
    const command = await new InstallDeps(topDir, []).getInstallCommand(pkgInfo);
    const auditArg = command.slice(command.indexOf("--audit-file ") + "--audit-file ".length);

    expect(execFileSync("sh", ["-c", `printf '%s' ${auditArg}`], { encoding: "utf8" })).toBe(auditPath);
  });

  it("quotes the audit path for the Windows command shell", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const auditPath = "C:\\my repo\\node_modules\\.f\\.fyn-audit.json";
    vi.mocked(getAuditFilePath).mockResolvedValueOnce(auditPath);

    expect(await new InstallDeps(topDir, []).getInstallCommand(pkgInfo))
      .toContain(`--audit-file "${auditPath}"`);
  });
});
