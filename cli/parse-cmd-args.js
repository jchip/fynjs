"use strict";

/**
 * @typedef {Object} SearchResult
 * @property {boolean} found - Whether a task file was found
 * @property {boolean} foundPkg - Whether a package.json was found
 * @property {string} [xrunFile] - Path to the found task file
 * @property {string} dir - Directory where the file was found
 */

/**
 * @typedef {Object} ParseOptions
 * @property {string} [cwd] - Current working directory
 * @property {string} [dir] - Directory to search in
 * @property {string[]} [require] - Modules to require
 * @property {boolean} [npm] - Whether to load npm tasks
 */

/**
 * @typedef {Object} ParseResult
 * @property {string[]} tasks - List of tasks to run
 * @property {Object} parsed - Parsed command line arguments
 * @property {SearchResult} searchResult - Result of searching for task files
 */

const Path = require("path");
const cliOptions = require("./cli-options");
const { NixClap } = require("nix-clap");
const xsh = require("xsh");
const usage = require("./usage");
const logger = require("../lib/logger");
const myPkg = require("../package.json");
const ck = require("chalker");
const config = require("./config");
const env = require("./env");
const fs = require("fs");
const { updateCwd, searchTaskFile, loadTaskFile, processTasks, loadTasks } = require("./task-file");
const { loadProviderPackages } = require("./provider-packages");
const WrapProcess = require("./wrap-process");

/**
 * Read and parse package.json from a directory
 * @param {string} dir - Directory containing package.json
 * @returns {Object} Parsed package.json contents
 */
function readPackageJson(dir) {
  try {
    const pkgData = fs.readFileSync(Path.join(dir, "package.json"), "utf-8");
    return JSON.parse(pkgData);
  } catch {
    /* istanbul ignore next */
    return {};
  }
}

/**
 * Parse command line arguments
 * @param {string[]} argv - Command line arguments
 * @param {number} start - Index to start parsing from
 * @returns {ParseResult} Parsed arguments and tasks
 */
function parseArgs(argv, start) {
  const nc = new NixClap({
    allowUnknownCommand: true, // Allow task names as commands
    allowUnknownOption: true, // Allow task-specific options
    handlers: {
      exit: code => {
        WrapProcess.exit(code);
      }
    }
  })
    .version(myPkg.version)
    .usage(usage)
    .init(
      cliOptions,
      {} // no xrun commands
    );

  // Parse all arguments at once - nix-clap v2 will handle command/option separation
  const parsed = nc.parse(argv, start);
  const opts = parsed.command.opts;

  const myDir = xsh.pathCwd.replace(Path.dirname(__dirname), ".");

  /* istanbul ignore next */
  if (env.get(env.xrunVersion) !== myPkg.version || env.get(env.xrunBinDir) !== myDir) {
    logger.log(ck`<green>${myPkg.name}</> version ${myPkg.version} at <magenta>${myDir}</>`);
  }

  /* istanbul ignore next */
  if (env.get(env.xrunNodeBin) !== process.execPath) {
    logger.log(ck`<green>node.js</> version ${process.version} at <magenta>${process.execPath}</>`);
  }

  env.set(env.xrunVersion, myPkg.version);
  env.set(env.xrunBinDir, myDir);
  env.set(env.xrunNodeBin, process.execPath);

  // don't search if user has explicitly set CWD
  const search = !opts.cwd;

  const saveCwd = env.get(env.xrunCwd);
  opts.cwd = updateCwd(opts.cwd);

  let searchResult = {};

  /* istanbul ignore next */
  if (!opts.require) {
    searchResult = searchTaskFile(search, opts);
  }

  const Pkg = readPackageJson(opts.cwd);

  const pkgOptField = config.getPkgOpt(Pkg);
  let pkgConfig = {};

  if (pkgOptField) {
    pkgConfig = Object.assign(pkgConfig, Pkg[pkgOptField]);
    delete pkgConfig.cwd; // not allow pkg config to override cwd
    delete pkgConfig.tasks;
    // nc.applyConfig(pkgConfig, parsed);
    const pkgName = ck`<magenta>./package.json</>`;
    logger.log(ck`Applied <green>${pkgOptField}</> options from ${pkgName}`);
  }

  const loaded = loadTasks(opts, searchResult);

  // Extract tasks from commands
  const tasks = Object.keys(parsed.command.subCmdNodes);

  // user has no tasks or explicitly enable searching for provider modules
  if (loaded === false || pkgConfig.loadProviderModules) {
    loadProviderPackages(Pkg, saveCwd, opts);
  }

  return {
    opts,
    tasks,
    parsed,
    searchResult
  };
}

module.exports = {
  parseArgs,
  updateCwd,
  searchTaskFile,
  loadTaskFile,
  processTasks
};
