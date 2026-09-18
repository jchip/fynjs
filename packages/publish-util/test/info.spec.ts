import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { findUp } from "find-up";
import { getInfo, getPackInfo, loadInfo } from "../src/index.js";

vi.mock("find-up", async importOriginal => {
  const actual = await importOriginal<typeof import("find-up")>();
  return { ...actual, findUp: vi.fn(actual.findUp) };
});

describe("package information", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await Fs.mkdtemp(Path.join(Os.tmpdir(), "publish-util-info-"));
    await Fs.writeFile(Path.join(dir, "package.json"), JSON.stringify({ name: "@scope/pkg" }));
    vi.stubEnv("INIT_CWD", undefined);
    vi.stubEnv("PUBLISH_UTIL_PKG_DIR", undefined);
    vi.stubEnv("npm_package_json", undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(findUp).mockClear();
    await Fs.rm(dir, { recursive: true, force: true });
  });

  it("loads package data and gives scoped packages a filesystem-safe backup name", async () => {
    const info = await getInfo(dir);
    expect(info.pkg).toEqual({ name: "@scope/pkg" });
    expect(info.pkgData).toEqual(await Fs.readFile(info.pkgFile));
    expect(info.saveName).toBe("package-util-_scope_pkg_pkg.json");
    expect(info.saveFile).toBe(Path.join(Os.tmpdir(), info.saveName));
  });

  it("prefers INIT_CWD when no directory is provided", async () => {
    vi.stubEnv("INIT_CWD", dir);
    expect((await getInfo()).pkgDir).toBe(dir);
    expect(findUp).toHaveBeenCalledWith("package.json", { cwd: dir });
  });

  it("uses process.cwd when INIT_CWD is absent", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    expect((await getInfo()).pkgDir).toBe(dir);
  });

  it("reports a missing manifest for general and pack-time lookup", async () => {
    vi.mocked(findUp).mockResolvedValueOnce(undefined);
    await expect(getInfo(dir)).rejects.toThrow(`No package.json found starting from directory: ${dir}`);
    await Fs.unlink(Path.join(dir, "package.json"));
    vi.mocked(findUp).mockResolvedValueOnce(undefined);
    await expect(getPackInfo(dir)).rejects.toThrow(`no package.json found for this package (looked in ${dir})`);
  });

  it("uses an unknown backup name for an unnamed manifest", async () => {
    const file = Path.join(dir, "package.json");
    await Fs.writeFile(file, "{}");
    expect((await loadInfo(file)).saveName).toBe("package-util-unknown_pkg.json");
  });
});
