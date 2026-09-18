import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prePack } from "../src/prepack.js";
import { postPack } from "../src/postpack.js";
import type { PackageInfo } from "../src/utils.js";

const mocks = vi.hoisted(() => ({
  getPackInfo: vi.fn(),
  writePkgFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn()
}));

vi.mock("../src/utils.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/utils.js")>(),
  getPackInfo: mocks.getPackInfo,
  writePkgFile: mocks.writePkgFile
}));

vi.mock("fs/promises", async importOriginal => ({
  ...await importOriginal<typeof import("fs/promises")>(),
  readFile: mocks.readFile,
  unlink: mocks.unlink
}));

describe("pack lifecycle failures and options", () => {
  let info: PackageInfo;
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetAllMocks();
    originalArgv = process.argv;
    process.argv = ["node", ""];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    info = {
      pkgDir: "/package",
      pkg: { name: "test-pkg", version: "1.0.0", publishUtil: { silent: true } },
      pkgData: Buffer.from("original manifest"),
      tmpDir: "/backup",
      saveName: "saved.json",
      saveFile: "/backup/saved.json",
      pkgFile: "/package/package.json"
    };
    mocks.getPackInfo.mockResolvedValue(info);
    mocks.writePkgFile.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("backs up bytes and records the target before pruning in silent mode", async () => {
    await prePack();

    expect(console.log).not.toHaveBeenCalled();
    expect(mocks.writePkgFile).toHaveBeenNthCalledWith(1, info.saveFile, info.pkgData);
    expect(mocks.writePkgFile.mock.calls[1][0]).toBe(`${info.saveFile}.meta.json`);
    expect(JSON.parse(mocks.writePkgFile.mock.calls[1][1])).toEqual({
      pkgFile: info.pkgFile,
      name: "test-pkg",
      version: "1.0.0",
      pid: process.pid,
      ts: expect.any(String)
    });
    expect(mocks.writePkgFile).toHaveBeenNthCalledWith(3, info.pkgFile, `${JSON.stringify({
      name: "test-pkg", version: "1.0.0", scripts: { postpack: "publish-util-postpack" }
    }, null, 2)}\n`);
  });

  it("reports a failed backup and leaves the manifest untouched", async () => {
    delete info.pkg.publishUtil;
    const error = new Error("backup failed");
    mocks.writePkgFile.mockRejectedValueOnce(error);

    await expect(prePack()).rejects.toThrow("exit");

    expect(mocks.writePkgFile).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("publish-util-prepack failed", error);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("reports restoration failures without deleting the backup", async () => {
    const error = new Error("manifest is read only");
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ pkgFile: info.pkgFile }));
    mocks.readFile.mockResolvedValueOnce(info.pkgData);
    mocks.writePkgFile.mockRejectedValueOnce(error);

    await expect(postPack()).rejects.toThrow("exit");

    expect(console.error).toHaveBeenCalledWith("publish-util-postpack failed", error);
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("restores to the resolved manifest when metadata has no recorded target", async () => {
    mocks.readFile.mockResolvedValueOnce("{}");
    mocks.readFile.mockResolvedValueOnce(info.pkgData);

    await postPack();

    expect(mocks.writePkgFile).toHaveBeenCalledWith(info.pkgFile, info.pkgData);
    expect(mocks.unlink).toHaveBeenCalledWith(info.saveFile);
    expect(mocks.unlink).toHaveBeenCalledWith(`${info.saveFile}.meta.json`);
  });
});
