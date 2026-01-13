import { defineConfig } from "vitest/config";
import Path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
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
        "**/.eslint*.*",
        "**/yarn/**"
      ],
      checkCoverage: true,
      statements: 76,
      branches: 68,
      functions: 79,
      lines: 77
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
