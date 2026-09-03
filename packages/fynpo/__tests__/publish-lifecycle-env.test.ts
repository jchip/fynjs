import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const fynRun = vi.fn();
vi.mock("fyn/bin/index.mjs", () => ({ default: { run: (...args: any[]) => fynRun(...args) } }));

vi.mock("shelljs", () => ({
  default: { pushd: vi.fn(), popd: vi.fn(), rm: vi.fn() },
}));

import Publish from "../src/publish";

//
// publish-util's check.js fails prepublishOnly unless it can tell a sanctioned publisher ran it.
// It is first in topo order because nearly every package devDeps it, so before FPO-55 that one
// guard aborted the entire 25-package release at the first package.
//
describe("publish lifecycle script environment", () => {
  const makePublish = () =>
    new Publish({ cwd: "/repo", dryRun: true, push: false }, { packages: { byId: {} } } as any);

  const pkg = {
    name: "publish-util",
    path: "packages/publish-util",
    pkgJson: { scripts: { prepublishOnly: "node check.js" } },
  } as any;

  beforeEach(() => {
    fynRun.mockReset();
    delete process.env.FYNPO_PUBLISH;
  });

  afterEach(() => {
    delete process.env.FYNPO_PUBLISH;
  });

  it("sets FYNPO_PUBLISH while the script runs", async () => {
    let seen: string | undefined = "not-run";
    fynRun.mockImplementation(async () => {
      seen = process.env.FYNPO_PUBLISH;
    });

    await makePublish().runScript(pkg, "prepublishOnly");

    expect(seen).toBe("1");
  });

  it("removes FYNPO_PUBLISH again once the script is done", async () => {
    fynRun.mockResolvedValue(undefined);

    await makePublish().runScript(pkg, "prepublishOnly");

    expect(process.env.FYNPO_PUBLISH).toBeUndefined();
  });

  //
  // the finally block has to run on the failure path too - otherwise a failed prepublishOnly
  // would leave FYNPO_PUBLISH set for the rest of the process, including the npm publish phase
  //
  it("restores the environment when the script throws", async () => {
    fynRun.mockRejectedValue(new Error("prepublishOnly failed"));

    await expect(makePublish().runScript(pkg, "prepublishOnly")).rejects.toThrow(
      "prepublishOnly failed"
    );
    expect(process.env.FYNPO_PUBLISH).toBeUndefined();
  });

  it("restores a pre-existing value rather than deleting it", async () => {
    process.env.FYNPO_PUBLISH = "outer";
    fynRun.mockResolvedValue(undefined);

    await makePublish().runScript(pkg, "prepublishOnly");

    expect(process.env.FYNPO_PUBLISH).toBe("outer");
  });

  it("does not run, or touch the environment, when the package has no such script", async () => {
    await makePublish().runScript({ ...pkg, pkgJson: { scripts: {} } }, "prepublishOnly");

    expect(fynRun).not.toHaveBeenCalled();
    expect(process.env.FYNPO_PUBLISH).toBeUndefined();
  });
});
