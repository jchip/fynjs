import _ from "lodash";

/** a `mergeWith` customizer that makes an array from the source replace the target's */
const replaceArray = (a: any, b: any) => (_.isArray(b) && b) || undefined;

/**
 * Merge sources into an object, with arrays replaced rather than merged by index.
 *
 * lodash's plain `merge` would blend `[1, 2, 3]` and `[9]` into `[9, 2, 3]`,
 * which is never what a config override means.
 */
const merge = (...args: any[]) => {
  Array.prototype.push.call(args, replaceArray);
  return (_.mergeWith as any).apply(_, args);
};

/**
 * a `mergeWith` customizer that unions arrays when the key starts with `+`,
 * and otherwise replaces them
 */
const unionArray = (a: any, b: any, k: string) => {
  if (_.isArray(b)) {
    if (k.startsWith("+") && _.isArray(a)) {
      return _.union(a, b);
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
const uMerge = (...args: any[]) => {
  Array.prototype.push.call(args, unionArray);
  return (_.mergeWith as any).apply(_, args);
};

export const util = { replaceArray, merge, unionArray, uMerge };

export default util;
