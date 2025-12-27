import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["lcov", "text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: [],
      thresholds: {
        statements: 20,
        branches: 20,
        functions: 20,
        lines: 20
      }
    }
  }
});
