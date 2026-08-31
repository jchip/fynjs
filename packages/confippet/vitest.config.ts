import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // the preset-config and store suites both drive process.env and the
    // module-level config singleton, so they must not run concurrently
    fileParallelism: false,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["lcov", "text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: [],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  }
});
