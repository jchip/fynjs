"use strict";

const { expect } = require("chai");
const { CliContext } = require("../../lib/cli-context");

describe("CliContext", function() {
  describe("constructor", function() {
    it("should handle full cmdArgs object from CLI parsing", function() {
      const cmdArgs = {
        parsed: {
          command: {
            subCmdNodes: {
              task1: { argv: ["task1", "--opt1", "value1"] },
              task2: { argv: ["task2", "--opt2"] }
            },
            jsonMeta: {
              opts: { quiet: false, serial: true },
              source: { quiet: "default" }
            }
          },
          _: ["extra", "args"]
        },
        opts: { quiet: false, serial: true },
        tasks: ["task1", "task2"],
        searchResult: { found: true, dir: "/test" }
      };

      const context = new CliContext(cmdArgs);

      expect(context.getTasks()).to.deep.equal(["task1", "task2"]);
      expect(context.getGlobalOptions()).to.deep.equal({ quiet: false, serial: true });
      expect(context.getRemainingArgs()).to.deep.equal(["extra", "args"]);
      expect(context.getTaskArgv("task1")).to.deep.equal(["task1", "--opt1", "value1"]);
      expect(context.getSearchResult()).to.deep.equal({ found: true, dir: "/test" });
    });

    it("should handle simplified object for tests", function() {
      const cmdArgs = {
        cmdNodes: {
          test: { argv: ["test", "--flag"] }
        },
        opts: { quiet: true },
        tasks: ["test"],
        searchResult: { found: false },
        parsed: { _: ["remaining"] }
      };

      const context = new CliContext(cmdArgs);

      expect(context.getTasks()).to.deep.equal(["test"]);
      expect(context.getGlobalOptions()).to.deep.equal({ quiet: true });
      expect(context.getRemainingArgs()).to.deep.equal(["remaining"]);
      expect(context.getTaskArgv("test")).to.deep.equal(["test", "--flag"]);
    });

    it("should handle minimal object with defaults", function() {
      const cmdArgs = {
        opts: {},
        parsed: {}
      };

      const context = new CliContext(cmdArgs);

      expect(context.getTasks()).to.deep.equal([]);
      expect(context.getGlobalOptions()).to.deep.equal({});
      expect(context.getRemainingArgs()).to.deep.equal([]);
      expect(context.getTaskArgv("nonexistent")).to.deep.equal([]);
    });
  });

  describe("getTaskCommand", function() {
    it("should return task command object", function() {
      const cmdArgs = {
        cmdNodes: {
          build: {
            argv: ["build", "--env", "prod"],
            opts: { env: "prod" }
          }
        },
        opts: {},
        tasks: ["build"],
        parsed: {}
      };

      const context = new CliContext(cmdArgs);
      const taskCmd = context.getTaskCommand("build");

      expect(taskCmd).to.deep.equal({
        argv: ["build", "--env", "prod"],
        opts: { env: "prod" }
      });
    });

    it("should return empty object for non-existent task", function() {
      const context = new CliContext({
        cmdNodes: {},
        opts: {},
        tasks: [],
        parsed: {}
      });

      expect(context.getTaskCommand("nonexistent")).to.deep.equal({});
    });
  });

  describe("getTaskArgv", function() {
    it("should return argv array for task", function() {
      const cmdArgs = {
        cmdNodes: {
          test: { argv: ["test", "--coverage", "--reporter", "json"] }
        },
        opts: {},
        tasks: ["test"],
        parsed: {}
      };

      const context = new CliContext(cmdArgs);

      expect(context.getTaskArgv("test")).to.deep.equal([
        "test",
        "--coverage",
        "--reporter",
        "json"
      ]);
    });

    it("should return empty array for task without argv", function() {
      const cmdArgs = {
        cmdNodes: {
          simple: {}
        },
        opts: {},
        tasks: ["simple"],
        parsed: {}
      };

      const context = new CliContext(cmdArgs);

      expect(context.getTaskArgv("simple")).to.deep.equal([]);
    });
  });

  describe("getMetadata", function() {
    it("should return jsonMeta from parsed command", function() {
      const cmdArgs = {
        parsed: {
          command: {
            jsonMeta: {
              opts: { quiet: true },
              source: { quiet: "cli" }
            }
          }
        },
        opts: {},
        tasks: []
      };

      const context = new CliContext(cmdArgs);
      const metadata = context.getMetadata();

      expect(metadata).to.deep.equal({
        opts: { quiet: true },
        source: { quiet: "cli" }
      });
    });

    it("should return empty object when no parsed data", function() {
      const context = new CliContext({
        opts: {},
        tasks: [],
        parsed: {}
      });

      expect(context.getMetadata()).to.deep.equal({});
    });
  });

  describe("boolean getters", function() {
    it("should return correct boolean values", function() {
      const cmdArgs = {
        opts: {
          quiet: true,
          serial: false,
          soe: "full"
        },
        tasks: [],
        parsed: {}
      };

      const context = new CliContext(cmdArgs);

      expect(context.isQuiet()).to.be.true;
      expect(context.isSerial()).to.be.false;
      expect(context.getStopOnError()).to.equal("full");
    });

    it("should handle undefined options", function() {
      const context = new CliContext({
        opts: {},
        tasks: [],
        parsed: {}
      });

      expect(context.isQuiet()).to.be.undefined;
      expect(context.isSerial()).to.be.undefined;
      expect(context.getStopOnError()).to.be.undefined;
    });
  });

  describe("remaining arguments", function() {
    it("should detect when remaining args exist", function() {
      const cmdArgs = {
        opts: {},
        tasks: [],
        parsed: { _: ["--verbose", "arg1", "arg2"] }
      };

      const context = new CliContext(cmdArgs);

      expect(context.hasRemainingArgs()).to.be.true;
      expect(context.getRemainingArgs()).to.deep.equal(["--verbose", "arg1", "arg2"]);
    });

    it("should handle empty remaining args", function() {
      const cmdArgs = {
        opts: {},
        tasks: [],
        parsed: { _: [] }
      };

      const context = new CliContext(cmdArgs);

      expect(context.hasRemainingArgs()).to.be.false;
      expect(context.getRemainingArgs()).to.deep.equal([]);
    });

    it("should handle missing remaining args", function() {
      const context = new CliContext({
        opts: {},
        tasks: [],
        parsed: {}
      });

      expect(context.hasRemainingArgs()).to.be.false;
      expect(context.getRemainingArgs()).to.deep.equal([]);
    });
  });

  describe("isLastTask", function() {
    it("should identify last task correctly", function() {
      const context = new CliContext({
        opts: {},
        tasks: ["build", "test", "deploy"],
        parsed: {}
      });

      expect(context.isLastTask("build")).to.be.false;
      expect(context.isLastTask("test")).to.be.false;
      expect(context.isLastTask("deploy")).to.be.true;
    });

    it("should handle single task", function() {
      const context = new CliContext({
        opts: {},
        tasks: ["onlytask"],
        parsed: {}
      });

      expect(context.isLastTask("onlytask")).to.be.true;
      expect(context.isLastTask("othertask")).to.be.false;
    });

    it("should handle empty tasks", function() {
      const context = new CliContext({
        opts: {},
        tasks: [],
        parsed: {}
      });

      expect(context.isLastTask("anytask")).to.be.false;
    });
  });

  describe("getAllTaskNames", function() {
    it("should return all task names from command nodes", function() {
      const cmdArgs = {
        cmdNodes: {
          build: { argv: ["build"] },
          test: { argv: ["test"] },
          deploy: { argv: ["deploy"] }
        },
        opts: {},
        tasks: [],
        parsed: {}
      };

      const context = new CliContext(cmdArgs);
      const taskNames = context.getAllTaskNames();

      expect(taskNames).to.deep.equal(["build", "test", "deploy"]);
    });

    it("should return empty array when no command nodes", function() {
      const context = new CliContext({
        opts: {},
        tasks: [],
        parsed: {}
      });

      expect(context.getAllTaskNames()).to.deep.equal([]);
    });
  });

  describe("backward compatibility methods", function() {
    it("should provide raw access methods", function() {
      const cmdArgs = {
        opts: { test: true },
        tasks: ["task"],
        parsed: { command: { test: "data" } }
      };

      const context = new CliContext(cmdArgs);

      expect(context.getRawCmdArgs()).to.equal(cmdArgs);
      expect(context.getRawParsed()).to.equal(cmdArgs.parsed);
    });
  });

  describe("complex scenarios", function() {
    it("should handle complex CLI scenario with multiple args", function() {
      const cmdArgs = {
        parsed: {
          command: {
            subCmdNodes: {
              build: {
                argv: ["build", "--env", "production"],
                opts: { env: "production" }
              },
              test: {
                argv: ["test", "--coverage"],
                opts: { coverage: true }
              }
            },
            jsonMeta: {
              opts: { quiet: false, serial: true, soe: "soft" },
              source: { quiet: "cli", serial: "cli", soe: "default" }
            }
          },
          _: ["--extra-flag", "value"]
        },
        opts: { quiet: false, serial: true, soe: "soft" },
        tasks: ["build", "test"],
        searchResult: { found: true, xrunFile: "xrun-tasks.js", dir: "/project" }
      };

      const context = new CliContext(cmdArgs);

      // Test all functionality together
      expect(context.getTasks()).to.deep.equal(["build", "test"]);
      expect(context.isQuiet()).to.be.false;
      expect(context.isSerial()).to.be.true;
      expect(context.getStopOnError()).to.equal("soft");

      expect(context.getTaskArgv("build")).to.deep.equal(["build", "--env", "production"]);
      expect(context.getTaskArgv("test")).to.deep.equal(["test", "--coverage"]);

      expect(context.hasRemainingArgs()).to.be.true;
      expect(context.getRemainingArgs()).to.deep.equal(["--extra-flag", "value"]);

      expect(context.isLastTask("build")).to.be.false;
      expect(context.isLastTask("test")).to.be.true;

      expect(context.getAllTaskNames()).to.deep.equal(["build", "test"]);

      const metadata = context.getMetadata();
      expect(metadata.source.quiet).to.equal("cli");
      expect(metadata.opts.serial).to.be.true;
    });
  });
});
