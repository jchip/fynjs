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
  title: "should warn peer dep missing",
  verify: () => {
    // New format: "Warning: peer dependencies mod-a@^0.3.0 is missing (by: mod-f@2.1.1)"
    // Search for the warning message in the log data
    const peerDep = "mod-a@^0.3.0";
    const requiringPkg = "mod-f@2.1.1";
    // Access logData from the logger instance
    // VisualLogger stores logs in _logData and exposes it via logData getter
    // Make sure we're using the same logger instance from scenarios.spec.ts
    const actualLogger = (typeof global !== "undefined" && global.__fynTestLogger) || logger;
    const logData = actualLogger.logData || (actualLogger._logData && Array.isArray(actualLogger._logData) ? actualLogger._logData : []) || [];
    const logText = logData.map(x => stripAnsi(String(x))).join(" ");
    
    // Check that the warning contains the peer dep, "is missing", "(by:", and the requiring package
    expect(logText).to.include(peerDep);
    expect(logText).to.include("is missing");
    expect(logText).to.include("(by:");
    expect(logText).to.include(requiringPkg);
  }
};
