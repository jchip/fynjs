import { createRequire } from "node:module";
import { makeOptionalRequire } from "optional-require";

//
// A require hook is the point here - TsRunner installs tsx / ts-node into require - so this
// deliberately stays on require rather than moving to optional-import.
//
const optionalRequire = makeOptionalRequire(createRequire(import.meta.url));
import env from "./env.js";
import logger from "../lib/logger.js";
import path from "path";
import WrapProcess from "./wrap-process.js";

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

export default TsRunner;
