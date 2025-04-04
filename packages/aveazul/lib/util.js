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

      const fnStr = fn.toString();
      const es6Class = fnStr.startsWith("class ") || /^class\s+/.test(fnStr);
      const hasMethods = keys.length > 1;
      const hasMethodsOtherThanConstructor =
        keys.length > 0 && !(keys.length === 1 && keys[0] === "constructor");
      const hasThisAssignmentAndStaticMethods =
        thisAssignmentPattern.test(fnStr) &&
        Object.getOwnPropertyNames(fn).length > 0;

      if (
        es6Class ||
        hasMethods ||
        hasMethodsOtherThanConstructor ||
        hasThisAssignmentAndStaticMethods
      ) {
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

function isConstructor(func) {
  if (!func) {
    return false;
  }
  const proto = func.prototype;
  return (
    !!proto &&
    !!proto.constructor &&
    !!proto.constructor.name &&
    proto.constructor.name === func.name
  );
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
      Object.defineProperty(
        target,
        name,
        Object.getOwnPropertyDescriptor(source, name)
      );
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
 * @param {Object} target - The target object to get keys from
 * @param {Array} [excludedPrototypes=[]] - An array of prototype objects to exclude keys from
 * @returns {Array<string>} - Array of property keys
 */
function getObjectKeys(target, excludedPrototypes = []) {
  const excluded =
    excludedPrototypes.length > 0 ? excludedPrototypes : defaultExcluded;

  // Get own properties
  const ownKeys = Object.getOwnPropertyNames(target);

  // Get prototype properties, excluding those from excluded prototypes
  let protoKeys = [];
  let currentProto = Object.getPrototypeOf(target);

  // Walk up the prototype chain until we hit null or an excluded prototype
  while (currentProto && !excluded.includes(currentProto)) {
    protoKeys = [...protoKeys, ...Object.getOwnPropertyNames(currentProto)];
    currentProto = Object.getPrototypeOf(currentProto);
  }

  // Combine own properties and prototype properties
  return [...protoKeys, ...ownKeys];
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

module.exports.copyOwnProperties = copyOwnProperties;
module.exports.isClass = isClass;
module.exports.isIdentifier = isIdentifier;
module.exports.isConstructor = isConstructor;
module.exports.isPromisified = isPromisified;
module.exports.isPromise = isPromise;
module.exports.triggerUncaughtException = triggerUncaughtException;
module.exports.getObjectKeys = getObjectKeys;
module.exports.isExcludedPrototype = isExcludedPrototype;
