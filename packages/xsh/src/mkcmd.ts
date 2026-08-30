/**
 * Make a command string: a single array of strings is joined with `" "`,
 * otherwise all arguments are joined with `" "`.
 */
export function mkCmd(...args: Array<string | string[]>): string {
  const a = args[0];
  return Array.isArray(a) ? a.join(" ") : (args as string[]).join(" ");
}
