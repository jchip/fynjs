/**
 * Audit cache utilities for storing/retrieving npm security advisory data.
 *
 * New advisories get published against versions that already exist, and a pinned lockfile
 * keeps the same cache key for a long time. So entries expire after AUDIT_CACHE_TTL.
 *
 * Cache key is generated from SHA256 hash of the sorted bulk request payload,
 * ensuring different dependency sets get different cache entries.
 */

import crypto from "crypto";
import Path from "path";
import { loadCacache } from "../cacache-util";

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

/** How long a cached audit result stays fresh, in ms. */
const AUDIT_CACHE_TTL = 30 * 60 * 1000;

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
  await (await loadCacache()).put(auditCacheDir, key, data);
}

/**
 * Retrieve cached audit result.
 * Returns null if not found, or if `maxAge` (ms) is given and the entry is older than that.
 */
async function getCachedAuditResult(
  cacheDir: string,
  key: string,
  maxAge?: number
): Promise<AuditResult | null> {
  const auditCacheDir = Path.join(cacheDir, "audit");
  const cacache = await loadCacache();
  try {
    if (maxAge !== undefined) {
      const info = await cacache.get.info(auditCacheDir, key);
      if (!info || Date.now() - info.time > maxAge) {
        return null;
      }
    }
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
    const info = await (await loadCacache()).get.info(auditCacheDir, key);
    return info !== null;
  } catch {
    return false;
  }
}

export {
  AUDIT_CACHE_PREFIX,
  AUDIT_CACHE_TTL,
  generateCacheKey,
  cacheAuditResult,
  getCachedAuditResult,
  hasAuditCache
};
