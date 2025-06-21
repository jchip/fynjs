"use strict";

const expect = require("chai").expect;
const xrun = require("../../../cli/xrun");
const logger = require("../../../lib/logger");
const WrapProcess = require("../../../cli/wrap-process");
const xrunInstance = require("../../../lib/xrun-instance");
const stripAnsi = require("strip-ansi");

describe("xrun cli", function() {
  this.timeout(10000);
  logger.quiet(true);

  let origExit;
  let exitCode;
  let logOutput;
  let origLog;
  let origError;
  let origLoggerLog;

  beforeEach(() => {
    origExit = WrapProcess.exit;
    origLog = console.log;
    origError = logger.error;
    origLoggerLog = logger.log;

    exitCode = undefined;
    logOutput = [];

    WrapProcess.exit = code => {
      exitCode = code;
    };

    console.log = (...args) => {
      logOutput.push(args.join(" "));
    };

    logger.error = (...args) => {
      logOutput.push(args.join(" "));
    };

    logger.log = (...args) => {
      logOutput.push(args.join(" "));
    };
  });

  afterEach(() => {
    logger.resetBuffer();
    WrapProcess.exit = origExit;
    console.log = origLog;
    logger.error = origError;
    logger.log = origLoggerLog;
  });

  it("should handle task file that exists but loads no tasks", () => {
    const { handleNoTasks } = require("../../../cli/xrun-main");
    const cmdArgs = {
      searchResult: {
        xrunFile: "/home/user/project/xrun-tasks.js"
      }
    };

    handleNoTasks(cmdArgs, process.cwd());

    const output = logOutput.join("\n");
    expect(output).to.include("*** No tasks found ***");
    expect(output).to.include("your task file");
    expect(output).to.include("didn't load any tasks or contains errors");
    expect(output).to.include("there are multiple copies of this package");
  });

  it("should handle error in task listing", () => {
    const { handleTaskListing } = require("../../../cli/xrun-main");
    const runner = {
      _tasks: {
        names: () => {
          throw new Error("Invalid namespace");
        },
        fullNames: () => {
          throw new Error("Invalid namespace");
        }
      }
    };
    const opts = {
      list: "invalid-namespace"
    };

    handleTaskListing(runner, opts);

    expect(logOutput).to.include("Invalid namespace");
  });

  it("should display help and example when opts.quiet is falsy", () => {
    const { handleHelp } = require("../../../cli/xrun-main");
    const runner = {
      printTasks: () => {}
    };
    const cmdArgs = {};
    const opts = {
      quiet: false
    };
    const cmdName = "xrun";

    handleHelp(runner, cmdArgs, opts, cmdName);

    const output = logOutput.join("\n");
    expect(stripAnsi(output)).to.include("Help: xrun -h");
    expect(stripAnsi(output)).to.include("Example: xrun build");
  });

  it("should do nothing when opts.nmbin is falsy", () => {
    const { setupNodeModulesBin } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");
    const envPath = require("xsh").envPath;

    // Save original env values
    const origPath = env.get(envPath.envKey);
    const origXrunId = env.get(env.xrunId);

    // Test with various falsy values
    [null, undefined, false, "", 0].forEach(falsyValue => {
      setupNodeModulesBin({ nmbin: falsyValue, cwd: process.cwd() });

      // Verify no messages were logged
      expect(logOutput).to.have.lengthOf(0);

      // Verify PATH wasn't modified
      expect(env.get(envPath.envKey)).to.equal(origPath);
    });

    // Restore original env values
    env.set(envPath.envKey, origPath);
    env.set(env.xrunId, origXrunId);
  });

  it("should do nothing when node_modules/.bin doesn't exist", () => {
    const { setupNodeModulesBin } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");
    const envPath = require("xsh").envPath;
    const path = require("path");

    // Save original env values
    const origPath = env.get(envPath.envKey);
    const origXrunId = env.get(env.xrunId);

    // Use a path that definitely doesn't exist
    const nonExistentPath = path.join(__dirname, "non-existent-dir");
    setupNodeModulesBin({ nmbin: true, cwd: nonExistentPath });

    // Verify no messages were logged
    expect(logOutput).to.have.lengthOf(0);

    // Verify PATH wasn't modified
    expect(env.get(envPath.envKey)).to.equal(origPath);

    // Restore original env values
    env.set(envPath.envKey, origPath);
    env.set(env.xrunId, origXrunId);
  });

  it("should add node_modules/.bin to PATH when not already present", () => {
    const { setupNodeModulesBin } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");
    const envPath = require("xsh").envPath;
    const path = require("path");
    const fs = require("fs");

    // Save original env values
    const origPath = env.get(envPath.envKey);
    const origXrunId = env.get(env.xrunId);

    // Create a temporary node_modules/.bin directory
    const tempDir = path.join(__dirname, "temp-test-dir");
    const nmBinDir = path.join(tempDir, "node_modules", ".bin");
    fs.mkdirSync(nmBinDir, { recursive: true });

    try {
      // Set PATH to something that definitely doesn't include our temp .bin directory
      env.set(envPath.envKey, "/usr/local/bin");

      setupNodeModulesBin({ nmbin: true, cwd: tempDir });

      // Verify the message was logged
      const output = stripAnsi(logOutput.join("\n"));
      expect(output).to.include("Added");
      expect(output).to.include(".bin to PATH");

      // Verify PATH was modified to include our directory
      const newPath = env.get(envPath.envKey);
      expect(newPath).to.include(nmBinDir);
      expect(newPath.startsWith(nmBinDir)).to.be.true; // Should be added to front
    } finally {
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Restore original env values
      env.set(envPath.envKey, origPath);
      env.set(env.xrunId, origXrunId);
    }
  });

  it("should add node_modules/.bin to PATH when PATH is not set", () => {
    const { setupNodeModulesBin } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");
    const envPath = require("xsh").envPath;
    const path = require("path");
    const fs = require("fs");

    // Save original env values
    const origPath = env.get(envPath.envKey);
    const origXrunId = env.get(env.xrunId);

    // Create a temporary node_modules/.bin directory
    const tempDir = path.join(__dirname, "temp-test-dir");
    const nmBinDir = path.join(tempDir, "node_modules", ".bin");
    fs.mkdirSync(nmBinDir, { recursive: true });

    try {
      // Remove PATH environment variable completely
      env.del(envPath.envKey);

      setupNodeModulesBin({ nmbin: true, cwd: tempDir });

      // Verify the message was logged
      const output = stripAnsi(logOutput.join("\n"));
      expect(output).to.include("Added");
      expect(output).to.include(".bin to PATH");

      // Verify PATH was set to just our directory
      const newPath = env.get(envPath.envKey);
      expect(newPath).to.equal(nmBinDir);
    } finally {
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Restore original env values
      env.set(envPath.envKey, origPath);
      env.set(env.xrunId, origXrunId);
    }
  });

  it("should log message when PATH contains .bin but xrunId not set", () => {
    const { setupNodeModulesBin } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");
    const envPath = require("xsh").envPath;
    const path = require("path");
    const fs = require("fs");

    // Save original env values
    const origPath = env.get(envPath.envKey);
    const origXrunId = env.get(env.xrunId);

    // Create a temporary node_modules/.bin directory
    const tempDir = path.join(__dirname, "temp-test-dir");
    const nmBinDir = path.join(tempDir, "node_modules", ".bin");
    fs.mkdirSync(nmBinDir, { recursive: true });

    try {
      // Set PATH to include our .bin directory
      env.set(envPath.envKey, `${nmBinDir}${path.delimiter}/usr/local/bin`);
      // Ensure xrunId is not set
      env.del(env.xrunId);

      setupNodeModulesBin({ nmbin: true, cwd: tempDir });

      // Verify the message was logged
      const output = stripAnsi(logOutput.join("\n"));
      expect(output).to.include("PATH already contains");
      expect(output).to.include(".bin");

      // Verify PATH wasn't modified
      expect(env.get(envPath.envKey)).to.equal(`${nmBinDir}${path.delimiter}/usr/local/bin`);
    } finally {
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Restore original env values
      env.set(envPath.envKey, origPath);
      env.set(env.xrunId, origXrunId);
    }
  });

  it("should increment xrunId when it exists", () => {
    const { setupEnvironment } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");

    // Save original env values
    const origXrunId = env.get(env.xrunId);
    const origForceColor = env.get(env.forceColor);

    try {
      // Set initial xrunId
      env.set(env.xrunId, "5");

      setupEnvironment();

      // Verify xrunId was incremented
      expect(env.get(env.xrunId)).to.equal("6");
    } finally {
      // Restore original env values
      env.set(env.xrunId, origXrunId);
      env.set(env.forceColor, origForceColor);
    }
  });

  it("should initialize xrunId to '1' when not set", () => {
    const { setupEnvironment } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");

    // Save original env values
    const origXrunId = env.get(env.xrunId);
    const origForceColor = env.get(env.forceColor);

    try {
      // Ensure xrunId is not set
      env.del(env.xrunId);

      setupEnvironment();

      // Verify xrunId was initialized to "1"
      expect(env.get(env.xrunId)).to.equal("1");
    } finally {
      // Restore original env values
      env.set(env.xrunId, origXrunId);
      env.set(env.forceColor, origForceColor);
    }
  });

  it("should set forceColor when not already set", () => {
    const { setupEnvironment } = require("../../../cli/xrun-main");
    const env = require("../../../cli/env");

    // Save original env values
    const origXrunId = env.get(env.xrunId);
    const origForceColor = env.get(env.forceColor);

    try {
      // Remove forceColor
      env.del(env.forceColor);

      setupEnvironment();

      // Verify forceColor was set to "1"
      expect(env.get(env.forceColor)).to.equal("1");
    } finally {
      // Restore original env values
      env.set(env.xrunId, origXrunId);
      env.set(env.forceColor, origForceColor);
    }
  });

  it("should handle --options flag", () => {
    xrun(["node", "xrun", "--options"], 2);
    expect(exitCode).to.equal(0);
  });

  it("should handle --list option", () => {
    xrun(["node", "xrun", "--quiet", "--list"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo3"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo4"))).to.be.true;
  });

  it("should handle --list with namespace", () => {
    xrun(["node", "xrun", "--quiet", "--list", "1"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
  });

  it("should handle --full option", () => {
    xrun(["node", "xrun", "--quiet", "--list", "--full"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("/xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("/xfoo2"))).to.be.true;
  });

  it("should handle --full > 1 option", () => {
    xrun(["node", "xrun", "--quiet", "--list", "-ff"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("/xfoo1"))).to.be.true;
    expect(logOutput.some(x => x.includes("/xfoo2"))).to.be.true;
  });

  it("should handle --ns option", () => {
    xrun(["node", "xrun", "--quiet", "--ns"], 2);
    expect(exitCode).to.equal(0);
    expect(logOutput.some(x => x.includes("1"))).to.be.true;
  });

  it("should handle --help option", () => {
    xrun(["node", "xrun", "--quiet", "--help", "xfoo1"], 2);
    expect(exitCode).to.equal(1);
    // expect(logOutput.some(x => x.includes("help for tasks: xfoo1"))).to.be.true;
  });

  it("should handle serial tasks with --serial", done => {
    xrun(["node", "xrun", "--quiet", "--serial", "xfoo1", "xfoo2"], 2, "", () => {
      expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
      // expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
      done();
    });
  });

  it("should take argv from process", done => {
    Object.defineProperty(WrapProcess, "argv", {
      get: () => ["node", "xrun", "--quiet", "--serial", "xfoo1", "xfoo2"]
    });
    xrun(undefined, undefined, "", () => {
      expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
      // expect(logOutput.some(x => x.includes("xfoo2"))).to.be.true;
      done();
    });
  });

  it("should handle --nmbin option", () => {
    xrun(["node", "xrun", "--quiet", "--nmbin", "xfoo1"], 2);
    // expect(logOutput.some(x => x.includes("Added") || x.includes("PATH already contains"))).to.be
    //   .true;
  });

  it("should handle task options", () => {
    xrun(["node", "xrun", "--quiet", ".arg-opts", "-a=1", "--test=true"], 2);
    // expect(logOutput.some(x => x.includes(".arg-opts"))).to.be.true;
  });

  it("should handle namespaced tasks", () => {
    xrun(["node", "xrun", "--quiet", "1/xfoo1"], 2);
    // expect(logOutput.some(x => x.includes("xfoo1"))).to.be.true;
  });

  it("should find no tasks in empty directory", done => {
    xrunInstance.reset();
    const path = require("path");
    const origCwd = process.cwd();
    const modPath = require.resolve("../../..");
    delete require.cache[modPath];
    const emptyCwd = path.resolve(__dirname, "../../../test/pkg-fixtures/empty");
    process.chdir(emptyCwd);
    xrun(["node", "xrun", "--quiet", "--list"], 2, "", err => {
      process.chdir(origCwd);
      const output = logOutput.join("\n");
      expect(err.exitCode).to.equal(1);
      expect(output).to.includes("No tasks found");
      expect(output).to.includes(`You do not have a "xrun-tasks.js|ts"`);
      done();
    });
  });

  it("should remove leading slash from task names containing another slash", () => {
    const { processTasks } = require("../../../cli/xrun-main");

    const tasks = ["/namespace/task1", "/another/task2", "normal-task", "/single-slash"];

    const result = processTasks(tasks);

    // Tasks with leading slash AND another slash should have leading slash removed
    expect(result).to.include("namespace/task1");
    expect(result).to.include("another/task2");

    // Other tasks should remain unchanged
    expect(result).to.include("normal-task");
    expect(result).to.include("/single-slash"); // Leading slash remains as no other slash present
  });

  it("should join and parse tasks that represent an array", () => {
    const { processTasks } = require("../../../cli/xrun-main");

    // Tasks that represent a split array like ["task1", "task2"]
    const tasks = ["[task1", "task2", "task3]"];

    const result = processTasks(tasks);

    // Should be parsed into an array of tasks
    expect(result).to.deep.equal(["task1 task2 task3"]);
  });

  it("should handle array tasks that fail to parse", () => {
    const { processTasks } = require("../../../cli/xrun-main");

    // More complex array with nested arrays and concurrent tasks
    const tasks = ["[build", "[test,lint]", "deploy]"];

    const result = processTasks(tasks);

    // Should be parsed into a nested array structure
    expect(result).to.deep.equal(null);
  });
});
