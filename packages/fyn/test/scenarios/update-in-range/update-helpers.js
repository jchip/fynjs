"use strict";

const Fs = require("fs");
const Path = require("path");
const Yaml = require("js-yaml");

const updateArgs = (options, names) =>
  [].concat(options.baseArgs, `--reg=${options.registry}`, "--layout=detail", "update", "--no-audit", names);

const lockedVersions = cwd => {
  const lock = Yaml.load(Fs.readFileSync(Path.join(cwd, "fyn-lock.yaml"), "utf8"));
  const result = {};
  for (const name of Object.keys(lock).filter(n => !n.startsWith("$"))) {
    result[name] = Object.keys(lock[name]).filter(v => !v.startsWith("_"));
  }
  return result;
};

module.exports = { updateArgs, lockedVersions };
