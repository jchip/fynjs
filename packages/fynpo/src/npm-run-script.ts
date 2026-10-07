/* copied from https://github.com/lerna/lerna/blob/main/utils/npm-run-script/npm-run-script.js */
import { spawnStreaming, exec } from "./child-process.ts";

// npm reads flags after the script name as its own config, so pass a `--` to hand them to the script
const makeArgv = (script, args) => ["run", script, ...(args.length > 0 ? ["--", ...args] : [])];

const makeOpts = (pkg, reject) => {
  return {
    cwd: pkg.path,
    reject,
    pkg,
  };
};

export const npmRunScript = (script, { args, npmClient, pkg, reject = true }) => {
  const argv = makeArgv(script, args);
  const opts = makeOpts(pkg, reject);

  return exec(npmClient, argv, opts);
};

export const npmRunScriptStreaming = (script, { args, npmClient, pkg, prefix, reject = true }) => {
  const argv = makeArgv(script, args);
  const opts = makeOpts(pkg, reject);

  return spawnStreaming(npmClient, argv, opts, prefix && pkg.name);
};
