"use strict";

//
// Helpers shared by the steps that expect fyn to build the local dep at
// test/fixtures/e1 by spawning a nested `fyn install` in that directory.
//
// A broken nested install used to leave the scenario green: the outer install
// runs e1's `install` script itself before linking, so it recreates dist/ and
// the node_modules tree still matches. What only the nested install produces
// is its own footprint inside the fixture directory - its debug log, its
// resolved node_modules, its lock file - so that is what these assert.
//

const Path = require("path");
const Fs = require("fs");
const FsP = require("fs/promises");
const assert = require("assert");

const e1Dir = Path.join(__dirname, "../../fixtures/e1");
// local-pkg-builder spawns the nested install with `--sl=fyn-debug.log`
const nestedLogFile = Path.join(e1Dir, "fyn-debug.log");

/**
 * Point e1's `install` script at the build and clear everything the nested
 * install produces, so the step starts with nothing built and nothing stale.
 */
async function resetLocalBuild() {
  const fileName = Path.join(e1Dir, "package.json");
  const pkg = JSON.parse(await FsP.readFile(fileName));
  pkg.scripts.install = "node index.js hello.js";
  await FsP.writeFile(fileName, JSON.stringify(pkg, null, 2));
  for (const f of ["dist", "node_modules", "fyn-lock.yaml", "fyn-debug.log"]) {
    Fs.rmSync(Path.join(e1Dir, f), { recursive: true, force: true });
  }
}

/**
 * Assert the nested install ran to completion and its build produced output.
 */
function verifyLocalBuild() {
  assert(
    Fs.existsSync(nestedLogFile),
    `no ${nestedLogFile} - fyn never spawned the nested install to build local dep e1`
  );
  const log = Fs.readFileSync(nestedLogFile).toString();
  assert(
    /Done e1@[^\s]+ npm script install .* exit code 0/.test(log),
    `nested install of local dep e1 did not run e1's build script to success, ${nestedLogFile} follows:\n${log}`
  );
  assert(
    Fs.existsSync(Path.join(e1Dir, "dist/hello.js")),
    `local dep e1 build ran but produced no dist/hello.js`
  );
  assert(
    Fs.existsSync(Path.join(e1Dir, "node_modules/mod-h")),
    `nested install of local dep e1 did not install e1's own dependencies`
  );
}

module.exports = { e1Dir, resetLocalBuild, verifyLocalBuild };
