"use strict";

const assert = require("assert");
const chalk = require("chalk");
const myPkg = require("../package.json");
const config = require("./config");

module.exports = {
  cwd: {
    type: "string",
    alias: "w",
    desc: `Set ${myPkg.name}'s ${chalk.magenta("CWD")}`,
    args: "<string path>",
    requireArg: true
  },
  dir: {
    type: "string",
    alias: "d",
    desc: `Set dir to look for ${chalk.green(config.taskFile)} (default is ${chalk.magenta("CWD")})`,
    args: "<string path>",
    requireArg: true
  },
  npm: {
    type: "boolean",
    alias: "n",
    desc: `load npm scripts into namespace ${chalk.magenta("npm")} (--no-npm to disable)`,
    args: "[boolean]",
    argDefault: "true"
  },
  nmbin: {
    type: "boolean",
    alias: "b",
    desc: `add ${chalk.magenta("CWD/node_modules/.bin")} to ${chalk.blue("PATH")}`,
    args: "[boolean]",
    argDefault: "true"
  },
  list: {
    type: "string",
    alias: "l",
    desc: "List tasks names from list of comma separated namespaces (default is all namespaces)",
    args: "[string namespaces]",
    argDefault: ""
  },
  full: {
    type: "count",
    alias: "f",
    desc: "--list show tasks names with namespace",
    counting: Infinity
  },
  ns: {
    type: "boolean",
    alias: "m",
    desc: "List all namespaces",
    args: "[boolean]"
  },
  soe: {
    alias: "e",
    desc: `Stop on errors - one of: no, soft, full`,
    args: "[enum mode]",
    argDefault: "full",
    custom: {
      mode: v => {
        if (v === undefined) return "full";
        if (!v || v === "no") return "";
        assert(v === "soft" || v === "full", `option soe value must be one of: no, soft, full`);
        return v;
      }
    }
  },
  quiet: {
    type: "boolean",
    alias: "q",
    desc: "Do not output any logs",
    args: "[boolean]",
    argDefault: "false"
  },
  serial: {
    type: "boolean",
    alias: ["s", "x"],
    desc: "Execute tasks from command line serially",
    args: "[boolean]",
    argDefault: "false"
  },
  require: {
    type: "string array",
    alias: "r",
    desc: `require module for tasks instead of loading ${config.taskFile}. require from path is CWD`,
    args: "[string... modules]"
  }
};
