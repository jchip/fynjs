import Path from "node:path";

/**
 * On Windows escape backslash path separators for use in a RegExp source
 * string; elsewhere pass through unchanged.
 */
export const escBs: (x: string) => string =
  Path.sep === "\\" ? x => x.replace(/\\/g, "\\\\") : x => x;
