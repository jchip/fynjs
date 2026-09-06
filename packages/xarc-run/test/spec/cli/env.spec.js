import { expect } from "vitest";
import env from "../../../cli/env.js";

describe("env", function() {
  // Store original env.container
  let originalContainer;

  beforeEach(() => {
    // Save original container
    originalContainer = env.container;

    // Create a new container for testing
    env.container = {};
  });

  afterEach(() => {
    // Restore original container
    env.container = originalContainer;
  });

  describe("environment variable keys", () => {
    it("should define XRUN_TASKFILE", () => {
      expect(env.xrunTaskFile).toBe("XRUN_TASKFILE");
    });

    it("should define XRUN_PACKAGE_PATH", () => {
      expect(env.xrunPackagePath).toBe("XRUN_PACKAGE_PATH");
    });

    it("should define XRUN_ID", () => {
      expect(env.xrunId).toBe("XRUN_ID");
    });

    it("should define FORCE_COLOR", () => {
      expect(env.forceColor).toBe("FORCE_COLOR");
    });

    it("should define XRUN_CWD", () => {
      expect(env.xrunCwd).toBe("XRUN_CWD");
    });

    it("should define XRUN_VERSION", () => {
      expect(env.xrunVersion).toBe("XRUN_VERSION");
    });

    it("should define XRUN_BIN_DIR", () => {
      expect(env.xrunBinDir).toBe("XRUN_BIN_DIR");
    });

    it("should define XRUN_NODE_BIN", () => {
      expect(env.xrunNodeBin).toBe("XRUN_NODE_BIN");
    });
  });

  describe("get", () => {
    it("should get environment variable value", () => {
      env.container.XRUN_TEST = "test-value";
      expect(env.get("XRUN_TEST")).toBe("test-value");
    });

    it("should return undefined for non-existent variable", () => {
      expect(env.get("XRUN_NON_EXISTENT")).toBeUndefined();
    });

    it("should throw error for invalid key", () => {
      expect(() => env.get()).toThrow("env.get invalid key: undefined");
      expect(() => env.get(null)).toThrow("env.get invalid key: null");
      expect(() => env.get("")).toThrow("env.get invalid key: ");
    });
  });

  describe("set", () => {
    it("should set environment variable", () => {
      env.set("XRUN_TEST", "test-value");
      expect(env.container.XRUN_TEST).toBe("test-value");
    });

    it("should convert non-string values to strings", () => {
      env.set("XRUN_TEST_NUMBER", 123);
      expect(env.container.XRUN_TEST_NUMBER).toBe("123");

      env.set("XRUN_TEST_BOOLEAN", true);
      expect(env.container.XRUN_TEST_BOOLEAN).toBe("true");

      env.set("XRUN_TEST_OBJECT", { key: "value" });
      expect(env.container.XRUN_TEST_OBJECT).toBe("[object Object]");
    });

    it("should throw error for invalid key", () => {
      expect(() => env.set()).toThrow("env.set invalid key: undefined");
      expect(() => env.set(null)).toThrow("env.set invalid key: null");
      expect(() => env.set("")).toThrow("env.set invalid key: ");
    });
  });

  describe("has", () => {
    it("should return true for existing variable", () => {
      env.container.XRUN_TEST = "test-value";
      expect(env.has("XRUN_TEST")).toBe(true);
    });

    it("should return false for non-existent variable", () => {
      expect(env.has("XRUN_NON_EXISTENT")).toBe(false);
    });

    it("should throw error for invalid key", () => {
      expect(() => env.has()).toThrow("env.has invalid key: undefined");
      expect(() => env.has(null)).toThrow("env.has invalid key: null");
      expect(() => env.has("")).toThrow("env.has invalid key: ");
    });
  });

  describe("del", () => {
    it("should delete environment variable", () => {
      env.container.XRUN_TEST = "test-value";
      env.del("XRUN_TEST");
      expect(env.container.XRUN_TEST).toBeUndefined();
    });

    it("should not throw error when deleting non-existent variable", () => {
      expect(() => env.del("XRUN_NON_EXISTENT")).not.toThrow();
    });

    it("should throw error for invalid key", () => {
      expect(() => env.del()).toThrow("env.del invalid key: undefined");
      expect(() => env.del(null)).toThrow("env.del invalid key: null");
      expect(() => env.del("")).toThrow("env.del invalid key: ");
    });
  });

  describe("container", () => {
    it("should allow setting a custom container", () => {
      const customContainer = {};
      env.container = customContainer;
      env.set("XRUN_TEST", "test-value");
      expect(customContainer.XRUN_TEST).toBe("test-value");
    });

    it("should use the current container for all operations", () => {
      const customContainer = {};
      env.container = customContainer;

      env.set("XRUN_TEST", "test-value");
      expect(env.get("XRUN_TEST")).toBe("test-value");

      expect(env.has("XRUN_TEST")).toBe(true);

      env.del("XRUN_TEST");
      expect(env.has("XRUN_TEST")).toBe(false);
    });
  });
});
