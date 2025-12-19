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
import type { AuditResult, Advisory } from "./audit-cache";
import type { Vulnerability } from "./audit-report";

type SeverityLevel = "critical" | "high" | "moderate" | "low" | "info";

/** Stat info for a package version */
interface PackageStat {
  significantPaths?: (string[] & { [SEMVER]?: string })[];
  [key: string]: unknown;
}

/** Stat provider interface for dependency path info */
interface StatProvider {
  getPackageStat(name: string, version: string): Promise<PackageStat | null>;
}

/** Options for AuditFormatter constructor */
export interface AuditFormatterOptions {
  json?: boolean;
  colors?: boolean;
  auditLevel?: SeverityLevel;
  summary?: boolean;
  statProvider?: StatProvider | null;
  statCache?: Record<string, PackageStat>;
}

/** Format output result */
export interface FormatResult {
  output: string;
  exitCode: number;
}

const SEVERITY_COLORS: Record<SeverityLevel, chalk.Chalk> = {
  critical: chalk.red.bold,
  high: chalk.red,
  moderate: chalk.yellow,
  low: chalk.cyan,
  info: chalk.blue
};

const SEVERITY_ORDER: SeverityLevel[] = ["critical", "high", "moderate", "low", "info"];

class AuditFormatter {
  private _json: boolean;
  private _colors: boolean;
  private _auditLevel: SeverityLevel;
  private _summary: boolean;
  private _statProvider: StatProvider | null;
  private _statCache: Record<string, PackageStat>;

  constructor(options: AuditFormatterOptions = {}) {
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
  getSeverityLevel(severity: string): number {
    const levels: Record<string, number> = { critical: 5, high: 4, moderate: 3, low: 2, info: 1 };
    return levels[severity] || 0;
  }

  /**
   * Check if severity meets minimum audit level.
   */
  meetsAuditLevel(severity: string): boolean {
    return this.getSeverityLevel(severity) >= this.getSeverityLevel(this._auditLevel);
  }

  /**
   * Colorize text based on severity.
   */
  colorize(text: string, severity: string): string {
    if (!this._colors) return text;
    const colorFn = SEVERITY_COLORS[severity as SeverityLevel] || ((t: string) => t);
    return colorFn(text);
  }

  /**
   * Format audit result for output.
   */
  format(auditResult: AuditResult, vulnerabilities: Vulnerability[]): FormatResult {
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
  formatSummary(auditResult: AuditResult, vulnerabilities: Vulnerability[]): FormatResult {
    const filtered = vulnerabilities.filter(v => this.meetsAuditLevel(v.advisory.severity));
    const pkgCount = auditResult.metadata?.totalDependencies || 0;

    if (filtered.length === 0) {
      return { output: `audited ${pkgCount} packages`, exitCode: 0 };
    }

    // Count by severity
    const counts: Record<string, number> = {};
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
  formatJson(auditResult: AuditResult, vulnerabilities: Vulnerability[]): FormatResult {
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
  formatHuman(auditResult: AuditResult, vulnerabilities: Vulnerability[]): FormatResult {
    const lines: string[] = [];
    const { metadata } = auditResult;

    // Filter by audit level
    const filtered = vulnerabilities.filter(v => this.meetsAuditLevel(v.advisory.severity));

    // Group by severity
    const bySeverity: Record<SeverityLevel, Vulnerability[]> = {
      critical: [],
      high: [],
      moderate: [],
      low: [],
      info: []
    };

    filtered.forEach(vuln => {
      const sev = vuln.advisory.severity as SeverityLevel;
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
  formatVulnerability(vuln: Vulnerability): string {
    const { advisory, name, version } = vuln;
    const lines: string[] = [];

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
      const seenFirstLegs = new Set<string>();
      const uniquePaths: (string[] & { [SEMVER]?: string })[] = [];

      for (const path of stat.significantPaths) {
        const firstLeg = path[0];
        if (!seenFirstLegs.has(firstLeg)) {
          seenFirstLegs.add(firstLeg);
          uniquePaths.push(path);
          if (uniquePaths.length >= 5) break;
        }
      }

      for (const path of uniquePaths) {
        const semverVal = path[SEMVER];
        const pathStr = path.join(" > ");
        const fullPath = semverVal ? `${pathStr} (${semverVal})` : pathStr;
        lines.push(`  > ${fullPath}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Pre-compute stat info for all vulnerabilities.
   * Call this before format() when using a stat provider.
   */
  async precomputeStats(vulnerabilities: Vulnerability[]): Promise<void> {
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
