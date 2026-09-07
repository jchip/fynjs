import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"]
    }
  }
});
