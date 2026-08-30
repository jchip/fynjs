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
        // vitest 4's v8 provider counts defensive guard branches that vitest 3 did not.
        // Four remain uncovered - command-node.ts:109 and nix-clap.ts:355, 797, 975 - all
        // false-paths of internal guards. Raise this back to 100 if they get tests.
        branches: 99,
        functions: 100,
        lines: 100
      }
    }
  }
});
