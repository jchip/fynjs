/**
 * Comprehensive unit tests for cacache-util.js
 *
 * Tests verify that modifying bucket mtime is safe and doesn't break
 * cacache's integrity guarantees across different versions.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import cacache from "cacache";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

import {
  refreshCacheEntry,
  getCacheInfoWithRefreshTime,
  getBucketPath,
  hashKey
} from "../../lib/cacache-util";

describe("cacache-util", () => {
  const testCache = path.join(__dirname, "../.cache-util-test");

  beforeAll(() => {
    // Clean up before tests
    try {
      fs.rmSync(testCache, { recursive: true });
    } catch (e) {
      // ignore: test cache may not exist yet
    }
  });

  afterAll(() => {
    // Clean up after tests
    try {
      fs.rmSync(testCache, { recursive: true });
    } catch (e) {
      // ignore: best-effort cleanup
    }
  });

  describe("hashKey()", () => {
    it("should generate consistent SHA256 hashes", () => {
      const key = "test-key";
      const hash1 = hashKey(key);
      const hash2 = hashKey(key);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex = 64 chars
      expect(hash1).toMatch(/^[a-f0-9]+$/); // Lowercase hex
    });

    it("should generate different hashes for different keys", () => {
      const hash1 = hashKey("key1");
      const hash2 = hashKey("key2");

      expect(hash1).not.toBe(hash2);
    });

    it("should match Node crypto.createHash behavior", () => {
      const key = "my-cache-key";
      const expected = crypto.createHash("sha256").update(key).digest("hex");

      expect(hashKey(key)).toBe(expected);
    });
  });

  describe("getBucketPath()", () => {
    it("should generate correct bucket path structure", () => {
      const key = "test-key";
      const bucket = getBucketPath(testCache, key);
      const hash = hashKey(key);

      expect(bucket).toContain(testCache);
      expect(bucket).toContain(`index-v`);
      expect(bucket).toContain(hash.slice(0, 2));
      expect(bucket).toContain(hash.slice(2, 4));
      expect(bucket).toContain(hash.slice(4));
    });

    it("should use cacache package.json for index version", () => {
      const key = "test-key";
      const bucket = getBucketPath(testCache, key);
      const indexV = require("cacache/package.json")["cache-version"].index;

      expect(bucket).toContain(`index-v${indexV}`);
    });

    it("should generate same path as cacache internals", async () => {
      // Write with cacache, then verify our path calculation matches
      await cacache.put(testCache, "verify-key", "data");
      const bucket = getBucketPath(testCache, "verify-key");

      expect(fs.existsSync(bucket)).toBe(true);
    });
  });

  describe("refreshCacheEntry()", () => {
    it("should update bucket mtime without modifying contents", async () => {
      const key = "refresh-test-key";
      await cacache.put(testCache, key, "test data");

      const bucket = getBucketPath(testCache, key);
      const beforeContent = fs.readFileSync(bucket, "utf8");
      const beforeStat = fs.statSync(bucket);

      // Wait to ensure mtime difference
      await new Promise(r => setTimeout(r, 100));

      await refreshCacheEntry(testCache, key);

      const afterContent = fs.readFileSync(bucket, "utf8");
      const afterStat = fs.statSync(bucket);

      expect(afterContent).toBe(beforeContent);
      expect(afterStat.size).toBe(beforeStat.size);
      expect(afterStat.mtimeMs).toBeGreaterThan(beforeStat.mtimeMs);
    });

    it("should not break cacache.get() after refresh", async () => {
      const key = "integrity-test-key";
      const data = "important data";

      await cacache.put(testCache, key, data);
      await refreshCacheEntry(testCache, key);

      const result = await cacache.get(testCache, key);
      expect(result.data.toString()).toBe(data);
    });

    it("should not break cacache.verify() after refresh", async () => {
      const key = "verify-test-key";
      await cacache.put(testCache, key, "verify this");
      await refreshCacheEntry(testCache, key);

      const verifyResult = await cacache.verify(testCache);
      expect(verifyResult.badContentCount).toBe(0);
    });

    it("should handle non-existent keys gracefully", async () => {
      // Should not throw
      await refreshCacheEntry(testCache, "does-not-exist");
    });

    it("should preserve SRI integrity hash", async () => {
      const key = "sri-test-key";
      const putResult = await cacache.put(testCache, key, "test data");

      await refreshCacheEntry(testCache, key);

      const getResult = await cacache.get(testCache, key);
      expect(getResult.integrity.toString()).toBe(putResult.toString());
    });
  });

  describe("getCacheInfoWithRefreshTime()", () => {
    it("should return info with refreshTime field", async () => {
      const key = "info-test-key";
      await cacache.put(testCache, key, "test data");

      const info = await getCacheInfoWithRefreshTime(testCache, key);

      expect(Object.prototype.toString.call(info)).toBe("[object Object]");
      expect(info).toHaveProperty("refreshTime");
      expect(typeof info.refreshTime).toBe("number");
      expect(info.refreshTime).toBeGreaterThan(0);
    });

    it("should include all standard cacache.get.info() fields", async () => {
      const key = "fields-test-key";
      await cacache.put(testCache, key, "test", { metadata: {custom: "data"} });

      const info = await getCacheInfoWithRefreshTime(testCache, key);

      expect(info).toHaveProperty("key");
      expect(info).toHaveProperty("integrity");
      expect(info).toHaveProperty("path");
      expect(info).toHaveProperty("size");
      expect(info).toHaveProperty("time");
      expect(info).toHaveProperty("metadata");
      expect(info).toHaveProperty("refreshTime"); // Our addition
    });

    it("should reflect updated mtime after refresh", async () => {
      const key = "mtime-test-key";
      await cacache.put(testCache, key, "data");

      const beforeInfo = await getCacheInfoWithRefreshTime(testCache, key);

      await new Promise(r => setTimeout(r, 100));
      await refreshCacheEntry(testCache, key);

      const afterInfo = await getCacheInfoWithRefreshTime(testCache, key);

      expect(afterInfo.refreshTime).toBeGreaterThan(beforeInfo.refreshTime);
      expect(afterInfo.time).toBe(beforeInfo.time); // Original time unchanged
    });

    it("should return null for non-existent keys", async () => {
      const info = await getCacheInfoWithRefreshTime(testCache, "does-not-exist");
      expect(info).toBeNull();
    });

    it("should work with metadata", async () => {
      const key = "metadata-test-key";
      const metadata = { version: "1.0.0", source: "npm" };

      await cacache.put(testCache, key, "data", { metadata });
      const info = await getCacheInfoWithRefreshTime(testCache, key);

      expect(info.metadata).toStrictEqual(metadata);
      expect(typeof info.refreshTime).toBe("number");
    });
  });

  describe("Integration: Staleness Check", () => {
    it("should enable staleness checking workflow", async () => {
      const key = "staleness-key";
      const STALE_TIME = 100; // 100ms for test

      // Write initial cache
      await cacache.put(testCache, key, "data");

      // Check immediately - should be fresh
      let info = await getCacheInfoWithRefreshTime(testCache, key);
      let age = Date.now() - info.refreshTime;
      expect(age).toBeLessThan(STALE_TIME);

      // Wait to become stale
      await new Promise(r => setTimeout(r, STALE_TIME + 50));

      info = await getCacheInfoWithRefreshTime(testCache, key);
      age = Date.now() - info.refreshTime;
      expect(age).toBeGreaterThan(STALE_TIME);

      // Refresh and check again - should be fresh
      await refreshCacheEntry(testCache, key);
      info = await getCacheInfoWithRefreshTime(testCache, key);
      age = Date.now() - info.refreshTime;
      expect(age).toBeLessThan(STALE_TIME);
    });
  });

  describe("Cross-version Compatibility", () => {
    it("should work with different cacache data formats", async () => {
      // Test with various data types
      const tests = [
        { key: "string-data", data: "simple string" },
        { key: "json-data", data: JSON.stringify({obj: "value"}) },
        { key: "buffer-data", data: Buffer.from("buffer content") },
        { key: "unicode-data", data: "测试 тест اختبار" }
      ];

      for (const test of tests) {
        await cacache.put(testCache, test.key, test.data);
        await refreshCacheEntry(testCache, test.key);

        const result = await cacache.get(testCache, test.key);
        const info = await getCacheInfoWithRefreshTime(testCache, test.key);

        expect(result.data.toString()).toBe(test.data.toString());
        expect(typeof info.refreshTime).toBe("number");
      }
    });

    it("should handle concurrent operations safely", async () => {
      const key = "concurrent-key";
      await cacache.put(testCache, key, "data");

      // Multiple concurrent refreshes
      await Promise.all([
        refreshCacheEntry(testCache, key),
        refreshCacheEntry(testCache, key),
        refreshCacheEntry(testCache, key)
      ]);

      // Should still be able to read
      const result = await cacache.get(testCache, key);
      expect(result.data.toString()).toBe("data");
    });
  });

  describe("Safety Verification", () => {
    it("should not modify bucket SHA1 hash", async () => {
      const key = "hash-safety-key";
      await cacache.put(testCache, key, "data");

      const bucket = getBucketPath(testCache, key);
      const beforeContent = fs.readFileSync(bucket, "utf8");
      const beforeHash = crypto.createHash("sha1").update(beforeContent).digest("hex");

      await refreshCacheEntry(testCache, key);

      const afterContent = fs.readFileSync(bucket, "utf8");
      const afterHash = crypto.createHash("sha1").update(afterContent).digest("hex");

      expect(afterHash).toBe(beforeHash);
    });

    it("should not modify bucket JSON structure", async () => {
      const key = "json-safety-key";
      await cacache.put(testCache, key, "data");

      const bucket = getBucketPath(testCache, key);
      const beforeContent = fs.readFileSync(bucket, "utf8");
      const beforeLines = beforeContent.split("\n").filter(x => x);

      await refreshCacheEntry(testCache, key);

      const afterContent = fs.readFileSync(bucket, "utf8");
      const afterLines = afterContent.split("\n").filter(x => x);

      expect(afterLines.length).toBe(beforeLines.length);
      expect(afterLines[0]).toBe(beforeLines[0]); // Exact match
    });
  });
});
