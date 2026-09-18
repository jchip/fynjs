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
        statements: 100,
        // npmPublish always supplies a filename to its private removeFile helper.
        branches: 99.35,
        functions: 100,
        lines: 100
      }
    }
  }
});
