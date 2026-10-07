/**
 * Make a command string: every argument, string or array of strings,
 * contributes its words in order, joined with `" "`.
 */
export function mkCmd(...args: Array<string | string[]>): string {
  return args.flat().join(" ");
}
