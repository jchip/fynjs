// @ts-nocheck
"use strict";

/**
 * CLI entry point for the audit command.
 *
 * Coordinates:
 * 1. Resolving dependencies (if not already resolved)
 * 2. Fetching security advisories
 * 3. Matching vulnerabilities to packages
 * 4. Formatting and displaying results (with dependency paths)
 */

const Promise = require("aveazul");
const CliLogger = require("../lib/cli-logger").default;
const logger = require("../lib/logger").default;
const AuditReport = require("../lib/audit/audit-report").default;
const AuditFormatter = require("../lib/audit/audit-formatter").default;
const PkgStatProvider = require("../lib/pkg-stat-provider").default;
const { FETCH_META } = require("../lib/log-items");

class ShowAudit {
  /**
   * @param {Object} options
   * @param {Object} options.fyn - Fyn instance
   * @param {Object} options.opts - CLI options
   */
  constructor({ fyn, opts }) {
    this._fyn = fyn;
    this._opts = opts || {};
    // Don't build local packages during audit
    this._fyn._options.buildLocal = false;
  }

  /**
   * Run the audit workflow.
   *
   * @returns {Promise<void>}
   */
  async runAudit() {
    const spinner = CliLogger.spinners[1];

    try {
      // Step 1: Resolve dependencies (skip if already resolved, e.g., after install)
      let depData = this._fyn._data;
      if (!depData || Object.keys(depData.pkgs || {}).length === 0) {
        logger.addItem({ name: FETCH_META, color: "green", spinner });
        logger.updateItem(FETCH_META, "resolving dependencies...");
        await this._fyn.resolveDependencies();
        logger.removeItem(FETCH_META);
        depData = this._fyn._data;
      }
      const pkgCount = Object.keys(depData.pkgs).length;

      if (pkgCount === 0) {
        logger.info("No dependencies to audit");
        return;
      }

      // Step 2: Fetch advisories
      logger.addItem({ name: FETCH_META, color: "green", spinner });
      logger.updateItem(FETCH_META, "fetching security advisories...");

      const auditReport = new AuditReport({
        fyn: this._fyn,
        depData,
        noCache: this._opts.noCache || false,
        omit: this._opts.omit || []
      });

      const auditResult = await auditReport.fetchAdvisories();
      logger.removeItem(FETCH_META);

      // Step 3: Match vulnerabilities
      const vulnerabilities = auditReport.matchVulnerabilities(auditResult);

      // Step 4: Create stat provider for dependency path info (skip for summary/json)
      let statProvider = null;
      if (!this._opts.summary && !this._opts.json) {
        statProvider = new PkgStatProvider({ fyn: this._fyn });
      }

      // Step 5: Format and display
      const formatter = new AuditFormatter({
        json: this._opts.json || false,
        colors: this._fyn._options.colors !== false,
        auditLevel: this._opts.auditLevel || "info",
        summary: this._opts.summary || false,
        statProvider
      });

      // Precompute stats for dependency path info
      if (statProvider) {
        await formatter.precomputeStats(vulnerabilities);
      }

      const { output } = formatter.format(auditResult, vulnerabilities);

      // Output the report (skip if empty)
      if (output) {
        console.log(output);
      }

    } catch (err) {
      logger.removeItem(FETCH_META);
      logger.error("Audit failed:", err.message);
      if (process.env.FYN_DEBUG) {
        logger.error(err.stack);
      }
    }
  }
}

/**
 * Entry point for audit command.
 *
 * @param {Object} fyn - Fyn instance
 * @param {Object} opts - CLI options { json, omit, auditLevel, noCache }
 * @returns {Promise<void>}
 */
module.exports = (fyn, opts) => {
  return new ShowAudit({ fyn, opts }).runAudit();
};
