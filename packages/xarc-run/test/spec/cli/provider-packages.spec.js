"use strict";

const { expect } = require("chai");
const Path = require("path");
const { loadProviderPackages } = require("../../../cli/provider-packages");
const instance = require("../../../lib/xrun-instance");

describe("provider-packages", function() {
  let originalCwd;

  beforeEach(function() {
    originalCwd = process.cwd();
    instance.reset();
  });

  afterEach(function() {
    process.chdir(originalCwd);
    instance.reset();
  });

  describe("loadProviderPackages", function() {
    it("should load provider packages with xrunProvider config", function() {
      const userPkg = {
        dependencies: {
          "provider-1": "^1.0.0",
          "provider-no-tasks": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      // Verify tasks were loaded by checking the global xrun instance
      const xrunTasks = instance.xrun._tasks;

      // Check if tasks exist by trying to lookup them (will throw if not found)
      const task1 = xrunTasks.lookup("provider1-task");
      const task2 = xrunTasks.lookup("provider1-build");

      // Verify task types
      expect(task1.item).to.be.a("string");
      expect(task2.item).to.be.a("function");
    });

    it("should load provider packages from devDependencies and optionalDependencies", function() {
      const userPkg = {
        devDependencies: {
          "provider-dev": "^1.0.0"
        },
        optionalDependencies: {
          "provider-optional": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      process.chdir(testDir);
      const opts = {};

      loadProviderPackages(userPkg, originalCwd, opts);

      // Verify tasks from both providers were loaded
      const xrunTasks = instance.xrun._tasks;

      // Check dev provider tasks
      const devTask = xrunTasks.lookup("dev-task");
      const devTest = xrunTasks.lookup("dev-test");

      // Check optional provider tasks
      const optTask = xrunTasks.lookup("optional-task");
      const optDeploy = xrunTasks.lookup("optional-deploy");

      // Verify task types
      expect(devTask.item).to.be.a("string");
      expect(devTest.item).to.be.a("function");
      expect(optTask.item).to.be.a("string");
      expect(optDeploy.item).to.be.a("function");
    });

    it("should use custom module when specified in xrunProvider config", function() {
      const userPkg = {
        dependencies: {
          "provider-1": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      const xrunTasks = instance.xrun._tasks;

      // Should load from tasks.js, not index.js
      const task1 = xrunTasks.lookup("provider1-task");
      expect(task1.item).to.be.a("string");

      // Verify wrong-task is not loaded (would come from index.js)
      expect(() => xrunTasks.lookup("wrong-task")).to.throw("Task wrong-task not found");
    });

    it("should use main module when no custom module specified", function() {
      const userPkg = {
        dependencies: {
          "provider-2": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/pkg-2");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      const xrunTasks = instance.xrun._tasks;

      // Should load from index.js (main module)
      const task1 = xrunTasks.lookup("provider2-task");
      const task2 = xrunTasks.lookup("provider2-clean");
      expect(task1.item).to.be.a("string");
      expect(task2.item).to.be.a("function");
    });

    it("should identify providers by @fynjs/run dependency", function() {
      const userPkg = {
        devDependencies: {
          "provider-dev": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      const xrunTasks = instance.xrun._tasks;
      const devTask = xrunTasks.lookup("dev-task");
      const devTest = xrunTasks.lookup("dev-test");
      expect(devTask.item).to.be.a("string");
      expect(devTest.item).to.be.a("function");
    });

    it("should skip packages without xrunProvider config or @fynjs/run dependency", function() {
      const userPkg = {
        dependencies: {
          "not-a-provider": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/pkg-2");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      const xrunTasks = instance.xrun._tasks;
      // Should not load any tasks since it's not a provider
      expect(xrunTasks.count()).to.equal(0);
    });

    it("should skip providers without loadTasks export", function() {
      const userPkg = {
        dependencies: {
          "provider-no-tasks": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      const xrunTasks = instance.xrun._tasks;
      // Should not load any tasks since provider doesn't export loadTasks
      expect(xrunTasks.count()).to.equal(0);
    });

    it("should handle missing package.json gracefully", function() {
      const userPkg = {
        dependencies: {
          "non-existent-package": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      // Should not throw error
      expect(() => {
        loadProviderPackages(userPkg, originalCwd, opts);
      }).to.not.throw();

      const xrunTasks = instance.xrun._tasks;
      expect(xrunTasks.count()).to.equal(0);
    });

    it("should handle missing provider module gracefully", function() {
      const userPkg = {
        dependencies: {
          "provider-1": "^1.0.0"
        }
      };

      // Use a directory where provider-1 has package.json but missing tasks.js
      const testDir = Path.join(__dirname, "../../provider-fixtures/pkg-2");
      const opts = { cwd: testDir };

      // Should not throw error
      expect(() => {
        loadProviderPackages(userPkg, originalCwd, opts);
      }).to.not.throw();

      const xrunTasks = instance.xrun._tasks;
      expect(xrunTasks.count()).to.equal(0);
    });

    it("should work correctly when saveCwd equals opts.cwd", function() {
      const userPkg = {
        dependencies: {
          "provider-1": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      // saveCwd equals opts.cwd - should still load tasks
      loadProviderPackages(userPkg, testDir, opts);

      const xrunTasks = instance.xrun._tasks;
      const task1 = xrunTasks.lookup("provider1-task");
      const task2 = xrunTasks.lookup("provider1-build");
      expect(task1.item).to.be.a("string");
      expect(task2.item).to.be.a("function");
    });

    it("should process multiple valid providers", function() {
      const userPkg = {
        dependencies: {
          "provider-1": "^1.0.0"
        },
        devDependencies: {
          "provider-dev": "^1.0.0"
        },
        optionalDependencies: {
          "provider-optional": "^1.0.0"
        }
      };

      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      const xrunTasks = instance.xrun._tasks;

      // Verify all providers were loaded
      const task1 = xrunTasks.lookup("provider1-task");
      const task2 = xrunTasks.lookup("provider1-build");
      const devTask = xrunTasks.lookup("dev-task");
      const devTest = xrunTasks.lookup("dev-test");
      const optTask = xrunTasks.lookup("optional-task");
      const optDeploy = xrunTasks.lookup("optional-deploy");

      // Verify task types
      expect(task1.item).to.be.a("string");
      expect(task2.item).to.be.a("function");
      expect(devTask.item).to.be.a("string");
      expect(devTest.item).to.be.a("function");
      expect(optTask.item).to.be.a("string");
      expect(optDeploy.item).to.be.a("function");

      // Should have 6 tasks total
      expect(xrunTasks.count()).to.equal(6);
    });

    it("should handle mixed valid and invalid providers", function() {
      const userPkg = {
        dependencies: {
          "provider-1": "^1.0.0",
          "not-a-provider": "^1.0.0",
          "provider-no-tasks": "^1.0.0"
        }
      };

      // Use proj-1 for provider-1 and provider-no-tasks, pkg-2 has not-a-provider
      const testDir = Path.join(__dirname, "../../provider-fixtures/proj-1");
      const opts = { cwd: testDir };

      loadProviderPackages(userPkg, originalCwd, opts);

      const xrunTasks = instance.xrun._tasks;

      // Should only process provider-1 (valid provider with loadTasks)
      const task1 = xrunTasks.lookup("provider1-task");
      const task2 = xrunTasks.lookup("provider1-build");
      expect(task1.item).to.be.a("string");
      expect(task2.item).to.be.a("function");

      // Should have only 2 tasks from provider-1
      expect(xrunTasks.count()).to.equal(2);
    });
  });
});
