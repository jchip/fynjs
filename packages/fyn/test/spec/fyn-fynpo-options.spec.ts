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
  const makeFyn = async (opts = {}, cliSource = {}): Promise<any> => {
    const fyn: any = new (Fyn as any)({
      opts: {
        registry: "http://localhost/",
        pkgFile: false,
        pkgData: { name: "t", version: "1.0.0" },
        targetDir: "xout",
        cwd,
        fynDir: path.join(cwd, ".fyn"),
        ...opts
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
    writeFynpo({ allowScripts: { "a@1.0.0": true, "b@2.0.0": true } });
    const fyn = await makeFyn({ allowScripts: { "b@2.0.0": false } });
    expect(fyn._options.allowScripts).to.deep.equal({
      "a@1.0.0": true,
      "b@2.0.0": false
    });
  });
});
