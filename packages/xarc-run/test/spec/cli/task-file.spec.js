import { expect } from "vitest";
import Path from "path";
import fs from "fs";
import os from "os";
import {
  updateCwd,
  searchTaskFile,
  loadTaskFile,
  processTasks,
  loadTasks
} from "../../../cli/task-file.js";
import env from "../../../cli/env.js";
import xrunInstance from "../../../lib/xrun-instance.js";
import logger from "../../../lib/logger.js";
import stripAnsi from "strip-ansi";
import WrapProcess from "../../../cli/wrap-process.js";
import xstdout from "xstdout";
import { verify } from "run-verify";

logger.quiet(true);

describe("task-file", function() {
  let testDir;
  let testEnv;
  let saveCwd;
  let xrun;
  let counter = 0;
  let originalWrapProcess;
  let mockProcess;

  beforeEach(() => {
    testDir = Path.join(os.tmpdir(), `xarc-run-test-${Date.now()}-${counter++}`);
    fs.mkdirSync(testDir, { recursive: true });
    saveCwd = process.cwd();
    process.chdir(testDir);

    testEnv = { ...process.env };
    env.container = testEnv;

    // Save original WrapProcess
    originalWrapProcess = Object.assign({}, WrapProcess);

    // Create mock process
    let mockCwd = testDir;
    mockProcess = {
      cwd: () => mockCwd,
      chdir: (dir) => {
        mockCwd = dir;
        process.chdir(dir); // Also change real process for fs operations
      },
      exit: (code) => {
        throw new Error(`Mock exit: ${code}`);
      },
      env: testEnv,
      argv: process.argv
    };

    // Set WrapProcess to use mock
    WrapProcess._process = mockProcess;
    WrapProcess.cwd = () => mockProcess.cwd();
    WrapProcess.chdir = (dir) => mockProcess.chdir(dir);
    WrapProcess.exit = (code) => mockProcess.exit(code);

    xrunInstance.reset();
    xrun = xrunInstance.xrun;
  });

  afterEach(() => {
    env.container = process.env;

    // Restore original WrapProcess
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

  describe("updateCwd", () => {
    it("should update current working directory", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      const newCwd = updateCwd(subDir);
      expect(newCwd).toBe(subDir);
      expect(mockProcess.cwd()).toBe(subDir);
      expect(env.get(env.xrunCwd)).toBe(subDir);
    });

    it("should handle relative paths", () => {
      const subDir = "subdir";
      fs.mkdirSync(subDir);
      const newCwd = updateCwd(subDir);
      const expectedPath = fs.realpathSync(Path.resolve(testDir, subDir));
      expect(fs.realpathSync(newCwd)).toBe(expectedPath);
      expect(fs.realpathSync(mockProcess.cwd())).toBe(expectedPath);
    });

    it("should use current directory when no dir provided", () => {
      const newCwd = updateCwd();
      expect(newCwd).toBe(testDir);
    });
  });

  describe("searchTaskFile", () => {
    it("should find task file in current directory", () => {
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(testDir, "xrun-tasks.js"));
    });

    it("should find task file in parent directory when search is true", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      const result = searchTaskFile(true, { cwd: subDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(testDir, "xrun-tasks.js"));
    });

    it("should not find task file in parent directory when search is false", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      const result = searchTaskFile(false, { cwd: subDir });
      expect(result.found).toBe(false);
    });

    it("should update cwd when task file is found during search", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      // Change mock to start in subDir
      mockProcess.chdir(subDir);
      const opts = { cwd: subDir };
      const result = searchTaskFile(true, opts);
      expect(result.found).toBe(true);
      expect(result.cwd).toBe(testDir);
      expect(mockProcess.cwd()).toBe(testDir);  // Verify WrapProcess.chdir was called
    });

    it("should avoid logging not found message when env.xrunTaskFile is already set to not found", () => {
      // Create a subdirectory where we know there won't be any xrun-tasks.js file
      const subDir = Path.join(testDir, "empty-subdir");
      fs.mkdirSync(subDir);

      // Create a spy on logger.log to track calls
      let logMessages = [];
      const originalLog = logger.log;
      logger.log = msg => logMessages.push(msg);

      try {
        // First call should log the not found message
        searchTaskFile(true, { cwd: subDir });
        expect(logMessages).toHaveLength(1);
        expect(stripAnsi(logMessages[0])).toContain("No xrun-tasks.js found");
        expect(env.get(env.xrunTaskFile)).toBe("not found");

        // Reset log messages
        logMessages = [];

        // Second call should not log the not found message
        searchTaskFile(true, { cwd: subDir });
        expect(logMessages).toHaveLength(0);
        expect(env.get(env.xrunTaskFile)).toBe("not found");
      } finally {
        // Restore original logger
        logger.log = originalLog;
      }
    });

    it("should not update cwd when task file is found but opts.updateCwd is false", () => {
      // Save the original project root directory where xrun-tasks.js exists
      const projectRoot = Path.resolve(import.meta.dirname, "../../..");

      // Create a test directory under test/
      const testSubDir = Path.join(projectRoot, "test/test-no-update-cwd");
      fs.mkdirSync(testSubDir, { recursive: true });

      try {
        // Change mock to the test directory
        const originalCwd = mockProcess.cwd();
        mockProcess.chdir(testSubDir);

        // Run searchTaskFile with updateCwd=false
        const opts = { cwd: testSubDir, updateCwd: false };
        const result = searchTaskFile(true, opts);

        // Verify that:
        // 1. The task file was found (since it exists in project root)
        // 2. The cwd was not changed
        expect(result.found).toBe(true);
        expect(result.xrunFile).toBe(Path.join(projectRoot, "xrun-tasks.js"));
        expect(mockProcess.cwd()).toBe(testSubDir);

        // Change back to original directory
        mockProcess.chdir(originalCwd);
      } finally {
        // Clean up the test directory
        fs.rmSync(testSubDir, { recursive: true, force: true });
      }
    });
  });

  describe("searchTaskFile in subdirectories", () => {
    it("should find task file in scripts/ subdirectory", () => {
      const scriptsDir = Path.join(testDir, "scripts");
      fs.mkdirSync(scriptsDir);
      fs.writeFileSync(Path.join(scriptsDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(scriptsDir, "xrun-tasks.js"));
    });

    it("should find task file in tools/ subdirectory", () => {
      const toolsDir = Path.join(testDir, "tools");
      fs.mkdirSync(toolsDir);
      fs.writeFileSync(Path.join(toolsDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(toolsDir, "xrun-tasks.js"));
    });

    it("should find task file in build/ subdirectory", () => {
      const buildDir = Path.join(testDir, "build");
      fs.mkdirSync(buildDir);
      fs.writeFileSync(Path.join(buildDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(buildDir, "xrun-tasks.js"));
    });

    it("should find task file in tasks/ subdirectory", () => {
      const tasksDir = Path.join(testDir, "tasks");
      fs.mkdirSync(tasksDir);
      fs.writeFileSync(Path.join(tasksDir, "xrun-tasks.js"), "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(tasksDir, "xrun-tasks.js"));
    });

    it("should prioritize root directory over subdirectories", () => {
      // Create task file in root
      fs.writeFileSync(Path.join(testDir, "xrun-tasks.js"), "module.exports = { root: true };");
      // Create task file in scripts subdirectory
      const scriptsDir = Path.join(testDir, "scripts");
      fs.mkdirSync(scriptsDir);
      fs.writeFileSync(Path.join(scriptsDir, "xrun-tasks.js"), "module.exports = { scripts: true };");

      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(testDir, "xrun-tasks.js"));
    });

    it("should prioritize scripts/ over tools/ subdirectory", () => {
      const scriptsDir = Path.join(testDir, "scripts");
      const toolsDir = Path.join(testDir, "tools");
      fs.mkdirSync(scriptsDir);
      fs.mkdirSync(toolsDir);
      fs.writeFileSync(Path.join(scriptsDir, "xrun-tasks.js"), "module.exports = { scripts: true };");
      fs.writeFileSync(Path.join(toolsDir, "xrun-tasks.js"), "module.exports = { tools: true };");

      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(scriptsDir, "xrun-tasks.js"));
    });

    it("should prioritize tools/ over build/ subdirectory", () => {
      const toolsDir = Path.join(testDir, "tools");
      const buildDir = Path.join(testDir, "build");
      fs.mkdirSync(toolsDir);
      fs.mkdirSync(buildDir);
      fs.writeFileSync(Path.join(toolsDir, "xrun-tasks.js"), "module.exports = { tools: true };");
      fs.writeFileSync(Path.join(buildDir, "xrun-tasks.js"), "module.exports = { build: true };");

      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(toolsDir, "xrun-tasks.js"));
    });

    it("should prioritize build/ over tasks/ subdirectory", () => {
      const buildDir = Path.join(testDir, "build");
      const tasksDir = Path.join(testDir, "tasks");
      fs.mkdirSync(buildDir);
      fs.mkdirSync(tasksDir);
      fs.writeFileSync(Path.join(buildDir, "xrun-tasks.js"), "module.exports = { build: true };");
      fs.writeFileSync(Path.join(tasksDir, "xrun-tasks.js"), "module.exports = { tasks: true };");

      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(buildDir, "xrun-tasks.js"));
    });

    it("should handle missing subdirectories gracefully", () => {
      // No task file anywhere
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(false);
    });

    it("should find task file with different extensions in subdirectories", () => {
      const scriptsDir = Path.join(testDir, "scripts");
      fs.mkdirSync(scriptsDir);
      fs.writeFileSync(Path.join(scriptsDir, "xrun.ts"), "export default {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).toBe(true);
      expect(result.xrunFile).toBe(Path.join(scriptsDir, "xrun.ts"));
    });
  });

  describe("loadTaskFile", () => {
    it("should load JavaScript task file", async () => {
      fs.writeFileSync("tasks.js", "module.exports = { foo: 'bar' };");
      const tasks = await loadTaskFile(Path.join(testDir, "tasks.js"));
      // loading goes through import(), so a CommonJS file arrives as a namespace with its
      // module.exports on .default - the shape processTasks unwraps
      expect(tasks.default).toStrictEqual({ foo: "bar" });
    });

    it("should handle non-existent file", async () => {
      const tasks = await loadTaskFile(Path.join(testDir, "non-existent.js"));
      expect(tasks).toBeUndefined();
    });

    // TODO: This test has process.cwd() issues with vitest - test isolation problem
    it("should handle TypeScript file load error", () => {
      const tsFile = Path.join(testDir, "tasks.ts");
      // Write invalid TypeScript that will cause a syntax error
      fs.writeFileSync(
        tsFile,
        `
function export const tasks = {
  foo: () => x
};
`
      );

      // Intercept error output to keep it within the test
      const intercept = xstdout.intercept(true);

      return verify({ cleanup: () => intercept.restore() })
        .step(() => loadTaskFile(tsFile))
        .step(result => {
          intercept.restore();

          // Verify the function handles the error gracefully
          expect(result).toBeUndefined();
          // Verify that an error was logged (expected behavior)
          const errorOutput = intercept.stdout.join("");
          expect(errorOutput).toContain("Unable to load");
          expect(errorOutput).toContain("tasks.ts");
        });
    });

    it("should handle ESM TypeScript file", () => {
      const tsFile = Path.join(testDir, "tasks.ts");
      // Write TypeScript using ESM syntax (with invalid syntax)
      fs.writeFileSync(
        tsFile,
        `
export const function tasks = {
  foo: () => "bar"
};
export default tasks;
`
      );

      // Intercept error output to keep it within the test
      const intercept = xstdout.intercept(true);

      return verify({ cleanup: () => intercept.restore() })
        .step(() => loadTaskFile(tsFile))
        .step(result => {
          intercept.restore();

          // Verify the function handles the error gracefully
          expect(result).toBeUndefined();
          // Verify that an error was logged (expected behavior)
          const errorOutput = intercept.stdout.join("");
          expect(errorOutput).toContain("Unable to load");
          expect(errorOutput).toContain("tasks.ts");
        });
    });
  });

  describe("processTasks", () => {
    it("should process function tasks", () => {
      const tasks = xrun => {
        xrun.load("test", { foo: "bar" });
      };
      processTasks(tasks, "test tasks");
      expect(xrun._tasks._tasks["test"].foo).toBe("bar");
    });

    it("should not log message for function tasks when loadMsg is falsy", () => {
      // Create a spy on logger.log to track calls
      let logMessages = [];
      const originalLog = logger.log;
      logger.log = msg => logMessages.push(msg);

      try {
        // Create a function task
        const tasks = xrun => {
          xrun.load("test", { foo: "bar" });
        };

        // Process tasks with falsy loadMsg
        processTasks(tasks, ""); // test empty string
        processTasks(tasks, null); // test null
        processTasks(tasks, undefined); // test undefined
        processTasks(tasks, false); // test false

        // Verify no messages were logged
        expect(logMessages).toHaveLength(0);

        // Verify tasks were still processed
        expect(xrun._tasks._tasks["test"].foo).toBe("bar");
      } finally {
        // Restore original logger
        logger.log = originalLog;
      }
    });

    it("should not log message for empty object tasks when loadMsg is falsy", () => {
      // Create a spy on logger.log to track calls
      let logMessages = [];
      const originalLog = logger.log;
      logger.log = msg => logMessages.push(msg);

      try {
        // Create an empty object task
        const tasks = {};

        // Process tasks with falsy loadMsg
        processTasks(tasks, ""); // test empty string
        processTasks(tasks, null); // test null
        processTasks(tasks, undefined); // test undefined
        processTasks(tasks, false); // test false

        // Verify no messages were logged
        expect(logMessages).toHaveLength(0);
      } finally {
        // Restore original logger
        logger.log = originalLog;
      }
    });

    it("should process object tasks", () => {
      const tasks = {
        foo: "bar",
        baz: ["qux"]
      };
      processTasks(tasks, "test tasks", "test");
      expect(xrun._tasks._tasks["test"].foo).toBe("bar");
      expect(xrun._tasks._tasks["test"].baz).toStrictEqual(["qux"]);
    });

    it("should process default export", () => {
      const tasks = {
        default: {
          foo: "bar"
        }
      };
      processTasks(tasks, "test tasks", "test");
      expect(xrun._tasks._tasks["test"].foo).toBe("bar");
    });

    it("should handle empty object tasks", () => {
      const tasks = {};
      processTasks(tasks, "empty tasks", "test");
      // Verify that the namespace exists but has no tasks
      // expect(typeof xrun._tasks._tasks["test"]).toBe("object");
      // expect(Object.keys(xrun._tasks._tasks["test"])).toHaveLength(0);
    });

    it("should handle unknown type tasks", () => {
      const tasks = "not valid tasks";
      processTasks(tasks, "invliad tasks", "test");
      // Verify that the namespace exists but has no tasks
      // expect(typeof xrun._tasks._tasks["test"]).toBe("object");
      // expect(Object.keys(xrun._tasks._tasks["test"])).toHaveLength(0);
    });
  });

  describe("loadTasks", () => {
    it("should load tasks from task file", async () => {
      fs.writeFileSync("xrun-tasks.js", "module.exports = { foo: 'bar' };");
      const searchResult = { found: true, xrunFile: Path.join(testDir, "xrun-tasks.js") };
      const loaded = await loadTasks({}, searchResult);
      expect(loaded).toBe(true);
      expect(xrun._tasks._tasks["xrun"].foo).toBe("bar");
    });

    it("should load tasks from required module", async () => {
      fs.writeFileSync("custom-tasks.js", "module.exports = { foo: 'bar' };");
      const loaded = await loadTasks({ require: ["./custom-tasks.js"] }, {});
      expect(loaded).toBe(true);
      expect(xrun._tasks._tasks["xrun"].foo).toBe("bar");
    });

    it("should report a task file that throws, with its stack", async () => {
      const errors = [];
      const origError = logger.error;
      logger.error = (...args) => errors.push(args.join(" "));

      try {
        const file = Path.join(testDir, "boom-tasks.js");
        fs.writeFileSync(file, `throw new Error("boom in task file");\n`);

        expect(await loadTaskFile(file)).toBeUndefined();

        const output = stripAnsi(errors.join("\n"));
        expect(output).toContain("Unable to load");
        expect(output).toContain("boom in task file");
      } finally {
        logger.error = origError;
      }
    });

    it("should handle non-existent required module", async () => {
      const loaded = await loadTasks({ require: ["./non-existent.js"] }, {});
      expect(loaded).toBe(false);
    });

    it("should load both npm scripts and task file", async () => {
      fs.writeFileSync(
        "package.json",
        JSON.stringify({
          scripts: {
            test: "mocha"
          }
        })
      );
      fs.writeFileSync("xrun-tasks.js", "module.exports = { foo: 'bar' };");
      const searchResult = { found: true, xrunFile: Path.join(testDir, "xrun-tasks.js") };
      await loadTasks({}, searchResult);
      expect(xrun._tasks._tasks["npm"].test.cmd).toBe("mocha");
      expect(xrun._tasks._tasks["xrun"].foo).toBe("bar");
    });
  });
});
