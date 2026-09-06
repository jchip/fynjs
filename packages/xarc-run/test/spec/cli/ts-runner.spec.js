import { expect } from "vitest";
import TsRunner from "../../../cli/ts-runner.js";
import env from "../../../cli/env.js";
import logger from "../../../lib/logger.js";

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
      const result = TsRunner.load("ts-resolve");
      expect(result).toBeUndefined();
      expect(TsRunner["error-ts-resolve"]).toEqual(expect.anything());
    });

    it("should return module when found", () => {
      const mockModule = {};
      TsRunner._require = _mod => mockModule;
      const result = TsRunner.load("ts-resolve");
      expect(result).toBe(mockModule);
      expect(TsRunner.loaded).toBe("ts-resolve");
    });

    it("should store error when module load fails", () => {
      const expectedError = new Error("Module not found");
      TsRunner._require = (mod, opts) => {
        opts.fail(expectedError);
        return undefined;
      };
      const result = TsRunner.load("ts-resolve");
      expect(result).toBeUndefined();
      expect(TsRunner["error-ts-resolve"]).toBe(expectedError);
    });
  });

  describe("startRunner", () => {
    it("should try ts-resolve first", () => {
      let attemptedModules = [];
      TsRunner._require = mod => {
        attemptedModules.push(mod);
        if (mod === "@fynjs/ts-resolve/register") {
          return {};
        }
        return undefined;
      };

      TsRunner.startRunner();

      expect(attemptedModules).toStrictEqual(["@fynjs/ts-resolve/register"]);
      expect(TsRunner.loaded).toBe("ts-resolve");
    });

    it("should try ts-node if ts-resolve fails then stop", () => {
      let attemptedModules = [];
      TsRunner._require = mod => {
        attemptedModules.push(mod);
        if (mod === "ts-node/register/transpile-only") {
          return {};
        }
        return undefined;
      };

      TsRunner.startRunner();

      expect(attemptedModules).toStrictEqual([
        "@fynjs/ts-resolve/register",
        "ts-node/register/transpile-only"
      ]);
      expect(TsRunner.loaded).toBe("ts-node");
    });

    //
    // ts-resolve is ESM-only and needs node >= 22.15 for module.registerHooks. On an older
    // node the require throws something that is not a not-found, optional-require hands it
    // to `fail`, and the next runner must still get its turn.
    //
    it("should fall through to ts-node when ts-resolve throws a non not-found error", () => {
      const hookErr = new TypeError("registerHooks is not a function");
      let attemptedModules = [];
      TsRunner._require = (mod, opts) => {
        attemptedModules.push(mod);
        if (mod === "@fynjs/ts-resolve/register") {
          opts.fail(hookErr);
          return undefined;
        }
        return {};
      };

      TsRunner.startRunner();

      expect(attemptedModules).toStrictEqual([
        "@fynjs/ts-resolve/register",
        "ts-node/register/transpile-only"
      ]);
      expect(TsRunner["error-ts-resolve"]).toBe(hookErr);
      expect(TsRunner.loaded).toBe("ts-node");
    });

    it("should handle case when no runner can be loaded", () => {
      let attemptedModules = [];
      TsRunner._require = (mod, opts) => {
        attemptedModules.push(mod);
        opts.fail(new Error("not found"));
        return undefined;
      };

      TsRunner.startRunner();

      expect(attemptedModules).toStrictEqual([
        "@fynjs/ts-resolve/register",
        "ts-node/register/transpile-only"
      ]);
      expect(TsRunner.loaded).toBeUndefined();
      expect(TsRunner["error-ts-resolve"]).toEqual(expect.anything());
      expect(TsRunner["error-ts-node"]).toEqual(expect.anything());
    });

    //
    // The real thing, not a mock: @fynjs/ts-resolve is ESM-only, so this is the check that
    // the require path in ts-runner can actually load it on this node.
    //
    it("should really load @fynjs/ts-resolve through require", () => {
      delete TsRunner["error-ts-resolve"];
      const result = TsRunner.load("ts-resolve");
      expect(TsRunner["error-ts-resolve"], String(TsRunner["error-ts-resolve"])).toBeUndefined();
      expect(result).toEqual(expect.anything());
      expect(TsRunner.loaded).toBe("ts-resolve");
      expect(TsRunner.path).toContain("ts-resolve");
    });

    it("should respect xrunId environment variable", () => {
      const prevXrunId = env.get(env.xrunId);
      const prevLoaded = TsRunner.loaded;

      // Set xrunId to simulate running as sub-invocation
      process.env[env.xrunId] = "test-run";

      // Mock successful runner load
      TsRunner._require = () => ({});

      TsRunner.startRunner();

      // Even if a runner is loaded, it shouldn't affect the existing state
      if (prevLoaded) {
        expect(TsRunner.loaded).toBe(prevLoaded);
      }

      // Restore previous state
      if (prevXrunId) {
        process.env[env.xrunId] = prevXrunId;
      } else {
        delete process.env[env.xrunId];
      }
      TsRunner.loaded = prevLoaded;
    });

    it("should log when runner is loaded and not in sub-invocation", () => {
      // Ensure xrunId is NOT set
      delete process.env[env.xrunId];

      // Spy on logger.log
      const originalLog = logger.log;
      let logMessages = [];
      logger.log = (msg) => logMessages.push(msg);

      try {
        // Mock successful ts-resolve load with path
        TsRunner._require = (mod) => {
          return {};
        };
        TsRunner._require.resolve = (mod) => {
          return "/some/path/to/ts-resolve/register.js";
        };

        TsRunner.startRunner();

        // Verify logger.log was called with the correct message
        expect(logMessages).toHaveLength(1);
        expect(logMessages[0]).toContain("Loaded ts-resolve for TypeScript files");
        expect(TsRunner.loaded).toBe("ts-resolve");
      } finally {
        // Restore logger
        logger.log = originalLog;
      }
    });

    it("should not log when runner is loaded but in sub-invocation", () => {
      // Set xrunId to simulate sub-invocation
      process.env[env.xrunId] = "test-run";

      // Spy on logger.log
      const originalLog = logger.log;
      let logMessages = [];
      logger.log = (msg) => logMessages.push(msg);

      try {
        // Mock successful ts-resolve load
        TsRunner._require = () => ({});

        TsRunner.startRunner();

        // Verify logger.log was NOT called for success message
        // (it shouldn't log when xrunId is set)
        expect(logMessages).toHaveLength(0);
        expect(TsRunner.loaded).toBe("ts-resolve");
      } finally {
        // Restore logger and env
        logger.log = originalLog;
        delete process.env[env.xrunId];
      }
    });
  });
});
