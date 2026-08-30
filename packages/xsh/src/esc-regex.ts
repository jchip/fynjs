/**
 * Escape a string for literal use inside a RegExp.
 *
 * Paths routinely carry regex metacharacters - a `.` in a dot directory, `+`
 * or parens in a project name, `\` separators on Windows - so interpolating
 * one raw either silently mismatches or throws a SyntaxError.
 */
export const escapeRegExp = (x: string): string => x.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
