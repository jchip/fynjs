import { defineConfig } from "vitest/config";
import Path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["test/vitest-setup.ts"],
    include: ["test/**/*.spec.{js,ts}"],
    exclude: ["node_modules/", "dist/", "coverage/"],
    threads: false,
    maxConcurrency: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "text-summary"],
      include: ["lib/**/*.{js,ts}", "cli/**/*.{js,ts}"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/coverage/**",
        "**/test/**",
        "**/*.spec.{js,ts}",
        "**/*.test.{js,ts}",
        "**/pkg-bin-linker-win32.js",
        "**/clap.js",
        "**/clap.ts",
        "**/bin/**",
        "**/cli/config/**",
        "**/cli/fun.js",
        "**/lib/util/file-ops-win32.js",
        "**/stubs/**",
        "**/tmp/**",
        "**/webpack.config.js",
        "**/xout/**",
        "**/xrun*.js",
        "**/xrun*.ts",
        "**/yarn/**"
      ],
      checkCoverage: true,
      //
      // Under `thresholds`. Declared flat these were silently ignored by vitest 4. They are a
      // ratchet against regression, so they sit just under what the suite actually covers -
      // raise them as coverage improves rather than leaving them aspirational and inert.
      //
      thresholds: {
        statements: 75,
        branches: 66,
        functions: 80,
        lines: 76
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000
  },
  resolve: {
    alias: {
      "@": Path.resolve(__dirname, "./lib")
    },
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
  },
  esbuild: {
    target: "node14"
  }
});
