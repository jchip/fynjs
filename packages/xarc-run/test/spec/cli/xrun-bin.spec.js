"use strict";

const expect = require("chai").expect;
const Fs = require("fs");
const Path = require("path");
const { spawnSync } = require("child_process");

const pkgDir = Path.join(__dirname, "../../..");
const binFile = Path.join(pkgDir, "bin/xrun.js");
const version = require("../../../package.json").version;

//
// Other specs in this fork set XRUN_* vars on process.env, and the child would inherit them and
// go looking for their task files - so hand it a clean environment.
//
const cleanEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("XRUN_")));

//
// `--version` still exits non-zero from a directory with no tasks, so the signal that the bin
// resolved its cli is the version reaching stdout, not the exit code.
//
const runBin = cwd =>
  spawnSync(process.execPath, [binFile, "--version"], { cwd, encoding: "utf8", env: cleanEnv() });

describe("bin/xrun.js cli resolution", function () {
  let tmpDir;

  //
  // Under .temp rather than os.tmpdir(): task-file.spec's searchTaskFile walks up from its own
  // dir in os.tmpdir(), and a sibling tree there perturbs what it finds.
  //
  beforeEach(() => {
    const tempRoot = Path.join(pkgDir, ".temp");
    Fs.mkdirSync(tempRoot, { recursive: true });
    tmpDir = Fs.mkdtempSync(Path.join(tempRoot, "xrun-bin-"));
  });

  afterEach(() => {
    Fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should load its cli from a cwd with no @fynjs/run installed", () => {
    const res = runBin(tmpDir);
    expect(res.stderr).to.not.contain("Cannot find module");
    expect(res.stdout).to.contain(version);
  });

  //
  // The bin used to probe for the cli from cwd but then require it by bare name, which resolves
  // from the bin file instead - so a cwd that had @fynjs/run installed sent it looking for a copy
  // that nothing above the bin file could resolve, and it died with MODULE_NOT_FOUND.
  //
  it("should load its cli when cwd has @fynjs/run installed but the bin file does not", () => {
    const nmDir = Path.join(tmpDir, "node_modules/@fynjs");
    Fs.mkdirSync(nmDir, { recursive: true });
    Fs.symlinkSync(pkgDir, Path.join(nmDir, "run"), "dir");

    const res = runBin(tmpDir);
    expect(res.stderr).to.not.contain("Cannot find module");
    expect(res.stdout).to.contain(version);
  });
});
