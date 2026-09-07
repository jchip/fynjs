import { mergeWith, union } from "lodash-es";

/** a `mergeWith` customizer that makes an array from the source replace the target's */
export const replaceArray = (a: any, b: any) => (Array.isArray(b) && b) || undefined;

/**
 * Merge sources into an object, with arrays replaced rather than merged by index.
 *
 * lodash's plain `merge` would blend `[1, 2, 3]` and `[9]` into `[9, 2, 3]`,
 * which is never what a config override means.
 */
export const merge = (...args: any[]) => {
  Array.prototype.push.call(args, replaceArray);
  return (mergeWith as any).apply(null, args);
};

/**
 * a `mergeWith` customizer that unions arrays when the key starts with `+`,
 * and otherwise replaces them
 */
export const unionArray = (a: any, b: any, k: string) => {
  if (Array.isArray(b)) {
    if (k.startsWith("+") && Array.isArray(a)) {
      return union(a, b);
    }
    return b;
  }
  return undefined;
};

/**
 * Merge sources into an object, unioning arrays under keys that start with `+`.
 *
 * This is what lets a config partial add to a list another partial started,
 * instead of replacing it.
 */
export const uMerge = (...args: any[]) => {
  Array.prototype.push.call(args, unionArray);
  return (mergeWith as any).apply(null, args);
};

export const util = { replaceArray, merge, unionArray, uMerge };

export default util;
