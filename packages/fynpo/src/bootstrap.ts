
import Fs from "fs";
import Path from "path";
import * as _ from "lodash-es";
import type { ItemQueueResult } from "item-queue";
import { logger } from "./logger.ts";
import chalk from "chalk";
import { isCI } from "ci-info";
import { FynpoDepGraph, type FynpoPackageInfo, type FynpoTopoPackages, type PackageDepData, pkgInfoId } from "@fynpo/base";

import readline from "readline";
import semver from "semver";
import { TopoRunner } from "./topo-runner.ts";
import { PkgBuildCache } from "./caching.ts";
import * as xaa from "xaa";
import { InstallDeps } from "./install-deps.ts";
import { checkGlobalFynVersion } from "./utils.ts";

type PackageInstallInfo = {
  depData: PackageDepData;
  status?: string;
};

/**
 * Format JSON preserving compact single-line representation for simple arrays
 * (e.g. versionLocks tuples, packages lists, scripts lists) to avoid formatting diff noise.
 */
export function formatCompactJson(json: any): string {
  let str = JSON.stringify(json, null, 2);
  str = str.replace(
    /\[\s*\n\s+("[^"\n]+"|\d+|true|false)(?:,\s*\n\s+("[^"\n]+"|\d+|true|false))*\s*\n\s*\]/g,
    match => {
      try {
        const parsed = JSON.parse(match);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            x => typeof x === "string" || typeof x === "number" || typeof x === "boolean"
          )
        ) {
          const compact = `[${parsed.map(x => JSON.stringify(x)).join(", ")}]`;
          if (compact.length <= 100) {
            return compact;
          }
        }
      } catch {}
      return match;
    }
  );
  return `${str}\n`;
}

export function caretRange(version: string): string {
  const clean = String(version).trim();
  return semver.validRange(`^${clean}`) ? `^${clean}` : clean;
}

export function splitRange(range: string): string[] {
  return String(range)
    .split(/\s*\|\|\s*|\s*\|\s*/)
    .map(p => p.trim())
    .filter(Boolean);
}

export function addVersionToRange(range: string, version: string): string {
  const parts = splitRange(range);
  const added = caretRange(version);
  if (parts.includes(added) || parts.some(part => semver.satisfies(version, part))) {
    return parts.join(" || ");
  }
  return [...parts, added].join(" || ");
}

export function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(String(answer).trim().toLowerCase());
    });
  });
}

export class Bootstrap {
  _opts;
  graph: FynpoDepGraph;
  topoPkgs: FynpoTopoPackages;
  installInfo: Record<string, PackageInstallInfo>;
  _topoRunner: TopoRunner;
  _scriptErrorsHandled: boolean = false;

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
    const errorsToLog = this._topoRunner._errors.filter(
      (data: ItemQueueResult<PackageInstallInfo>) => {
        if (!this._scriptErrorsHandled) return true;
        const error: any = data.error;
        const output: any = error?.output;
        const text = `${output?.stderr || ""} ${output?.stdout || ""} ${error?.message || ""}`;
        return !text.includes("need approval to run their install scripts");
      }
    );

    _.each(errorsToLog, (data: ItemQueueResult<PackageInstallInfo>) => {
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

  async aggregateScriptReview(): Promise<{
    records: Array<{ name: string; version: string; scripts: string[] }>;
    byPackage: Record<string, string[]>;
    hasPolicyErrors: boolean;
  }> {
    const rawRecords: Array<{ name: string; version: string; scripts: string[] }> = [];
    const byPackage: Record<string, string[]> = {};

    const scanConfig = async (configPath: string, pkgLabel: string) => {
      try {
        const content = await Fs.promises.readFile(configPath, "utf8");
        const data = JSON.parse(content);
        const list = [...(data.blockedScripts || []), ...(data.pendingScripts || [])];
        for (const item of list) {
          if (!item || !item.name) continue;
          rawRecords.push(item);
          if (!byPackage[item.name]) {
            byPackage[item.name] = [];
          }
          if (pkgLabel && !byPackage[item.name].includes(pkgLabel)) {
            byPackage[item.name].push(pkgLabel);
          }
        }
      } catch {}
    };

    // Root node_modules/.f/fyn-install-config.json
    await scanConfig(Path.join(this.cwd, "node_modules", ".f", "fyn-install-config.json"), "");

    // Workspace packages
    for (const depData of this.topoPkgs.sorted) {
      const pkgInfo = depData.pkgInfo;
      const configPath = Path.join(
        this.cwd,
        pkgInfo.path,
        "node_modules",
        ".f",
        "fyn-install-config.json"
      );
      await scanConfig(configPath, pkgInfo.name || pkgInfo.path);
    }

    // Check if any error in topoRunner was a script-policy error
    let hasPolicyErrors = false;
    for (const errData of this._topoRunner._errors || []) {
      const error: any = errData.error;
      const output = error?.output;
      const text = `${output?.stderr || ""} ${output?.stdout || ""} ${error?.message || ""}`;
      if (
        text.includes("need approval to run their install scripts") ||
        text.includes("awaiting install-script review")
      ) {
        hasPolicyErrors = true;
        break;
      }
    }

    // Deduplicate records by name@version
    const seen = new Set<string>();
    const dedupe: Array<{ name: string; version: string; scripts: string[] }> = [];
    for (const r of rawRecords) {
      const key = `${r.name}@${r.version || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupe.push({
          name: r.name,
          version: r.version,
          scripts: r.scripts || ["install"]
        });
      }
    }

    // Read root fynpo.json to filter out already approved packages
    let rootAllowScripts: Record<string, any> = {};
    try {
      const fynpoJson = JSON.parse(
        await Fs.promises.readFile(Path.join(this.cwd, "fynpo.json"), "utf8")
      );
      rootAllowScripts = _.get(fynpoJson, ["fyn", "options", "allowScripts"]) || {};
    } catch {}

    const pendingRecords = dedupe.filter(r => {
      const existing = rootAllowScripts[r.name];
      if (!existing) return true;
      if (existing === false) return false; // explicit denial
      if (typeof existing === "object" && existing.semver) {
        if (semver.satisfies(r.version, existing.semver)) {
          return false; // already satisfied
        }
      }
      return true;
    });

    return { records: pendingRecords, byPackage, hasPolicyErrors };
  }

  async promptAndApproveScripts(
    records: Array<{ name: string; version: string; scripts: string[] }>,
    byPackage: Record<string, string[]>
  ): Promise<boolean> {
    if (records.length === 0) return false;

    logger.info(
      `${chalk.cyan(records.length)} package${records.length > 1 ? "s" : ""} want to run install scripts that have not been approved:`
    );

    const width = records.reduce((w, r) => Math.max(w, `${r.name}@${r.version}`.length), 0);
    for (const r of records) {
      const inPkgs = byPackage[r.name]?.length
        ? ` ${chalk.dim(`(in ${byPackage[r.name].join(", ")})`)}`
        : "";
      logger.info(
        `  ${chalk.cyan(`${r.name}@${r.version}`.padEnd(width))}  ${chalk.yellow(r.scripts.join(", "))}${inPkgs}`
      );
    }

    const answer = await ask(
      `Approve for monorepo? ${chalk.cyan("[a]")}ll / ${chalk.cyan("[s]")}elect / ${chalk.cyan("[n]")}one (default) `
    );

    let toApprove: Array<{ name: string; version: string; scripts: string[] }> = [];

    if (answer === "a" || answer === "all" || answer === "y" || answer === "yes") {
      toApprove = records;
    } else if (answer === "s" || answer === "select") {
      for (const r of records) {
        const yn = await ask(
          `  ${r.name}@${r.version} (${r.scripts.join(", ")})? [y/N] `
        );
        if (yn === "y" || yn === "yes") {
          toApprove.push(r);
        }
      }
    }

    if (toApprove.length === 0) {
      logger.info("no approvals recorded - install scripts will not run");
      return false;
    }

    const fynpoJsonPath = Path.join(this.cwd, "fynpo.json");
    let json: any = {};
    try {
      json = JSON.parse(await Fs.promises.readFile(fynpoJsonPath, "utf8"));
    } catch (err) {
      logger.error(`Failed to read ${fynpoJsonPath} to record approvals: ${(err as Error).message}`);
      return false;
    }

    const currentAllow = _.get(json, ["fyn", "options", "allowScripts"]) || {};
    const approvedNames: string[] = [];

    for (const r of toApprove) {
      const existing = currentAllow[r.name];
      if (existing === false) {
        logger.warn(`denied, not approved: ${r.name}`);
        continue;
      }
      const entry: any = existing && typeof existing === "object" ? { ...existing } : {};
      if (entry.semver) {
        entry.semver = addVersionToRange(entry.semver, r.version);
      } else {
        entry.semver = `^${r.version}`;
      }
      if (r.scripts && r.scripts.length > 0 && r.scripts[0] !== "*") {
        entry.scripts = r.scripts;
      }
      currentAllow[r.name] = entry;
      approvedNames.push(r.name);
    }

    _.set(json, ["fyn", "options", "allowScripts"], currentAllow);

    await Fs.promises.writeFile(fynpoJsonPath, formatCompactJson(json));
    logger.info(`updated ${chalk.cyan(fynpoJsonPath)}`);
    logger.info(`approved ${chalk.cyan(approvedNames.join(", "))}`);
    logger.info(`Re-running bootstrap with approved install scripts...`);

    return true;
  }

  reportScriptGate(
    records: Array<{ name: string; version: string; scripts: string[] }>,
    byPackage: Record<string, string[]>
  ) {
    logger.prefix("").error(chalk.red("=".repeat(80)));
    logger.prefix("").error(
      `${chalk.red("✗")} ${chalk.bold(`${records.length} package(s) need approval to run their install scripts across the monorepo:`)}`
    );
    for (const r of records) {
      const inPkgs = byPackage[r.name]?.length
        ? ` (${chalk.dim("in " + byPackage[r.name].join(", "))})`
        : "";
      logger.prefix("").error(
        `  ${chalk.cyan(`${r.name}@${r.version}`)}  ${chalk.yellow(r.scripts.join(", "))}${inPkgs}`
      );
    }
    logger.prefix("").error("");
    logger.prefix("").error(`  Approve them with:`);
    logger.prefix("").error(`    ${chalk.cyan("fyn install-scripts approve <package>")} (or --all)`);
    logger.prefix("").error(
      `  Or record the approvals in your ${chalk.cyan("fynpo.json")} before installing.`
    );
    logger.prefix("").error(chalk.red("=".repeat(80)));
  }

  async exec({
    build = true,
    fynOpts = [],
    concurrency = 6,
    skip = [],
  }): Promise<{ rerun?: boolean } | void> {
    const installDeps = new InstallDeps(this.cwd, fynOpts);
    await checkGlobalFynVersion();

    const canPrompt = !isCI && Boolean(process.stdin.isTTY && process.stdout.isTTY);

    // Pre-install check: surface gate before installing if pending approvals already exist
    const preReview = await this.aggregateScriptReview();
    if (preReview.records.length > 0 && canPrompt) {
      const approved = await this.promptAndApproveScripts(preReview.records, preReview.byPackage);
      if (approved) {
        return { rerun: true };
      }
    }

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
      stopOnError: false,
    });

    await this.aggregateAuditResults();

    // Post-install check: aggregate script approvals across the whole monorepo
    const postReview = await this.aggregateScriptReview();
    if (postReview.records.length > 0 || postReview.hasPolicyErrors) {
      if (postReview.records.length > 0 && canPrompt) {
        const approved = await this.promptAndApproveScripts(postReview.records, postReview.byPackage);
        if (approved) {
          return { rerun: true };
        }
      }

      if (postReview.records.length > 0) {
        this.reportScriptGate(postReview.records, postReview.byPackage);
        this._scriptErrorsHandled = true;
      }
    }
  }
}
