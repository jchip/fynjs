import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getInfo: vi.fn(), writePkgFile: vi.fn() }));
vi.mock("../src/utils.js", () => mocks);

describe("postinstall", () => {
  let pkg: Record<string, unknown>;
  const pkgFile = "/consumer/package.json";

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("INIT_CWD", "/consumer");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    pkg = { name: "consumer" };
    mocks.getInfo.mockResolvedValue({ pkg, pkgFile });
    mocks.writePkgFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const install = async () => {
    await import("../src/postinstall.js");
    await vi.dynamicImportSettled();
  };

  it("skips installation when the caller's directory is unavailable", async () => {
    vi.stubEnv("INIT_CWD", undefined);

    await install();

    expect(console.error).toHaveBeenCalledWith("publish-util postinstall: no INIT_CWD env - skipping");
    expect(mocks.getInfo).not.toHaveBeenCalled();
    expect(mocks.writePkgFile).not.toHaveBeenCalled();
  });

  it("adds missing lifecycle scripts to the invoking package", async () => {
    await install();

    expect(mocks.getInfo).toHaveBeenCalledWith("/consumer");
    expect(pkg.scripts).toEqual({ prepack: "publish-util-prepack", postpack: "publish-util-postpack" });
    expect(mocks.writePkgFile).toHaveBeenCalledWith(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("preserves scripts that already include the lifecycle commands", async () => {
    const scripts = { prepack: "build && publish-util-prepack", postpack: "publish-util-postpack && cleanup" };
    pkg.scripts = { ...scripts };

    await install();

    expect(pkg.scripts).toEqual(scripts);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("warns about custom scripts without overwriting them", async () => {
    const scripts = { prepack: "build", postpack: "cleanup" };
    pkg.scripts = { ...scripts };

    await install();

    expect(pkg.scripts).toEqual(scripts);
    expect(console.warn).toHaveBeenCalledWith("You already have npm script 'prepack' in your package.json, please add 'publish-util-prepack' to it.");
    expect(console.warn).toHaveBeenCalledWith("You already have npm script 'postpack' in your package.json, please add 'publish-util-postpack' to it.");
  });

  it("reports a manifest write failure without rejecting the installation", async () => {
    const error = new Error("read only manifest");
    mocks.writePkgFile.mockRejectedValueOnce(error);

    await install();

    expect(console.error).toHaveBeenCalledWith(`publish-util postinstall: failed updating ${pkgFile}`, error);
  });
});
