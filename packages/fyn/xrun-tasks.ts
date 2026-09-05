"use strict";

const Fs = require("fs/promises");
const Path = require("path");
const which = require("which");

const xrun = require("@fynjs/run");

xrun.load("fyn", {
  // rolldown emits an ESM bundle (dist/fyn.mjs). ESM is required, not preferred: chalker uses
  // top-level await to reach ESM-only chalk, and no CJS output format can represent it.
  bundle: xrun.exec("rolldown -c rolldown.config.mjs"),

  "replace-npm-g": {
    desc: "Replace the version that was installed by 'npm i -g' with current",
    task: [
      "fyn/bundle",
      async () => {
        const fyn = await which("fyn");
        const realPath = await Fs.realpath(fyn);
        const dist = Path.join(realPath, "../../dist/fyn.mjs");
        return xrun.exec(`cp dist/fyn.mjs ${dist}`);
      }
    ]
  },

  "create-tgz": "node test/fixtures/mock-npm/create-tgz"
});
