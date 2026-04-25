"use strict";

module.exports = {
  test: {
    globals: true,
    include: ["test/spec/**/*.spec.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**/*.js"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  }
};
