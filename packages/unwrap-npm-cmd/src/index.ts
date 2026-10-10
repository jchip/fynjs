import { resolveNpmCmd, type ResolveResult } from "./resolve-npm-cmd.js";
import { quote, relative, unquote } from "./utils.js";

export { quote, relative, unquote } from "./utils.js";
export { resolveNpmCmd } from "./resolve-npm-cmd.js";
export type { ResolveResult, ResolveOptions } from "./resolve-npm-cmd.js";

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

  // the exe is a leading double-quoted token, such as a path with spaces, or the first word
  const quoteEnd = cmd.startsWith(`"`) ? cmd.indexOf(`"`, 1) : -1;
  let exeEnd = quoteEnd + 1;
  let exe = cmd.slice(1, quoteEnd);
  if (quoteEnd < 0) {
    exeEnd = cmd.includes(" ") ? cmd.indexOf(" ") : cmd.length;
    exe = cmd.slice(0, exeEnd);
  }

  const newExe = unwrapExe(exe, options);
  return newExe !== exe ? newExe + cmd.slice(exeEnd) : cmd;
}

export default unwrapNpmCmd;
