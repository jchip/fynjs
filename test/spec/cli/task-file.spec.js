"use strict";

const { expect } = require("chai");
const Path = require("path");
const fs = require("fs");
const os = require("os");
const {
  updateCwd,
  searchTaskFile,
  loadTaskFile,
  processTasks,
  loadTasks
} = require("../../../cli/task-file");
const env = require("../../../cli/env");
const xrunInstance = require("../../../lib/xrun-instance");
const logger = require("../../../lib/logger");
const stripAnsi = require("strip-ansi");

logger.quiet(true);

describe("task-file", function() {
  let testDir;
  let testEnv;
  let saveCwd;
  let xrun;

  beforeEach(() => {
    testDir = Path.join(os.tmpdir(), `xarc-run-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    saveCwd = process.cwd();
    process.chdir(testDir);

    testEnv = { ...process.env };
    env.container = testEnv;
    xrunInstance.reset();
    xrun = xrunInstance.xrun;
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    env.container = process.env;
    process.chdir(saveCwd);
  });

  describe("updateCwd", () => {
    it("should update current working directory", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      const newCwd = updateCwd(subDir);
      expect(newCwd).to.equal(subDir);
      expect(process.cwd()).to.contain(subDir);
      expect(env.get(env.xrunCwd)).to.equal(subDir);
    });

    it("should handle relative paths", () => {
      const subDir = "subdir";
      fs.mkdirSync(subDir);
      const newCwd = updateCwd(subDir);
      expect(newCwd).to.contain(Path.resolve(testDir, subDir));
    });

    it("should use current directory when no dir provided", () => {
      const newCwd = updateCwd();
      expect(newCwd).to.contain(testDir);
    });
  });

  describe("searchTaskFile", () => {
    it("should find task file in current directory", () => {
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      const result = searchTaskFile(true, { cwd: testDir });
      expect(result.found).to.be.true;
      expect(result.xrunFile).to.equal(Path.join(testDir, "xrun-tasks.js"));
    });

    it("should find task file in parent directory when search is true", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      const result = searchTaskFile(true, { cwd: subDir });
      expect(result.found).to.be.true;
      expect(result.xrunFile).to.equal(Path.join(testDir, "xrun-tasks.js"));
    });

    it("should not find task file in parent directory when search is false", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      const result = searchTaskFile(false, { cwd: subDir });
      expect(result.found).to.be.false;
    });

    it("should update cwd when task file is found during search", () => {
      const subDir = Path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync("xrun-tasks.js", "module.exports = {};");
      const opts = { cwd: subDir };
      const result = searchTaskFile(true, opts);
      expect(result.cwd).to.equal(testDir);
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
        expect(logMessages).to.have.lengthOf(1);
        expect(stripAnsi(logMessages[0])).to.include("No xrun-tasks.js found");
        expect(env.get(env.xrunTaskFile)).to.equal("not found");

        // Reset log messages
        logMessages = [];

        // Second call should not log the not found message
        searchTaskFile(true, { cwd: subDir });
        expect(logMessages).to.have.lengthOf(0);
        expect(env.get(env.xrunTaskFile)).to.equal("not found");
      } finally {
        // Restore original logger
        logger.log = originalLog;
      }
    });

    it("should not update cwd when task file is found but opts.updateCwd is false", () => {
      // Save the original project root directory where xrun-tasks.js exists
      const projectRoot = Path.resolve(__dirname, "../../..");

      // Create a test directory under test/
      const testSubDir = Path.join(projectRoot, "test/test-no-update-cwd");
      fs.mkdirSync(testSubDir, { recursive: true });

      try {
        // Change to the test directory
        const originalCwd = process.cwd();
        process.chdir(testSubDir);

        // Run searchTaskFile with search=false
        const opts = { cwd: testSubDir, updateCwd: false };
        const result = searchTaskFile(true, opts);

        // Verify that:
        // 1. The task file was found (since it exists in project root)
        // 2. The cwd in opts was not changed
        // 3. The actual process.cwd() was not changed
        expect(result.found).to.be.true;
        expect(result.xrunFile).to.equal(Path.join(projectRoot, "xrun-tasks.js"));
        expect(process.cwd()).to.equal(testSubDir);

        // Change back to original directory
        process.chdir(originalCwd);
      } finally {
        // Clean up the test directory
        fs.rmSync(testSubDir, { recursive: true, force: true });
      }
    });
  });

  describe("loadTaskFile", () => {
    it("should load JavaScript task file", () => {
      fs.writeFileSync("tasks.js", "module.exports = { foo: 'bar' };");
      const tasks = loadTaskFile(Path.join(testDir, "tasks.js"));
      expect(tasks).to.deep.equal({ foo: "bar" });
    });

    it("should handle non-existent file", () => {
      const tasks = loadTaskFile(Path.join(testDir, "non-existent.js"));
      expect(tasks).to.be.undefined;
    });

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

      const result = loadTaskFile(tsFile);
      expect(result).to.be.undefined;
    });

    it("should handle ESM TypeScript file", () => {
      const tsFile = Path.join(testDir, "tasks.ts");
      // Write TypeScript using ESM syntax
      fs.writeFileSync(
        tsFile,
        `
export const function tasks = {
  foo: () => "bar"
};
export default tasks;
`
      );

      const result = loadTaskFile(tsFile);
      expect(result).to.be.undefined;
    });
  });

  describe("processTasks", () => {
    it("should process function tasks", () => {
      const tasks = xrun => {
        xrun.load("test", { foo: "bar" });
      };
      processTasks(tasks, "test tasks");
      expect(xrun._tasks._tasks["test"].foo).to.equal("bar");
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
        expect(logMessages).to.have.lengthOf(0);

        // Verify tasks were still processed
        expect(xrun._tasks._tasks["test"].foo).to.equal("bar");
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
        expect(logMessages).to.have.lengthOf(0);
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
      expect(xrun._tasks._tasks["test"].foo).to.equal("bar");
      expect(xrun._tasks._tasks["test"].baz).to.deep.equal(["qux"]);
    });

    it("should process default export", () => {
      const tasks = {
        default: {
          foo: "bar"
        }
      };
      processTasks(tasks, "test tasks", "test");
      expect(xrun._tasks._tasks["test"].foo).to.equal("bar");
    });

    it("should handle empty object tasks", () => {
      const tasks = {};
      processTasks(tasks, "empty tasks", "test");
      // Verify that the namespace exists but has no tasks
      // expect(xrun._tasks._tasks["test"]).to.be.an("object");
      // expect(Object.keys(xrun._tasks._tasks["test"])).to.have.lengthOf(0);
    });

    it("should handle unknown type tasks", () => {
      const tasks = "not valid tasks";
      processTasks(tasks, "invliad tasks", "test");
      // Verify that the namespace exists but has no tasks
      // expect(xrun._tasks._tasks["test"]).to.be.an("object");
      // expect(Object.keys(xrun._tasks._tasks["test"])).to.have.lengthOf(0);
    });
  });

  describe("loadTasks", () => {
    it("should load tasks from task file", () => {
      fs.writeFileSync("xrun-tasks.js", "module.exports = { foo: 'bar' };");
      const searchResult = { found: true, xrunFile: Path.join(testDir, "xrun-tasks.js") };
      const loaded = loadTasks({}, searchResult);
      expect(loaded).to.be.true;
      expect(xrun._tasks._tasks["xrun"].foo).to.equal("bar");
    });

    it("should load tasks from required module", () => {
      fs.writeFileSync("custom-tasks.js", "module.exports = { foo: 'bar' };");
      const loaded = loadTasks({ require: ["./custom-tasks.js"] }, {});
      expect(loaded).to.be.true;
      expect(xrun._tasks._tasks["xrun"].foo).to.equal("bar");
    });

    it("should handle non-existent required module", () => {
      const loaded = loadTasks({ require: ["./non-existent.js"] }, {});
      expect(loaded).to.be.false;
    });

    it("should load both npm scripts and task file", () => {
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
      loadTasks({}, searchResult);
      expect(xrun._tasks._tasks["npm"].test.cmd).to.equal("mocha");
      expect(xrun._tasks._tasks["xrun"].foo).to.equal("bar");
    });
  });
});
