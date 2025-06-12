"use strict";

/* istanbul ignore file */

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
const requireAt = require("require-at");
const { makeOptionalRequire } = require("optional-require");
const env = require("./env");
const WrapProcess = require("./wrap-process");

function flushLogger(opts) {
  logger.quiet(opts && opts.quiet);
  logger.resetBuffer(true, false);
}

function xrun(argv, offset, xrunPath = "", done = null) {
  let cmdName = "xrun";
  const cwd = WrapProcess.cwd();

  if (!argv) {
    cmdName = Path.basename(WrapProcess.argv[1]);
    argv = WrapProcess.argv;
    offset = 2;
  } else {
    cmdName = "xrun";
  }

  function exitOrDone(code) {
    if (done) {
      const err = new Error(`exit code: ${code}`);
      err.exitCode = code;
      done(err);
    } else {
      WrapProcess.exit(code);
    }
  }

  /** list xrun's CLI options and exit - for shell auto completion etc */
  if (argv.length === 3 && argv[offset] === "--options") {
    Object.keys(cliOptions).forEach(k => {
      const x = cliOptions[k];
      console.log(`--${k}`);
      console.log(`-${x.alias}`);
    });
    return exitOrDone(0);
  }

  // handle situation where node.js thinks this pkg is at a diff dir than where it's
  // physically installed, a scenario in case pkg mgr installs using symlinks
  let runner;
  const optionalRequire = makeOptionalRequire(require);
  const foundReq = [
    xrunPath, // first look for it in path passed from cli
    "@xarc/run", // let node.js resolve by package name
    ".." // finally load from definitive known location
  ].find(p => p && (runner = optionalRequire(p)));

  const foundPath = foundReq && Path.dirname(require.resolve(foundReq));

  const cmdArgs = parseCmdArgs.parseArgs(argv, offset, foundPath);

  const numTasks = runner.countTasks();

  const jsonMeta = cmdArgs.parsed.command.jsonMeta;
  const opts = jsonMeta.opts;

  if (numTasks === 0) {
    const fromCwd = optionalRequire.resolve("@xarc/run");
    const fromMyDir = Path.dirname(require.resolve(".."));
    const info = cmdArgs.searchResult.xrunFile
      ? `
This could be due to a few reasons:

  1. your task file ${cmdArgs.searchResult.xrunFile} didn't load any tasks or contains errors.
  2. there are multiple copies of this package (@xarc/run) installed in "node_modules".
`
      : `
You do not have a "xrun-tasks.js|ts" file, so the only tasks may come from your
'package.json' npm scripts, and you probably don't have any defined there either.
`;
    //
    logger.error(`${chalk.red("*** No tasks found ***")}
${info}
For reference, some paths used to search for tasks:
    - my current __dirname: '${__dirname}'
    - dir used to search for tasks:
        '${cwd}'

Some paths used to resolve @xarc/run:
    - resolved from CWD: '${fromCwd ? fromCwd : "not found - probably not installed"}'
    - resolved from my dir: '${fromMyDir}'
`);
  } else if (jsonMeta.source.list !== "default") {
    // user explicitly specified the --list option
    // so we list tasks
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
    return exitOrDone(0);
  } else if (opts.ns) {
    flushLogger(opts);
    console.log(runner._tasks._namespaces.join("\n"));
    return exitOrDone(0);
  }

  if (cmdArgs.tasks.length === 0 || numTasks === 0) {
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
    return exitOrDone(1);
  }

  if (opts.help) {
    console.log("help for tasks:", cmdArgs.tasks);
    return exitOrDone(0);
  }

  flushLogger(opts);

  if (opts.nmbin) {
    const nmBin = Path.join(opts.cwd, "node_modules", ".bin");
    if (Fs.existsSync(nmBin)) {
      const x = chalk.magenta(`${xsh.pathCwd.replace(nmBin, ".")}`);

      const pathStr = env.get(envPath.envKey) || "";
      if (!pathStr.match(new RegExp(`${nmBin}(${Path.delimiter}|$)`))) {
        envPath.addToFront(nmBin);
        logger.log(`Added ${x} to PATH`);
      } else if (!env.get(env.xrunId)) {
        logger.log(`PATH already contains ${x}`);
      }
    }
  }

  if (!env.get(env.xrunId)) {
    env.set(env.xrunId, "1");
  } else {
    env.set(env.xrunId, parseInt(env.get(env.xrunId)) + 1);
  }

  if (!env.has(env.forceColor)) {
    env.set(env.forceColor, "1");
  }

  if (runner.stopOnError === undefined || jsonMeta.source.soe !== "default") {
    runner.stopOnError = opts.soe;
  }

  let tasks = cmdArgs.tasks.map(x => {
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
      return exitOrDone(1);
    }
  }

  if (tasks.length > 1 && tasks[0] !== "." && opts.serial) {
    tasks = ["."].concat(tasks);
  }

  return runner.run(tasks.length === 1 ? tasks[0] : tasks, done);
}

module.exports = xrun;
