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

/** Bulk request payload: package names mapped to version arrays */
export type BulkPayload = Record<string, string[]>;

/** Advisory metadata from npm security API */
export interface Advisory {
  id: number;
  title: string;
  severity: string;
  url: string;
  vulnerable_versions: string;
  patched_versions: string;
  recommendation?: string;
}

/** Result from audit API with advisories and metadata */
export interface AuditResult {
  advisories: Record<string, Advisory[]>;
  metadata: {
    totalDependencies: number;
    vulnerabilities?: number;
  };
}

const AUDIT_CACHE_PREFIX = "fyn-audit-";

/**
 * Generate a deterministic cache key from the bulk request payload.
 * Sorts package names and versions to ensure same dependencies = same key.
 */
function generateCacheKey(payload: BulkPayload): string {
  // Sort packages and their versions for deterministic key
  const sorted = Object.keys(payload)
    .sort()
    .reduce<BulkPayload>((acc, name) => {
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
 */
async function cacheAuditResult(cacheDir: string, key: string, result: AuditResult): Promise<void> {
  const auditCacheDir = Path.join(cacheDir, "audit");
  const data = JSON.stringify(result);
  await cacache.put(auditCacheDir, key, data);
}

/**
 * Retrieve cached audit result.
 * Returns null if not found (cache miss).
 */
async function getCachedAuditResult(cacheDir: string, key: string): Promise<AuditResult | null> {
  const auditCacheDir = Path.join(cacheDir, "audit");
  try {
    const { data } = await cacache.get(auditCacheDir, key);
    return JSON.parse(data.toString()) as AuditResult;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTCACHED") {
      return null;
    }
    throw err;
  }
}

/**
 * Check if audit result exists in cache without retrieving data.
 */
async function hasAuditCache(cacheDir: string, key: string): Promise<boolean> {
  const auditCacheDir = Path.join(cacheDir, "audit");
  try {
    const info = await cacache.get.info(auditCacheDir, key);
    return info !== null;
  } catch {
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
