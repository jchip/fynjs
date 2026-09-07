function isPlainObject(val: any): boolean {
  if (val === null || typeof val !== "object" || Object.prototype.toString.call(val) !== "[object Object]") {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

/** a customizer that makes an array from the source replace the target's */
export const replaceArray = (a: any, b: any) => (Array.isArray(b) ? b : undefined);

/**
 * a customizer that unions arrays when the key starts with `+`,
 * and otherwise replaces them
 */
export const unionArray = (a: any, b: any, k?: string) => {
  if (Array.isArray(b)) {
    if (k && typeof k === "string" && k.startsWith("+") && Array.isArray(a)) {
      return Array.from(new Set([...a, ...b]));
    }
    return b;
  }
  return undefined;
};

function internalMerge(
  customizer: (a: any, b: any, k: string) => any,
  target: any,
  ...sources: any[]
): any {
  if (target === null || typeof target !== "object") {
    return target;
  }

  for (const source of sources) {
    if (source === null || typeof source !== "object") {
      continue;
    }

    for (const k of Object.keys(source)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        continue;
      }

      const sourceVal = source[k];
      const targetVal = target[k];

      const custom = customizer(targetVal, sourceVal, k);
      if (custom !== undefined) {
        target[k] = custom;
        continue;
      }

      if (sourceVal === undefined && k in target) {
        continue;
      }

      if (isPlainObject(sourceVal)) {
        if (!isPlainObject(targetVal)) {
          target[k] = {};
        }
        internalMerge(customizer, target[k], sourceVal);
      } else {
        target[k] = sourceVal;
      }
    }
  }

  return target;
}

/**
 * Merge sources into an object, with arrays replaced rather than merged by index.
 *
 * Arrays replace rather than blend into `[9, 2, 3]`, which is never what a config override means.
 */
export const merge = (target: any, ...sources: any[]) => internalMerge(replaceArray, target, ...sources);

/**
 * Merge sources into an object, unioning arrays under keys that start with `+`.
 *
 * This is what lets a config partial add to a list another partial started,
 * instead of replacing it.
 */
export const uMerge = (target: any, ...sources: any[]) => internalMerge(unionArray, target, ...sources);

/**
 * Deep fill missing properties into target object from sources without overriding existing values.
 */
export function defaultsDeep(target: any, ...sources: any[]): any {
  if (target === null || typeof target !== "object") {
    return target;
  }

  for (const source of sources) {
    if (source === null || typeof source !== "object") {
      continue;
    }

    for (const k of Object.keys(source)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        continue;
      }

      const targetVal = target[k];
      const sourceVal = source[k];

      if (targetVal === undefined) {
        if (isPlainObject(sourceVal)) {
          target[k] = defaultsDeep({}, sourceVal);
        } else {
          target[k] = sourceVal;
        }
      } else if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
        defaultsDeep(targetVal, sourceVal);
      }
    }
  }

  return target;
}

/**
 * Get a value at path of object.
 */
export function getPath(obj: any, path: any, defaultValue?: any): any {
  if (obj == null || path === undefined || path === null) {
    return defaultValue;
  }

  if (Array.isArray(path)) {
    if (path.length === 0) return defaultValue;
    let curr = obj;
    for (const key of path) {
      if (curr == null) return defaultValue;
      curr = curr[key];
    }
    return curr === undefined ? defaultValue : curr;
  }

  if (typeof path !== "string") {
    const val = obj[path];
    return val === undefined ? defaultValue : val;
  }

  if (path === "") {
    return defaultValue;
  }

  if (typeof obj === "object" && path in obj) {
    const val = obj[path];
    return val === undefined ? defaultValue : val;
  }

  const keys = path
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\['(.*?)'\]/g, ".$1")
    .replace(/\["(.*?)"\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  let curr = obj;
  for (const key of keys) {
    if (curr == null) return defaultValue;
    curr = curr[key];
  }

  return curr === undefined ? defaultValue : curr;
}

export const util = { replaceArray, merge, unionArray, uMerge, defaultsDeep, getPath };

export default util;

