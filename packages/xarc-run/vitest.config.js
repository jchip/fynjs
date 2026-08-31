import { defineConfig } from "vitest/config";

//
// Specs that call `xstdout.intercept()` to capture stdout themselves.
//
// They must run with vitest's own console interception off. Vitest otherwise
// ships every write to the main process over the `onUserConsoleLog` RPC, and
// these specs emit output from tasks that outlive the test - a log still in
// flight when the worker's environment tears down rejects as
// `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending`,
// which fails the run even though every test passed.
//
// One list, used to include them here and exclude them there, so a new
// intercepting spec cannot land in only half of it.
//
const stdoutInterceptSpecs = [
  "test/spec/cli/task-file.spec.js",
  "test/spec/finally.spec.js",
  "test/spec/logger.spec.js",
  "test/spec/print-tasks.spec.js",
  "test/spec/reporters/sample1.spec.js",
  "test/spec/sample1.spec.js",
  "test/spec/xrun.spec.js"
];

export default defineConfig({
  test: {
    // Shared configuration for all projects
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup-vitest.mjs"],
    pool: "forks",
    forks: {
      singleFork: true
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
      //
      // Under `thresholds`. Declared flat these were silently ignored by vitest 4, so the
      // gate passed at whatever coverage happened to be.
      //
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        // one uncovered arm in xqtor: a task cliParser error that is not an unknown option
        branches: 99
      },
    },
    testTimeout: 10000,

    // Define projects with different configurations
    projects: [
      {
        extends: true,  // Inherit parent config (globals, setupFiles, etc.)
        test: {
          name: "stdout-intercept",
          include: stdoutInterceptSpecs,
          // Disable vitest's console interception for tests that use xstdout.intercept()
          disableConsoleIntercept: true
        }
      },
      {
        extends: true,  // Inherit parent config (globals, setupFiles, etc.)
        test: {
          name: "default",
          include: ["test/spec/**/*.spec.js"],
          exclude: stdoutInterceptSpecs
        }
      }
    ]
  },
});
