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

/** run a task through the bin and hand back everything it wrote */
const runTask = (cwd, task) => {
  const res = spawnSync(process.execPath, [binFile, task], {
    cwd,
    encoding: "utf8",
    env: cleanEnv()
  });
  return { ...res, output: `${res.stdout}${res.stderr}` };
};

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

  //
  // These run through the bin because the failure they cover is the logger buffer being
  // discarded on exit - only a real process shows whether the diagnostic actually surfaced.
  // A vitest-hosted require also reports top-level await differently than node does.
  //
  describe("reporting an unusable task file", () => {
    //
    // searchUpTaskFile stops at the first package.json, so this keeps the walk from climbing
    // out of the temp dir and finding this package's own task file. No scripts, so npm-loader
    // contributes no tasks either.
    //
    beforeEach(() => {
      Fs.writeFileSync(
        Path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "xrun-bin-fixture", version: "1.0.0" })
      );
    });

    it("should say why when the task file uses top-level await", () => {
      Fs.writeFileSync(
        Path.join(tmpDir, "xrun-tasks.mjs"),
        `await new Promise(r => setTimeout(r, 1));\nexport default () => {};\n`
      );

      const res = runTask(tmpDir, "hello");
      expect(res.status).to.equal(1);
      expect(res.output).to.contain("top-level await");
      expect(res.output).to.contain("Move the await inside a task");
    });

    it("should say why when the task file throws", () => {
      Fs.writeFileSync(Path.join(tmpDir, "xrun-tasks.js"), `throw new Error("boom in task file");\n`);

      const res = runTask(tmpDir, "hello");
      expect(res.status).to.equal(1);
      expect(res.output).to.contain("Unable to load");
      expect(res.output).to.contain("boom in task file");
    });

    it("should say so when there is no task file at all", () => {
      const res = runTask(tmpDir, "hello");
      expect(res.status).to.equal(1);
      expect(res.output).to.contain("No tasks found");
      expect(res.output).to.contain(`You do not have a "xrun-tasks.js|ts" file`);
    });

    it("should still run a valid ESM task file", () => {
      Fs.writeFileSync(
        Path.join(tmpDir, "xrun-tasks.mjs"),
        `export default (xrun) => { xrun.load({ hello: () => console.log("hi from task") }); };\n`
      );

      const res = runTask(tmpDir, "hello");
      expect(res.status).to.equal(0);
      expect(res.output).to.contain("hi from task");
    });
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
