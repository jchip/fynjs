#!/usr/bin/env node
import Path from "path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/**
 * Find the directory holding the CLI code to run.
 *
 * A project can install its own @fynjs/run, and that copy should win over whichever one this bin
 * happens to live in - so look from the project's cwd first, then from this file. Looking from
 * this file also covers package managers that symlink node_modules/.bin straight at the bin
 * script, which bypasses node's `--preserve-symlinks` handling.
 *
 * Every branch returns an absolute path. Probing by name and then requiring by name would use two
 * different resolution bases - cwd for the probe, this file for the require - so they could land
 * on different copies, or the require could fail outright when only the probe matched.
 *
 * @returns absolute path to the cli directory
 */
function resolveCliDir() {
  for (const paths of [[process.cwd()], [import.meta.dirname]]) {
    try {
      return Path.dirname(require.resolve("@fynjs/run/cli/xrun", { paths }));
    } catch (err) {
      //
    }
  }

  // not installed under either - running from this package's own checkout
  return Path.join(import.meta.dirname, "..", "cli");
}

//
// resolve xrun and ck from the same install so they cannot come from different copies
//
const cliDir = resolveCliDir();

const { default: xrun } = await import(pathToFileURL(Path.join(cliDir, "xrun.js")).href);

await xrun();
