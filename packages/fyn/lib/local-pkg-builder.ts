/* eslint-disable max-statements */

/**
 * Before linking a local dep, go into its dir and run fyn install
 *
 * - TODO: impl timestamp check so if no files updated then don't run
 */

import Path from "path";
import logger from "./logger";
import PromiseQueue from "./util/promise-queue";
import { VisualExec } from "visual-exec";
import * as xaa from "xaa";
import Fs from "./util/file-ops";
import _ from "lodash";
import chalk from "chalk";
import { runNpmScript } from "./util/run-npm-script";
import { AggregateError } from "@jchip/error";

class LocalPkgBuilder {
  constructor(options) {
    this._options = options;
    this._fyn = options.fyn;
    this._waitItems = {};
    this._failedItems = {};
  }

  async start() {
    this._started = xaa.makeDefer();

    this._promiseQ = new PromiseQueue({
      concurrency: 1,
      stopOnError: false,
      processItem: x => this.processItem(x)
    });

    const cliFynJs = Path.join(__dirname, "../cli/fyn.js");
    if (await Fs.exists(cliFynJs)) {
      this._fynJs = cliFynJs;
    } else {
      this._fynJs = Path.join(__dirname, "../bin/fyn.js");
    }

    const { localsByDepth } = this._options;

    this._promiseQ.on("doneItem", data => {
      this._waitItems[data.item.fullPath].resolve({});
    });
    this._promiseQ.on("failItem", data => {
      const debugLog = Path.join(data.item.fullPath, "fyn-debug.log");
      const error: any = data.error;
      const output: any = error?.output;
      const dispPath = Path.relative(this._options.fyn._cwd, data.item.fullPath);
      
      // Extract primary error message
      let primaryError: string | null = null;
      const errorLines: string[] = [];
      
      if (output) {
        const stderr = output.stderr || "";
        const stdout = output.stdout || "";
        
        // Priority patterns - more specific errors first
        const priorityPatterns = [
          /TypeError:\s*(.+)/i,
          /SyntaxError:\s*(.+)/i,
          /ReferenceError:\s*(.+)/i,
          /EACCES|ENOENT|EADDRINUSE/i, // System errors
        ];
        
        const generalPatterns = [
          /Error:\s*(.+)/i,
          /failed|failure|fatal/i
        ];
        
        // Extract error lines from stderr first (usually more relevant)
        const stderrLines = stderr.split("\n");
        for (let i = stderrLines.length - 1; i >= 0; i--) {
          const line = stderrLines[i].trim();
          if (!line) continue;
          
          // Check for priority errors first (TypeError, SyntaxError, etc.)
          const priorityMatch = priorityPatterns.find(pattern => pattern.test(line));
          if (priorityMatch) {
            if (!primaryError) {
              primaryError = line;
            }
            errorLines.unshift(line);
            if (errorLines.length >= 10) break; // Get more lines for priority errors
          } else {
            // Check for general errors
            const generalMatch = generalPatterns.find(pattern => pattern.test(line));
            if (generalMatch) {
              // Only set as primary if we don't have one and it's not a generic "shell cmd" wrapper
              if (!primaryError && !line.includes("shell cmd") && !line.includes("exit code")) {
                primaryError = line;
              }
              errorLines.unshift(line);
              if (errorLines.length >= 5) break;
            }
          }
        }
        
        // If no errors in stderr, check stdout
        if (errorLines.length === 0) {
          const stdoutLines = stdout.split("\n");
          for (let i = stdoutLines.length - 1; i >= 0; i--) {
            const line = stdoutLines[i].trim();
            if (!line) continue;
            
            const priorityMatch = priorityPatterns.find(pattern => pattern.test(line));
            if (priorityMatch) {
              if (!primaryError) {
                primaryError = line;
              }
              errorLines.unshift(line);
              if (errorLines.length >= 10) break;
            } else {
              const generalMatch = generalPatterns.find(pattern => pattern.test(line));
              if (generalMatch) {
                if (!primaryError && !line.includes("shell cmd") && !line.includes("exit code")) {
                  primaryError = line;
                }
                errorLines.unshift(line);
                if (errorLines.length >= 5) break;
              }
            }
          }
        }
      }
      
      // Log improved error message (without prefix)
      logger.prefix("").error(chalk.red("=".repeat(80)));
      logger.prefix("").error(`${chalk.red("✗")} ${chalk.bold(`Failed to build local package`)} at ${chalk.blue(dispPath)}`);
      logger.prefix("").error(chalk.red("=".repeat(80)));
      
      if (primaryError) {
        logger.prefix("").error(`${chalk.red("Primary Error:")}`);
        logger.prefix("").error(chalk.red(primaryError));
      } else if (errorLines.length > 0) {
        logger.prefix("").error(`${chalk.red("Error Summary:")}`);
        errorLines.forEach(line => {
          logger.prefix("").error(chalk.red(`  ${line}`));
        });
      } else if (error?.message) {
        logger.prefix("").error(`${chalk.red("Error:")} ${error.message}`);
      }
      
      // Log nested AggregateError messages - recursively extract all nested errors
      const extractNestedErrors = (err: any, depth = 0, seen = new Set()): any[] => {
        const errors: any[] = [];
        if (!err || typeof err !== "object" || seen.has(err)) {
          return errors;
        }
        seen.add(err);
        
        // Check if it's an AggregateError (has errors property)
        try {
          const errErrors = (err as any)?.errors;
          if (errErrors !== undefined && errErrors !== null && Array.isArray(errErrors) && errErrors.length > 0) {
            errErrors.forEach((nestedErr: any) => {
              if (nestedErr && !seen.has(nestedErr)) {
                errors.push(nestedErr);
                // Recursively extract nested errors
                errors.push(...extractNestedErrors(nestedErr, depth + 1, seen));
              }
            });
          }
        } catch (e) {
          // Ignore errors accessing the errors property
        }
        return errors;
      };
      
      const nestedErrors = extractNestedErrors(error);
      if (nestedErrors.length > 0) {
        logger.prefix("").error(`\n${chalk.yellow("Nested Errors:")}`);
        const shownMessages = new Set<string>();
        nestedErrors.forEach((nestedErr: any, idx: number) => {
          const errMsg = nestedErr?.message || nestedErr?.toString() || String(nestedErr);
          // Skip if it's the same as the primary error, already shown, or empty
          if (errMsg && errMsg.trim() && errMsg !== primaryError && !shownMessages.has(errMsg)) {
            shownMessages.add(errMsg);
            logger.prefix("").error(chalk.yellow(`  ${idx + 1}. ${errMsg}`));
          }
        });
      }
      
      if (error?.command) {
        logger.prefix("").error(`\n${chalk.yellow("Command:")} ${error.command}`);
      }
      if (error?.code !== undefined) {
        logger.prefix("").error(`${chalk.yellow("Exit Code:")} ${error.code}`);
      }
      
      logger.prefix("").error(`\n${chalk.dim("For full error details, check:")} ${chalk.cyan(debugLog)}`);
      logger.prefix("").error(chalk.red("=".repeat(80)));
      
      const buildError = new AggregateError(
        [data.error],
        `failed build local package at ${data.item.fullPath} - check ${debugLog} for details`
      );
      // Mark this error as already logged to avoid redundant output
      (buildError as any)._fynAlreadyLogged = true;
      
      const itemRes = {
        error: buildError
      };
      this._waitItems[data.item.fullPath].resolve(itemRes);
      this._failedItems[data.item.fullPath] = itemRes;
    });

    this._defer = xaa.makeDefer();

    this._promiseQ.on("done", () => {
      if (!this._promiseQ.isPending) {
        this._defer.resolve();
      }
    });

    this._promiseQ.on("fail", data => {
      this._defer.reject(new AggregateError([data.error], `failed to build local packages`));
    });

    //
    // localsByDepth is array of array: level 1 depths, level 2 packages
    //
    const flatLocals = [].concat(...localsByDepth);
    const allPaths = flatLocals.map(x => x.fullPath);

    //
    // convert items into array of paths and then use _.uniq to only keep
    // the first occurrence of duplicate paths, and reverse them so the
    // ones that has no dependence on the ones before them are build first.
    //
    const uniqPaths = _.uniq(allPaths).reverse();
    const byPathLookup = flatLocals.reduce((a, x) => {
      a[x.fullPath] = x;
      return a;
    }, {});
    logger.debug("local pkgs for build all paths", allPaths, "uniq paths", uniqPaths);

    for (const path of uniqPaths) {
      await this.addItem(byPathLookup[path]);
    }

    logger.debug("resolving build local _started promise");
    this._started.resolve();
  }

  async addItem(item) {
    if (this._waitItems[item.fullPath] !== undefined) {
      logger.debug(`local pkg at ${item.fullPath} already being built`);
      return;
    }

    const checkPkg = await this._fyn.getLocalPkgInstall(item.fullPath);

    this._waitItems[item.fullPath] = false;

    // TODO: if one of its deps is a local and needed install, then it'd
    // need to be installed also, even if its own files didn't change.
    // Generally this is unnecessary, except if its build process may
    // depend on that downstream local package.
    if (!checkPkg.localBuild) {
      logger.debug(`local pkg at ${item.fullPath} doesn't need build`, checkPkg);
      return;
    }

    if (checkPkg.pkgJson.name === this._fyn._pkg.name) {
      logger.debug(`local pkg at ${item.fullPath} is self, skipping build`);
      return;
    }

    logger.debug(
      `building local pkg at ${item.fullPath}`,
      "ctime:",
      checkPkg.ctime,
      "checkCtime",
      checkPkg.checkCtime,
      "stats",
      JSON.stringify(checkPkg.stats, null, 2), // eslint-disable-line
      this._fyn._installConfig
    );

    this._promiseQ.addItem(item);

    this._waitItems[item.fullPath] = xaa.makeDefer();
  }

  async waitForItem(fullPath) {
    if (this._waitItems[fullPath] === undefined && this._started.promise) {
      logger.debug("waiting for local build item start, fullPath:", fullPath);
      await this._started.promise;
    }
    const x = this._waitItems[fullPath];
    // assert(x !== undefined, `No local pkg build job started for pkg at ${fullPath}`);

    if (x && x.promise) {
      logger.debug("waiting for build local item", fullPath, x);
      const localBuildResult = await x.promise;
      logger.debug("build local item awaited", fullPath);
      return localBuildResult;
    } else {
      logger.debug("no build local job for pkg at", fullPath, x);
    }

    return {};
  }

  waitForDone() {
    return this._defer && this._defer.promise;
  }

  async processItem(item) {
    if (!_.isEmpty(this._failedItems)) {
      return {};
    }
    const dispPath = Path.relative(this._options.fyn._cwd, item.fullPath);

    const command = [
      process.argv[0],
      this._fynJs,
      this._fyn._options.registry && `--reg=${this._fyn._options.registry}`,
      "-q=d --pg=simple --no-build-local --sl=fyn-debug.log",
      !this._fyn._options.sourceMaps && "--no-source-maps",
      "install --no-audit"
    ]
      .filter(x => x)
      .join(" ");

    const displayTitle = `building local pkg at ${dispPath}`;
    logger.verbose(displayTitle);

    const ve = new VisualExec({
      displayTitle,
      cwd: item.fullPath,
      command,
      visualLogger: logger
    });

    ve.logFinalOutput = _.noop;

    try {
      await ve.execute();
    } catch (err: any) {
      // Ensure error has command context for better error reporting
      if (err && !err.command) {
        err.command = command;
      }
      throw err;
    }

    const pkgJsonFile = Path.join(item.fullPath, "package.json");
    let pkgJson;
    const prePkgJson = (pkgJson = JSON.parse(await Fs.readFile(pkgJsonFile)));

    if (_.get(prePkgJson, "scripts.prepublish") !== undefined) {
      if (_.get(prePkgJson, "scripts.prepare") !== undefined) {
        logger.warn(`
  Local package has 'prepare' and 'prepublish', skipping 'prepublish'.  dir at ${dispPath} 
        `);
      } else {
        logger.warn(`
  Build local dep package - running npm script 'prepublish' at ${dispPath}

  ==NOTE== While fyn will run 'prepublish' as part of installing this local package as a dependency,
  ==NOTE== Please note that npm deprecated this script and recommend other npm lifecycle script
  ==NOTE== such as 'prepare'.  See docs here https://docs.npmjs.com/cli/v7/using-npm/scripts#prepare-and-prepublish
  ==NOTE== If you want to use 'prepublishOnly', please note that fyn won't execute it as part of
  ==NOTE== installing local packages.
`);
        await runNpmScript({
          scripts: ["prepublish"],
          appDir: item.fullPath,
          dir: item.fullPath,
          fyn: this._fyn,
          depInfo: item,
          pkgJson: prePkgJson
        });
        pkgJson = JSON.parse(await Fs.readFile(pkgJsonFile));
      }
    }

    if (_.get(prePkgJson, "scripts.prepack") !== undefined) {
      logger.debug(`Build local dep package - running npm script 'prepack' at ${dispPath}`);
      await runNpmScript({
        scripts: ["prepack"],
        appDir: item.fullPath,
        dir: item.fullPath,
        fyn: this._fyn,
        depInfo: item,
        pkgJson: prePkgJson
      });
      pkgJson = JSON.parse(await Fs.readFile(pkgJsonFile));
    }

    if (_.get(pkgJson, "scripts.postpack") !== undefined) {
      logger.debug(`Build local dep package - running npm script 'postpack' at ${dispPath}`);
      await runNpmScript({
        scripts: ["postpack"],
        appDir: item.fullPath,
        dir: item.fullPath,
        fyn: this._fyn,
        depInfo: item,
        pkgJson
      });
    }

    return { pkgJson };
  }
}

export { LocalPkgBuilder };