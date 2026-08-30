import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

/**
 * vitest's SSR transform removes `import.meta.resolve`, so the real resolver can only be
 * exercised in an actual node process. probe.ts runs there against genuine `import.meta` and
 * a fixture app with its own node_modules, and reports what happened as JSON.
 */

const probe = fileURLToPath(new URL("../fixtures/app/probe.ts", import.meta.url));
const tsx = fileURLToPath(new URL("../../node_modules/.bin/tsx", import.meta.url));

let report: Record<string, any>;

beforeAll(async () => {
  const { stdout } = await execFileAsync(tsx, [probe], { encoding: "utf8" });
  report = JSON.parse(stdout);
}, 60000);

describe("real import.meta.resolve", () => {
  it("should import a present ESM optional dependency", () => {
    expect(report.presentEsm.ok).toEqual({ kind: "esm", default: "present-esm-default" });
  });

  it("should import a present CJS optional dependency onto the namespace default", () => {
    expect(report.presentCjs.ok).toEqual({ namespaceDefault: { kind: "cjs" } });
  });

  it("should return undefined for an absent dependency", () => {
    expect(report.missing).toEqual({});
  });

  it("should return the default value for an absent dependency", () => {
    expect(report.missingWithDefault.ok).toBe("FELL-BACK");
  });

  it("should NOT fall back when the dependency is installed but its own dep is missing", () => {
    // both this and `missing` above surface ERR_MODULE_NOT_FOUND from node -- the whole point
    // is that only one of them is the dependency being absent
    expect(report.brokenNested.threw.code).toBe("ERR_MODULE_NOT_FOUND");
    expect(report.brokenNested.threw.message).toMatch(/a-dep-that-is-not-installed/);
  });

  it("should return the default for an absent absolute path", () => {
    expect(report.pathMissingWithDefault.ok).toBe("FELL-BACK");
  });

  it("should return the default for an absent relative path", () => {
    expect(report.relPathMissingWithDefault.ok).toBe("FELL-BACK");
  });

  it("should return the default for an absent file: URL", () => {
    expect(report.fileUrlMissingWithDefault.ok).toBe("FELL-BACK");
  });

  it("should import a path that exists", () => {
    expect(report.pathPresent.ok).toEqual({ kind: "local-good" });
  });

  it("should NOT fall back for a path that exists but whose own dep is missing", () => {
    // the same discrimination the bare-specifier case gets: the file is there, so this is a
    // real failure naming the NESTED specifier, not the optional dependency being absent
    expect(report.pathBroken.threw.code).toBe("ERR_MODULE_NOT_FOUND");
    expect(report.pathBroken.threw.message).toMatch(/no-such-dep-of-mine/);
  });

  it("should route a broken path through fail", () => {
    expect(report.pathBrokenViaFail.ok).toEqual({ failCalled: "ERR_MODULE_NOT_FOUND" });
  });

  it("should not extension-probe a path the way CJS would", () => {
    expect(report.pathNoExtensionProbing.ok).toBe("FELL-BACK");
  });

  it("should report absent paths through has and resolve", () => {
    expect(report.hasMissingPath).toBe(false);
    expect(report.hasPresentPath).toBe(true);
    expect(report.resolveMissingPath).toBe(null);
  });

  it("should NOT fall back when the dependency throws at module scope", () => {
    expect(report.throwsAtLoad.threw.message).toMatch(/boom at module scope/);
  });

  it("should route a broken install through fail", () => {
    expect(report.brokenNestedViaFail.ok).toEqual({ failCalled: "ERR_MODULE_NOT_FOUND" });
  });

  it("should treat an unexported subpath as not found by default", () => {
    expect(report.notExportedDefault.ok).toBe("FELL-BACK");
  });

  it("should treat an unexported subpath as a failure when asked", () => {
    expect(report.notExportedAsFail.threw.code).toBe("ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  it("should answer availability synchronously", () => {
    expect(report.hasPresent).toBe(true);
    expect(report.hasMissing).toBe(false);
    expect(report.resolvePresent).toBe(true);
    expect(report.resolveMissing).toBeNull();
  });
});
