import { pathToFileURL } from "node:url";
import Path from "path";
import env from "./env.js";
import xsh from "xsh";
import logger from "../lib/logger.js";
import config from "./config.js";
import ck from "./ck.js";
import { searchUpTaskFile } from "./search-up-task-file.js";
import WrapProcess from "./wrap-process.js";
import npmLoader from "./npm-loader.js";
import requireAt from "require-at";
import instance from "../lib/xrun-instance.js";
import TsRunner from "./ts-runner.js";

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
    // set env to let subsequent xrun calls know that the task file was not found
    // and avoid logging the same message again
    env.set(env.xrunTaskFile, "not found");
  } else if (opts.updateCwd !== false) {
    // force CWD to where xrun task file was found
    loadResult.cwd = updateCwd(loadResult.dir);
  }

  return loadResult;
}

/**
 * Load a task file.
 *
 * Loading goes through `import()` rather than `require`, which is what lets a task file use
 * top-level await - node's `require(esm)` refuses that graph outright and always will. Every
 * other format keeps working: `import()` of a CommonJS file yields a namespace with
 * `module.exports` on `.default`, which processTasks already unwraps.
 *
 * @param {string} name - Path to the task file
 * @returns {Promise<Object|Function|undefined>} Loaded task module, or undefined if it failed
 */
async function loadTaskFile(name) {
  const ext = Path.extname(name);
  if (ext === ".ts" || ext === ".tsx" || ext === ".mts" || ext === ".cts") {
    TsRunner.startRunner();
  }

  try {
    return await import(pathToFileURL(Path.resolve(name)).href);
  } catch (e) {
    const file = xsh.pathCwd.replace(name, ".");
    const errMsg = ck`<red>Unable to load ${file}</>`;

    //
    // node strips TypeScript types natively, which covers ordinary task files. It cannot
    // handle syntax that has to be transformed rather than erased - enums, namespaces,
    // parameter properties - and says so with its own code. Name the limit rather than
    // dumping a stack that does not explain it.
    //
    /* istanbul ignore next */
    if (
      e.code === "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX" ||
      e.code === "ERR_UNKNOWN_FILE_EXTENSION" ||
      e.code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING"
    ) {
      logger.error(
        ck`${errMsg}: node cannot load this TypeScript on its own.
  It strips types, but enums, namespaces and parameter properties need a real transform.
  Rewrite them, or run node with <yellow>--experimental-transform-types</>.
  ${e.message}`
      );
      return undefined;
    }

    logger.error(`${errMsg}: ${xsh.pathCwd.replace(e.stack, ".", "g")}`);
    return undefined;
  }
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
async function loadTasks(opts, searchResult) {
  let loaded = false;
  npmLoader(instance.xrun, opts);
  if (opts.require) {
    // a for-of rather than forEach: each file has to finish loading before the next starts,
    // so tasks land in the order the user listed their modules
    for (const xmod of opts.require) {
      let file;
      try {
        file = requireAt(WrapProcess.cwd()).resolve(xmod);
      } catch (err) {
        logger.log(
          ck`<red>ERROR:</> <yellow>Unable to require module</> <cyan>'${xmod}'</> - <red>${err.message}</>`
        );
        continue;
      }
      const tasks = await loadTaskFile(file);
      /* istanbul ignore else */
      if (tasks) {
        const loadMsg = ck`<green>${xmod}</>`;
        processTasks(tasks, loadMsg);
        loaded = true;
      }
    }
  } else if (searchResult.xrunFile) {
    const tasks = await loadTaskFile(searchResult.xrunFile);
    /* istanbul ignore else */
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

export { updateCwd, searchTaskFile, loadTaskFile, processTasks, loadTasks };
