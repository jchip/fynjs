"use strict";

const Path = require("path");
const env = require("./env");
const xsh = require("xsh");
const logger = require("../lib/logger");
const config = require("./config");
const ck = require("chalker");
const { searchUpTaskFile } = require("./search-up-task-file");
const WrapProcess = require("./wrap-process");
const npmLoader = require("./npm-loader");
const requireAt = require("require-at");
const optionalRequire = require("optional-require")(require);
const instance = require("../lib/xrun-instance");
const TsRunner = require("./ts-runner");

/**
 * Update the current working directory
 * @param {string} [dir] - Directory to change to
 * @returns {string} New working directory
 */
function updateCwd(dir) {
  dir = dir || WrapProcess.cwd();
  const newCwd = Path.isAbsolute(dir) ? dir : Path.resolve(dir);

  try {
    const cwd = WrapProcess.cwd();
    if (newCwd !== cwd) {
      WrapProcess.chdir(newCwd);
      logger.log(ck`CWD changed to <magenta>${newCwd}</>`);
    } else if (env.get(env.xrunCwd) !== cwd) {
      logger.log(ck`CWD is <magenta>${cwd}</>`);
    }
    env.set(env.xrunCwd, newCwd);

    return newCwd;
  } catch (err) {
    logger.log(ck`chdir <magenta>${newCwd}</> <red>failed</>`);
    WrapProcess.exit(1);
  }
}

/**
 * Search for task files in the given directory
 * @param {boolean} search - Whether to search up directories
 * @param {ParseOptions} opts - Search options
 * @returns {SearchResult} Search result
 */
function searchTaskFile(search, opts) {
  const xrunDir = Path.join(opts.cwd, opts.dir || "");

  const loadResult = searchUpTaskFile(xrunDir, search);

  if (!loadResult.found) {
    if (env.get(env.xrunTaskFile) !== "not found") {
      const x = xsh.pathCwd.replace(xrunDir, "./");
      logger.log(ck`No <green>${config.taskFile}</> found in <magenta>${x}</>`);
    }
    env.set(env.xrunTaskFile, "not found");
  } else if (search) {
    // force CWD to where xrun task file was found
    opts.cwd = updateCwd(loadResult.dir);
  }

  return loadResult;
}

/**
 * Load a task file with TypeScript support
 * @param {string} name - Path to the task file
 * @returns {Object|Function|undefined} Loaded task module
 */
function loadTaskFile(name) {
  const ext = Path.extname(name);
  if (ext === ".ts" || ext === ".tsx" || ext === ".mts") {
    TsRunner.startRunner();
  }

  return optionalRequire(name, {
    fail: e => {
      const errMsg = ck`<red>Unable to load ${xsh.pathCwd.replace(name, ".")}</>`;
      let msg2 = "";
      /* istanbul ignore next */
      if (e.code === "ERR_REQUIRE_ESM") {
        /* istanbul ignore next */
        msg2 = ` === This is an issue with ts-node/register, install and use tsx ===\n\n`;
      }
      logger.error(`${errMsg}: ${msg2}${xsh.pathCwd.replace(e.stack, ".", "g")}`);
    }
  });
}

/**
 * Process loaded tasks and register them with xrun
 * @param {Object|Function} tasks - Tasks to process
 * @param {string} loadMsg - Message to display when tasks are loaded
 * @param {string} [ns="xrun"] - Namespace to load tasks into
 */
function processTasks(tasks, loadMsg, ns = "xrun") {
  if (typeof tasks === "function") {
    tasks(instance.xrun);
    if (loadMsg) {
      logger.log(`Loaded tasks by calling export function from ${loadMsg}`);
    }
  } else if (typeof tasks === "object") {
    if (tasks.default) {
      processTasks(tasks.default, `${loadMsg} default export`, ns);
    } else if (Object.keys(tasks).length > 0) {
      instance.xrun.load(ns, tasks);
      logger.log(ck`Loaded tasks from ${loadMsg} into namespace <magenta>${ns}</>`);
    } else if (loadMsg) {
      logger.log(`Loaded ${loadMsg}`);
    }
  } else {
    logger.log(ck`Unknown export type <yellow>${typeof tasks}</> from ${loadMsg}`);
  }
}

/**
 * Load tasks from files or required modules
 * @param {ParseOptions} opts - Options for loading tasks
 * @param {SearchResult} searchResult - Result from searching for task files
 * @returns {boolean} Whether any tasks were loaded
 */
function loadTasks(opts, searchResult) {
  let loaded = false;
  npmLoader(instance.xrun, opts);
  if (opts.require) {
    opts.require.forEach(xmod => {
      let file;
      try {
        file = requireAt(WrapProcess.cwd()).resolve(xmod);
      } catch (err) {
        logger.log(
          ck`<red>ERROR:</> <yellow>Unable to require module</> <cyan>'${xmod}'</> - <red>${err.message}</>`
        );
        return;
      }
      const tasks = loadTaskFile(file);
      if (tasks) {
        const loadMsg = ck`<green>${xmod}</>`;
        processTasks(tasks, loadMsg);
        return (loaded = true);
      }
    });
  } else if (searchResult.xrunFile) {
    const tasks = loadTaskFile(searchResult.xrunFile);
    if (tasks) {
      processTasks(
        tasks,
        env.get(env.xrunTaskFile) !== searchResult.xrunFile
          ? ck`<green>${xsh.pathCwd.replace(searchResult.xrunFile, ".")}</>`
          : ""
      );
      env.set(env.xrunTaskFile, searchResult.xrunFile);

      return (loaded = true);
    }
  }

  return loaded;
}

module.exports = { updateCwd, searchTaskFile, loadTaskFile, processTasks, loadTasks };
