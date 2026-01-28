/* eslint-disable no-magic-numbers, consistent-return, complexity */

import Fs from "fs";
import Path from "path";
import _ from "lodash";
import { ItemQueueResult } from "item-queue";
import { logger } from "./logger";
import chalk from "chalk";
import { isCI } from "./is-ci";
import {
  FynpoDepGraph,
  FynpoPackageInfo,
  FynpoTopoPackages,
  PackageDepData,
  pkgInfoId,
} from "@fynpo/base";

import { TopoRunner } from "./topo-runner";
import { PkgBuildCache } from "./caching";
import * as xaa from "xaa";
import { InstallDeps } from "./install-deps";
import { checkGlobalFynVersion } from "./utils";

type PackageInstallInfo = {
  depData: PackageDepData;
  status?: string;
};

export class Bootstrap {
  _opts;
  graph: FynpoDepGraph;
  topoPkgs: FynpoTopoPackages;
  installInfo: Record<string, PackageInstallInfo>;
  _topoRunner: TopoRunner;

  constructor(graph: FynpoDepGraph, opts) {
    this._opts = opts;
    this.topoPkgs = graph.getTopoSortPackages();
    this._topoRunner = new TopoRunner(this.topoPkgs, opts);
    this.graph = graph;
  }

  get cwd() {
    return this._opts.cwd;
  }

  get failed() {
    return this._topoRunner._errors.length > 0 ? 1 : 0;
  }

  get elapsedTime() {
    return this._topoRunner._totalTime;
  }

  logErrors() {
    _.each(this._topoRunner._errors, (data: ItemQueueResult<PackageInstallInfo>) => {
      const pkgInfo = data.item?.depData?.pkgInfo;
      const name = pkgInfo?.name;
      const path = pkgInfo?.path;
      const error: any = data.error;
      const output: any = error.output;

      logger.prefix("").error(chalk.red("=".repeat(80)));
      logger.prefix("").error(`${chalk.red("✗")} ${chalk.bold(`Failed to bootstrap ${chalk.magenta(name)}`)} at ${chalk.blue(path)}`);
      logger.prefix("").error(chalk.red("=".repeat(80)));

      if (!output) {
        logger.prefix("").error(`${chalk.yellow("Error:")}`, error?.message || error);
        logger.prefix("").error(`${chalk.dim("Full error details are available in:")} ${chalk.cyan(Path.join(this.cwd, path, "fyn-debug.log"))}`);
        return;
      }

      // Extract key error information
      const stderr = output.stderr || "";
      const stdout = output.stdout || "";

      // Priority patterns - more specific errors first (TypeError, SyntaxError, etc.)
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

      let primaryError: string | null = null;
      const errorLines: string[] = [];

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

      // If no errors found in stderr, check stdout
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

      // Display primary error prominently
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

      // Show command that failed
      if (error?.command || error?.message) {
        logger.prefix("").error(`\n${chalk.yellow("Command:")} ${error.command || error.message}`);
      }

      // Show exit code if available
      if (error?.code !== undefined) {
        logger.prefix("").error(`${chalk.yellow("Exit Code:")} ${error.code}`);
      }

      // For CI or verbose mode, show full output
      if (isCI) {
        logger.prefix("").error(`${chalk.yellow("=".repeat(80))}`);
        logger.prefix("").error(`${chalk.yellow("Full Output (CI mode):")}`);
        
        if (stdout) {
          const stdoutLines = stdout.split("\n");
          if (stdoutLines.length > 100) {
            logger.prefix("").error(`${chalk.dim("Last 50 lines of stdout:")}`);
            logger.prefix("").error(stdoutLines.slice(stdoutLines.length - 50).join("\n"));
          } else {
            logger.prefix("").error(`${chalk.dim("stdout:")}`);
            logger.prefix("").error(stdout);
          }
        }

        if (stderr) {
          const stderrLines = stderr.split("\n");
          if (stderrLines.length > 100) {
            logger.prefix("").error(`${chalk.dim("Last 50 lines of stderr:")}`);
            logger.prefix("").error(stderrLines.slice(stderrLines.length - 50).join("\n"));
          } else {
            logger.prefix("").error(`${chalk.dim("stderr:")}`);
            logger.prefix("").error(stderr);
          }
        }
      } else {
        // In non-CI mode, show a summary and point to debug log
        if (errorLines.length > 0 && errorLines.length < 10) {
          logger.error(`\n${chalk.yellow("Error Details:")}`);
          errorLines.forEach(line => {
            logger.error(chalk.dim(`  ${line}`));
          });
        }
      }

      // Always point to debug log for full details
      const debugLog = Path.join(this.cwd, path, "fyn-debug.log");
      logger.error(`\n${chalk.dim("For full error details, check:")} ${chalk.cyan(debugLog)}`);
      logger.error(chalk.red("=".repeat(80)) + "\n");
    });
  }

  async aggregateAuditResults(): Promise<void> {
    const reports: {
      pkgInfo: FynpoPackageInfo;
      report: {
        vulnerabilities?: Array<{ advisory?: { severity?: string } }>;
        metadata?: { totalDependencies?: number };
      };
    }[] = [];

    for (const depData of this.topoPkgs.sorted) {
      const pkgInfo = depData.pkgInfo;
      const auditPath = Path.join(this.cwd, pkgInfo.path, ".fyn-audit.json");
      try {
        const content = await Fs.promises.readFile(auditPath, "utf8");
        const report = JSON.parse(content);
        reports.push({ pkgInfo, report });
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          logger.warn(`Failed to read audit report for ${pkgInfo.name} at ${pkgInfo.path}: ${err.message}`);
        }
      }
    }

    if (reports.length === 0) {
      logger.info("No audit reports found from bootstrap.");
      return;
    }

    const severityOrder = ["critical", "high", "moderate", "low", "info"] as const;
    const severityColors = {
      critical: chalk.red.bold,
      high: chalk.red,
      moderate: chalk.yellow,
      low: chalk.cyan,
      info: chalk.blue
    };

    const totals = {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0
    };
    const perPackage: {
      pkgInfo: FynpoPackageInfo;
      counts: Record<string, number>;
      total: number;
    }[] = [];
    let totalDependencies = 0;

    for (const { pkgInfo, report } of reports) {
      const vulnerabilities = Array.isArray(report.vulnerabilities) ? report.vulnerabilities : [];
      const counts: Record<string, number> = {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0
      };

      for (const vuln of vulnerabilities) {
        const severity = vuln?.advisory?.severity;
        if (severity && counts[severity] !== undefined) {
          counts[severity] += 1;
        }
      }

      totalDependencies += report?.metadata?.totalDependencies || 0;
      const total = vulnerabilities.length;
      severityOrder.forEach(sev => {
        totals[sev] += counts[sev];
      });

      if (total > 0) {
        perPackage.push({ pkgInfo, counts, total });
      }
    }

    const totalVulns = severityOrder.reduce((sum, sev) => sum + totals[sev], 0);
    logger.info(chalk.bold("Security audit summary (bootstrap)"));
    logger.info(`audited ${totalDependencies} packages across ${reports.length} workspaces`);

    if (totalVulns === 0) {
      logger.info(chalk.green("No vulnerabilities found."));
      return;
    }

    const summaryParts = severityOrder
      .filter(sev => totals[sev] > 0)
      .map(sev => severityColors[sev](`${totals[sev]} ${sev}`));
    logger.warn(`${totalVulns} vulnerabilities (${summaryParts.join(", ")})`);

    if (perPackage.length > 0) {
      const maxPackages = 20;
      logger.warn("Vulnerabilities by package:");
      perPackage.slice(0, maxPackages).forEach(({ pkgInfo, counts, total }) => {
        const parts = severityOrder
          .filter(sev => counts[sev] > 0)
          .map(sev => severityColors[sev](`${counts[sev]} ${sev}`));
        logger.warn(
          `${chalk.magenta(pkgInfo.name)} ${chalk.blue(pkgInfo.path)} - ${total} total (${parts.join(", ")})`
        );
      });
      if (perPackage.length > maxPackages) {
        logger.warn(`...and ${perPackage.length - maxPackages} more packages with vulnerabilities.`);
      }
      logger.warn("Run `fyn audit` in a package for full details.");
    }
  }

  async exec({
    build = true, // eslint-disable-line
    fynOpts = [],
    concurrency = 6,
    skip = [],
  }) {
    const installDeps = new InstallDeps(this.cwd, fynOpts);
    await checkGlobalFynVersion();

    const dispCmd = chalk.cyan([`fyn`].concat(installDeps.fynOptArgs).join(" "));
    logger.info(`bootstrap command: ${dispCmd}`);
    const colorFyn = chalk.cyan(`fyn`);

    await this._topoRunner.start({
      concurrency,
      processor: async (pkgInfo: FynpoPackageInfo, depData: PackageDepData) => {
        const circulars = this._topoRunner.circulars;
        this._topoRunner.circulars = [];
        if (circulars.length) {
          circulars.forEach((circ) => {
            logger.warn(chalk.red("detected circular deps"), circ.join(" > "));
          });
        }

        const colorId = chalk.magenta(pkgInfoId(pkgInfo));
        if (skip && skip.includes(pkgInfo.name)) {
          logger.info("bootstrap skipping", colorId);
          return;
        }
        const colorPath = chalk.blue(pkgInfo.path);

        const cacheRules = _.get(this._opts, "packageCache.default");
        let cached: PkgBuildCache;
        if (!_.isEmpty(cacheRules)) {
          cached = new PkgBuildCache(this.cwd, this._opts, cacheRules, "bootstrap");
          await xaa.try(cached.checkCache(depData));
        }

        if (cached?.exist) {
          try {
            if (cached.exist === "remote") {
              await cached.downloadCacheFromRemote();
            }
            await cached.restoreFromCache();
            logger.info(
              `Done bootstrap ${colorId} ${colorPath} ${chalk.cyan(`(${cached.exist} cached)`)}`
            );
            return;
          } catch (err) {
            logger.warn(
              `Failed restore from cache for ${colorId} in ${colorPath} - doing full bootstrap`
            );
          }
        } else if (cached?.enable) {
          await xaa.try(cached.saveCacheMissDetails());
        }
        //
        // cache didn't exist or not able to restore => do full bootstrap
        //
        logger[isCI ? "info" : "debug"]("bootstrap", colorId, colorPath);
        const displayTitle = `bootstrap ${colorId} in ${colorPath} ${colorFyn}`;
        await installDeps.runVisualInstall(pkgInfo, displayTitle);
        if (cached?.enable) {
          logger.debug(`Copying output to cache for ${colorId}`);
          await xaa.try(() => cached.copyToCache(), (err: any) => {
            console.log(`\n***ERROR*** - Copy to cache failed for ${pkgInfo.name}\n\n`, err);
          });
        }
      },
      stopOnError: true,
    });

    await this.aggregateAuditResults();
  }
}
