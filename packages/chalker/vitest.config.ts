import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // set before test files (and their imports, ie chalk/chalker) are evaluated so
    // chalk's color-support detection sees color support enabled even without a TTY -
    // ESM import hoisting means setting process.env.FORCE_COLOR inside the spec file
    // itself would run too late, after chalk has already computed supportsColor.
    env: {
      FORCE_COLOR: "1"
    },
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["lcov", "text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: []
    }
  }
});
