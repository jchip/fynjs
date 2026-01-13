/**
 * Unit tests for audit-cache.ts
 *
 * Tests cache key generation and storage/retrieval of advisory data.
 */

import { describe, it, beforeAll, afterAll } from "vitest";
import { expect } from "chai";
import fs from "fs";
import path from "path";
import crypto from "crypto";

import {
  AUDIT_CACHE_PREFIX,
  generateCacheKey,
  cacheAuditResult,
  getCachedAuditResult,
  hasAuditCache
} from "../../../lib/audit/audit-cache";

describe("audit-cache", () => {
  const testCache = path.join(__dirname, "../../.audit-cache-test");

  beforeAll(() => {
    // Clean up before tests
    try {
      fs.rmSync(testCache, { recursive: true });
    } catch (e) {}
  });

  afterAll(() => {
    // Clean up after tests
    try {
      fs.rmSync(testCache, { recursive: true });
    } catch (e) {}
  });

  describe("generateCacheKey()", () => {
    it("should generate deterministic keys for same payload", () => {
      const payload = { lodash: ["4.17.21"], express: ["4.18.0", "4.17.1"] };
      const key1 = generateCacheKey(payload);
      const key2 = generateCacheKey(payload);

      expect(key1).to.equal(key2);
    });

    it("should include the audit cache prefix", () => {
      const payload = { lodash: ["4.17.21"] };
      const key = generateCacheKey(payload);

      expect(key).to.match(new RegExp(`^${AUDIT_CACHE_PREFIX}`));
    });

    it("should generate different keys for different payloads", () => {
      const key1 = generateCacheKey({ lodash: ["4.17.21"] });
      const key2 = generateCacheKey({ lodash: ["4.17.20"] });

      expect(key1).to.not.equal(key2);
    });

    it("should sort packages alphabetically for deterministic keys", () => {
      const payload1 = { zlib: ["1.0.0"], axios: ["1.0.0"] };
      const payload2 = { axios: ["1.0.0"], zlib: ["1.0.0"] };

      expect(generateCacheKey(payload1)).to.equal(generateCacheKey(payload2));
    });

    it("should sort versions for deterministic keys", () => {
      const payload1 = { lodash: ["4.17.21", "4.17.20"] };
      const payload2 = { lodash: ["4.17.20", "4.17.21"] };

      expect(generateCacheKey(payload1)).to.equal(generateCacheKey(payload2));
    });

    it("should handle empty payload", () => {
      const key = generateCacheKey({});
      expect(key).to.match(new RegExp(`^${AUDIT_CACHE_PREFIX}`));
    });

    it("should handle scoped packages", () => {
      const payload = { "@types/node": ["18.0.0"], "@babel/core": ["7.0.0"] };
      const key = generateCacheKey(payload);

      expect(key).to.match(new RegExp(`^${AUDIT_CACHE_PREFIX}`));
      expect(key).to.have.length.greaterThan(AUDIT_CACHE_PREFIX.length);
    });
  });

  describe("cacheAuditResult() and getCachedAuditResult()", () => {
    it("should store and retrieve audit results", async () => {
      const key = "test-audit-key-1";
      const result = {
        advisories: { "1234": { id: 1234, severity: "high" } },
        metadata: { totalDependencies: 10 }
      };

      await cacheAuditResult(testCache, key, result);
      const cached = await getCachedAuditResult(testCache, key);

      expect(cached).to.deep.equal(result);
    });

    it("should return null for cache miss", async () => {
      const cached = await getCachedAuditResult(testCache, "non-existent-key");
      expect(cached).to.be.null;
    });

    it("should handle complex advisory data", async () => {
      const key = "test-audit-key-2";
      const result = {
        advisories: {
          "5678": {
            id: 5678,
            module_name: "lodash",
            severity: "critical",
            vulnerable_versions: "<4.17.21",
            patched_versions: ">=4.17.21",
            title: "Prototype Pollution",
            url: "https://npmjs.com/advisories/5678"
          }
        },
        metadata: { totalDependencies: 100, vulnerabilities: 1 }
      };

      await cacheAuditResult(testCache, key, result);
      const cached = await getCachedAuditResult(testCache, key);

      expect(cached).to.deep.equal(result);
      expect(cached.advisories["5678"].severity).to.equal("critical");
    });
  });

  describe("hasAuditCache()", () => {
    it("should return true for existing cache entry", async () => {
      const key = "test-audit-key-3";
      await cacheAuditResult(testCache, key, { advisories: {} });

      const exists = await hasAuditCache(testCache, key);
      expect(exists).to.be.true;
    });

    it("should return false for non-existent entry", async () => {
      const exists = await hasAuditCache(testCache, "does-not-exist");
      expect(exists).to.be.false;
    });
  });
});
