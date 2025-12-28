import { resolveNpmCmd, ResolveResult } from "./resolve-npm-cmd.ts";
import { quote, relative, unquote } from "./utils.ts";

export { quote, relative, unquote } from "./utils.ts";
export { resolveNpmCmd } from "./resolve-npm-cmd.ts";
export type { ResolveResult, ResolveOptions } from "./resolve-npm-cmd.ts";

export interface UnwrapOptions {
  path?: string;
  relative?: boolean;
  cwd?: string;
  jsOnly?: boolean;
}

const RESOLVE_CACHE: Record<string, Record<string, string | ResolveResult>> = {};

function unwrapExe(exe: string, options: UnwrapOptions): string {
  const pathKey = options.path || "";
  let pathCache = RESOLVE_CACHE[pathKey];

  if (!pathCache) {
    pathCache = RESOLVE_CACHE[pathKey] = {};
  }

  let newExe: string | ResolveResult;

  if (pathCache[exe]) {
    newExe = pathCache[exe];
  } else {
    try {
      newExe = resolveNpmCmd(exe, options);
      pathCache[exe] = newExe;
    } catch (_err) {
      pathCache[exe] = exe;
      return exe;
    }
  }

  if (typeof newExe === "string") {
    return newExe;
  }

  let { jsFile } = newExe;

  if (options && options.relative) {
    jsFile = relative(jsFile, options.cwd);
  }

  if (options && options.jsOnly) {
    return quote(jsFile);
  }

  return [quote(process.execPath), quote(jsFile)].join(" ");
}

export function unwrapNpmCmd(cmd: string, options: UnwrapOptions = { path: process.env.PATH }): string {
  if (process.platform !== "win32") {
    return cmd;
  }

  const cmdParts = cmd.split(" ");
  const exe = unwrapExe(cmdParts[0], options);
  if (exe !== cmdParts[0]) {
    return [exe].concat(cmdParts.slice(1)).join(" ");
  } else {
    return cmd;
  }
}

export default unwrapNpmCmd;
