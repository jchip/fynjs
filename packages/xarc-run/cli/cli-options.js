"use strict";

const assert = require("assert");
const chalk = require("chalk");
const myPkg = require("../package.json");
const config = require("./config");

module.exports = {
  cwd: {
    alias: "w",
    desc: `Set ${myPkg.name}'s ${chalk.magenta("CWD")}`,
    args: "<path string>",
    requireArg: true
  },
  dir: {
    alias: "d",
    desc: `Set dir to look for ${chalk.green(config.taskFile)} (default is ${chalk.magenta(
      "CWD"
    )})`,
    args: "<path string>",
    requireArg: true
  },
  npm: {
    alias: "n",
    desc: `load npm scripts into namespace ${chalk.magenta("npm")} (--no-npm to disable)`,
    args: "[ boolean]",
    argDefault: "true"
  },
  nmbin: {
    alias: "b",
    desc: `add ${chalk.magenta("CWD/node_modules/.bin")} to ${chalk.blue("PATH")}`,
    args: "[ boolean]",
    argDefault: "true"
  },
  list: {
    alias: "l",
    desc: "List tasks names from list of comma separated namespaces (default is all namespaces)",
    args: "[namespaces string]",
    argDefault: ""
  },
  full: {
    type: "count",
    alias: "f",
    desc: "--list show tasks names with namespace",
    counting: Infinity
  },
  ns: {
    alias: "m",
    desc: "List all namespaces",
    args: "[ boolean]"
  },
  soe: {
    alias: "e",
    desc: `Stop on errors - one of: no, soft, full`,
    args: "[mode enum]",
    argDefault: "full",
    customTypes: {
      enum: v => {
        /* istanbul ignore next */
        if (v === undefined) {
          return "full";
        }
        /* istanbul ignore next */
        if (!v || v === "no") {
          /* istanbul ignore next */
          return "";
        }
        assert(v === "soft" || v === "full", `option soe value must be one of: no, soft, full`);
        return v;
      }
    }
  },
  quiet: {
    alias: "q",
    desc: "Do not output any logs",
    args: "[ boolean]",
    argDefault: "false"
  },
  serial: {
    alias: ["s", "x", "ser"],
    desc: "Execute tasks from command line serially",
    args: "[ boolean]",
    argDefault: "false"
  },
  concurrent: {
    alias: ["c", "conc"],
    desc: "Execute tasks from command line concurrently (default)",
    args: "[ boolean]",
    argDefault: "true"
  },
  env: {
    desc: "Set env. ie: --env NODE_ENV=development FOO=BAR -.",
    args: "[env string...]"
  },
  require: {
    alias: "r",
    desc: `require module for tasks instead of loading ${config.taskFile}. require from path is CWD`,
    args: "[modules string...]"
  }
};
