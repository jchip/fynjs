/* copied from https://github.com/lerna/lerna/blob/main/core/child-process/index.js */

import chalk from "chalk";
import { execa, execaSync } from "execa";
import logTransformer from "strong-log-transformer";
import os from "os";
import boxen from "boxen";
import { logger } from "./logger";

const colorWheel = ["cyan", "magenta", "blue", "yellow", "green", "red"];
const NUM_COLORS = colorWheel.length;
const children = new Set();

let currentColor = 0;

/**
 * @param {import("execa").ExecaError} result
 * @returns {number}
 */
const getExitCode = (result) => {
  if (result.exitCode) {
    return result.exitCode;
  }

  // https://nodejs.org/docs/latest-v6.x/api/child_process.html#child_process_event_close
  if (typeof result.code === "number") {
    return result.code;
  }

  // https://nodejs.org/docs/latest-v6.x/api/errors.html#errors_error_code
  // execa >= 9 keeps the spawn error (with its string code, e.g. ENOENT) on `cause`
  const code = typeof result.code === "string" ? result.code : result.cause && result.cause.code;
  if (typeof code === "string") {
    return os.constants.errno[code];
  }

  return process.exitCode;
};

/**
 * @param {import("execa").ResultPromise & { pkg?: fynpo package }} spawned
 */
const wrapError = (spawned, runOpts) => {
  if (spawned.pkg) {
    return spawned.then(
      (result) => {
        //
        // With `reject: false` (what `fynpo run --no-bail` passes), execa RESOLVES a failed
        // run instead of throwing, so the rejection handler below never sees it and the
        // result reaches the caller with no `pkg` attached. That is what made `--no-bail`
        // report every failure as `- undefined - exit code 1` while the bail path named the
        // package correctly (FPO-39). Annotate the resolved failure the same way.
        //
        if (result && result.failed) {
          result.exitCode = getExitCode(result);
          result.pkg = spawned.pkg;
          result.runOpts = runOpts;
        }

        return result;
      },
      (err) => {
        // ensure exit code is always a number
        err.exitCode = getExitCode(err);

        // log non-lerna error cleanly
        err.pkg = spawned.pkg;

        err.runOpts = runOpts;

        throw err;
      }
    );
  }

  return spawned;
};

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("execa").Options} opts
 */
const spawnProcess = (command, args, opts) => {
  // execa >= 9 validates its options and throws on unknown ones, so fynpo-private
  // annotations like `pkg` must not reach it
  const { pkg, ...execaOpts } = opts;
  const child = execa(command, args, execaOpts);

  //
  // execa >= 9 subprocess exposes streams and the result promise but is no longer an
  // EventEmitter (no .once/.on for "exit"/"error"), so observe termination through the
  // promise instead. Handlers run once, so the old re-entry guard is unnecessary.
  //
  const drain = (exitCode) => {
    children.delete(child);

    // propagate exit code, if any
    if (exitCode) {
      process.exitCode = exitCode;
    }
  };

  child.then(
    (result) => drain(getExitCode(result)),
    (err) => drain(getExitCode(err))
  );

  if (pkg) {
    (child as any).pkg = pkg;
  }

  children.add(child);

  return child;
};

/**
 * Execute a command synchronously.
 * @param {string} command
 * @param {string[]} args
 * @param {import("execa").SyncOptions} [opts]
 */
export const execSync = (command, args, opts) => {
  return execaSync(command, args, opts).stdout;
};

/**
 * Execute a command asynchronously, piping stdio by default.
 * @param {string} command
 * @param {string[]} args
 * @param {import("execa").Options} [opts]
 */
export const exec = (command, args, opts) => {
  const options = Object.assign({ stdio: "pipe" }, opts);
  const spawned = spawnProcess(command, args, options);

  return wrapError(spawned, {});
};

/**
 * Spawn a command asynchronously, streaming stdio with optional prefix.
 * @param {string} command
 * @param {string[]} args
 * @param {import("execa").Options} [opts]
 * @param {string} [prefix]
 */
export const spawnStreaming = (command, args, opts, prefix) => {
  const options = Object.assign({}, opts);
  options.stdio = ["ignore", "pipe", "pipe"];

  const spawned = spawnProcess(command, args, options);

  const stdoutOpts: any = { tag: "" };
  const stderrOpts: any = { tag: "" };

  if (prefix) {
    const colorName = colorWheel[currentColor % NUM_COLORS];
    const color = chalk[colorName];

    currentColor += 1;

    stdoutOpts.tag = `${color.bold(prefix)}:`;
    stderrOpts.tag = `${color(prefix)}:`;
  }

  const banner = boxen(`Starting command  '${command} ${args.join(" ")}'`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
  });

  banner.split("\n").forEach((l) => {
    logger.prefix(false).info(`${stdoutOpts.tag} ${l}`);
  });

  // Avoid "Possible EventEmitter memory leak detected" warning due to piped stdio
  if (children.size > process.stdout.listenerCount("close")) {
    process.stdout.setMaxListeners(children.size);
    process.stderr.setMaxListeners(children.size);
  }

  spawned.stdout.pipe(logTransformer(stdoutOpts)).pipe(process.stdout);
  spawned.stderr.pipe(logTransformer(stderrOpts)).pipe(process.stderr);

  return wrapError(spawned, { stdoutOpts, stderrOpts });
};
