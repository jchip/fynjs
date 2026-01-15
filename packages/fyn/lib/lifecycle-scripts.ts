/* eslint-disable no-magic-numbers, max-statements, no-eval, camelcase, no-param-reassign */

//
// execute npm scripts
//
// NOTE: This is fyn's custom lifecycle script executor used during package installation.
// It differs from @npmcli/run-script (used in cli/fyn-cli.js for `fyn run` commands) because:
// - Sets custom npm_config_* environment variables from .npmrc files
// - Provides VisualExec for custom progress display during installation
// - Handles fynpo-specific PATH setup for monorepo support
// - Custom error handling with AggregateError for better debugging
//

import Path from "path";
import { createRequire } from "module";
import makeOptionalRequire from "optional-require";
import assert from "assert";
import xsh from "xsh";
import chalk from "chalk";
import _ from "lodash";
import logger from "./logger";
import logFormat from "./util/log-format";
import { VisualExec } from "visual-exec";
import fyntil from "./util/fyntil";
import requireAt from "require-at";
import { setupNodeGypEnv } from "./util/setup-node-gyp";
import * as xaa from "xaa";
import npmConfigEnv from "./util/npm-config-env";
import { AggregateError } from "@jchip/error";
import type { PackageJson } from "./types";

const optionalRequire = makeOptionalRequire(createRequire(import.meta.url));

/** Fyn instance interface for lifecycle scripts */
interface FynForLifecycle {
  allrc?: Record<string, unknown>;
  isFynpo?: boolean;
  _fynpo?: { dir: string };
  initCwd?: string;
  cwd?: string;
}

/** Options for LifecycleScripts constructor */
interface LifecycleScriptsOptions {
  dir: string;
  appDir?: string;
  json?: Partial<PackageJson>;
  _fyn?: FynForLifecycle;
}

/** Environment variables */
type EnvVars = Record<string, string | undefined>;

const readPkgJson = (dir: string): Promise<Partial<PackageJson>> => {
  return fyntil.readPkgJson(dir).catch(() => {
    return {};
  });
};

// When released, all code are bundled into dist/fyn.js
// When running from original source, this is under lib/lifecycle-scripts.js
// It's important to maintain same level so "../package.json" works.
const fynInstalledDir = Path.dirname(optionalRequire.resolve("../package.json"));
const fynCli = requireAt(fynInstalledDir).resolve("./bin/fyn.js");

/*
 * ref: https://github.com/npm/npm/blob/75b462c19ea16ef0d7f943f94ff4d255695a5c0d/lib/utils/lifecycle.js
 * docs: https://docs.npmjs.com/misc/scripts
 *
 */

const ONE_MB = 1024 * 1024;

class LifecycleScripts {
  private _fyn: FynForLifecycle;
  private _pkgDir: string;
  private _options: LifecycleScriptsOptions;
  private _appDir?: string;
  private _appPkg: Partial<PackageJson>;
  private _pkg: Partial<PackageJson>;

  constructor(options: string | LifecycleScriptsOptions) {
    if (typeof options === "string") {
      options = { dir: options };
    }
    this._fyn = options._fyn || {};
    this._pkgDir = options.dir;
    this._options = Object.assign({}, options);
    this._appPkg = {};
    this._pkg = {};
  }

  makeEnv(override?: EnvVars): EnvVars {
    // let env = Object.assign({}, process.env, override);
    // this._addNpmPackageConfig(this._appPkg.config, env);
    // this._addNpmPackageConfig(this._pkg.config, env);

    const env = Object.assign({}, npmConfigEnv(this._pkg, this._fyn.allrc || {}), override);

    setupNodeGypEnv(env);

    // add fynpo node_modules/.bin to PATH
    if (this._fyn.isFynpo) {
      xsh.envPath.addToFront(Path.join(this._fyn._fynpo.dir, "node_modules/.bin"), env);
    }

    if (this._appDir) {
      xsh.envPath.addToFront(Path.join(this._appDir, "node_modules/.bin"), env);
    }
    xsh.envPath.addToFront(Path.join(this._pkgDir, "node_modules/.bin"), env);

    // env.npm_lifecycle_event = stage;  // TODO

    env.npm_node_execpath = env.NODE = env.NODE || process.execPath;
    env.npm_execpath = fynCli;
    // INIT_CWD should be the directory where fyn was invoked (matches npm behavior).
    // PWD is set to the package directory in _execute().
    // Use initCwd which preserves original invocation directory (important for global installs
    // where cwd is a temp directory)
    env.INIT_CWD = this._fyn.initCwd || this._fyn.cwd || process.cwd();

    return env;
  }

  execute(aliases: string | string[], silent?: boolean): Promise<unknown> {
    return xaa.wrap(() => this._execute(aliases, silent));
  }

  async _initialize(): Promise<void> {
    const options = this._options;
    if (options.appDir && options.appDir !== options.dir) {
      this._appDir = options.appDir;
      this._appPkg = await readPkgJson(this._appDir);
    } else {
      this._appPkg = {};
    }

    this._pkg = options.json || (await readPkgJson(this._pkgDir));
    assert(this._pkg, `Unable to load package.json from ${this._pkgDir}`);
    if (!this._pkg.scripts) {
      this._pkg.scripts = {};
    }
  }

  async _execute(aliases: string | string[], silent?: boolean): Promise<unknown> {
    if (!this._pkg.name) {
      await this._initialize();
    }

    if (typeof aliases === "string") aliases = [aliases];

    const scripts = this._pkg.scripts;
    if (!scripts) {
      return false;
    }

    const name = _.keys(scripts).find(x => aliases.indexOf(x) >= 0);

    if (!name || !scripts.hasOwnProperty(name)) {
      return false;
    }

    assert(scripts[name], `No npm script ${name} found in package.json in ${this._pkgDir}.`);

    const scriptCommand = scripts[name];
    const pkgName = logFormat.pkgId(this._pkg);
    const dimPkgName = chalk.dim(pkgName);
    const scriptName = chalk.magenta(name);
    const script = `"${chalk.cyan(scriptCommand)}"`;
    const pkgDir = logFormat.pkgPath(
      this._pkg.name,
      this._pkgDir.replace(this._fyn.cwd || "", ".")
    );

    const env = this.makeEnv({ PWD: this._pkgDir });

    logger.verbose(
      `running npm script '${scriptName}' of ${dimPkgName}: ${script} - at dir ${pkgDir}`
    );

    const child = xsh.exec(
      {
        silent,
        cwd: this._pkgDir,
        env,
        maxBuffer: 20 * ONE_MB
      },
      scriptCommand
    );

    // exec not silent so it's dumping to stdout
    // and it's not a good idea to try to show visual progress of the execution
    if (!silent) {
      return child.promise;
    }

    const ve = new VisualExec({
      command: scriptCommand,
      cwd: this._pkgDir,
      visualLogger: logger,
      displayTitle: `Running ${scriptName} of ${pkgName}`,
      logLabel: `${pkgName} npm script ${scriptName}`,
      outputLabel: `${dimPkgName} npm script ${scriptName}`
    });

    try {
      return await ve.show(child);
    } catch (err: any) {
      // Extract error information from nested errors and output
      const output: any = err?.output;
      let primaryError: string | null = null;
      const errorLines: string[] = [];
      const usefulStackLines: string[] = [];
      
      // First, extract nested errors recursively to find the actual error
      const extractNestedErrors = (error: any, seen = new Set()): any[] => {
        const errors: any[] = [];
        if (!error || typeof error !== "object" || seen.has(error)) {
          return errors;
        }
        seen.add(error);
        
        try {
          const errErrors = error?.errors;
          if (errErrors !== undefined && errErrors !== null && Array.isArray(errErrors) && errErrors.length > 0) {
            errErrors.forEach((nestedErr: any) => {
              if (nestedErr && !seen.has(nestedErr)) {
                errors.push(nestedErr);
                errors.push(...extractNestedErrors(nestedErr, seen));
              }
            });
          }
        } catch (e) {
          // Ignore errors accessing the errors property
        }
        return errors;
      };
      
      const allNestedErrors = [err, ...extractNestedErrors(err)];
      
      // Extract useful error messages and stack traces from nested errors
      for (const nestedErr of allNestedErrors) {
        if (!nestedErr) continue;
        
        const errMsg = nestedErr?.message || nestedErr?.toString() || String(nestedErr);
        if (errMsg && errMsg.trim()) {
          // Skip generic wrapper messages
          if (!errMsg.includes("Failed running npm script") && 
              !errMsg.includes("AggregateError") &&
              !errMsg.match(/^\s*at\s+/)) {
            if (!primaryError && !errMsg.includes("shell cmd")) {
              primaryError = errMsg;
            }
            if (!errorLines.includes(errMsg)) {
              errorLines.push(errMsg);
            }
          }
        }
        
        // Extract useful stack trace lines (skip internal fyn/clap code, show user code)
        if (nestedErr?.stack) {
          const stackLines = nestedErr.stack.split("\n");
          for (const line of stackLines) {
            const trimmed = line.trim();
            // Include lines that show actual error locations (not just fyn internals)
            if (trimmed && 
                trimmed.startsWith("at ") && 
                !trimmed.includes("/fyn/lib/") &&
                !trimmed.includes("/fyn/cli/") &&
                !trimmed.includes("/nix-clap/") &&
                !trimmed.includes("/xsh/") &&
                !trimmed.includes("node:internal") &&
                usefulStackLines.length < 5) {
              usefulStackLines.push(trimmed);
            }
          }
        }
      }
      
      // Also check output stderr/stdout for additional error info
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
          
          const priorityMatch = priorityPatterns.find(pattern => pattern.test(line));
          if (priorityMatch) {
            if (!primaryError) {
              primaryError = line;
            }
            if (!errorLines.includes(line)) {
              errorLines.unshift(line);
            }
            if (errorLines.length >= 10) break;
          } else {
            const generalMatch = generalPatterns.find(pattern => pattern.test(line));
            if (generalMatch) {
              if (!primaryError && !line.includes("shell cmd") && !line.includes("exit code")) {
                primaryError = line;
              }
              if (!errorLines.includes(line)) {
                errorLines.unshift(line);
              }
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
              if (!errorLines.includes(line)) {
                errorLines.unshift(line);
              }
              if (errorLines.length >= 10) break;
            } else {
              const generalMatch = generalPatterns.find(pattern => pattern.test(line));
              if (generalMatch) {
                if (!primaryError && !line.includes("shell cmd") && !line.includes("exit code")) {
                  primaryError = line;
                }
                if (!errorLines.includes(line)) {
                  errorLines.unshift(line);
                }
                if (errorLines.length >= 5) break;
              }
            }
          }
        }
      }
      
      // Log improved error message (without prefix)
      logger.prefix("").error(chalk.red("=".repeat(80)));
      logger.prefix("").error(`${chalk.red("✗")} ${chalk.bold(`Failed running npm script`)} ${chalk.magenta(`'${name}'`)} ${chalk.bold(`for package`)} ${chalk.blue(pkgName)} ${chalk.bold(`at`)} ${chalk.blue(pkgDir)}`);
      logger.prefix("").error(chalk.red("=".repeat(80)));
      
      if (primaryError) {
        logger.prefix("").error(`\n${chalk.red("Error:")}`);
        logger.prefix("").error(chalk.red(primaryError));
      } else if (errorLines.length > 0) {
        logger.prefix("").error(`\n${chalk.red("Error Summary:")}`);
        errorLines.slice(0, 5).forEach(line => {
          logger.prefix("").error(chalk.red(`  ${line}`));
        });
      } else if (err?.message) {
        logger.prefix("").error(`\n${chalk.red("Error:")} ${err.message}`);
      }
      
      // Show useful stack trace lines if available
      if (usefulStackLines.length > 0) {
        logger.prefix("").error(`\n${chalk.dim("Stack trace:")}`);
        usefulStackLines.forEach(line => {
          logger.prefix("").error(chalk.dim(`  ${line}`));
        });
      }
      
      if (err?.command) {
        logger.prefix("").error(`\n${chalk.yellow("Command:")} ${err.command}`);
      }
      if (err?.code !== undefined) {
        logger.prefix("").error(`${chalk.yellow("Exit Code:")} ${err.code}`);
      }
      
      logger.prefix("").error(`\n${chalk.dim("For full error details, check:")} ${chalk.cyan(Path.join(this._pkgDir, "fyn-debug.log"))}`);
      logger.prefix("").error(chalk.red("=".repeat(80)) + "\n");
      
      const buildError = new AggregateError(
        [err],
        `Failed running npm script '${name}' for package ${pkgName} at ${pkgDir}`
      );
      // Mark this error as already logged to avoid redundant output
      (buildError as any)._fynAlreadyLogged = true;
      
      throw buildError;
    }
  }
}

export default LifecycleScripts;