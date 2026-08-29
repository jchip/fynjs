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

//
// resolve xrun and ck from the same install so they cannot come from different copies
//
const cliDir = optionalRequireCwd("@fynjs/run/cli/xrun") ? "@fynjs/run" : prefix;

const xrun = require(`${cliDir}/cli/xrun`);
const ck = require(`${cliDir}/cli/ck`);

//
// chalker is ESM-only with top-level await, so it can only be loaded asynchronously. Load it
// here, before the CLI runs, so the synchronous `ck` log call sites throughout cli/ get colors.
// ck.load() never rejects - colors are optional.
//
ck.load().then(() => xrun());
