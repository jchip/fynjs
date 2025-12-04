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

  // First check the root directory
  let xrunFile;
  files.find(n => (xrunFile = dirFiles.find(f => f.startsWith(n))));

  // If found in root, return it
  if (xrunFile) {
    const foundPkg = Boolean(dirFiles.find(f => f === "package.json"));
    return {
      found: true,
      foundPkg,
      xrunFile: Path.join(xrunDir, xrunFile),
      dir: xrunDir
    };
  }

  // If not found in root, check subdirectories: scripts/, tools/, build/, tasks/
  const subDirs = ["scripts", "tools", "build", "tasks"];
  for (const subDir of subDirs) {
    const subDirPath = Path.join(xrunDir, subDir);
    try {
      const subDirFiles = Fs.readdirSync(subDirPath);
      files.find(n => (xrunFile = subDirFiles.find(f => f.startsWith(n))));

      if (xrunFile) {
        const foundPkg = Boolean(dirFiles.find(f => f === "package.json"));
        return {
          found: true,
          foundPkg,
          xrunFile: Path.join(subDirPath, xrunFile),
          dir: xrunDir
        };
      }
    } catch (err) {
      // Subdirectory doesn't exist or can't be read, skip it
    }
  }

  // Not found anywhere
  const foundPkg = Boolean(dirFiles.find(f => f === "package.json"));
  return {
    found: false,
    foundPkg,
    xrunFile: undefined,
    dir: xrunDir
  };
}

module.exports = { searchUpTaskFile, findTaskFile };
