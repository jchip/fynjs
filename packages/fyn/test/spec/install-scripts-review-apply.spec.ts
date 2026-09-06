import { describe, it, beforeEach, afterEach, vi } from "vitest";
import { expect } from "chai";
import Fs from "fs";
import Os from "os";
import Path from "path";
import logger from "../../lib/logger";

// review() only asks when there is a terminal and no CI, and it reads the
// answer through readline - both faked here so the prompt path can run under
// vitest. Kept in its own spec file so these mocks cannot reach the other
// install-scripts tests, one of which asserts the no-terminal behavior.
vi.mock("ci-info", () => ({ default: { isCI: false }, isCI: false }));
vi.mock("readline", () => ({
  default: {
    createInterface: () => ({
      question: (_q: string, cb: (answer: string) => void) => cb("a"),
      close: () => undefined
    })
  }
}));

const { InstallScripts } = await import("../../lib/install-scripts");

/**
 * FPM-125: review() wrote the approval to disk and stopped there. The install
 * that asked evaluates policy from the config it already holds in memory, so
 * the approval had to be handed to the live instance too - otherwise the
 * requeue re-evaluates against the pre-approval policy and the package stays
 * blocked, reported as "not reviewed" right after "approved".
 */
describe("review() applies the approval it just wrote", function () {
  let dir: string;
  let stdinTTY: boolean | undefined;
  let stdoutTTY: boolean | undefined;
  let infoSpy: any;

  beforeEach(() => {
    dir = Fs.realpathSync(Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-review-apply-")));
    Fs.writeFileSync(
      Path.join(dir, "package.json"),
      JSON.stringify({ name: "t", version: "1.0.0" }, null, 2)
    );
    stdinTTY = process.stdin.isTTY;
    stdoutTTY = process.stdout.isTTY;
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined as any);
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
    process.stdin.isTTY = stdinTTY as boolean;
    process.stdout.isTTY = stdoutTTY as boolean;
    infoSpy.mockRestore();
  });

  /**
   * @param {object} [over] fields to override
   * @returns {object} a fyn stub that records applyAllowScripts calls
   */
  const mkFyn = (over: any = {}) => ({
    cwd: dir,
    allowScriptsPin: true,
    allowScripts: {},
    denyScripts: {},
    blockedScripts: [],
    pendingScripts: [],
    _fynpo: {},
    applied: [] as any[],
    applyAllowScripts(allowScripts: any, opts: any) {
      (this as any).applied.push({ allowScripts, opts });
    },
    ...over
  });

  const mkRecord = (over = {}) => ({
    name: "sharp",
    version: "0.34.4",
    scripts: ["install"],
    ...over
  });

  it("hands the written allowlist to the live instance, not just to disk", async () => {
    const fyn = mkFyn();

    const approved = await new InstallScripts({ fyn }).review([mkRecord()]);

    // it did approve, and it did write the file
    expect(approved).to.have.length(1);
    const onDisk = JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8"));
    expect(onDisk.fyn.allowScripts).to.not.equal(undefined);

    // and the same map reached the running install
    expect(fyn.applied).to.have.length(1);
    expect(fyn.applied[0].allowScripts).to.deep.equal(onDisk.fyn.allowScripts);
    expect(fyn.applied[0].opts).to.deep.equal({ fynpo: false });
  });

  it("targets the fynpo config when the approval went to fynpo.json", async () => {
    Fs.writeFileSync(
      Path.join(dir, "fynpo.json"),
      JSON.stringify({ packages: [] }, null, 2)
    );
    const fyn = mkFyn({ _fynpo: { dir } });

    await new InstallScripts({ fyn }).review([mkRecord()]);

    expect(fyn.applied).to.have.length(1);
    expect(fyn.applied[0].opts).to.deep.equal({ fynpo: true });
  });

  it("does not touch the live instance when nothing was approved", async () => {
    // a denied package has nothing to approve, so nothing should be applied
    const fyn = mkFyn({ denyScripts: { sharp: true } });

    const approved = await new InstallScripts({ fyn }).review([mkRecord()]);

    expect(approved).to.deep.equal([]);
    expect(fyn.applied).to.deep.equal([]);
  });
});
