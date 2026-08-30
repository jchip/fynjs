import ownInstance from "../lib/xrun-instance.js";
import Path from "path";
import parseCmdArgs from "./parse-cmd-args.js";
import chalk from "../lib/chalk.js";
import logger from "../lib/logger.js";
import usage from "./usage.js";
import { envPath as envPath } from "xsh";
import Fs from "fs";
import xsh from "xsh";
import cliOptions from "./cli-options.js";
import parseArray from "../lib/util/parse-array.js";
import { makeOptionalRequire } from "optional-require";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const optionalRequire = makeOptionalRequire(require);
import env from "./env.js";
import WrapProcess from "./wrap-process.js";
import { CliContext } from "../lib/cli-context.js";

/**
 * Flush logger based on options
 * @param {Object} opts - Options
 */
function flushLogger(opts) {
  // only opts carries a quiet preference - without one, leave the current setting alone
  // rather than silently un-quieting the logger
  if (opts) {
    logger.quiet(opts.quiet);
  }
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

  //
  // The runner may resolve to this package's own ESM entry, in which case require(esm) hands
  // back the module namespace rather than the instance - the runner sits on `.default`. A copy
  // that is still CJS has no `.default` and is used as-is.
  //
  /* istanbul ignore next: the .default arm needs a real require of this package - see below */
  const loadRunner = p => {
    const mod = optionalRequire(p);
    return mod && (mod.default || mod);
  };

  const foundReq = [
    xrunPath, // first look for it in path passed from cli
    "@fynjs/run" // let node.js resolve by package name
  ].find(p => p && (runner = loadRunner(p)));

  //
  // Not covered on purpose. Exercising this means letting `optionalRequire` load a real copy
  // of this package through node's own registry, which is a second, uninstrumented copy of
  // every module in it - the rest of the run then uses that copy and coverage collapses for
  // files that have nothing to do with this branch. A test here costs ~20 statements elsewhere.
  //
  /* istanbul ignore next */
  if (runner) {
    return { runner, foundPath: Path.dirname(require.resolve(foundReq)) };
  }

  //
  // Definitive known location. This used to be `optionalRequire("..")`, but resolving our own
  // package at runtime can load a second copy of it - a distinct xrun instance, with distinct
  // Symbols - which is exactly what the two earlier entries are for. A static import is the
  // same module by construction.
  //
  return { runner: ownInstance.xrun, foundPath: Path.dirname(import.meta.dirname) };
}

/**
 * Handle case when no tasks are found
 * @param {CliContext} cliContext - Command context
 * @param {string} cwd - Current working directory
 * @param {Function} done - Optional callback
 */
function handleNoTasks(cliContext, cwd, done, opts) {
  //
  // Flush first, like handleTaskListing does. Without this the whole diagnostic below is
  // written into the logger's buffer and then thrown away by the exit, so a missing, broken,
  // or unloadable task file made xrun exit 1 with no output at all.
  //
  flushLogger(opts);

  const fromCwd = optionalRequire.resolve("@fynjs/run") || "not found - probably not installed";
  const fromMyDir = Path.dirname(require.resolve(".."));
  const searchResult = cliContext.getSearchResult();
  const info = searchResult.xrunFile
    ? `
This could be due to a few reasons:

  1. your task file ${searchResult.xrunFile} didn't load any tasks or contains errors.
  2. there are multiple copies of this package (@fynjs/run) installed in "node_modules".
`
    : `
You do not have a "xrun-tasks.js|ts" file, so the only tasks may come from your
'package.json' npm scripts, and you probably don't have any defined there either.
`;

  logger.error(`${chalk.red("*** No tasks found ***")}
${info}
For reference, some paths used to search for tasks:
    - my current import.meta.dirname: '${import.meta.dirname}'
    - dir used to search for tasks:
        '${cwd}'

Some paths used to resolve @fynjs/run:
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
  /* istanbul ignore if */
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
async function xrunMain(argv, offset, xrunPath = "", done = null) {
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
  const rawCmdArgs = await parseCmdArgs.parseArgs(argv, offset, foundPath);

  // Create CliContext as the primary interface
  const cliContext = new CliContext(rawCmdArgs);

  const numTasks = runner.countTasks();
  const jsonMeta = cliContext.getMetadata();
  const opts = cliContext.getGlobalOptions();

  // Handle quiet flag
  handleQuietFlag(jsonMeta, opts);

  // Handle no tasks case
  if (numTasks === 0) {
    return handleNoTasks(cliContext, cwd, done, opts);
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
  /* istanbul ignore if */
  if (cliContext.getTasks().length === 0) {
    /* istanbul ignore next */
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

import { INTERNALS } from "../lib/defaults.js";
export { xrunMain };

export default {
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
