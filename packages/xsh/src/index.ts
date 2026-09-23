import { util } from "./util.ts";
import { exec } from "./exec.ts";
import { env } from "./env.ts";
import { envPath } from "./env-path.ts";
import { mkCmd } from "./mkcmd.ts";
import { pathCwd } from "./path-cwd.ts";
import { pathCwdNm } from "./path-cwd-nm.ts";
import { pushd, popd } from "./pushd.ts";

export type {
  ExecOutput,
  ExecError,
  ExecCallback,
  ExecOptions,
  ExecFragment,
  ExecArg,
  ExecResult
} from "./exec.ts";
export type { EnvContainer } from "./env-path.ts";

export interface Xsh {
  exec: typeof exec;
  env: typeof env;
  envPath: typeof envPath;
  mkCmd: typeof mkCmd;
  pathCwd: typeof pathCwd;
  pathCwdNm: typeof pathCwdNm;
  pushd: typeof pushd;
  popd: typeof popd;
  /** Promise implementation used by exec - set to null to restore native Promise */
  Promise: PromiseConstructor;
}

const xsh = {
  exec,
  env,
  envPath,
  mkCmd,
  pathCwd,
  pathCwdNm,
  pushd,
  popd
} as Xsh;

Object.defineProperty(xsh, "Promise", {
  set: p => {
    util.Promise = p || Promise;
  },
  get: () => util.Promise
});

export { exec, env, envPath, mkCmd, pathCwd, pathCwdNm, pushd, popd };

export default xsh;

// make `require("xsh")` in CJS consumers (node >=22.12 require(esm)) return the
// xsh object itself - same shape as the historical module.exports - instead of
// the module namespace.
export { xsh as "module.exports" };
