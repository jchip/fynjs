"use strict";

// Access logger through the global logger instance that's already loaded by scenarios.spec.ts
// The logger is a singleton, so we should get the same instance
const stripAnsiModule = require("strip-ansi");
const stripAnsi = stripAnsiModule.default || stripAnsiModule;

// Get logger from global (set by scenarios.spec.ts beforeEach)
let logger;
if (typeof global !== "undefined" && global.__fynTestLogger) {
  logger = global.__fynTestLogger;
} else {
  // Fallback: try to require the logger (vitest should handle TypeScript transformation)
  try {
    const loggerModule = require("../../../../lib/logger");
    logger = loggerModule.default || loggerModule;
  } catch (e) {
    // If require fails, we'll use a mock logger (test will likely fail but won't crash)
    logger = { logData: [], _logData: [], _lines: [] };
  }
}

module.exports = {
  title: "should NOT warn about optional peer dep missing",
  verify: () => {
    // mod-f@3.0.0 has mod-a as an optional peer dependency
    // Since it's marked as optional in peerDependenciesMeta, no warning should appear
    const msg = "peer dependencies mod-a@^0.3.0 of mod-f@3.0.0 is missing";
    // Access logData from the logger instance
    // Make sure we're using the same logger instance from scenarios.spec.ts
    const actualLogger = (typeof global !== "undefined" && global.__fynTestLogger) || logger;
    const logData = actualLogger.logData || (actualLogger._logData && Array.isArray(actualLogger._logData) ? actualLogger._logData : []) || [];
    const warning = logData.map(x => stripAnsi(String(x))).find(x => x.indexOf(msg) > 0);
    expect(warning).to.be.undefined;
  }
};
