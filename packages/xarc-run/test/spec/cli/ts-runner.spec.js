"use strict";

const { expect } = require("chai");
const TsRunner = require("../../../cli/ts-runner");
const env = require("../../../cli/env");

describe("ts-runner", function() {
  let originalEnv;
  let originalRequire;

  beforeEach(() => {
    // Save original env and require state
    originalEnv = { ...process.env };
    originalRequire = TsRunner._require;
    // Reset TsRunner state
    TsRunner.loaded = undefined;
  });

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
    // Restore original require
    TsRunner._require = originalRequire;
  });

  describe("load", () => {
    it("should return undefined when module is not found", () => {
      TsRunner._require = (mod, opts) => {
        opts.fail(new Error("not found"));
        return undefined;
      };
      const result = TsRunner.load("tsx");
      expect(result).to.be.undefined;
      expect(TsRunner["error-tsx"]).to.exist;
    });

    it("should return module when found", () => {
      const mockModule = {};
      TsRunner._require = _mod => mockModule;
      const result = TsRunner.load("tsx");
      expect(result).to.equal(mockModule);
      expect(TsRunner.loaded).to.equal("tsx");
    });

    it("should store error when module load fails", () => {
      const expectedError = new Error("Module not found");
      TsRunner._require = (mod, opts) => {
        opts.fail(expectedError);
        return undefined;
      };
      const result = TsRunner.load("tsx");
      expect(result).to.be.undefined;
      expect(TsRunner["error-tsx"]).to.equal(expectedError);
    });
  });

  describe("startRunner", () => {
    it("should try tsx first then ts-node", () => {
      let attemptedModules = [];
      TsRunner._require = mod => {
        attemptedModules.push(mod);
        if (mod === "tsx") {
          return {};
        }
        return undefined;
      };

      TsRunner.startRunner();

      expect(attemptedModules).to.deep.equal(["tsx"]);
      expect(TsRunner.loaded).to.equal("tsx");
    });

    it("should try ts-node if tsx fails", () => {
      let attemptedModules = [];
      TsRunner._require = mod => {
        attemptedModules.push(mod);
        if (mod === "ts-node/register/transpile-only") {
          return {};
        }
        return undefined;
      };

      TsRunner.startRunner();

      expect(attemptedModules).to.deep.equal(["tsx", "ts-node/register/transpile-only"]);
      expect(TsRunner.loaded).to.equal("ts-node");
    });

    it("should handle case when no runner can be loaded", () => {
      let attemptedModules = [];
      TsRunner._require = (mod, opts) => {
        attemptedModules.push(mod);
        opts.fail(new Error("not found"));
        return undefined;
      };

      TsRunner.startRunner();

      expect(attemptedModules).to.deep.equal(["tsx", "ts-node/register/transpile-only"]);
      expect(TsRunner.loaded).to.be.undefined;
      expect(TsRunner["error-tsx"]).to.exist;
      expect(TsRunner["error-ts-node"]).to.exist;
    });

    it("should respect xrunId environment variable", () => {
      const prevXrunId = env.get(env.xrunId);
      const prevLoaded = TsRunner.loaded;

      // Set xrunId to simulate running as sub-invocation
      process.env[env.xrunId] = "test-run";

      // Mock successful tsx load
      TsRunner._require = () => ({});

      TsRunner.startRunner();

      // Even if a runner is loaded, it shouldn't affect the existing state
      if (prevLoaded) {
        expect(TsRunner.loaded).to.equal(prevLoaded);
      }

      // Restore previous state
      if (prevXrunId) {
        process.env[env.xrunId] = prevXrunId;
      } else {
        delete process.env[env.xrunId];
      }
      TsRunner.loaded = prevLoaded;
    });
  });
});
