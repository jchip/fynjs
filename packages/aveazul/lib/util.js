"use strict";

function isClass(fn) {
  try {
    if (fn && typeof fn === "function") {
      const fnStr = fn.toString();
      return fnStr.startsWith("class ");
    }
  } catch (e) {
    // ignore
  }
  return false;
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

module.exports.copyOwnProperties = copyOwnProperties;
module.exports.isClass = isClass;
module.exports.isIdentifier = isIdentifier;
module.exports.isConstructor = isConstructor;
module.exports.isPromisified = isPromisified;
