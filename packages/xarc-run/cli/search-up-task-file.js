"use strict";

/* eslint-disable no-constant-condition */

const Path = require("path");
const Fs = require("fs");
const config = require("./config");

/*
 * Look for xrun file at xrunDir
 * Search up each directory if `search` is true
 * Until a file "package.json" is found or top is reached
 */

function searchUpTaskFile(xrunDir, search) {
  let result;
  let dir = xrunDir;

  do {
    result = findTaskFile(dir);

    // If we found a task file or package.json, stop searching
    if (result.found || result.foundPkg) {
      break;
    }

    // If we're not searching up or we've hit the root, stop
    if (!search) break;

    const tmp = Path.join(dir, "..");
    if (!tmp || tmp === "." || tmp === dir) {
      break;
    }
    dir = tmp;
  } while (true);

  // If we didn't find a task file, use the original directory
  if (!result.found) {
    result.dir = xrunDir;
  }

  return result;
}

function findTaskFile(xrunDir) {
  const dirFiles = Fs.readdirSync(xrunDir);
  const files = config.search;

  let xrunFile;
  files.find(n => (xrunFile = dirFiles.find(f => f.startsWith(n))));

  const foundPkg = Boolean(dirFiles.find(f => f === "package.json"));

  return {
    found: Boolean(xrunFile),
    foundPkg,
    xrunFile: xrunFile ? Path.join(xrunDir, xrunFile) : undefined,
    dir: xrunDir
  };
}

module.exports = { searchUpTaskFile, findTaskFile };
