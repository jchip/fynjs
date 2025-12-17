// @ts-nocheck

/**
 * Audit cache utilities for storing/retrieving npm security advisory data.
 *
 * Advisories are immutable - once an advisory exists for a specific package@version,
 * it doesn't change. Therefore we cache indefinitely (no TTL check needed).
 *
 * Cache key is generated from SHA256 hash of the sorted bulk request payload,
 * ensuring different dependency sets get different cache entries.
 */

import cacache from "cacache";
import crypto from "crypto";
import Path from "path";

const AUDIT_CACHE_PREFIX = "fyn-audit-";

/**
 * Generate a deterministic cache key from the bulk request payload.
 * Sorts package names and versions to ensure same dependencies = same key.
 *
 * @param {Object} payload - Bulk request payload { pkgName: [versions] }
 * @returns {string} Cache key with prefix
 */
function generateCacheKey(payload) {
  // Sort packages and their versions for deterministic key
  const sorted = Object.keys(payload)
    .sort()
    .reduce((acc, name) => {
      acc[name] = [...payload[name]].sort();
      return acc;
    }, {});

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex");

  return `${AUDIT_CACHE_PREFIX}${hash}`;
}

/**
 * Store audit result in cache.
 * Uses cacache for content-addressable storage.
 *
 * @param {string} cacheDir - Cache directory path
 * @param {string} key - Cache key from generateCacheKey()
 * @param {Object} result - Advisory data to cache
 * @returns {Promise<void>}
 */
async function cacheAuditResult(cacheDir, key, result) {
  const auditCacheDir = Path.join(cacheDir, "audit");
  const data = JSON.stringify(result);
  await cacache.put(auditCacheDir, key, data);
}

/**
 * Retrieve cached audit result.
 * Returns null if not found (cache miss).
 *
 * @param {string} cacheDir - Cache directory path
 * @param {string} key - Cache key from generateCacheKey()
 * @returns {Promise<Object|null>} Cached advisory data or null
 */
async function getCachedAuditResult(cacheDir, key) {
  const auditCacheDir = Path.join(cacheDir, "audit");
  try {
    const { data } = await cacache.get(auditCacheDir, key);
    return JSON.parse(data.toString());
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTCACHED") {
      return null;
    }
    throw err;
  }
}

/**
 * Check if audit result exists in cache without retrieving data.
 *
 * @param {string} cacheDir - Cache directory path
 * @param {string} key - Cache key from generateCacheKey()
 * @returns {Promise<boolean>} True if cached
 */
async function hasAuditCache(cacheDir, key) {
  const auditCacheDir = Path.join(cacheDir, "audit");
  try {
    const info = await cacache.get.info(auditCacheDir, key);
    return info !== null;
  } catch (err) {
    return false;
  }
}

export {
  AUDIT_CACHE_PREFIX,
  generateCacheKey,
  cacheAuditResult,
  getCachedAuditResult,
  hasAuditCache
};
