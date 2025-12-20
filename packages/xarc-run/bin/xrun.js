#!/usr/bin/env node
"use strict";

const Path = require("path");
const { optionalRequireCwd } = require("optional-require");

/**
 * In case a package manager uses symlinks to arrange packages under node_modules, this will
 * detect whether we should use a relative path, or this module's full name, as prefix to its code
 * in order to be compatible with node's `--preserve-symlinks` flag.
 *
 * The reason this is needed: In node_modules/.bin, package managers will create symlinks that
 * point directly to the bin files, and that will by pass the `--preserv-symlinks` behavior.
 *
 * @returns relative path or full name to this module's code
 */
function detectRequirePrefix() {
  try {
    const nmName = require.resolve("@fynjs/run/bin/xrun");
    const nmDir = Path.dirname(nmName);
    if (nmDir !== __dirname) {
      return "@fynjs/run"; // use module's full name
    }
  } catch (err) {
    //
  }

  return ".."; // use relative path
}

const prefix = detectRequirePrefix();

const xrun = optionalRequireCwd("@fynjs/run/cli/xrun") || require(`${prefix}/cli/xrun`);

xrun();
