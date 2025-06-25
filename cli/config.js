"use strict";

const myPkg = require("../package.json");

module.exports = {
  taskFile: "xrun-tasks.js",
  taskFileExt: ["js", "cjs", "ts", "mts", "mjs"],
  search: ["xrun-tasks", "xrun", "xclap.", "clapfile.", "clap.", "gulpfile."],
  getPkgOpt: pkg => ["xclap", "xrun", myPkg.name].find(f => pkg.hasOwnProperty(f))
};
