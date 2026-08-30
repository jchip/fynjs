import Path from "node:path";
import { pathCwd } from "./path-cwd.ts";
import { escBs } from "./esc-bs.ts";

const normNm = escBs(Path.normalize("/node_modules/"));
const normNmReplacer = Path.normalize("/~/");

const makeNmRegex = () => escBs(Path.resolve("node_modules"));

/**
 * Remove occurrences of CWD/node_modules from `p`.
 *
 * @param p path string to process
 * @param flags RegExp flags, ie: `"g"`
 */
function remove(p: string, flags?: string): string {
  const nmRegex = new RegExp(makeNmRegex(), flags || "");
  p = p.replace(nmRegex, "");
  return pathCwd.remove(p, flags);
}

/**
 * Replace occurrences of CWD/node_modules in `p` with `str` (default
 * `"CWD/~"`), and any remaining `/node_modules/` with `/~/`.
 *
 * @param p path string to process
 * @param str replacement - non-string means use `"CWD/~"`
 * @param flags RegExp flags, ie: `"g"`
 */
function replace(p: string, str?: string | null | false, flags?: string): string {
  if (typeof str !== "string") {
    str = Path.join(`CWD`, `~`);
  }
  const nmRegex = new RegExp(makeNmRegex(), flags || "");
  p = pathCwd.replace(p.replace(nmRegex, str), null, flags);
  return p.replace(new RegExp(normNm, flags), normNmReplacer);
}

export const pathCwdNm = { remove, replace };
