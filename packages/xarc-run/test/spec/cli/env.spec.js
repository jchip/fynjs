"use strict";

const { expect } = require("chai");
const env = require("../../../cli/env");

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
      expect(env.xrunTaskFile).to.equal("XRUN_TASKFILE");
    });

    it("should define XRUN_PACKAGE_PATH", () => {
      expect(env.xrunPackagePath).to.equal("XRUN_PACKAGE_PATH");
    });

    it("should define XRUN_ID", () => {
      expect(env.xrunId).to.equal("XRUN_ID");
    });

    it("should define FORCE_COLOR", () => {
      expect(env.forceColor).to.equal("FORCE_COLOR");
    });

    it("should define XRUN_CWD", () => {
      expect(env.xrunCwd).to.equal("XRUN_CWD");
    });

    it("should define XRUN_VERSION", () => {
      expect(env.xrunVersion).to.equal("XRUN_VERSION");
    });

    it("should define XRUN_BIN_DIR", () => {
      expect(env.xrunBinDir).to.equal("XRUN_BIN_DIR");
    });

    it("should define XRUN_NODE_BIN", () => {
      expect(env.xrunNodeBin).to.equal("XRUN_NODE_BIN");
    });
  });

  describe("get", () => {
    it("should get environment variable value", () => {
      env.container.XRUN_TEST = "test-value";
      expect(env.get("XRUN_TEST")).to.equal("test-value");
    });

    it("should return undefined for non-existent variable", () => {
      expect(env.get("XRUN_NON_EXISTENT")).to.be.undefined;
    });

    it("should throw error for invalid key", () => {
      expect(() => env.get()).to.throw("env.get invalid key: undefined");
      expect(() => env.get(null)).to.throw("env.get invalid key: null");
      expect(() => env.get("")).to.throw("env.get invalid key: ");
    });
  });

  describe("set", () => {
    it("should set environment variable", () => {
      env.set("XRUN_TEST", "test-value");
      expect(env.container.XRUN_TEST).to.equal("test-value");
    });

    it("should convert non-string values to strings", () => {
      env.set("XRUN_TEST_NUMBER", 123);
      expect(env.container.XRUN_TEST_NUMBER).to.equal("123");

      env.set("XRUN_TEST_BOOLEAN", true);
      expect(env.container.XRUN_TEST_BOOLEAN).to.equal("true");

      env.set("XRUN_TEST_OBJECT", { key: "value" });
      expect(env.container.XRUN_TEST_OBJECT).to.equal("[object Object]");
    });

    it("should throw error for invalid key", () => {
      expect(() => env.set()).to.throw("env.set invalid key: undefined");
      expect(() => env.set(null)).to.throw("env.set invalid key: null");
      expect(() => env.set("")).to.throw("env.set invalid key: ");
    });
  });

  describe("has", () => {
    it("should return true for existing variable", () => {
      env.container.XRUN_TEST = "test-value";
      expect(env.has("XRUN_TEST")).to.be.true;
    });

    it("should return false for non-existent variable", () => {
      expect(env.has("XRUN_NON_EXISTENT")).to.be.false;
    });

    it("should throw error for invalid key", () => {
      expect(() => env.has()).to.throw("env.has invalid key: undefined");
      expect(() => env.has(null)).to.throw("env.has invalid key: null");
      expect(() => env.has("")).to.throw("env.has invalid key: ");
    });
  });

  describe("del", () => {
    it("should delete environment variable", () => {
      env.container.XRUN_TEST = "test-value";
      env.del("XRUN_TEST");
      expect(env.container.XRUN_TEST).to.be.undefined;
    });

    it("should not throw error when deleting non-existent variable", () => {
      expect(() => env.del("XRUN_NON_EXISTENT")).to.not.throw();
    });

    it("should throw error for invalid key", () => {
      expect(() => env.del()).to.throw("env.del invalid key: undefined");
      expect(() => env.del(null)).to.throw("env.del invalid key: null");
      expect(() => env.del("")).to.throw("env.del invalid key: ");
    });
  });

  describe("container", () => {
    it("should allow setting a custom container", () => {
      const customContainer = {};
      env.container = customContainer;
      env.set("XRUN_TEST", "test-value");
      expect(customContainer.XRUN_TEST).to.equal("test-value");
    });

    it("should use the current container for all operations", () => {
      const customContainer = {};
      env.container = customContainer;

      env.set("XRUN_TEST", "test-value");
      expect(env.get("XRUN_TEST")).to.equal("test-value");

      expect(env.has("XRUN_TEST")).to.be.true;

      env.del("XRUN_TEST");
      expect(env.has("XRUN_TEST")).to.be.false;
    });
  });
});
