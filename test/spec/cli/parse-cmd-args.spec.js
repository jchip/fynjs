"use strict";

const { expect } = require("chai");
const Path = require("path");
const fs = require("fs");
const os = require("os");
const { parseArgs } = require("../../../cli/parse-cmd-args");
const env = require("../../../cli/env");
const logger = require("../../../lib/logger");
const WrapProcess = require("../../../cli/wrap-process");
const { updateCwd, searchTaskFile } = require("../../../cli/task-file");

// Suppress logging during tests
logger.quiet(true);

describe("parse-cmd-args", function() {
  let originalWrapProcess;

  beforeEach(() => {
    // Save original WrapProcess
    originalWrapProcess = Object.assign({}, WrapProcess);

    // Reset environment variables before each test
    Object.keys(env.container).forEach(key => {
      if (key.startsWith("XRUN_")) {
        delete env.container[key];
      }
    });
  });

  afterEach(() => {
    // Restore original WrapProcess
    Object.assign(WrapProcess, originalWrapProcess);
  });

  describe("task parsing", () => {
    it("parses tasks after --", () => {
      const args = ["node", "xrun", "task1", "task2"];
      const result = parseArgs(args, 2);
      expect(result.tasks).to.deep.equal(["task1", "task2"]);
    });

    it("handles task arguments", () => {
      const args = ["node", "xrun", "task1", "--task-opt=value", "task2"];
      const result = parseArgs(args, 2);
      expect(result.tasks).to.deep.equal(["task1", "task2"]);
      expect(result.parsed.command.subCmdNodes.task1.opts.taskOpt).to.equal("value");
    });
  });

  describe("task file handling", () => {
    it("finds task file in specified directory", () => {
      const args = ["node", "xrun", "task1"];
      const result = parseArgs(args, 2);
      expect(result.searchResult.found).to.equal(true);
      expect(result.searchResult.xrunFile).to.match(/xrun-tasks\.js$/);
    });
  });

  describe("searchTaskFile", function() {
    let testDir;
    let subDir;
    let subSubDir;
    let mockCwd;

    beforeEach(() => {
      // Create test directory structure in a temporary directory
      testDir = Path.join(os.tmpdir(), `xarc-run-test-${Date.now()}`);
      subDir = Path.join(testDir, "subdir");
      subSubDir = Path.join(subDir, "subsubdir");

      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(subDir, { recursive: true });
      fs.mkdirSync(subSubDir, { recursive: true });

      // Mock WrapProcess
      mockCwd = process.cwd();
      WrapProcess.cwd = () => mockCwd;
      WrapProcess.chdir = dir => {
        mockCwd = dir;
      };
    });

    afterEach(() => {
      // Clean up test directories
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it("should find xrun-tasks.js in current directory", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).to.be.true;
      expect(result.xrunFile).to.match(/xrun-tasks\.js$/);
      expect(result.dir).to.equal(testDir);
    });

    it("should find xrun.ts in current directory", () => {
      fs.writeFileSync(Path.join(testDir, "xrun.ts"), "export default {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).to.be.true;
      expect(result.xrunFile).to.match(/xrun\.ts$/);
      expect(result.dir).to.equal(testDir);
    });

    it("should search up directories when search is true", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: subSubDir });
      expect(result.found).to.be.true;
      expect(result.xrunFile).to.match(/xrun-tasks\.js$/);
      expect(result.dir).to.equal(testDir);
    });

    it("should stop searching at package.json even if no task file found", () => {
      fs.writeFileSync(Path.join(subDir, "package.json"), "{}");
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: subSubDir });
      expect(result.found).to.be.false;
      expect(result.foundPkg).to.be.true;
      expect(result.dir).to.equal(subSubDir); // The search stops but we keep original dir
    });

    it("should not search up when search is false", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(false, { cwd: subSubDir });
      expect(result.found).to.be.false;
      expect(result.dir).to.equal(subSubDir);
    });

    it("should handle directory with no task file", () => {
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).to.be.false;
      expect(result.foundPkg).to.be.false;
      expect(result.dir).to.equal(testDir); // Keep original dir when nothing is found
    });

    it("should handle directory option", () => {
      fs.writeFileSync(Path.join(subDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir, dir: "subdir" });
      expect(result.found).to.be.true;
      expect(result.xrunFile).to.match(/xrun-tasks\.js$/);
      expect(result.dir).to.equal(subDir);
    });

    it("should update cwd when task file is found during search", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const opts = { cwd: subSubDir };
      const result = searchTaskFile(true, opts);
      expect(result.found).to.be.true;
      expect(result.dir).to.equal(testDir);
      expect(opts.cwd).to.equal(testDir);
    });

    it("should not update cwd when search is false", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const opts = { cwd: subSubDir };
      const result = searchTaskFile(false, opts);
      expect(result.found).to.be.false;
      expect(opts.cwd).to.equal(subSubDir);
    });
  });

  describe("updateCwd", function() {
    let originalCwd;
    let originalEnvCwd;
    let mockCwd;
    let exitCode;

    beforeEach(() => {
      originalCwd = process.cwd();
      originalEnvCwd = env.get(env.xrunCwd);
      mockCwd = originalCwd;

      // Mock WrapProcess
      WrapProcess.cwd = () => mockCwd;
      WrapProcess.chdir = dir => {
        mockCwd = dir;
      };
      WrapProcess.exit = code => {
        exitCode = code;
      };
    });

    afterEach(() => {
      env.set(env.xrunCwd, originalEnvCwd);
    });

    it("should use process.cwd() when dir is not provided", () => {
      const result = updateCwd();
      expect(result).to.equal(mockCwd);
      expect(env.get(env.xrunCwd)).to.equal(mockCwd);
    });

    it("should use process.cwd() when dir is undefined", () => {
      const result = updateCwd(undefined);
      expect(result).to.equal(mockCwd);
      expect(env.get(env.xrunCwd)).to.equal(mockCwd);
    });

    it("should use process.cwd() when dir is null", () => {
      const result = updateCwd(null);
      expect(result).to.equal(mockCwd);
      expect(env.get(env.xrunCwd)).to.equal(mockCwd);
    });

    it("should use process.cwd() when dir is empty string", () => {
      const result = updateCwd("");
      expect(result).to.equal(mockCwd);
      expect(env.get(env.xrunCwd)).to.equal(mockCwd);
    });

    it("should resolve relative paths to absolute", () => {
      const relPath = "./test";
      const absPath = Path.resolve(relPath);
      const result = updateCwd(relPath);
      expect(result).to.equal(absPath);
      expect(env.get(env.xrunCwd)).to.equal(absPath);
      expect(mockCwd).to.equal(absPath);
    });

    it("should resolve parent directory paths", () => {
      const relPath = "../";
      const absPath = Path.resolve(relPath);
      const result = updateCwd(relPath);
      expect(result).to.equal(absPath);
      expect(env.get(env.xrunCwd)).to.equal(absPath);
      expect(mockCwd).to.equal(absPath);
    });

    it("should resolve complex relative paths", () => {
      const relPath = "./test/../other/./path";
      const absPath = Path.resolve(relPath);
      const result = updateCwd(relPath);
      expect(result).to.equal(absPath);
      expect(env.get(env.xrunCwd)).to.equal(absPath);
      expect(mockCwd).to.equal(absPath);
    });

    it("should keep absolute paths as is", () => {
      const absPath = Path.resolve("./test"); // Create an absolute path for testing
      const result = updateCwd(absPath);
      expect(result).to.equal(absPath);
      expect(env.get(env.xrunCwd)).to.equal(absPath);
      expect(mockCwd).to.equal(absPath);
    });

    it("should normalize path separators", () => {
      const mixedPath = "test\\subdir/path";
      const normalizedPath = Path.resolve(mixedPath);
      const result = updateCwd(mixedPath);
      expect(result).to.equal(normalizedPath);
      expect(env.get(env.xrunCwd)).to.equal(normalizedPath);
      expect(mockCwd).to.equal(normalizedPath);
    });

    it("should exit when directory doesn't exist", () => {
      const nonExistentDir = Path.join(process.cwd(), "non-existent-dir");
      WrapProcess.chdir = () => {
        throw new Error("ENOENT");
      };
      updateCwd(nonExistentDir);
      expect(exitCode).to.equal(1);
    });

    it("should exit when path is not a directory", () => {
      const filePath = __filename; // Current test file path
      WrapProcess.chdir = () => {
        throw new Error("ENOTDIR");
      };
      updateCwd(filePath);
      expect(exitCode).to.equal(1);
    });

    it("should update env.xrunCwd even when directory hasn't changed", () => {
      const currentCwd = mockCwd;
      env.set(env.xrunCwd, "some-other-path"); // Set to different value
      const result = updateCwd(currentCwd);
      expect(result).to.equal(currentCwd);
      expect(env.get(env.xrunCwd)).to.equal(currentCwd);
      expect(mockCwd).to.equal(currentCwd);
    });

    it("should handle symlinked directories", function() {
      // Skip on Windows as symlinks might require special permissions
      if (process.platform === "win32") {
        this.skip();
        return;
      }

      const tempDir = Path.join(process.cwd(), "temp-test-dir");
      const symlinkPath = Path.join(process.cwd(), "temp-test-link");

      try {
        // Create a temporary directory and symlink
        fs.mkdirSync(tempDir, { recursive: true });
        fs.symlinkSync(tempDir, symlinkPath);

        const result = updateCwd(symlinkPath);
        expect(result).to.equal(symlinkPath);
        expect(env.get(env.xrunCwd)).to.equal(symlinkPath);
        expect(mockCwd).to.equal(symlinkPath);
      } finally {
        // Cleanup
        try {
          fs.unlinkSync(symlinkPath);
          fs.rmdirSync(tempDir);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  });
});
