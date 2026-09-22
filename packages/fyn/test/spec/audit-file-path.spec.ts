import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { getAuditFilePath, run } from "../../cli/main";
import FynCli from "../../cli/fyn-cli";
import fynTil from "../../lib/util/fyntil";

describe("generated audit report path", () => {
  let dir: string;
  let cwd: string;
  let home: string;

  beforeEach(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-audit-path-"));
    cwd = Path.join(dir, "packages", "pkg");
    home = Path.join(dir, "home");
    Fs.mkdirSync(cwd, { recursive: true });
    Fs.mkdirSync(home);
    Fs.writeFileSync(Path.join(dir, "fynpo.json"), JSON.stringify({ packages: [] }));
    vi.spyOn(Os, "homedir").mockReturnValue(home);
    vi.stubEnv("NPM_CONFIG_GLOBALCONFIG", "");
    vi.stubEnv("NPM_CONFIG_USERCONFIG", "");
    vi.stubEnv("FYN_FYNPO_DIR", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fynTil.resetFynpo();
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("places the default report inside node_modules/.f", async () => {
    expect(await getAuditFilePath(cwd)).toBe(Path.join(cwd, "node_modules/.f/.fyn-audit.json"));
    expect(Fs.existsSync(Path.join(cwd, "node_modules"))).toBe(false);
  });

  it("matches the install directory when the monorepo config specifies a target", async () => {
    Fs.writeFileSync(Path.join(dir, "fynpo.json"), JSON.stringify({
      packages: [], fyn: { options: { targetDir: "custom_modules" } }
    }));
    let actual: string;
    vi.spyOn(FynCli.prototype, "install").mockImplementation(function () {
      actual = this.fyn.getFvDir(".fyn-audit.json");
      return Promise.resolve();
    });
    await run(["--cwd", cwd, "install"]);
    expect(await getAuditFilePath(cwd)).toBe(actual!);
  });

  it("uses the package rc target ahead of the monorepo and user settings", async () => {
    Fs.writeFileSync(Path.join(dir, "fynpo.json"), JSON.stringify({
      packages: [], fyn: { options: { targetDir: "repo_modules" } }
    }));
    Fs.writeFileSync(Path.join(home, ".fynrc"), "targetDir=user_modules\n");
    Fs.writeFileSync(Path.join(cwd, ".fynrc"), "targetDir=package_modules\n");
    expect(await getAuditFilePath(cwd)).toBe(Path.join(cwd, "package_modules/.f/.fyn-audit.json"));
  });

  it("uses a target directory from the user rc", async () => {
    Fs.writeFileSync(Path.join(home, ".fynrc"), "targetDir=user_modules\n");
    expect(await getAuditFilePath(cwd)).toBe(Path.join(cwd, "user_modules/.f/.fyn-audit.json"));
  });

  it("honors conditional rc sections and environment substitution", async () => {
    vi.stubEnv("FYN_AUDIT_PATH_TEST", "enabled");
    vi.stubEnv("FYN_AUDIT_TEST_DIR", "conditional_modules");
    Fs.writeFileSync(Path.join(cwd, ".fynrc"),
      "[FYN_AUDIT_PATH_TEST:enabled]\ntargetDir=${FYN_AUDIT_TEST_DIR}\n");
    expect(await getAuditFilePath(cwd)).toBe(Path.join(cwd, "conditional_modules/.f/.fyn-audit.json"));
  });

  it("can disable rc files", async () => {
    Fs.writeFileSync(Path.join(cwd, ".fynrc"), "targetDir=package_modules\n");
    expect(await getAuditFilePath(cwd, { rcfile: false }))
      .toBe(Path.join(cwd, "node_modules/.f/.fyn-audit.json"));
  });
});
