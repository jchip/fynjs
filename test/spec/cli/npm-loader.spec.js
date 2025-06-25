"use strict";

const { expect } = require("chai");
const Path = require("path");
const fs = require("fs");
const os = require("os");
const npmLoader = require("../../../cli/npm-loader");
const env = require("../../../cli/env");
const { createXrunInstance } = require("../../../lib/xrun-instance");

describe("npm-loader", function() {
  let testDir;
  let testEnv;
  let xrun;
  let saveCwd;

  beforeEach(() => {
    testDir = Path.join(os.tmpdir(), `xarc-run-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    saveCwd = process.cwd();
    process.chdir(testDir);

    testEnv = { ...process.env };
    env.container = testEnv;

    xrun = createXrunInstance();
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
    env.container = process.env;
    process.chdir(saveCwd);
  });

  describe("when no package.json exists", () => {
    it("should do nothing", () => {
      npmLoader(xrun, {});
      expect(xrun._tasks._tasks).to.deep.equal({ "/": {} });
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

      expect(xrun._tasks._tasks.npm.test.cmd).equal("mocha");
      expect(xrun._tasks._tasks.npm.build.cmd).equal("webpack");
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

      expect(xrun._tasks._tasks.npm.pretest.cmd).equal("eslint");
      expect(xrun._tasks._tasks.npm.test[2].cmd).equal("mocha");
      expect(xrun._tasks._tasks.npm.posttest.cmd).equal("coverage");
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

      expect(xrun._tasks._tasks.npm).to.be.undefined;
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

      expect(xrun._tasks._tasks["pkg"].foo).to.deep.equal(["bar", "baz"]);
      expect(xrun._tasks._tasks["pkg"].qux).equal("quux");
    });

    it("should not load tasks if package config has no tasks", () => {
      // Create a package.json with empty xarc config
      const pkg = {
        xarc: {}
      };
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

      npmLoader(xrun, {});

      expect(xrun._tasks._tasks["/pkg"]).to.be.undefined;
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

      expect(xrun._tasks._tasks.npm.test.cmd).equal("mocha");
      expect(xrun._tasks._tasks["pkg"].foo).equal("bar");
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

      expect(env.get(env.xrunPackagePath)).to.contain(Path.join(testDir, "package.json"));
    });
  });
});
