"use strict";

const Path = require("path");
const parseCmdArgs = require("./parse-cmd-args");
const chalk = require("chalk");
const logger = require("../lib/logger");
const usage = require("./usage");
const envPath = require("xsh").envPath;
const Fs = require("fs");
const xsh = require("xsh");
const cliOptions = require("./cli-options");
const parseArray = require("../lib/util/parse-array");
const { makeOptionalRequire } = require("optional-require");
const optionalRequire = makeOptionalRequire(require);
const env = require("./env");
const WrapProcess = require("./wrap-process");
const { CliContext } = require("../lib/cli-context");

/**
 * Flush logger based on options
 * @param {Object} opts - Options
 */
function flushLogger(opts) {
  logger.quiet(opts && opts.quiet);
  logger.resetBuffer(true, false);
}

/**
 * Handle process exit or callback
 * @param {number} code - Exit code
 * @param {Function} done - Optional callback
 */
function handleExitOrDone(code, done) {
  if (done) {
    const err = new Error(`exit code: ${code}`);
    err.exitCode = code;
    done(err);
  } else {
    WrapProcess.exit(code);
  }
  return true;
}

/**
 * Process environment options from command line
 * @param {Object} opts - Options object containing env property
 */
function processEnvOptions(opts) {
  const envs = [].concat(opts.env).filter(Boolean);

  for (const envStr of envs) {
    const [key, val] = envStr.split("=");
    if (key) {
      env.set(key, val);
    }
  }
}

/**
 * List CLI options for shell auto completion
 * @param {Array} argv - Command line arguments
 * @param {number} offset - Argument offset
 * @param {Function} done - Optional callback
 * @returns {void}
 */
function handleCliOptions(argv, offset, done) {
  if (argv.length === 3 && argv[offset] === "--options") {
    Object.keys(cliOptions).forEach(k => {
      const x = cliOptions[k];
      console.log(`--${k}`);
      console.log(`-${x.alias}`);
    });
    return handleExitOrDone(0, done);
  }
  return false;
}

/**
 * Find and load the runner module
 * @param {string} xrunPath - Path to xrun
 * @returns {Object} Runner module and its path
 */
function findRunnerModule(xrunPath) {
  let runner;
  const foundReq = [
    xrunPath, // first look for it in path passed from cli
    "@xarc/run", // let node.js resolve by package name
    ".." // finally load from definitive known location
  ].find(p => p && (runner = optionalRequire(p)));

  const foundPath = foundReq && Path.dirname(require.resolve(foundReq));
  return { runner, foundPath };
}

/**
 * Handle case when no tasks are found
 * @param {CliContext} cliContext - Command context
 * @param {string} cwd - Current working directory
 * @param {Function} done - Optional callback
 */
function handleNoTasks(cliContext, cwd, done) {
  const fromCwd = optionalRequire.resolve("@xarc/run") || "not found - probably not installed";
  const fromMyDir = Path.dirname(require.resolve(".."));
  const searchResult = cliContext.getSearchResult();
  const info = searchResult.xrunFile
    ? `
This could be due to a few reasons:

  1. your task file ${searchResult.xrunFile} didn't load any tasks or contains errors.
  2. there are multiple copies of this package (@xarc/run) installed in "node_modules".
`
    : `
You do not have a "xrun-tasks.js|ts" file, so the only tasks may come from your
'package.json' npm scripts, and you probably don't have any defined there either.
`;

  logger.error(`${chalk.red("*** No tasks found ***")}
${info}
For reference, some paths used to search for tasks:
    - my current __dirname: '${__dirname}'
    - dir used to search for tasks:
        '${cwd}'

Some paths used to resolve @xarc/run:
    - resolved from CWD: '${fromCwd}'
    - resolved from my dir: '${fromMyDir}'
`);
  return handleExitOrDone(1, done);
}

/**
 * Handle task listing
 * @param {Object} runner - Runner instance
 * @param {Object} opts - Options
 * @param {Function} done - Optional callback
 * @returns {void}
 */
function handleTaskListing(runner, opts, done) {
  flushLogger(opts);
  const ns = opts.list && opts.list.split(",").map(x => x.trim());
  try {
    if (opts.full) {
      let fn = runner._tasks.fullNames(ns);
      if (opts.full > 1) fn = fn.map(x => (x.startsWith("/") ? x : `/${x}`));
      console.log(fn.join("\n"));
    } else {
      console.log(runner._tasks.names(ns).join("\n"));
    }
  } catch (err) {
    console.log(err.message);
  }
  return handleExitOrDone(0, done);
}

/**
 * Handle namespace listing
 * @param {Object} runner - Runner instance
 * @param {Object} opts - Options
 * @param {Function} done - Optional callback
 * @returns {void}
 */
function handleNamespaceListing(runner, opts, done) {
  flushLogger(opts);
  console.log(runner._tasks._namespaces.join("\n"));
  return handleExitOrDone(0, done);
}

/**
 * Handle help display
 * @param {Object} runner - Runner instance
 * @param {CliContext} cliContext - Command context
 * @param {Object} opts - Options
 * @param {string} cmdName - Command name
 * @param {Function} done - Optional callback
 * @returns {void}
 */
function handleHelp(runner, cliContext, opts, cmdName, done) {
  flushLogger(opts);
  runner.printTasks();
  if (!opts.quiet) {
    console.log(`${usage}`);
    console.log(
      chalk.bold(" Help:"),
      `${cmdName} -h`,
      chalk.bold(" Example:"),
      `${cmdName} build\n`
    );
  }
  return handleExitOrDone(1, done);
}

/**
 * Setup node_modules bin in PATH
 * @param {Object} opts - Options
 */
function setupNodeModulesBin(opts) {
  if (opts.nmbin) {
    const nmBin = Path.join(opts.cwd, "node_modules", ".bin");
    if (Fs.existsSync(nmBin)) {
      const x = chalk.magenta(`${xsh.pathCwd.replace(nmBin, ".")}`);
      const pathStr = env.get(envPath.envKey) || "";
      const updated = envPath.addToFront(nmBin);
      if (updated !== pathStr) {
        logger.log(`Added ${x} to front of PATH`);
      } else if (!env.get(env.xrunId)) {
        logger.log(`PATH already contains ${x}`, pathStr);
      }
    }
  }
}

/**
 * Setup environment variables
 */
function setupEnvironment() {
  if (!env.get(env.xrunId)) {
    env.set(env.xrunId, "1");
  } else {
    env.set(env.xrunId, parseInt(env.get(env.xrunId)) + 1);
  }

  if (!env.has(env.forceColor)) {
    env.set(env.forceColor, "1");
  }
}

/**
 * Process task arguments
 * @param {Array} tasks - Task arguments
 * @param {Object} opts - Options
 * @returns {Array} Processed tasks
 */
function processTasks(tasks, opts) {
  tasks = tasks.map(x => {
    if (x.startsWith("/") && x.indexOf("/", 1) > 1) {
      return x.substring(1);
    }
    return x;
  });

  if (tasks[0].startsWith("[")) {
    let arrayStr;
    try {
      arrayStr = tasks.join(" ");
      tasks = parseArray(arrayStr);
    } catch (e) {
      console.log(
        "Parsing array of tasks failed:",
        chalk.red(`${e.message}:`),
        chalk.cyan(arrayStr)
      );
      return null;
    }
  }

  if (tasks.length > 1 && tasks[0] !== "." && opts && opts.serial) {
    tasks = ["."].concat(tasks);
  }

  return tasks;
}

/**
 * Handle quiet flag setting in environment
 * @param {Object} jsonMeta - Command metadata
 * @param {Object} opts - Command options
 * @returns {boolean} - Whether quiet mode is enabled
 */
function handleQuietFlag(jsonMeta, opts) {
  if (jsonMeta.source.quiet === "default") {
    opts.quiet = env.get(env.xrunQuiet) === "1";
    jsonMeta.source.quiet = "env";
  } else if (opts.quiet) {
    env.set(env.xrunQuiet, "1");
  }
  return opts.quiet;
}

/**
 * Main entry point for xrun
 * @param {Array} argv - Command line arguments
 * @param {number} offset - Argument offset
 * @param {string} xrunPath - Path to xrun
 * @param {Function} done - Optional callback
 * @returns {*} Runner result or void
 */
function xrunMain(argv, offset, xrunPath = "", done = null) {
  let cmdName = "xrun";
  const cwd = WrapProcess.cwd();

  if (!argv) {
    cmdName = Path.basename(WrapProcess.argv[1]);
    argv = WrapProcess.argv;
    offset = 2;
  } else {
    cmdName = "xrun";
  }

  // Handle CLI options listing
  if (handleCliOptions(argv, offset, done)) return;

  // Find and load runner module
  const { runner, foundPath } = findRunnerModule(xrunPath);
  const rawCmdArgs = parseCmdArgs.parseArgs(argv, offset, foundPath);

  // Create CliContext as the primary interface
  const cliContext = new CliContext(rawCmdArgs);

  const numTasks = runner.countTasks();
  const jsonMeta = cliContext.getMetadata();
  const opts = cliContext.getGlobalOptions();

  // Handle quiet flag
  handleQuietFlag(jsonMeta, opts);

  // Handle no tasks case
  if (numTasks === 0) {
    return handleNoTasks(cliContext, cwd, done);
  }
  // Handle task listing
  else if (jsonMeta.source.list !== "default") {
    return handleTaskListing(runner, opts, done);
  }
  // Handle namespace listing
  else if (opts.ns) {
    return handleNamespaceListing(runner, opts, done);
  }

  // Handle help display
  if (cliContext.getTasks().length === 0) {
    return handleHelp(runner, cliContext, opts, cmdName, done);
  }

  flushLogger(opts);

  // Setup environment
  setupNodeModulesBin(opts);
  setupEnvironment();

  // Configure runner with CliContext
  if (runner.stopOnError === undefined || jsonMeta.source.soe !== "default") {
    runner.stopOnError = cliContext.getStopOnError();
  }

  // Set CliContext on runner
  runner.setCliContext(cliContext);

  // Process tasks using CliContext
  const processedTasks = processTasks(cliContext.getTasks(), opts);
  /* istanbul ignore next */
  if (processedTasks === null) {
    /* istanbul ignore next */
    return handleExitOrDone(1, done);
  }

  processEnvOptions(opts);

  // Run tasks with CliContext already set on runner
  return runner.run(processedTasks.length === 1 ? processedTasks[0] : processedTasks, done);
}

const { INTERNALS } = require("../lib/defaults");
module.exports = {
  xrunMain,
  [INTERNALS]: {
    flushLogger,
    handleExitOrDone,
    handleCliOptions,
    findRunnerModule,
    handleNoTasks,
    handleTaskListing,
    handleNamespaceListing,
    handleHelp,
    setupNodeModulesBin,
    setupEnvironment,
    processTasks,
    handleQuietFlag,
    processEnvOptions
  }
};
