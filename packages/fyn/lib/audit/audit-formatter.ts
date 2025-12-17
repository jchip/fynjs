// @ts-nocheck

/**
 * Format audit results for display.
 *
 * Supports:
 * - JSON output for machine consumption
 * - Human-readable table format with severity colors
 * - Dependency path info from PkgStatProvider
 */

import chalk from "chalk";
import { SEMVER } from "../symbols";

const SEVERITY_COLORS = {
  critical: chalk.red.bold,
  high: chalk.red,
  moderate: chalk.yellow,
  low: chalk.cyan,
  info: chalk.blue
};

const SEVERITY_ORDER = ["critical", "high", "moderate", "low", "info"];

class AuditFormatter {
  /**
   * @param {Object} options
   * @param {boolean} options.json - Output as JSON
   * @param {boolean} options.colors - Use colors in output
   * @param {string} options.auditLevel - Minimum severity to report
   * @param {boolean} options.summary - Output brief summary only (like npm after install)
   * @param {Object} options.statProvider - PkgStatProvider instance for dependency path info
   * @param {Object} options.statCache - Pre-computed stat results keyed by "name@version"
   */
  constructor(options = {}) {
    this._json = options.json || false;
    this._colors = options.colors !== false;
    this._auditLevel = options.auditLevel || "info";
    this._summary = options.summary || false;
    this._statProvider = options.statProvider || null;
    this._statCache = options.statCache || {};
  }

  /**
   * Get severity level as number for comparison.
   */
  getSeverityLevel(severity) {
    const levels = { critical: 5, high: 4, moderate: 3, low: 2, info: 1 };
    return levels[severity] || 0;
  }

  /**
   * Check if severity meets minimum audit level.
   */
  meetsAuditLevel(severity) {
    return this.getSeverityLevel(severity) >= this.getSeverityLevel(this._auditLevel);
  }

  /**
   * Colorize text based on severity.
   */
  colorize(text, severity) {
    if (!this._colors) return text;
    const colorFn = SEVERITY_COLORS[severity] || (t => t);
    return colorFn(text);
  }

  /**
   * Format audit result for output.
   *
   * @param {Object} auditResult - Result from AuditReport.fetchAdvisories()
   * @param {Array} vulnerabilities - Matched vulnerabilities from matchVulnerabilities()
   * @returns {Object} { output: string, exitCode: number }
   */
  format(auditResult, vulnerabilities) {
    if (this._json) {
      return this.formatJson(auditResult, vulnerabilities);
    }
    if (this._summary) {
      return this.formatSummary(auditResult, vulnerabilities);
    }
    return this.formatHuman(auditResult, vulnerabilities);
  }

  /**
   * Format as brief summary (like npm shows after install).
   * Example: "audited 745 packages\n3 vulnerabilities (1 moderate, 1 high, 1 critical)"
   */
  formatSummary(auditResult, vulnerabilities) {
    const filtered = vulnerabilities.filter(v => this.meetsAuditLevel(v.advisory.severity));
    const pkgCount = auditResult.metadata?.totalDependencies || 0;

    if (filtered.length === 0) {
      return { output: `audited ${pkgCount} packages`, exitCode: 0 };
    }

    // Count by severity
    const counts = {};
    filtered.forEach(v => {
      const sev = v.advisory.severity;
      counts[sev] = (counts[sev] || 0) + 1;
    });

    // Build severity breakdown
    const parts = SEVERITY_ORDER
      .filter(sev => counts[sev])
      .map(sev => {
        const count = counts[sev];
        return this.colorize(`${count} ${sev}`, sev);
      });

    const total = filtered.length;
    const output = `audited ${pkgCount} packages\n\n${total} ${total === 1 ? "vulnerability" : "vulnerabilities"} (${parts.join(", ")})\n\nRun \`fyn audit\` for details.`;

    return { output, exitCode: 0 };
  }

  /**
   * Format as JSON.
   */
  formatJson(auditResult, vulnerabilities) {
    const filtered = vulnerabilities.filter(v => this.meetsAuditLevel(v.advisory.severity));

    const output = JSON.stringify(
      {
        vulnerabilities: filtered,
        metadata: auditResult.metadata,
        advisories: auditResult.advisories
      },
      null,
      2
    );

    return { output, exitCode: 0 };
  }

  /**
   * Format as human-readable table.
   */
  formatHuman(auditResult, vulnerabilities) {
    const lines = [];
    const { metadata } = auditResult;

    // Filter by audit level
    const filtered = vulnerabilities.filter(v => this.meetsAuditLevel(v.advisory.severity));

    // Group by severity
    const bySeverity = {};
    SEVERITY_ORDER.forEach(s => (bySeverity[s] = []));

    filtered.forEach(vuln => {
      const sev = vuln.advisory.severity;
      if (bySeverity[sev]) {
        bySeverity[sev].push(vuln);
      }
    });

    // Header
    lines.push("");
    if (filtered.length === 0) {
      lines.push(this._colors ? chalk.green("No vulnerabilities found!") : "No vulnerabilities found!");
      lines.push("");
      lines.push(`Scanned ${metadata.totalDependencies} packages`);
    } else {
      // Summary counts
      const counts = SEVERITY_ORDER.map(sev => {
        const count = bySeverity[sev].length;
        if (count === 0) return null;
        return this.colorize(`${count} ${sev}`, sev);
      }).filter(Boolean);

      lines.push(`Found ${filtered.length} vulnerabilities (${counts.join(", ")})`);
      lines.push("");

      // Details for each vulnerability
      SEVERITY_ORDER.forEach(severity => {
        const vulns = bySeverity[severity];
        if (vulns.length === 0) return;

        vulns.forEach(vuln => {
          const { advisory } = vuln;
          lines.push(this.formatVulnerability(vuln));
          lines.push("");
        });
      });

      lines.push(`Scanned ${metadata.totalDependencies} packages`);
    }

    lines.push("");
    return { output: lines.join("\n"), exitCode: 0 };
  }

  /**
   * Format a single vulnerability entry.
   */
  formatVulnerability(vuln) {
    const { advisory, name, version } = vuln;
    const lines = [];

    // Severity and title
    const sevLabel = this.colorize(advisory.severity.toUpperCase().padEnd(10), advisory.severity);
    lines.push(`${sevLabel} ${advisory.title}`);

    // Compact package info on one line with color coding
    const pkgId = this._colors ? chalk.yellow(`${name}@${version}`) : `${name}@${version}`;
    const vulnRange = this._colors ? chalk.red(`Vulnerable: ${advisory.vulnerable_versions}`) : `Vulnerable: ${advisory.vulnerable_versions}`;
    const infoUrl = advisory.url
      ? (this._colors ? chalk.cyan(`info: ${advisory.url}`) : `info: ${advisory.url}`)
      : "";

    let details = `  ${pkgId} - ${vulnRange}`;
    if (infoUrl) {
      details += ` - ${infoUrl}`;
    }
    lines.push(details);

    // Add dependency paths if stat info is available
    // Show up to 5 paths, but only with unique first legs (root dependencies)
    const cacheKey = `${name}@${version}`;
    const stat = this._statCache[cacheKey];
    if (stat && stat.significantPaths && stat.significantPaths.length > 0) {
      const seenFirstLegs = new Set();
      const uniquePaths = [];

      for (const path of stat.significantPaths) {
        const firstLeg = path[0];
        if (!seenFirstLegs.has(firstLeg)) {
          seenFirstLegs.add(firstLeg);
          uniquePaths.push(path);
          if (uniquePaths.length >= 5) break;
        }
      }

      for (const path of uniquePaths) {
        const semver = path[SEMVER];
        const pathStr = path.join(" > ");
        const fullPath = semver ? `${pathStr} (${semver})` : pathStr;
        lines.push(`  > ${fullPath}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Pre-compute stat info for all vulnerabilities.
   * Call this before format() when using a stat provider.
   *
   * @param {Array} vulnerabilities - List of vulnerabilities from matchVulnerabilities()
   * @returns {Promise<void>}
   */
  async precomputeStats(vulnerabilities) {
    if (!this._statProvider) return;

    const filtered = vulnerabilities.filter(v => this.meetsAuditLevel(v.advisory.severity));

    for (const vuln of filtered) {
      const cacheKey = `${vuln.name}@${vuln.version}`;
      if (!this._statCache[cacheKey]) {
        const stat = await this._statProvider.getPackageStat(vuln.name, vuln.version);
        if (stat) {
          this._statCache[cacheKey] = stat;
        }
      }
    }
  }
}

export default AuditFormatter;
