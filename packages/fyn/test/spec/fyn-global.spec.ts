import { describe, it, beforeEach, afterEach, vi } from "vitest";
import { expect } from "chai";
import fs from "fs";
import path from "path";

const state = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("../../lib/pkg-bin-linker", () => {
  class FakePkgBinLinker {
    constructor(options: any) {
      state.calls.push({ type: "construct", options });
    }

    async hasBinLink(binName: string) {
      state.calls.push({ type: "has", binName });
      return false;
    }

    async linkBinPath(target: string, binName: string, options: any) {
      state.calls.push({ type: "link", target, binName, options });
    }

    async matchesBinPath(binName: string, target: string) {
      state.calls.push({ type: "match", binName, target });
      return true;
    }

    async removeBinLink(binName: string) {
      state.calls.push({ type: "remove", binName });
    }
  }

  return { default: FakePkgBinLinker };
});

vi.mock("../../lib/fyn", () => {
  class FakeFyn {
    constructor(config: any) {
      state.calls.push({ type: "fyn", opts: config.opts });
    }
  }

  return { default: FakeFyn };
});

import FynGlobal from "../../lib/fyn-global";

describe("fyn-global", function () {
  const globalDir = path.join(__dirname, "../.fyn-global");
  const cleanup = () => {
    fs.rmSync(globalDir, { recursive: true, force: true });
  };

  let calls: any[];

  beforeEach(() => {
    cleanup();
    state.calls.length = 0;
    calls = state.calls;
  });

  afterEach(() => {
    cleanup();
  });

  it("should link global bins through the shared linker", async () => {
    const fynGlobal: any = new (FynGlobal as any)({ globalDir, nodeVersion: "20" });
    const target = path.join(globalDir, "v20/packages/g1/node_modules/.bin/foo");

    await fynGlobal.linkBins("g1", { foo: target }, true);

    // absoluteTarget is required for the global bin dir: it is reached through the
    // `global/bin` -> `v<N>/bin` symlink, where a Windows .cmd's `%~dp0\..` resolves one level
    // short of the version dir. See PkgBinLinkerBase._useAbsoluteTarget.
    expect(calls).to.deep.include({
      type: "construct",
      options: { binDir: path.join(globalDir, "v20", "bin"), absoluteTarget: true }
    });
    expect(calls).to.deep.include({
      type: "link",
      target,
      binName: "foo",
      options: { overwrite: true }
    });
  });

  it("should unlink global bins through the shared linker", async () => {
    const fynGlobal: any = new (FynGlobal as any)({ globalDir, nodeVersion: "20" });

    await fynGlobal.writeInstalledJson({
      packages: {
        foo: {
          versions: [{ version: "1.0.0", dir: "g1", bins: ["foo"], linked: true }]
        }
      }
    });

    await fynGlobal.unlinkBinsForVersion("foo", "g1");

    expect(calls).to.deep.include({
      type: "match",
      binName: "foo",
      target: path.join(globalDir, "v20/packages/g1/node_modules/.bin/foo")
    });
    expect(calls).to.deep.include({ type: "remove", binName: "foo" });
  });

  it("should propagate CLI fynOpts into the Fyn instance it creates", () => {
    const fynGlobal: any = new (FynGlobal as any)({
      globalDir,
      nodeVersion: "20",
      fynOpts: { refreshMeta: true, production: true }
    });

    fynGlobal._createFyn(globalDir, false);

    const fynCall = calls.find(c => c.type === "fyn");
    expect(fynCall).to.exist;
    expect(fynCall.opts.refreshMeta).to.equal(true);
    expect(fynCall.opts.production).to.equal(true);
  });

  it("should override global-install settings even if fynOpts sets them", () => {
    const fynGlobal: any = new (FynGlobal as any)({
      globalDir,
      nodeVersion: "20",
      fynOpts: { centralStore: false, lockfile: false, layout: "detail" }
    });

    fynGlobal._createFyn(globalDir, false);

    const fynCall = calls.find(c => c.type === "fyn");
    expect(fynCall.opts.centralStore).to.equal(true);
    expect(fynCall.opts.lockfile).to.equal(true);
    expect(fynCall.opts.layout).to.equal("normal");
  });
});
