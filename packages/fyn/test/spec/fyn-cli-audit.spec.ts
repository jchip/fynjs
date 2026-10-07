import { afterEach, describe, it, expect, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import { verify } from "run-verify";
import FynCli from "../../cli/fyn-cli";
import showAudit from "../../cli/show-audit";
import fyntil from "../../lib/util/fyntil";

vi.mock("../../cli/show-audit", () => ({ default: vi.fn() }));
vi.mock("check-pkg-new-version-engine", () => ({ checkPkgNewVersionEngine: vi.fn() }));

const makeCli = (fyn: object) => {
  const cli: any = Object.create(FynCli.prototype);
  cli._fyn = fyn;
  cli._opts = {};
  return cli;
};

describe("FynCli audit exit code", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(showAudit).mockReset();
  });

  it("fyn audit exits with the audit's non-zero code", () => {
    let exit;
    return verify({ timeout: 2000 })
      .step(() => vi.mocked(showAudit).mockResolvedValue(1))
      .step(() => (exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never)))
      .step(() => makeCli({ _options: {} }).audit({ opts: {} }))
      .step(() => expect(exit).toHaveBeenCalledWith(1));
  });

  it("fyn audit does not exit when the audit is clean", () => {
    let exit;
    return verify({ timeout: 2000 })
      .step(() => vi.mocked(showAudit).mockResolvedValue(0))
      .step(() => (exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never)))
      .step(() => makeCli({ _options: {} }).audit({ opts: {} }))
      .step(() => expect(exit).not.toHaveBeenCalled());
  });

  it("post-install audit with vulnerabilities still exits install with 0", () => {
    const tmpDir = Path.resolve(".temp", "fyn-cli-audit-spec");
    let exit;
    // a "No Change" install: up-to-date install config, so it goes straight to the audit
    const fyn = {
      cwd: tmpDir,
      fynDir: Path.join(tmpDir, "cache"),
      fynlocal: false,
      _options: {},
      _pkg: {},
      _installConfig: { fynlocal: false, time: Date.now() + 60_000 },
      _initializePkg: vi.fn().mockResolvedValue(undefined),
      checkLocalPkgFromInstallConfigNeedInstall: vi.fn().mockResolvedValue(false),
      checkFynLockExist: vi.fn().mockReturnValue(true),
      saveInstallConfig: vi.fn().mockResolvedValue(undefined)
    };
    return verify({
      timeout: 5000,
      cleanup: () => Fs.rmSync(tmpDir, { recursive: true, force: true })
    })
      .step(() => Fs.mkdirSync(tmpDir, { recursive: true }))
      .step(() => vi.mocked(showAudit).mockResolvedValue(1))
      .step(() => (exit = vi.spyOn(fyntil, "exit").mockImplementation(() => undefined as never)))
      .step(() => makeCli(fyn).install({ opts: { audit: true } }))
      .keep.step(() => expect(showAudit).toHaveBeenCalledOnce())
      .step(() => expect(exit.mock.calls).toStrictEqual([[0]]));
  });
});
