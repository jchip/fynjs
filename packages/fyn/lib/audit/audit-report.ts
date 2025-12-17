// @ts-nocheck

/**
 * Core audit logic for fetching security advisories from npm registry.
 *
 * Workflow:
 * 1. Build bulk payload from resolved DepData.pkgs
 * 2. Check cache for existing advisories
 * 3. If miss, POST to /-/npm/v1/security/advisories/bulk
 * 4. Cache response and return
 */

import npmFetch from "npm-registry-fetch";
import semver from "semver";
import logger from "../logger";
import {
  generateCacheKey,
  cacheAuditResult,
  getCachedAuditResult
} from "./audit-cache";

class AuditReport {
  /**
   * @param {Object} options
   * @param {Object} options.fyn - Fyn instance with resolved data
   * @param {Object} options.depData - DepData with resolved packages
   * @param {boolean} options.noCache - Skip cache lookup
   * @param {string[]} options.omit - Dependency types to omit (dev, optional, peer)
   */
  constructor(options) {
    this._fyn = options.fyn;
    this._depData = options.depData;
    this._noCache = options.noCache || false;
    this._omit = options.omit || [];
    this._cacheDir = options.fyn.fynDir;
  }

  /**
   * Build bulk request payload from resolved packages.
   * Format: { "packageName": ["version1", "version2"], ... }
   *
   * @returns {Object} Bulk payload for npm security API
   */
  buildBulkPayload() {
    const payload = {};
    const pkgs = this._depData.pkgs;
    const omitDev = this._omit.includes("dev");
    const omitOptional = this._omit.includes("optional");
    const omitPeer = this._omit.includes("peer");

    Object.keys(pkgs).forEach(name => {
      const versions = pkgs[name];
      Object.keys(versions).forEach(version => {
        const pkgInfo = versions[version];

        // Skip based on omit options
        if (omitDev && pkgInfo.src === "dev") return;
        if (omitOptional && pkgInfo.src === "opt") return;
        if (omitPeer && pkgInfo.src === "per") return;

        // Skip local packages (file: or link: dependencies)
        if (pkgInfo.local || pkgInfo.localType) return;

        if (!payload[name]) {
          payload[name] = [];
        }
        if (!payload[name].includes(version)) {
          payload[name].push(version);
        }
      });
    });

    return payload;
  }

  /**
   * Get registry URL for audit API.
   * Uses the main registry (not scoped registries since audit is global).
   *
   * @returns {string} Registry URL with trailing slash
   */
  getAuditRegistryUrl() {
    const registry = this._fyn._options.registry || "https://registry.npmjs.org";
    return registry.endsWith("/") ? registry : `${registry}/`;
  }

  /**
   * Get npm-registry-fetch options with auth.
   *
   * @returns {Object} Options for npm-registry-fetch
   */
  getFetchOptions() {
    const opts = this._fyn._options;
    const fetchOpts = {
      registry: this.getAuditRegistryUrl()
    };

    // Add auth options if present
    if (opts.username) fetchOpts.username = opts.username;
    if (opts.password) fetchOpts.password = opts.password;
    if (opts.email) fetchOpts.email = opts.email;
    if (opts["always-auth"]) fetchOpts.alwaysAuth = opts["always-auth"];

    // Add auth tokens
    Object.keys(opts).forEach(key => {
      if (key.endsWith(":_authToken")) {
        fetchOpts[key] = opts[key];
      }
    });

    return fetchOpts;
  }

  /**
   * Fetch advisories from npm security API.
   * Uses cache if available and noCache is false.
   *
   * @returns {Promise<Object>} Audit result with advisories
   */
  async fetchAdvisories() {
    const payload = this.buildBulkPayload();
    const packageCount = Object.keys(payload).length;

    if (packageCount === 0) {
      logger.info("No packages to audit");
      return { advisories: {}, metadata: { totalDependencies: 0 } };
    }

    const cacheKey = generateCacheKey(payload);

    // Check cache first (unless noCache)
    if (!this._noCache) {
      const cached = await getCachedAuditResult(this._cacheDir, cacheKey);
      if (cached) {
        logger.debug("Using cached audit result");
        return cached;
      }
    }

    // Fetch from registry
    const registryUrl = this.getAuditRegistryUrl();
    const auditUrl = `${registryUrl}-/npm/v1/security/advisories/bulk`;

    logger.info(`Auditing ${packageCount} packages...`);

    try {
      const fetchOpts = this.getFetchOptions();
      const response = await npmFetch(auditUrl, {
        ...fetchOpts,
        method: "POST",
        body: payload,
        gzip: true
      });

      const advisories = await response.json();

      // Build result object
      const result = {
        advisories,
        metadata: {
          totalDependencies: packageCount,
          vulnerabilities: Object.keys(advisories).length
        }
      };

      // Cache the result
      await cacheAuditResult(this._cacheDir, cacheKey, result);

      return result;
    } catch (err) {
      // Try to use cached data on network error
      if (!this._noCache) {
        const cached = await getCachedAuditResult(this._cacheDir, cacheKey);
        if (cached) {
          logger.warn("Network error, using cached audit data");
          return cached;
        }
      }

      if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
        throw new Error(`Unable to reach npm registry for audit: ${err.message}`);
      }
      if (err.statusCode === 401 || err.statusCode === 403) {
        throw new Error("Authentication required for security audit");
      }
      throw err;
    }
  }

  /**
   * Match advisories to resolved packages.
   * Returns list of affected packages with advisory details.
   *
   * The bulk API returns advisories grouped by package name:
   * { "package-name": [{ id, vulnerable_versions, ... }, ...] }
   *
   * @param {Object} auditResult - Result from fetchAdvisories()
   * @returns {Array} List of vulnerabilities with package info
   */
  matchVulnerabilities(auditResult) {
    const vulnerabilities = [];
    const { advisories } = auditResult;
    const pkgs = this._depData.pkgs;

    // Advisories are grouped by package name
    Object.keys(advisories).forEach(pkgName => {
      const pkgAdvisories = advisories[pkgName];

      // Skip if package not in our resolved dependencies
      if (!pkgs[pkgName]) return;

      // Each package can have multiple advisories
      pkgAdvisories.forEach(advisory => {
        const vulnVersions = advisory.vulnerable_versions;

        // Check each installed version of this package
        Object.keys(pkgs[pkgName]).forEach(version => {
          if (semver.satisfies(version, vulnVersions)) {
            vulnerabilities.push({
              name: pkgName,
              version,
              advisory: {
                id: advisory.id,
                title: advisory.title,
                severity: advisory.severity,
                url: advisory.url,
                vulnerable_versions: vulnVersions,
                patched_versions: advisory.patched_versions,
                recommendation: advisory.recommendation
              },
              paths: pkgs[pkgName][version].requests || []
            });
          }
        });
      });
    });

    return vulnerabilities;
  }
}

export default AuditReport;
