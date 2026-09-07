import { expect } from "vitest";
import Path from "path";
import fs from "fs";
import os from "os";
import { parseArgs } from "../../../cli/parse-cmd-args.js";
import env from "../../../cli/env.js";
import logger from "../../../lib/logger.js";
import WrapProcess from "../../../cli/wrap-process.js";
import { updateCwd, searchTaskFile } from "../../../cli/task-file.js";
import ownInstance from "../../../lib/xrun-instance.js";

// Suppress logging during tests
logger.quiet(true);

describe("parse-cmd-args", function() {
  let originalWrapProcess;
  let originalCwd;

  beforeEach(() => {
    originalCwd = process.cwd();
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
    try {
      process.chdir(originalCwd);
    } catch {
      // ignore if already deleted
    }
    ownInstance.reset();
    // Restore original WrapProcess
    Object.assign(WrapProcess, originalWrapProcess);
  });

  // Note: The exit handler in parse-cmd-args.js (line 67-69) is excluded from coverage
  // because NixClap v2 handles --version and --help internally without calling
  // the custom exit handler. It's marked with /* istanbul ignore next */

  describe("task parsing", () => {
    it("parses tasks after --", async () => {
      const args = ["node", "xrun", "task1", "task2"];
      const result = await parseArgs(args, 2);
      expect(result.tasks).toStrictEqual(["task1", "task2"]);
    });

    it("handles task arguments", async () => {
      const args = ["node", "xrun", "task1", "--task-opt=value", "task2"];
      const result = await parseArgs(args, 2);
      expect(result.tasks).toStrictEqual(["task1", "task2"]);
      expect(result.parsed.command.subCmdNodes.task1.opts.taskOpt).toBe("value");
    });

    it("maps task option alias and consumes value without task leakage (FJM-131)", async () => {
      const args = ["node", "xrun", ".arg-opts", "-f", "world"];
      const result = await parseArgs(args, 2);
      expect(result.tasks).toStrictEqual([".arg-opts"]);
      expect(result.parsed.command.subCmdNodes[".arg-opts"].opts.foo).toBe("world");
      expect(result.parsed.command.subCmdNodes[".arg-opts"].opts.f).toBe("world");
    });

    it("fails when required task option is omitted (FJM-131)", async () => {
      let exitCode;
      WrapProcess.exit = code => {
        exitCode = code;
      };
      const args = ["node", "xrun", ".arg-opts"];
      const result = await parseArgs(args, 2);
      expect(exitCode).toBe(1);
      expect(result.parsed.errorNodes.length).toBeGreaterThan(0);
    });

    it("does not register exec options as CLI options (FJM-191)", async () => {
      const tempDir = Path.join(import.meta.dirname, "../../../.temp", `task-exec-opts-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const pkgPath = Path.join(tempDir, "package.json");
      fs.writeFileSync(pkgPath, JSON.stringify({ name: "test-exec-opts", version: "1.0.0" }));
      const taskPath = Path.join(tempDir, "xrun-tasks.mjs");
      fs.writeFileSync(
        taskPath,
        `export default xrun => { xrun.load({ hello: xrun.exec("echo $FOO", { env: { FOO: "bar" } }) }); };\n`
      );
      try {
        const args = ["node", "xrun", "--cwd", tempDir, "hello"];
        const result = await parseArgs(args, 2);
        expect(result.tasks).toStrictEqual(["hello"]);
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("surfaces subcommand registration errors as a clean CLI error (FJM-191)", async () => {
      let exitCode;
      WrapProcess.exit = code => {
        exitCode = code;
      };
      const tempDir = Path.join(import.meta.dirname, "../../../.temp", `task-dup-opt-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const pkgPath = Path.join(tempDir, "package.json");
      fs.writeFileSync(pkgPath, JSON.stringify({ name: "test-dup-opt", version: "1.0.0" }));
      const taskPath = Path.join(tempDir, "xrun-tasks.mjs");
      fs.writeFileSync(
        taskPath,
        `export default xrun => { xrun.load({ bad: { argOpts: { env: { args: "<val string>" } }, task: () => {} } }); };\n`
      );
      try {
        const args = ["node", "xrun", "--cwd", tempDir, "bad"];
        const result = await parseArgs(args, 2);
        expect(exitCode).toBe(1);
        expect(result.parsed.errorNodes.length).toBeGreaterThan(0);
        expect(result.parsed.errorNodes[0].errors[0].message).toContain("already used by parent");
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("env option parsing", () => {
    it("should handle when no --env option is provided", async () => {
      const args = ["node", "xrun", "task1"];
      const result = await parseArgs(args, 2);
      expect(result.opts.env).toBeUndefined();
    });
  });

  describe("task file handling", () => {
    it("finds task file in specified directory", async () => {
      const args = ["node", "xrun", "task1"];
      const result = await parseArgs(args, 2);
      expect(result.searchResult.found).toBe(true);
      expect(result.searchResult.xrunFile).toMatch(/xrun-tasks\.js$/);
    });
  });

  describe("searchTaskFile", function() {
    let testDir;
    let subDir;
    let subSubDir;
    let mockCwd;
    let saveCwd;
    let counter = 0;

    beforeEach(() => {
      // Create test directory structure in a temporary directory
      testDir = Path.join(os.tmpdir(), `xarc-run-test-${Date.now()}-${counter++}`);
      subDir = Path.join(testDir, "subdir");
      subSubDir = Path.join(subDir, "subsubdir");

      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(subDir, { recursive: true });
      fs.mkdirSync(subSubDir, { recursive: true });

      // Save current directory
      saveCwd = process.cwd();

      // Mock WrapProcess
      mockCwd = saveCwd;
      WrapProcess.cwd = () => mockCwd;
      WrapProcess.chdir = dir => {
        mockCwd = dir;
      };
    });

    afterEach(() => {
      // Restore WrapProcess
      Object.assign(WrapProcess, originalWrapProcess);

      // Change directory back BEFORE deleting to avoid ENOTEMPTY errors
      // Ensure we're in a valid directory first
      if (saveCwd && fs.existsSync(saveCwd)) {
        try {
          process.chdir(saveCwd);
        } catch (e) {
          // If chdir fails, try to go to temp dir as fallback
          process.chdir(os.tmpdir());
        }
      } else {
        // Fallback to temp dir if saveCwd doesn't exist
        process.chdir(os.tmpdir());
      }

      // Now safe to delete test directory
      if (testDir && fs.existsSync(testDir)) {
        try {
          fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    it("should find xrun-tasks.js in current directory", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toMatch(/xrun-tasks\.js$/);
      expect(result.dir).toBe(testDir);
    });

    it("should find xrun.ts in current directory", () => {
      fs.writeFileSync(Path.join(testDir, "xrun.ts"), "export default {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toMatch(/xrun\.ts$/);
      expect(result.dir).toBe(testDir);
    });

    it("should search up directories when search is true", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: subSubDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toMatch(/xrun-tasks\.js$/);
      expect(result.dir).toBe(testDir);
    });

    it("should stop searching at package.json even if no task file found", () => {
      fs.writeFileSync(Path.join(subDir, "package.json"), "{}");
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: subSubDir });
      expect(result.found).toBe(false);
      expect(result.foundPkg).toBe(true);
      expect(result.dir).toBe(subSubDir); // The search stops but we keep original dir
    });

    it("should not search up when search is false", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(false, { cwd: subSubDir });
      expect(result.found).toBe(false);
      expect(result.dir).toBe(subSubDir);
    });

    it("should handle directory with no task file", () => {
      // Create a package.json to stop the search from going up to project root
      fs.writeFileSync(Path.join(testDir, "package.json"), "{}");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(false);
      expect(result.foundPkg).toBe(true);  // Found the package.json we created
      expect(result.dir).toBe(testDir); // Keep original dir when nothing is found
    });

    it("should handle directory option", () => {
      fs.writeFileSync(Path.join(subDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir, dir: "subdir" });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toMatch(/xrun-tasks\.js$/);
      expect(result.dir).toBe(subDir);
    });

    it("should update cwd when task file is found during search", () => {
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = {};");
      const opts = { cwd: subSubDir };
      const result = searchTaskFile(true, opts);
      expect(result.found).toBe(true);
      expect(result.dir).toBe(testDir);
      expect(result.cwd).toBe(testDir);
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
      expect(result).toBe(mockCwd);
      expect(env.get(env.xrunCwd)).toBe(mockCwd);
    });

    it("should use process.cwd() when dir is undefined", () => {
      const result = updateCwd(undefined);
      expect(result).toBe(mockCwd);
      expect(env.get(env.xrunCwd)).toBe(mockCwd);
    });

    it("should use process.cwd() when dir is null", () => {
      const result = updateCwd(null);
      expect(result).toBe(mockCwd);
      expect(env.get(env.xrunCwd)).toBe(mockCwd);
    });

    it("should use process.cwd() when dir is empty string", () => {
      const result = updateCwd("");
      expect(result).toBe(mockCwd);
      expect(env.get(env.xrunCwd)).toBe(mockCwd);
    });

    it("should resolve relative paths to absolute", () => {
      const relPath = "./test";
      const absPath = Path.resolve(relPath);
      const result = updateCwd(relPath);
      expect(result).toBe(absPath);
      expect(env.get(env.xrunCwd)).toBe(absPath);
      expect(mockCwd).toBe(absPath);
    });

    it("should resolve parent directory paths", () => {
      const relPath = "../";
      const absPath = Path.resolve(relPath);
      const result = updateCwd(relPath);
      expect(result).toBe(absPath);
      expect(env.get(env.xrunCwd)).toBe(absPath);
      expect(mockCwd).toBe(absPath);
    });

    it("should resolve complex relative paths", () => {
      const relPath = "./test/../other/./path";
      const absPath = Path.resolve(relPath);
      const result = updateCwd(relPath);
      expect(result).toBe(absPath);
      expect(env.get(env.xrunCwd)).toBe(absPath);
      expect(mockCwd).toBe(absPath);
    });

    it("should keep absolute paths as is", () => {
      const absPath = Path.resolve("./test"); // Create an absolute path for testing
      const result = updateCwd(absPath);
      expect(result).toBe(absPath);
      expect(env.get(env.xrunCwd)).toBe(absPath);
      expect(mockCwd).toBe(absPath);
    });

    it("should normalize path separators", () => {
      const mixedPath = "test\\subdir/path";
      const normalizedPath = Path.resolve(mixedPath);
      const result = updateCwd(mixedPath);
      expect(result).toBe(normalizedPath);
      expect(env.get(env.xrunCwd)).toBe(normalizedPath);
      expect(mockCwd).toBe(normalizedPath);
    });

    it("should exit when directory doesn't exist", () => {
      const nonExistentDir = Path.join(process.cwd(), "non-existent-dir");
      WrapProcess.chdir = () => {
        throw new Error("ENOENT");
      };
      updateCwd(nonExistentDir);
      expect(exitCode).toBe(1);
    });

    it("should exit when path is not a directory", () => {
      const filePath = __filename; // Current test file path
      WrapProcess.chdir = () => {
        throw new Error("ENOTDIR");
      };
      updateCwd(filePath);
      expect(exitCode).toBe(1);
    });

    it("should update env.xrunCwd even when directory hasn't changed", () => {
      const currentCwd = mockCwd;
      env.set(env.xrunCwd, "some-other-path"); // Set to different value
      const result = updateCwd(currentCwd);
      expect(result).toBe(currentCwd);
      expect(env.get(env.xrunCwd)).toBe(currentCwd);
      expect(mockCwd).toBe(currentCwd);
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
        expect(result).toBe(symlinkPath);
        expect(env.get(env.xrunCwd)).toBe(symlinkPath);
        expect(mockCwd).toBe(symlinkPath);
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
