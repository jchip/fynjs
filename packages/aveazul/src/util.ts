/**
 * Determines if a function is a class (either ES6 class or ES5 constructor function)
 * This function performs several checks to identify different class patterns:
 * 1. ES6 classes with the 'class' keyword
 * 2. Constructor functions (ES5 classes) with prototype methods
 *
 * @param fn - The value to check
 * @returns True if the function is a class, false otherwise
 */
const thisAssignmentPattern = /this\s*\.\s*\S+\s*=/;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isClass(fn: unknown): fn is Function {
  try {
    if (typeof fn === "function") {
      const keys = Object.getOwnPropertyNames(fn.prototype);

      const hasMethods = keys.length > 1;
      const hasMethodsOtherThanConstructor =
        keys.length > 0 && !(keys.length === 1 && keys[0] === "constructor");
      const hasThisAssignmentAndStaticMethods =
        thisAssignmentPattern.test(fn + "") &&
        Object.getOwnPropertyNames(fn).length > 0;

      if (
        hasMethods ||
        hasMethodsOtherThanConstructor ||
        hasThisAssignmentAndStaticMethods
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const rident = /^[a-z$_][a-z$_0-9]*$/i;

export function isIdentifier(str: string): boolean {
  return rident.test(str);
}

/**
 * Prop filtering code copied from bluebird/js/release
 */
const noCopyProps = [
  "arity",
  "length",
  "name",
  "arguments",
  "caller",
  "callee",
  "prototype",
  "__isPromisified__",
];
const noCopyPropsPattern = new RegExp("^(?:" + noCopyProps.join("|") + ")$");

function propsFilter(key: string): boolean {
  return !noCopyPropsPattern.test(key);
}

export function copyOwnProperties(
  source: object,
  target: object,
  filter: (key: string) => boolean = propsFilter
): void {
  const names = Object.getOwnPropertyNames(source);

  for (const name of names) {
    if (filter(name)) {
      Object.defineProperty(
        target,
        name,
        Object.getOwnPropertyDescriptor(source, name)!
      );
    }
  }
}

/**
 * Copied from bluebird/js/release/util.js
 */
export function isPromisified(fn: unknown): boolean {
  try {
    return (fn as { __isPromisified__?: boolean }).__isPromisified__ === true;
  } catch {
    return false;
  }
}

/**
 * Determines if an object is a Promise instance
 * @param obj - The object to check
 * @returns True if the object is a Promise instance, false otherwise
 */
export function isPromise(obj: unknown): obj is Promise<unknown> {
  return (
    obj instanceof Promise ||
    (obj != null &&
      typeof obj === "object" &&
      typeof (obj as { then?: unknown }).then === "function" &&
      typeof (obj as { catch?: unknown }).catch === "function")
  );
}

/**
 * Gets all property keys from an object and its prototype chain, excluding standard
 * prototypes like Object.prototype, Array.prototype, and Function.prototype
 *
 * @param obj - The target object to get keys from
 * @param excludedProtos - An array of prototype objects to exclude keys from
 * @returns Array of property keys
 */
export function getObjectDataKeys(
  obj: object | null,
  excludedProtos: object[] = []
): string[] {
  const excludedPrototypes = [
    Array.prototype,
    Object.prototype,
    Function.prototype,
    ...excludedProtos,
  ];

  const isExcludedProto = function (val: object): boolean {
    for (const protoVal of excludedPrototypes) {
      if (protoVal === val) {
        return true;
      }
    }
    return false;
  };

  const ret: string[] = [];
  const visitedKeys = Object.create(null);

  /* copied from bluebird/js/release/util.js and modified */
  while (obj && !isExcludedProto(obj)) {
    let keys: string[];
    try {
      keys = Object.getOwnPropertyNames(obj);
    } catch {
      /* istanbul ignore next */
      return ret;
    }

    for (const key of keys) {
      /* istanbul ignore if */
      if (visitedKeys[key]) {
        /* istanbul ignore next */
        continue;
      }
      visitedKeys[key] = true;
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      /**
       * When desc.get && desc.set are falsy, it means the property is a data
       * property that holds an actual value, rather than being computed dynamically
       * through getter/setter functions.
       */
      /* istanbul ignore next */
      if (desc && !desc.get && !desc.set) {
        ret.push(key);
      }
    }
    obj = Object.getPrototypeOf(obj);
  }

  return ret;
}

/**
 * Triggers an uncaught exception in a safe way by scheduling it on the next event loop tick
 * This is used for fatal errors that should crash the process
 * @param error - The error to throw
 */
export function triggerUncaughtException(error: unknown): void {
  let err: Error;
  if (!(error instanceof Error)) {
    err = new Error(String(error));
  } else {
    err = error;
  }

  // Use setTimeout with 0ms delay to throw on the next event loop tick
  // This ensures the current execution context completes first
  setTimeout(() => {
    throw err;
  }, 0);
}

export function toArray<T>(args: Iterable<T> | ArrayLike<T>): T[] {
  if (!Array.isArray(args)) {
    // Check if args is iterable
    if (
      args != null &&
      typeof (args as Iterable<T>)[Symbol.iterator] === "function"
    ) {
      // Convert iterable to array, must do this to get the length, in order
      // to detect if too many errors occurred and completion is impossible.
      args = Array.from(args as Iterable<T>);
    } else {
      throw new TypeError(
        "expecting an array or an iterable object but got " + args
      );
    }
  }

  return args as T[];
}
