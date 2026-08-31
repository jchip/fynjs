import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "child_process";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const PKG_DIR = Path.join(__dirname, "..");
const REPO_ROOT = Path.join(PKG_DIR, "..", "..");
const BIN = Path.join(PKG_DIR, "dist", "fynpo.js");

//
// FJM-85. fynpo-cli is a thin global launcher: it finds the fynpo installed in whatever
// monorepo you are standing in and runs it. It used to require "fynpo/dist/fynpo-cli", a path
// inside fynpo's build output. When fynpo's build changed (webpack dist/fynpo-cli -> rolldown
// dist/bundle.mjs) that file stopped existing, so every invocation fell into the notFound
// branch and printed "not in a fynpo monorepo" - misleading, since fynpo was installed.
//
// It now resolves fynpo's entry from the `bin` field of its package.json, which is the
// published contract, so a future build-layout change cannot break it the same way.
//
describe("fynpo-cli launcher (FJM-85)", () => {
  beforeAll(() => {
    expect(Fs.existsSync(BIN), "dist is not built - run the package build first").toBe(true);
  });

  /** the source with comments removed - the guards below are about code, not prose */
  const code = () =>
    Fs.readFileSync(Path.join(PKG_DIR, "bin", "fynpo.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("does not reach into fynpo's dist layout", () => {
    // the comment block above the fix names the stale path deliberately, so strip comments
    // first - otherwise documenting the bug would trip its own guard
    expect(code()).not.toContain("fynpo/dist");
  });

  it("resolves fynpo through its package.json bin field", () => {
    expect(code()).toContain("fynpo/package.json");
    expect(code()).toMatch(/\bbin\b/);
  });

  it("runs the monorepo's fynpo and reports its version", async () => {
    const { stdout } = await execFileAsync(process.execPath, [BIN, "--version"], {
      cwd: REPO_ROOT
    });

    const fynpoPkg = JSON.parse(
      Fs.readFileSync(Path.join(REPO_ROOT, "packages", "fynpo", "package.json"), "utf8")
    );

    //
    // The version is the last line, not the whole of stdout. fynpo 2.1.6 - which is what the
    // launcher resolves from the root install - writes "CI env detected" to stdout before the
    // answer whenever CI is set, so an exact match passed locally and failed in CI. That
    // diagnostic now goes to stderr (FJM-124), but this test has to hold for the installed
    // copy too, and asserting "the version is what it reported" is the point either way.
    //
    const lines = stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(lines[lines.length - 1]).toEqual(fynpoPkg.version);
  });

  it("dispatches a real command through to fynpo", async () => {
    const { stdout } = await execFileAsync(process.execPath, [BIN, "--help"], { cwd: REPO_ROOT });

    expect(stdout).toContain("Usage: fynpo");
    expect(stdout).toContain("bootstrap");
  });

  it("reports the real error, and exits non-zero, outside a monorepo", async () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-cli-"));

    try {
      let code = 0;
      let stderr = "";
      try {
        await execFileAsync(process.execPath, [BIN, "--version"], { cwd: dir });
      } catch (err: any) {
        code = err.code;
        stderr = err.stderr || "";
      }

      expect(code).toEqual(1);
      expect(stderr).toContain("Unable to find the fynpo module");
    } finally {
      Fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
