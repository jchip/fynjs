/**
 * Get an environment variable
 *
 * @param name env variable name
 * @param valWhenUndef value to return if the variable is not defined
 */
export function get(name: string, valWhenUndef?: string): string | undefined {
  const x = process.env[name];
  return x === undefined ? valWhenUndef : x;
}

/**
 * Get an environment variable as a boolean.  `"true"`, `"1"`, `"yes"`, `"on"`
 * (case insensitive) are `true`, anything else is `false`.
 *
 * @param name env variable name
 * @param valWhenUndef value to return if the variable is not defined - must be
 *   a boolean, else `false` is returned
 */
export function getAsBool(name: string, valWhenUndef?: unknown): boolean {
  const x = process.env[name];
  if (x === undefined) {
    if (typeof valWhenUndef === "boolean") {
      return valWhenUndef;
    }
    return false;
  }

  const b = x.toLowerCase();
  return b === "true" || b === "1" || b === "yes" || b === "on";
}

/**
 * Get an environment variable as an integer.
 *
 * @param name env variable name
 * @param valWhenUndef value to return if the variable is not defined or can't
 *   be parsed - must be a number, else `NaN` is returned
 */
export function getAsInt(name: string, valWhenUndef?: unknown): number {
  let n = NaN;
  const x = process.env[name];
  if (x !== undefined) {
    n = +x;
    if (!isNaN(n)) return n;
  }

  if (typeof valWhenUndef === "number") {
    return valWhenUndef;
  }

  return n;
}

export const env = { get, getAsBool, getAsInt };
