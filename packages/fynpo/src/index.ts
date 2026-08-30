#!/usr/bin/env node

import Path from "path";
import { NixClap } from "@fynjs/cli-args";
import { Bootstrap } from "./bootstrap";
import { Prepare } from "./prepare";
import Changelog from "./update-changelog";
import Publish from "./publish";
import { Run } from "./run";
import { Init } from "./init";
import { Updated } from "./updated";
import { Commitlint } from "./commitlint";
import { Version } from "./version";
import { makePkgDeps, readFynpoPackages, FynpoDepGraph } from "@fynpo/base";
import { logger } from "./logger";
import * as utils from "./utils";
import Fs from "fs";
import _ from "lodash";

const xrequire = eval("require"); // eslint-disable-line

const globalCmnds = ["bootstrap", "local", "run"];

/**
 * Detect if an error is likely an internal fynpo bug vs a user/package issue
 */
const detectInternalBug = (err: any): { isInternal: boolean; hint: string } => {
  const msg = err?.message || String(err);
  const stack = err?.stack || "";

  // Webpack module errors indicate import/export issues in fynpo's code
  if (msg.includes("__WEBPACK_IMPORTED_MODULE_") || msg.includes("is not a constructor")) {
    return {
      isInternal: true,
      hint: "This appears to be an import/export bug in fynpo's bundled code.",
    };
  }

  // Check if error originates from fynpo's own modules
  if (stack.includes("/fynpo/dist/") || stack.includes("/fynpo/src/")) {
    if (
      msg.includes("is not a function") ||
      msg.includes("is not defined") ||
      msg.includes("Cannot read prop")
    ) {
      return {
        isInternal: true,
        hint: "Error originated from fynpo's internal code.",
      };
    }
  }

  return { isInternal: false, hint: "" };
};

/**
 * Discovery is implicit when fynpo.json declares no `packages` patterns. Say so,
 * because the two discovery paths then disagree: the dep graph searches every
 * directory for a package.json, while readFynpoPackages falls back to
 * `packages/*` and finds nothing in a repo laid out any other way.
 */
const noticeImplicitDiscovery = (autoSearched: boolean, found: number) => {
  if (!autoSearched) {
    return;
  }
  if (found > 0) {
    logger.info(
      `No "packages" patterns in fynpo.json - searched every directory for package.json and found ${found}.`,
      `Declare "packages" to make discovery explicit, e.g. "packages": ["packages/*"].`
    );
  } else {
    logger.warn(
      `No "packages" patterns in fynpo.json and no package.json found by searching.`,
      `Declare "packages" in fynpo.json to say where your packages live.`
    );
  }
};

const readPackages = async (opts: any, cmdName: string = "") => {
  const packages = await readFynpoPackages(_.pick(opts, ["patterns", "cwd", "packages"]));

  if (_.isEmpty(packages)) {
    // this path does NOT auto-search - it defaults to `packages/*`, so an empty
    // result usually means the repo keeps its packages somewhere else
    logger.warn(
      `No packages found under ${JSON.stringify(opts.patterns || ["packages/*"])}.`,
      `If your packages live elsewhere, declare them in fynpo.json, e.g. "packages": ["*"].`
    );
  }

  const result = await makePkgDeps(packages, opts);
  if (!_.isEmpty(result.warnings)) {
    result.warnings.forEach((w) => logger.warn(w));
  }

  if (result.focusPkgPath) {
    if (globalCmnds.includes(cmdName)) {
      logger.error(
        `${cmdName} command is only supported at mono-repo root level but CWD is '${result.focusPkgPath}`
      );
      process.exit(1);
    }
  }

  return result;
};

const readFynpoData = async (cwd) => {
  try {
    const data = Fs.readFileSync(Path.join(cwd, ".fynpo-data.json"), "utf-8");
    return JSON.parse(data);
  } catch (_err) {
    return { indirects: {} };
  }
};

const makeOpts = async (cmd, _parsed) => {
  // In nix-clap v2, merge root command opts with subcommand opts
  const rootOpts = cmd.rootCmd?.jsonMeta?.opts || {};
  const cmdOpts = cmd.jsonMeta?.opts || {};
  const allOpts = { ...rootOpts, ...cmdOpts };

  let cwd = process.cwd();
  if (allOpts.cwd) {
    logger.info(`Setting CWD to ${allOpts.cwd}`);
    cwd = allOpts.cwd;
    process.chdir(cwd);
  }
  const fynpo: any = utils.loadConfig(cwd);
  const optConfig = Object.assign({}, fynpo.fynpoRc, allOpts, {
    cwd: fynpo.dir,
    // `packages` no longer aliases discovery patterns - loadConfig sets `patterns` only from
    // the object form's `include` (FPO-17)
    patterns: fynpo.fynpoRc.patterns,
  });

  return optConfig;
};

const makeDepGraph = async (opts) => {
  const graph = new FynpoDepGraph(opts);
  await graph.resolve();
  noticeImplicitDiscovery(graph.autoSearched, Object.keys(graph.packages.byName || {}).length);
  const fynpoData = await readFynpoData(opts.cwd);
  if (!_.isEmpty(fynpoData.indirects)) {
    const noFynLocal = opts.noFynLocal || [];
    _.each(fynpoData.indirects, (relations) => {
      // Filter out relations where onPkg is in noFynLocal
      const filtered = relations.filter(
        (rel) => !noFynLocal.includes(rel.onPkg.name)
      );
      if (filtered.length) {
        graph.addDepRelations(filtered);
      }
    });
    graph.updateDepMap();
  }

  return graph;
};

const makeBootstrap = async (cmd, parsed) => {
  const opts = await makeOpts(cmd, parsed);
  const graph = await makeDepGraph(opts);
  return new Bootstrap(graph, opts);
};

const execBootstrap = async (cmd, parsed, firstRunTime = 0) => {
  const bootstrap = await makeBootstrap(cmd, parsed);
  const fynpoDataStart = await readFynpoData(bootstrap.cwd);
  let statusCode = 0;

  // In nix-clap v2, use cmd.jsonMeta for merged options and args
  const meta = cmd.jsonMeta;

  if (!firstRunTime) {
    logger.debug("CLI options", JSON.stringify({ opts: meta.opts, args: meta.argList }));
  }

  let secondRun = false;
  try {
    await bootstrap.exec({
      build: meta.opts.build,
      fynOpts: meta.opts.fynOpts,
      concurrency: meta.opts.concurrency,
      skip: meta.opts.skip,
    });

    if (!firstRunTime) {
      const fynpoDataEnd = await readFynpoData(bootstrap.cwd);
      if (fynpoDataEnd.__timestamp !== fynpoDataStart.__timestamp) {
        logger.info(
          "=== fynpo data changed - running bootstrap again - fynpo recommands that you commit the .fynpo-data.json file ==="
        );
        secondRun = true;
        return await execBootstrap(cmd, parsed, bootstrap.elapsedTime);
      }
    }

    bootstrap.logErrors();
    statusCode = bootstrap.failed;
  } catch (err: any) {
    if (!secondRun) {
      const bugInfo = detectInternalBug(err);
      if (bugInfo.isInternal) {
        logger.error("*** INTERNAL FYNPO BUG DETECTED ***");
        logger.error(bugInfo.hint);
        logger.error("Please report this issue at: https://github.com/jchip/fynjs/issues");
      }
      logger.error("Bootstrap error:", err?.message || err);
      if (err?.stack) {
        logger.debug("Stack trace:", err.stack);
      }
      bootstrap.logErrors();
      statusCode = 1;
    }
  } finally {
    if (!secondRun) {
      const sec = ((bootstrap.elapsedTime + firstRunTime) / 1000).toFixed(2);
      const status = statusCode === 0 ? "completed" : "failed";
      logger[statusCode === 0 ? "info" : "error"](`bootstrap ${status} in ${sec}secs`);
      if (statusCode !== 0 || meta.opts.saveLog) {
        Fs.writeFileSync("fynpo-debug.log", logger.logData.join("\n") + "\n");
        logger.error("Please check the file fynpo-debug.log for more info.");
      }
      process.exit(statusCode);
    }
  }

  return undefined;
};

const execLocal = async (cmd, parsed) => {
  return await makeBootstrap(cmd, parsed);
};

const execPrepare = async (cmd, _parsed) => {
  // use makeOpts like every other command, so the configured `packages` patterns
  // reach discovery. Building opts by hand here left readFynpoPackages on its
  // default ["packages/*"], so any repo laid out differently found no packages -
  // and prepare then matched the changelog against an empty list and reported
  // "No versions found in CHANGELOG.md".
  const opts = await makeOpts(cmd, _parsed);

  // prepare only applies at top level, so switch CWD there
  process.chdir(opts.cwd);

  return new Prepare(opts, await readPackages(opts)).exec();
};

const execChangelog = async (cmd, _parsed) => {
  const opts = await makeOpts(cmd, _parsed);
  const graph = await makeDepGraph(opts);

  // changelog only applies at top level, so switch CWD there
  process.chdir(opts.cwd);

  return new Changelog(opts, graph).exec();
};

const execUpdated = async (cmd, _parsed) => {
  const opts = await makeOpts(cmd, _parsed);
  const graph = await makeDepGraph(opts);

  return new Updated(opts, graph).exec();
};

const execPublish = async (cmd, _parsed) => {
  const opts = await makeOpts(cmd, _parsed);
  const graph = await makeDepGraph(opts);

  return new Publish(opts, graph).exec();
};

const execVersion = async (cmd, _parsed) => {
  const opts = await makeOpts(cmd, _parsed);
  const graph = await makeDepGraph(opts);

  return new Version(opts, graph).exec();
};

/**
 * Resolve the exit code for `fynpo run`. Run.exec() signals a failing package
 * script by setting process.exitCode (it does not throw), so honor it: a caught
 * exception's code wins, then the code Run set, else 0. A hardcoded 0 here would
 * mask failing package scripts (exit 0 on failure).
 *
 * @param thrownCode 1 when execRunScript caught an exception, else 0
 * @param procExitCode process.exitCode as (optionally) set by Run.exec()
 * @returns the exit code to pass to process.exit
 */
export const resolveRunExitCode = (thrownCode: number, procExitCode?: number): number =>
  thrownCode || procExitCode || 0;

const execRunScript = async (cmd, _parsed) => {
  const opts = await makeOpts(cmd, _parsed);
  const graph = await makeDepGraph(opts);
  let exitCode = 0;
  try {
    // In nix-clap v2, use cmd.jsonMeta.args for named arguments
    const scriptArgs = cmd.jsonMeta?.args || {};
    return await new Run(opts, scriptArgs, graph).exec();
  } catch (err) {
    exitCode = 1;
  } finally {
    // Run.exec() signals script failure via process.exitCode (it does not
    // throw), so honor it here - otherwise a hardcoded process.exit(0) would
    // mask failing package scripts.
    process.exit(resolveRunExitCode(exitCode, process.exitCode));
  }

  return undefined;
};

const execInit = (cmd, _parsed) => {
  // In nix-clap v2, use cmd.jsonMeta.opts for merged options
  const opts = Object.assign({ cwd: process.cwd() }, cmd.jsonMeta?.opts || {});

  return new Init(opts).exec();
};

const execLinting = (cmd, _parsed) => {
  // In nix-clap v2, use cmd.jsonMeta.opts for merged options
  const opts = Object.assign({ cwd: process.cwd() }, cmd.jsonMeta?.opts || {});

  return new Commitlint(opts).exec();
};

const myPkg = xrequire(Path.join(__dirname, "../package.json"));

//
// Top-level CLI options, shared across sub-commands via each entry's `allowCmd`.
// Exported so tests can assert on the table itself - a duplicate key here collapses
// silently at runtime and only shows up as a bundler warning (FPO-30).
//
export const cliOptions = {
  cwd: {
    args: "<path string>",
    desc: "set fynpo's working directory",
  },
  ignore: {
    alias: "i",
    args: "<vals string..>",
    desc: "list of packages to ignore",
    allowCmd: ["bootstrap", "local", "run"],
  },
  scope: {
    alias: "s",
    args: "<vals string..>",
    desc: "include only packages with names matching the given scopes",
    allowCmd: ["bootstrap", "local", "run"],
  },
  deps: {
    alias: "d",
    args: "[val number]",
    argDefault: "10",
    desc: "level of deps to include even if they were ignored",
    allowCmd: ["bootstrap", "local", "run"],
  },
  commit: {
    args: "[flag boolean]",
    argDefault: "true",
    desc: "commit the changes to changelog and package.json (use --no-commit to disable)",
    allowCmd: ["changelog", "version", "prepare"],
  },
  "force-publish": {
    alias: "fp",
    args: "<vals string..>",
    desc: "force publish packages",
    allowCmd: ["updated", "changelog", "version"],
  },
  //
  // One option, two readers, same shape (a list of package names):
  //   - bootstrap/local/run filter the topo set by it (topo-runner.ts)
  //   - updated/changelog/version/prepare treat it as the selective-release
  //     selection, expanded across version lock groups (utils.expandSelection)
  // These were once two entries under the same key, so the second silently shadowed
  // the first and cost bootstrap/local/run the option entirely. See FPO-30.
  //
  only: {
    alias: "o",
    args: "<vals string..>",
    desc: "limit to these packages (for a release, version lock groups expand)",
    allowCmd: ["bootstrap", "local", "run", "updated", "changelog", "version", "prepare"],
  },
  "ignore-changes": {
    alias: "ic",
    args: "<vals string..>",
    desc: "ignore patterns",
    allowCmd: ["updated", "changelog", "version"],
  },
  "save-log": {
    alias: "sl",
    desc: "save logs to fynpo-debug.log",
  },
};

export const fynpoMain = () => {
  const nixClap = new NixClap({
    name: myPkg.name,
    usage: "$0 [command] [options]",
    defaultCommand: "bootstrap" // Run bootstrap when no command is given
  });
  nixClap.version(myPkg.version);


  const subCommands = {
    bootstrap: {
      alias: "b",
      desc: "bootstrap packages",
      exec: execBootstrap,
      options: {
        build: {
          args: "[flag boolean]",
          argDefault: "true",
          desc: "run npm script build if no prepare (use --no-build to disable)",
        },
        concurrency: {
          alias: "cc",
          args: "[val number]",
          argDefault: "6",
          desc: "number of packages to bootstrap concurrently",
        },
        skip: {
          args: "<vals string..>",
          desc: "list of packages to skip running fyn install on, but won't ignore",
        },
      },
    },
    local: {
      alias: "l",
      desc: "update packages dependencies to point to local",
      exec: execLocal,
    },
    prepare: {
      alias: "p",
      desc: "Prepare packages versions for publish",
      exec: execPrepare,
      options: {
        tag: {
          desc: "create tags for individual packages",
        },
      },
    },
    updated: {
      alias: "u",
      desc: "list changed packages",
      exec: execUpdated,
    },
    changelog: {
      alias: "c",
      desc: "Update changelog",
      exec: execChangelog,
      options: {
        publish: {
          desc: "enable to trigger publish with changelog commit",
        },
        tag: {
          desc: "create tags for individual packages",
        },
      },
    },
    run: {
      alias: "r",
      desc: "Run passed npm script in each package",
      args: "<script string>",
      exec: execRunScript,
      options: {
        stream: {
          desc: "stream output from child processes, prefixed with the originating package name",
        },
        parallel: {
          desc: "run script immediately in up to concurrency number of matching packages",
        },
        prefix: {
          args: "[flag boolean]",
          argDefault: "true",
          desc: "add package name prefixing for stream output (use --no-prefix to disable)",
        },
        bail: {
          args: "[flag boolean]",
          argDefault: "true",
          desc: "immediately stop if any package's script fail (use --no-bail to disable)",
        },
        concurrency: {
          alias: "cc",
          args: "[val number]",
          argDefault: "6",
          desc: "number of packages to run script concurrently when parallel is not set",
        },
        sort: {
          args: "[flag boolean]",
          argDefault: "true",
          desc: "run the script through packages in topological sort order (use --no-sort to disable)",
        },
        cache: {
          desc: "cache the run results",
        },
      },
    },
    version: {
      alias: "v",
      desc: "Update changelog and bump version",
      exec: execVersion,
      options: {
        tag: {
          desc: "create tags for individual packages",
        },
      },
    },
    publish: {
      alias: "pb",
      desc: "Publish Packages",
      exec: execPublish,
      options: {
        "dist-tag": {
          args: "<tag string>",
          desc: "set publish tag for all packages",
        },
        "dry-run": {
          desc: "publish dry run",
        },
        push: {
          args: "[flag boolean]",
          argDefault: "true",
          desc: "push release tag to remote (use --no-push to skip)",
        },
      },
    },
    init: {
      alias: "i",
      desc: "Initialize a new fynpo repo",
      exec: execInit,
      options: {
        commitlint: {
          desc: "To add commitlint configuration",
        },
      },
    },
    commitlint: {
      alias: "cl",
      desc: "Commit lint",
      exec: execLinting,
      options: {
        config: {
          args: "<path string>",
          desc: "path to the config file",
        },
        color: {
          alias: "c",
          args: "[flag boolean]",
          argDefault: "true",
          desc: "toggle colored output (use --no-color to disable)",
        },
        edit: {
          alias: "e",
          args: "<file string>",
          desc: "read last commit message from the specified file or fallbacks to ./.git/COMMIT_EDITMSG",
        },
        verbose: {
          alias: "V",
          desc: "enable verbose output for reports without problems",
        },
      },
    },
  };

  nixClap.init2({
    options: cliOptions,
    subCommands
  });

  return nixClap.parseAsync();
};
