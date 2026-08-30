import Path from "node:path";
import { escapeRegExp } from "./esc-regex.ts";

/**
 * Remove occurrences of CWD from `p`.
 *
 * @param p path string to process
 * @param flags RegExp flags, ie: `"g"`
 * @param stripSlash also strip the path separator following CWD
 */
function remove(p: string, flags?: string, stripSlash?: boolean): string {
  const cwd = process.cwd();
  if (stripSlash) {
    const regex = new RegExp(escapeRegExp(Path.join(cwd, Path.sep)), flags);
    p = p.replace(regex, "");
  }
  if (p.indexOf(cwd) >= 0) {
    const regex = new RegExp(escapeRegExp(cwd), flags);
    return p.replace(regex, "");
  }
  return p;
}

/**
 * Replace occurrences of CWD in `p` with `str` (default `"CWD"`).
 *
 * @param p path string to process
 * @param str replacement - non-string means use `"CWD"`
 * @param flags RegExp flags, ie: `"g"`
 */
function replace(p: string, str?: string | null | false, flags?: string): string {
  if (typeof str !== "string") {
    str = "CWD";
  }
  const regex = new RegExp(escapeRegExp(process.cwd()), flags);
  return p.replace(regex, str);
}

export const pathCwd = { remove, replace };
