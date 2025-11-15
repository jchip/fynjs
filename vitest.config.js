import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Shared configuration for all projects
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup-vitest.js"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    sequence: {
      concurrent: false
    },
    silent: false,
    coverage: {
      provider: "v8", // Using v8 because istanbul doesn't work with forks pool (needed for process.chdir())
      reporter: ["text", "lcov", "text-summary"],
      include: ["cli/**/*.js", "lib/**/*.js"],
      exclude: [
        "demos",
        "bin",
        "cli/check-global.js",
        "xclap.js",
        "xtasks.js",
        "xrun-tasks.js",
        "coverage",
        ".eslintrc.js",
        ".prettierrc.js",
        ".nycrc.js",
        ".nycrc.json",
        ".nycrc.yml",
        ".nycrc.yaml",
      ],
      all: true,
      lines: 100,
      functions: 100,
      branches: 95, // Set to 95% to account for v8 coverage false positives with short-circuit evaluation
      statements: 100,
    },
    testTimeout: 10000,

    // Define projects with different configurations
    projects: [
      {
        extends: true,  // Inherit parent config (globals, setupFiles, etc.)
        test: {
          name: "stdout-intercept",
          include: [
            "test/spec/sample1.spec.js",
            "test/spec/print-tasks.spec.js",
            "test/spec/xrun.spec.js"
          ],
          // Disable vitest's console interception for tests that use xstdout.intercept()
          disableConsoleIntercept: true
        }
      },
      {
        extends: true,  // Inherit parent config (globals, setupFiles, etc.)
        test: {
          name: "default",
          include: ["test/spec/**/*.spec.js"],
          exclude: [
            "test/spec/sample1.spec.js",
            "test/spec/print-tasks.spec.js",
            "test/spec/xrun.spec.js"
          ]
        }
      }
    ]
  },
});
