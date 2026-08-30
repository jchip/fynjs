import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import Fs from "fs";
import Path from "path";
import { promisify } from "util";

import { makeSampleFixture, removeSampleFixture } from "./helpers/sample-fixture";

const execFileAsync = promisify(execFile);

//
// End-to-end bootstrap.
//
// The previous version of this test shelled out to `tsx ../../src/fynpo`, asserted
// `expect(true).toBe(true)`, and then cd'd into packages that do not exist in the fixture.
// It could not fail: the child died on an uncaught chalker top-level-await TransformError
// every run and the test still reported green. See FPO-31.
//
// Two changes make it real: drive the shipped entry (bin/fynpo.js -> dist/bundle.mjs, which
// is what users actually run) instead of the TS source, and assert both the child's exit
// status and an observable effect on disk.
//
// The fixture packages are local-only - pkg2 depends on pkg1 and nothing else - so bootstrap
// links them without touching the network.
//
describe("test bootstrap command", () => {
  const fynpoBin = Path.join(__dirname, "..", "bin", "fynpo.js");
  let dir: string;

  const writePkg = (name: string, pkg: Record<string, unknown>) => {
    const pkgDir = Path.join(dir, "packages", name);
    Fs.mkdirSync(pkgDir, { recursive: true });
    Fs.writeFileSync(Path.join(pkgDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    Fs.writeFileSync(Path.join(pkgDir, "index.js"), "module.exports = 1;\n");
  };

  beforeAll(() => {
    dir = makeSampleFixture("bootstrap-e2e");

    writePkg("pkg1", { name: "pkg1", version: "1.0.0", main: "index.js", private: true });
    writePkg("pkg2", {
      name: "pkg2",
      version: "1.0.0",
      main: "index.js",
      private: true,
      dependencies: { pkg1: "^1.0.0" },
    });
  });

  afterAll(() => {
    removeSampleFixture(dir);
  });

  it("requires the built bundle - bootstrap runs what ships, not the TS source", () => {
    expect(
      Fs.existsSync(Path.join(__dirname, "..", "dist", "bundle.mjs")),
      "dist is not built - run the package build first"
    ).toBe(true);
  });

  it("exec bootstrap", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [fynpoBin, "bootstrap"], {
      cwd: dir,
    });

    // execFile rejects on a non-zero exit, so reaching here means exit 0 - which the old
    // test never checked, and which was in fact non-zero every run
    expect(stdout).toContain("bootstrap completed");

    // the crash that used to be swallowed
    expect(stderr).not.toContain("TransformError");
    expect(stdout + stderr).not.toContain("ERR_REQUIRE_ASYNC_MODULE");

    // observable effect: pkg2 depends on pkg1, so bootstrap must link it locally
    expect(Fs.existsSync(Path.join(dir, "packages", "pkg2", "node_modules", "pkg1"))).toBe(true);
  });

  it("reports both fixture packages", async () => {
    const { stdout } = await execFileAsync(process.execPath, [fynpoBin, "bootstrap"], {
      cwd: dir,
    });

    expect(stdout).toContain("pkg1@1.0.0");
    expect(stdout).toContain("pkg2@1.0.0");
  });
});
