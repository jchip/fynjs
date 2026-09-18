import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import * as Fs from "fs/promises";
import * as Path from "path";
import { npmPublish } from "../src/npm-publish.js";
import { getInfo, writePkgFile } from "../src/utils.js";
import type { PackageInfo } from "../src/utils.js";

vi.mock("child_process", () => ({ spawn: vi.fn() }));
vi.mock("fs/promises", () => ({ unlink: vi.fn() }));
vi.mock("../src/utils.js", () => ({ getInfo: vi.fn(), writePkgFile: vi.fn() }));

describe("npmPublish", () => {
  let info: PackageInfo;
  let originalArgv: string[];
  let originalListeners: ReturnType<typeof process.listeners>;
  let originalPublishEnv: string | undefined;
  let cwd: string;
  let results: Array<number | Error>;

  beforeEach(() => {
    vi.resetAllMocks();
    originalArgv = process.argv;
    originalListeners = process.listeners("SIGINT");
    originalPublishEnv = process.env.BY_PUBLISH_UTIL;
    cwd = process.cwd();
    process.argv = ["node", "do-publish"];
    const pkgDir = Path.join(cwd, "fixture-package");
    info = {
      pkgDir,
      pkgFile: Path.join(pkgDir, "package.json"),
      pkg: { name: "@scope/package", version: "1.2.3" },
      pkgData: Buffer.from('{"name":"@scope/package","version":"1.2.3"}\n'),
      tmpDir: cwd,
      saveName: "saved-package.json",
      saveFile: Path.join(cwd, "saved-package.json"),
    };
    vi.mocked(getInfo).mockResolvedValue(info);
    vi.mocked(writePkgFile).mockResolvedValue(true);
    vi.mocked(Fs.unlink).mockResolvedValue(undefined);
    vi.spyOn(process, "chdir").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    results = [];
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter();
      const result = results.shift() ?? 0;
      queueMicrotask(() => {
        if (result instanceof Error) child.emit("error", result);
        else child.emit("close", result);
      });
      return child as ChildProcess;
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalPublishEnv === undefined) delete process.env.BY_PUBLISH_UTIL;
    else process.env.BY_PUBLISH_UTIL = originalPublishEnv;
    for (const listener of process.listeners("SIGINT")) {
      if (!originalListeners.includes(listener)) process.removeListener("SIGINT", listener);
    }
    vi.restoreAllMocks();
  });

  const commands = () => vi.mocked(spawn).mock.calls.map(([cmd, args]) => [cmd, args]);
  const tarball = () => Path.join(info.pkgDir, "scope-package-1.2.3.tgz");

  it("packs and publishes with default options, then cleans up and exits", async () => {
    expect(await npmPublish()).toBe(0);

    expect(commands()).toEqual([["npm", ["pack"]], ["npm", ["publish", tarball()]]]);
    expect(spawn).toHaveBeenCalledWith("npm", ["pack"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    expect(process.env.BY_PUBLISH_UTIL).toBe("1");
    expect(process.chdir).toHaveBeenNthCalledWith(1, info.pkgDir);
    expect(process.chdir).toHaveBeenLastCalledWith(cwd);
    expect(Fs.unlink).toHaveBeenNthCalledWith(1, tarball());
    expect(Fs.unlink).toHaveBeenNthCalledWith(2, tarball());
    expect(writePkgFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("publishing args:", `publish ${tarball()}`);
    expect(process.listeners("SIGINT")).toEqual(originalListeners);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("runs lifecycle scripts in order, forwards options, and restores the original manifest", async () => {
    info.pkg.scripts = { prepublish: "old", prepublishOnly: "before", publish: "after" };
    process.argv.push("--otp", "123456", "--access", "public", "--tag", "next");

    expect(await npmPublish({ exit: false })).toBe(0);

    expect(commands()).toEqual([
      ["npm", ["run", "prepublishOnly"]],
      ["npm", ["pack"]],
      ["npm", ["run", "publish"]],
      ["npm", ["publish", "--tag", "next", "--access", "public", tarball(), "--otp", "123456"]],
    ]);
    expect(JSON.parse(String(vi.mocked(writePkgFile).mock.calls[0][1])).scripts).toEqual({
      prepublishOnly: "before", publish: "after",
    });
    expect(writePkgFile).toHaveBeenLastCalledWith(info.pkgFile, info.pkgData);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    expect(console.log).toHaveBeenCalledWith("Restoring", info.pkgFile);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("dry runs without prepare or publishing while keeping the other lifecycle scripts", async () => {
    info.pkg.scripts = { prepare: "prepare", prepublishOnly: "before", publish: "after" };
    process.argv.push("--dry-run", "--access", "restricted", "--tag", "beta", "--otp", "123456");

    expect(await npmPublish({ exit: false, silent: true })).toBe(0);

    expect(commands()).toEqual([
      ["npm", ["run", "prepublishOnly"]], ["npm", ["pack"]], ["npm", ["run", "publish"]],
    ]);
    expect(JSON.parse(String(vi.mocked(writePkgFile).mock.calls[0][1])).scripts)
      .not.toHaveProperty("prepare");
    expect(writePkgFile).toHaveBeenLastCalledWith(info.pkgFile, info.pkgData);
    expect(console.log).toHaveBeenCalledExactlyOnceWith("dry-run", "scope-package-1.2.3.tgz", "args:",
      ["--tag", "beta", "--access", "restricted", "--otp", "123456"]);
  });

  it("uses fallback package names and versions and suppresses publish logging", async () => {
    info.pkg = {};
    expect(await npmPublish({ exit: false, silent: true })).toBe(0);
    expect(commands()[1]).toEqual(["npm", ["publish", Path.join(info.pkgDir, "unknown-0.0.0.tgz")]]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each([
    ["--tag", undefined, "--tag must specify a tag"],
    ["--access", "private", "must be one of: public, restricted"],
    ["--access", undefined, "must be one of: public, restricted"],
  ])("rejects invalid %s values (%s) before spawning commands", async (option, value, message) => {
    process.argv.push(option);
    if (value !== undefined) process.argv.push(value);
    await expect(npmPublish({ exit: false })).rejects.toThrow(message);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reports failed commands, stops publishing, restores the manifest, and exits with failure", async () => {
    info.pkg.scripts = { prepublish: "old" };
    results.push(2);

    expect(await npmPublish()).toBe(1);

    expect(commands()).toEqual([["npm", ["pack"]]]);
    expect(console.error).toHaveBeenCalledWith("publish failed!", new Error("npm pack exited with code 2"));
    expect(writePkgFile).toHaveBeenLastCalledWith(info.pkgFile, info.pkgData);
    expect(process.chdir).toHaveBeenLastCalledWith(cwd);
    expect(Fs.unlink).toHaveBeenLastCalledWith(tarball());
    expect(process.listeners("SIGINT")).toEqual(originalListeners);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("reports spawn errors", async () => {
    const error = new Error("spawn npm ENOENT");
    results.push(error);
    expect(await npmPublish({ exit: false })).toBe(1);
    expect(console.error).toHaveBeenCalledWith("publish failed!", error);
  });

  it("handles interrupts without printing an error", async () => {
    vi.mocked(getInfo).mockImplementation(async () => {
      const listener = process.listeners("SIGINT").find(value => !originalListeners.includes(value));
      listener!("SIGINT");
      return info;
    });
    results.push(new Error("SIGINT"));
    expect(await npmPublish({ exit: false })).toBe(1);
    expect(console.log).toHaveBeenCalledWith("");
    expect(console.error).not.toHaveBeenCalled();
    expect(process.listeners("SIGINT")).toEqual(originalListeners);
  });

  it("reports non-Error failures and still cleans up", async () => {
    vi.mocked(process.chdir).mockImplementationOnce(() => { throw "directory unavailable"; });
    expect(await npmPublish({ exit: false })).toBe(1);
    expect(console.error).toHaveBeenCalledWith("publish failed!", "directory unavailable");
    expect(spawn).not.toHaveBeenCalled();
    expect(Fs.unlink).toHaveBeenCalledWith(tarball());
  });

  it("tolerates missing tarballs and restoration failures", async () => {
    process.argv.push("--dry-run");
    vi.mocked(Fs.unlink).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(writePkgFile).mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("read-only"));
    vi.mocked(process.chdir).mockImplementationOnce(() => {}).mockImplementationOnce(() => {
      throw new Error("original directory removed");
    });

    expect(await npmPublish({ exit: false })).toBe(0);
    expect(writePkgFile).toHaveBeenLastCalledWith(info.pkgFile, info.pkgData);
    expect(Fs.unlink).toHaveBeenCalledTimes(2);
    expect(process.listeners("SIGINT")).toEqual(originalListeners);
  });
});
