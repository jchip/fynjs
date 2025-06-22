"use strict";

const optionalRequire = require("optional-require")(require);
const env = require("./env");
const logger = require("../lib/logger");
const path = require("path");
const WrapProcess = require("./wrap-process");

const TsRunner = {
  "runner-tsx": "tsx",
  "runner-ts-node": "ts-node/register/transpile-only",
  loaded: undefined,
  runner: undefined,
  _require: optionalRequire,
  load(name) {
    const runner = TsRunner._require(TsRunner[`runner-${name}`], {
      fail: e => (TsRunner[`error-${name}`] = e)
    });
    if (runner) {
      TsRunner.loaded = name;
      TsRunner.runner = runner;
      const resolve = TsRunner._require.resolve;
      TsRunner.path =
        (resolve && ": " + path.relative(WrapProcess.cwd(), resolve(TsRunner[`runner-${name}`]))) ||
        "";
    }
    return runner;
  },
  startRunner() {
    const runners = ["tsx", "ts-node"];
    for (const runner of runners) {
      if (TsRunner.load(runner)) {
        break;
      }
    }
    if (!TsRunner.loaded) {
      const errMsg = runners.map(r => r + ": " + TsRunner[`error-${r}`]).join("\n  ");
      logger.log(`Unable to load a typescript runner:\n  ${errMsg}`);
    } else if (!env.get(env.xrunId)) {
      /* if xrunId exist then we are already running as invocation from another xrun */
      logger.log(`Loaded ${TsRunner.loaded} for TypeScript files${TsRunner.path}`);
    }
  }
};

module.exports = TsRunner;
