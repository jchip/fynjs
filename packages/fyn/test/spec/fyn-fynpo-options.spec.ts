import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import Fyn from "../../lib/fyn";
import fynTil from "../../lib/util/fyntil";

/**
 * FPM-81: a fynpo monorepo's `fyn.options` is the only channel by which the
 * repo can set fyn options for every package in it. It read the wrong path
 * (`_fynpo.fyn.options` instead of `_fynpo.config.fyn.options`), so the whole
 * merge was a silent no-op.
 */
describe("fynpo fyn.options", function () {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fyn-fynpo-opts-")));
    fynTil.resetFynpo();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
    fynTil.resetFynpo();
    delete process.env.FYN_FYNPO_DIR;
  });

  /**
   * @param {object} fynOptions the `fyn.options` block for fynpo.json
   * @returns {void}
   */
  const writeFynpo = (fynOptions: Record<string, unknown>): void => {
    fs.writeFileSync(
      path.join(cwd, "fynpo.json"),
      JSON.stringify({ fyn: { options: fynOptions }, packages: [] })
    );
  };

  /**
   * @param {object} opts extra fyn options
   * @param {object} cliSource where each option came from
   * @returns {object} an initialized Fyn instance
   */
  const makeFyn = async (opts: any = {}, cliSource = {}): Promise<any> => {
    const { pkgFyn, ...rest } = opts;
    const fyn: any = new (Fyn as any)({
      opts: {
        registry: "http://localhost/",
        pkgFile: false,
        pkgData: { name: "t", version: "1.0.0", ...(pkgFyn ? { fyn: pkgFyn } : {}) },
        targetDir: "xout",
        cwd,
        fynDir: path.join(cwd, ".fyn"),
        ...rest
      },
      _cliSource: cliSource
    });
    await fyn._initializePkg();
    return fyn;
  };

  it("applies an option only the fynpo config supplies", async () => {
    writeFynpo({ layout: "detail", sourceMaps: false });
    const fyn = await makeFyn();
    expect(fyn._options.layout).to.equal("detail");
    expect(fyn._options.sourceMaps).to.equal(false);
  });

  it("applies the fynpo value when the option is only at its default", async () => {
    writeFynpo({ layout: "detail" });
    const fyn = await makeFyn({ layout: "normal" }, { layout: "default" });
    expect(fyn._options.layout).to.equal("detail");
  });

  it("lets an explicit CLI flag win over the fynpo config", async () => {
    writeFynpo({ layout: "detail" });
    const fyn = await makeFyn({ layout: "normal" }, { layout: "cli" });
    expect(fyn._options.layout).to.equal("normal");
  });

  it("never lets the fynpo config relocate cwd", async () => {
    writeFynpo({ cwd: path.join(os.tmpdir(), "somewhere-else"), layout: "detail" });
    const fyn = await makeFyn();
    expect(fyn._options.cwd).to.equal(cwd);
    expect(fyn._cwd).to.equal(cwd);
    // the rest of the block still applies
    expect(fyn._options.layout).to.equal("detail");
  });

  it("deep merges object options, with the locally set keys winning", async () => {
    writeFynpo({ resolutions: { "a": "1.0.0", "b": "2.0.0" } });
    const fyn = await makeFyn({ resolutions: { "b": "3.0.0" } });
    expect(fyn._options.resolutions).to.deep.equal({ a: "1.0.0", b: "3.0.0" });
  });

  it("leaves the script-policy options to their own precedence rules", async () => {
    // allowScripts unions across scopes with a denial winning at any level, so
    // the generic option merge must not flatten it - see Fyn.allowScripts
    writeFynpo({ allowScripts: { "a@1.0.0": true, "b@2.0.0": false } });
    const fyn = await makeFyn({ allowScripts: { "b@2.0.0": true } });
    expect(fyn._options.allowScripts).to.deep.equal({ "b@2.0.0": true });
    expect(fyn.allowScripts).to.deep.equal({ "a@1.0.0": true, "b@2.0.0": false });
  });

  describe("script policy scopes", function () {
    it("applies the monorepo's scriptPolicy to a package that sets none", async () => {
      writeFynpo({ scriptPolicy: "review" });
      const fyn = await makeFyn();
      expect(fyn.scriptPolicy).to.equal("review");
    });

    it("lets a package tighten the monorepo's mode", async () => {
      writeFynpo({ scriptPolicy: "review" });
      const fyn = await makeFyn({ pkgFyn: { scriptPolicy: "off" } });
      expect(fyn.scriptPolicy).to.equal("off");
    });

    it("does not let a package loosen the monorepo's mode", async () => {
      writeFynpo({ scriptPolicy: "review" });
      const fyn = await makeFyn({ pkgFyn: { scriptPolicy: "source" } });
      expect(fyn.scriptPolicy).to.equal("review");
    });

    it("lets the CLI override the mode outright", async () => {
      writeFynpo({ scriptPolicy: "review" });
      const fyn = await makeFyn({ scriptPolicy: "source" });
      expect(fyn.scriptPolicy).to.equal("source");
    });

    it("defaults to source with nothing configured", async () => {
      writeFynpo({});
      const fyn = await makeFyn();
      expect(fyn.scriptPolicy).to.equal("source");
    });

    it("unions allowScripts across scopes, with a denial final", async () => {
      writeFynpo({ allowScripts: { sharp: true, malware: false } });
      const fyn = await makeFyn({
        pkgFyn: { allowScripts: { canvas: "5.0.1", malware: true } },
        allowScripts: "esbuild"
      });
      expect(fyn.allowScripts).to.deep.equal({
        sharp: true,
        malware: false,
        canvas: "5.0.1",
        esbuild: true
      });
    });

    it("turns reviewLocalPackages on from any scope", async () => {
      writeFynpo({ reviewLocalPackages: true });
      const fyn = await makeFyn();
      expect(fyn.reviewLocalPackages).to.equal(true);
    });

    it("takes allowTopLevelScripts from the package over the monorepo", async () => {
      writeFynpo({ allowTopLevelScripts: true });
      const fyn = await makeFyn({ pkgFyn: { allowTopLevelScripts: ["postinstall"] } });
      expect(fyn.allowTopLevelScripts).to.deep.equal(["postinstall"]);
    });
  });
});
