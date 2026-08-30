import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["lcov", "text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: []
    }
  }
});
