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
  //
  // `@fynjs/ts-resolve` is ESM-only, but it stays on this same require path: node's
  // `require(esm)` is unflagged from 22.12, which is already this package's floor, and
  // `./register` has no top-level await - the one graph `require(esm)` refuses. So it is
  // required like the others and returns a (truthy) namespace object.
  //
  // It is first because it is the cheapest: a resolve hook feeding node's own type
  // stripping, no transpiler and no native binary. Its only hard requirement is node
  // >= 22.15 for `module.registerHooks`; below that the require throws, optional-require
  // routes that to `fail`, and tsx / ts-node still get their turn.
  //
  "runner-ts-resolve": "@fynjs/ts-resolve/register",
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
    const runners = ["ts-resolve", "tsx", "ts-node"];
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
