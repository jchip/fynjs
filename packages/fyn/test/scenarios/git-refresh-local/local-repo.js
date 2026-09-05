"use strict";

//
// The scenario installs from a throwaway git repo under packages/fyn/.tmp (gitignored), so the
// dependency URL is an absolute path that is different on every machine.
//
// The steps used to read their own tracked pkg.json, poke the absolute path into it and write it
// back, which committed one developer's home directory to git and left the file permanently dirty
// for everyone else. Each step's pkg.json is generated here instead, and gitignored - the scenario
// dir's .gitignore covers step-*/pkg.json.
//
const Fs = require("fs");
const Path = require("path");

/**
 * Absolute path of the local git repo fixture this scenario installs from.
 *
 * @param {string} scenarioDir this scenario's directory
 * @returns {string} absolute path to the fixture repo (may not exist yet)
 */
const repoDir = scenarioDir => Path.resolve(scenarioDir, "..", "..", "..", ".tmp", "test-git-repo");

/**
 * The fixture repo as a git+file:// URL. On Windows a file URL needs forward slashes and three
 * slashes before the drive letter.
 *
 * @param {string} scenarioDir this scenario's directory
 * @returns {string} dependency URL for the fixture repo
 */
const repoUrl = scenarioDir => {
  const dir = repoDir(scenarioDir);
  return process.platform === "win32" ? `git+file:///${dir.replace(/\\/g, "/")}` : `git+file://${dir}`;
};

/**
 * Generate a step's pkg.json - the framework merges it into the scenario's package.json right
 * after the step's `before` hook returns.
 *
 * @param {string} scenarioDir this scenario's directory
 * @param {string} step step directory name, e.g. "step-01"
 * @returns {string} the dependency URL written
 */
const writeStepPkgJson = (scenarioDir, step) => {
  const url = repoUrl(scenarioDir);
  const pkgJson = {
    name: "git-refresh-local-test",
    version: "1.0.0",
    dependencies: {
      "test-from-gh": url
    }
  };
  Fs.writeFileSync(
    Path.join(scenarioDir, step, "pkg.json"),
    `${JSON.stringify(pkgJson, null, 2)}\n`
  );
  return url;
};

module.exports = { repoDir, repoUrl, writeStepPkgJson };
