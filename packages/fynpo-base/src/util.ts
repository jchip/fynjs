import Path from "path";

/**
 * ensure a path uses `/` for separator
 */
export const posixify = Path.sep === "/" ? (x) => x : (path) => path.replace(/\\/g, "/");

/**
 * Pick specified properties from an object
 */
export function pick<T extends Record<string, any>>(
  obj: T | null | undefined,
  keys: string | readonly (string | number | symbol)[] | undefined
): Partial<T> {
  const res: any = {};
  if (!obj || !keys) return res;
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const k of keyList) {
    if (k in obj) {
      res[k] = obj[k as keyof T];
    }
  }
  return res;
}
