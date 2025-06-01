"use strict";

/**
 * Determines if a function is a class (either ES6 class or ES5 constructor function)
 * This function performs several checks to identify different class patterns:
 * 1. ES6 classes with the 'class' keyword
 * 2. Constructor functions (ES5 classes) with prototype methods
 *
 * @param {*} fn - The value to check
 * @returns {boolean} - True if the function is a class, false otherwise
 */
const thisAssignmentPattern = /this\s*\.\s*\S+\s*=/;
function isClass(fn) {
    try {
        if (typeof fn === "function") {
            const keys = Object.getOwnPropertyNames(fn.prototype);

            const hasMethods = keys.length > 1;
            const hasMethodsOtherThanConstructor = keys.length > 0 &&
                !(keys.length === 1 && keys[0] === "constructor");
            const hasThisAssignmentAndStaticMethods =
                thisAssignmentPattern.test(fn + "") && Object.getOwnPropertyNames (fn).length > 0;

            if (hasMethods || hasMethodsOtherThanConstructor ||
                hasThisAssignmentAndStaticMethods) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

const rident = /^[a-z$_][a-z$_0-9]*$/i;
function isIdentifier(str) {
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

function propsFilter(key) {
  return !noCopyPropsPattern.test(key);
}

function copyOwnProperties(source, target, filter = propsFilter) {
  const names = Object.getOwnPropertyNames(source);

  for (const name of names) {
    if (filter(name)) {
      Object.defineProperty(target, name, Object.getOwnPropertyDescriptor(source, name));
    }
  }
}

/**
 * Copied from bluebird/js/release/util.js
 * @param {*} fn
 * @returns {boolean}
 */
function isPromisified(fn) {
  try {
    return fn.__isPromisified__ === true;
  } catch (e) {
    return false;
  }
}

/**
 * Determines if an object is a Promise instance
 * @param {*} obj - The object to check
 * @returns {boolean} - True if the object is a Promise instance, false otherwise
 */
function isPromise(obj) {
  return (
    obj instanceof Promise ||
    (obj != null &&
      typeof obj === "object" &&
      typeof obj.then === "function" &&
      typeof obj.catch === "function")
  );
}

// istanbul ignore next
const emptyFatArrow = () => {};
// istanbul ignore next
const emptyFunction = function () {};

const defaultExcluded = [
  Object.getPrototypeOf(Array), // Array.prototype
  Object.getPrototypeOf(Object), // Object.prototype
  Object.getPrototypeOf(Function), // Function.prototype
  Object.getPrototypeOf([]),
  Object.getPrototypeOf({}),
  Object.getPrototypeOf(emptyFatArrow),
  Object.getPrototypeOf(emptyFunction),
];

function isExcludedPrototype(proto) {
  return defaultExcluded.includes(proto);
}

/**
 * Gets all property keys from an object and its prototype chain, excluding standard
 * prototypes like Object.prototype, Array.prototype, and Function.prototype
 *
 * @param {Object} obj - The target object to get keys from
 * @param {Array} [excludedPrototypes=[]] - An array of prototype objects to exclude keys from
 * @returns {Array<string>} - Array of property keys
 */
function getObjectDataKeys(obj, excludedProtos = []) {
  const excludedPrototypes = [
    Array.prototype,
    Object.prototype,
    Function.prototype,
    ...excludedProtos,
  ];

  const isExcludedProto = function (val) {
    for (const protoVal of excludedPrototypes) {
      if (protoVal === val) {
        return true;
      }
    }
    return false;
  };

  const ret = [];
  const visitedKeys = Object.create(null);

  /* copied from bluebird/js/release/util.js and modified */
  while (obj && !isExcludedProto(obj)) {
    let keys;
    try {
      keys = Object.getOwnPropertyNames(obj);
    } catch (e) {
      return ret;
    }

    for (const key of keys) {
      if (visitedKeys[key]) {
        continue;
      }
      visitedKeys[key] = true;
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      /**
       * When desc.get && desc.set are falsy, it means the property is a data
       * property that holds an actual value, rather than being computed dynamically
       * through getter/setter functions.
       */
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
 * @param {Error} error - The error to throw
 */
function triggerUncaughtException(error) {
  if (!(error instanceof Error)) {
    error = new Error(String(error));
  }

  // Use setTimeout with 0ms delay to throw on the next event loop tick
  // This ensures the current execution context completes first
  setTimeout(() => {
    throw error;
  }, 0);
}

function toArray(args) {
  if (!Array.isArray(args)) {
    // Check if args is iterable
    if (args != null && typeof args[Symbol.iterator] === "function") {
      // Convert iterable to array, must do this to get the length, in order
      // to detect if too many errors occurred and completion is impossible.
      args = Array.from(args);
    } else {
      throw new TypeError("expecting an array or an iterable object but got " + args);
    }
  }

  return args;
}

module.exports.copyOwnProperties = copyOwnProperties;
module.exports.isClass = isClass;
module.exports.isIdentifier = isIdentifier;
module.exports.isPromisified = isPromisified;
module.exports.isPromise = isPromise;
module.exports.triggerUncaughtException = triggerUncaughtException;
module.exports.getObjectDataKeys = getObjectDataKeys;
module.exports.isExcludedPrototype = isExcludedPrototype;
module.exports.toArray = toArray;
