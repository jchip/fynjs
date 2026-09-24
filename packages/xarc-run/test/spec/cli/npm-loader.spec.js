import { expect } from "vitest";
import Path from "path";
import fs from "fs";
import os from "os";
import { verify } from "run-verify";
import npmLoader from "../../../cli/npm-loader.js";
import env from "../../../cli/env.js";
import { createXrunInstance } from "../../../lib/xrun-instance.js";

describe("npm-loader", function() {
  let testDir;
  let testEnv;
  let xrun;
  let saveCwd;
  let counter = 0;

  beforeEach(() => {
    testDir = Path.join(os.tmpdir(), `xarc-run-test-${Date.now()}-${counter++}`);
    fs.mkdirSync(testDir, { recursive: true });
    saveCwd = process.cwd();
    process.chdir(testDir);

    testEnv = { ...process.env };
    env.container = testEnv;

    xrun = createXrunInstance();
  });

  afterEach(() => {
    env.container = process.env;
    // Change directory back BEFORE deleting to avoid ENOTEMPTY errors
    // Ensure we're in a valid directory first
    if (saveCwd && fs.existsSync(saveCwd)) {
      try {
        process.chdir(saveCwd);
      } catch (e) {
        // If chdir fails, try to go to temp dir as fallback
        process.chdir(os.tmpdir());
      }
    } else {
      // Fallback to temp dir if saveCwd doesn't exist
      process.chdir(os.tmpdir());
    }

    // Now safe to delete test directory
    if (testDir && fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe("when no package.json exists", () => {
    it("should do nothing", () => {
      npmLoader(xrun, {});
      expect(xrun._tasks._tasks).toStrictEqual({ "/": {} });
    });
  });

  describe("npm scripts loading", () => {
    it("should load npm scripts", () => {
      // Create a package.json with test scripts
      const pkg = {
        scripts: {
          test: "mocha",
          build: "webpack"
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, {});

      expect(xrun._tasks._tasks.npm.test.cmd).toBe("mocha");
      expect(xrun._tasks._tasks.npm.build.cmd).toBe("webpack");
    });

    it("should handle pre/post scripts", () => {
      // Create a package.json with pre/post scripts
      const pkg = {
        scripts: {
          pretest: "eslint",
          test: "mocha",
          posttest: "coverage"
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, {});

      expect(xrun._tasks._tasks.npm.pretest.cmd).toBe("eslint");
      expect(xrun._tasks._tasks.npm.test[2].cmd).toBe("mocha");
      expect(xrun._tasks._tasks.npm.posttest.cmd).toBe("coverage");
    });

    it("should not load npm scripts when npm option is false", () => {
      // Create a package.json with test scripts
      const pkg = {
        scripts: {
          test: "mocha"
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, { npm: false });

      expect(xrun._tasks._tasks.npm).toBeUndefined();
    });
  });

  describe("package config tasks loading", () => {
    it("should load tasks from xrun config", () => {
      // Create a package.json with xrun config
      const pkg = {
        xrun: {
          tasks: {
            foo: ["bar", "baz"],
            qux: "quux"
          }
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, {});

      expect(xrun._tasks._tasks["pkg"].foo).toStrictEqual(["bar", "baz"]);
      expect(xrun._tasks._tasks["pkg"].qux).toBe("quux");
    });

    it("should not load tasks if package config has no tasks", () => {
      // Create a package.json with empty xarc config
      const pkg = {
        xarc: {}
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, {});

      expect(xrun._tasks._tasks["/pkg"]).toBeUndefined();
    });

    it("should handle both npm scripts and package config", () => {
      // Create a package.json with both npm scripts and xarc config
      const pkg = {
        scripts: {
          test: "mocha"
        },
        xclap: {
          tasks: {
            foo: "bar"
          }
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, {});

      expect(xrun._tasks._tasks.npm.test.cmd).toBe("mocha");
      expect(xrun._tasks._tasks["pkg"].foo).toBe("bar");
    });
  });

  describe("environment handling", () => {
    it("should update XRUN_PACKAGE_PATH", () => {
      // Create a package.json
      const pkg = {
        scripts: {
          test: "mocha"
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, {});

      expect(env.get(env.xrunPackagePath)).toContain(Path.join(testDir, "package.json"));
    });
  });

  describe("npm-run-like script env", () => {
    it("should set npm_* env vars and INIT_CWD on the script's exec spec", () => {
      const pkg = {
        name: "my-pkg",
        version: "9.9.9",
        scripts: {
          test: "mocha"
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      return verify()
        .step(() => npmLoader(xrun, {}))
        .step(() => xrun._tasks._tasks.npm.test.options.env)
        .step(scriptEnv => {
          expect(scriptEnv.npm_lifecycle_event).toBe("test");
          expect(scriptEnv.npm_lifecycle_script).toBe("mocha");
          expect(scriptEnv.npm_package_name).toBe("my-pkg");
          expect(scriptEnv.npm_package_version).toBe("9.9.9");
          expect(fs.realpathSync(scriptEnv.npm_package_json)).toBe(
            fs.realpathSync(Path.join(testDir, "package.json"))
          );
          // XRUN_INIT_CWD is only captured by parseArgs(), which this direct call bypasses
          expect(scriptEnv.INIT_CWD).toBe(process.cwd());
        });
    });

    it("should give pre/post scripts their own npm_lifecycle_event", () => {
      const pkg = {
        scripts: {
          pretest: "eslint",
          test: "mocha",
          posttest: "coverage"
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      return verify()
        .step(() => npmLoader(xrun, {}))
        .step(() => {
          expect(xrun._tasks._tasks.npm.pretest.options.env.npm_lifecycle_event).toBe("pretest");
          expect(xrun._tasks._tasks.npm.test[2].options.env.npm_lifecycle_event).toBe("test");
          expect(xrun._tasks._tasks.npm.posttest.options.env.npm_lifecycle_event).toBe(
            "posttest"
          );
        });
    });

    it("should use XRUN_INIT_CWD when parseArgs has already captured it", () => {
      const originalCwd = "/original/invocation/dir";
      env.set(env.xrunInitCwd, originalCwd);

      const pkg = {
        scripts: {
          test: "mocha"
        }
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      return verify()
        .step(() => npmLoader(xrun, {}))
        .step(() => {
          expect(xrun._tasks._tasks.npm.test.options.env.INIT_CWD).toBe(originalCwd);
        });
    });
  });
});
