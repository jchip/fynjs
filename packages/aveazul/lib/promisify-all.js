"use strict";

const { promisify, isPromisified } = require("./promisify");

const defaultSuffix = "Async";

const rident = /^[a-z$_][a-z$_0-9]*$/i;
function isIdentifier(str) {
  return rident.test(str);
}

const defaultFilter = function (name) {
  return isIdentifier(name) && name.charAt(0) !== "_" && name !== "constructor";
};

const defaultPromisifier = (fn, _defaultPromisifier, options) => {
  return promisify(fn, {
    ...options,
    copyProps: false,
  });
};

const thisAssignmentPattern = /this\s*\.\s*\S+\s*=/;
function isClass(fn) {
  try {
    if (fn && typeof fn === "function") {
      const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(fn));

      let fnStr = "";

      if (
        // has methods
        keys.length > 1 ||
        // hasMethodsOtherThanConstructor
        (keys.length > 0 &&
          !(keys.length === 1 && keys[0] === "constructor")) ||
        // hasThisAssignmentAndStaticMethods
        ((fnStr = fn.toString()) &&
          thisAssignmentPattern.test(fnStr) &&
          Object.getOwnPropertyNames(fn).length > 0) ||
        // "class Blah {"
        fnStr.startsWith("class ")
      ) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

const excludedPrototypes = [
  Object.getPrototypeOf(Array),
  Object.getPrototypeOf(Object),
  Object.getPrototypeOf(Function),
];

const excludedClasses = [Array, Object, Function];

function getPromisifiedKeys(target) {
  const proto = Object.getPrototypeOf(target);
  const protoKeys = excludedPrototypes.includes(proto)
    ? []
    : Object.getOwnPropertyNames(proto);
  const keys = Object.getOwnPropertyNames(target);
  const allKeys = [...protoKeys, ...keys];

  return allKeys;
}

function isConstructor(func) {
  return (
    !!func.prototype &&
    !!func.prototype.constructor.name &&
    func.prototype.constructor.name === func.name
  );
}

function promisifyAll2(obj, options) {
  if (excludedClasses.includes(obj)) {
    return;
  }

  const allKeys = getPromisifiedKeys(obj);

  for (const key of allKeys) {
    if (key.endsWith(options.suffix)) {
      throw new TypeError(
        "Cannot promisify an API that has normal methods with '%s'-suffix\u000a\u000a    See http://goo.gl/MqrFmX\u000a".replace(
          "%s",
          options.suffix
        )
      );
    }
    const value = obj[key];
    const promisifiedKey = key + options.suffix;
    const passesDefaultFilter =
      options.filter === defaultFilter ? true : defaultFilter(key, value, obj);
    if (
      isConstructor(value) ||
      typeof value !== "function" ||
      isPromisified(value) ||
      obj[promisifiedKey] ||
      !options.filter(key, value, obj, passesDefaultFilter)
    ) {
      continue;
    }
    obj[promisifiedKey] = options.promisifier(value, defaultPromisifier, {
      context: obj,
      copyProps: false,
      multiArgs: options.multiArgs,
      Promise: options.Promise,
    });
  }
}

function promisifyAll(target, _options) {
  if (typeof target !== "function" && typeof target !== "object") {
    throw new TypeError(
      "the target of promisifyAll must be an object or a function"
    );
  }

  const options = {
    suffix: defaultSuffix,
    filter: defaultFilter,
    promisifier: defaultPromisifier,
    Promise: global.Promise,
    ..._options,
  };

  const suffix = options.suffix;

  if (!isIdentifier(suffix)) {
    throw new RangeError(
      "suffix must be a valid identifier\u000a\u000a    See http://goo.gl/MqrFmX\u000a"
    );
  }

  const allKeys = getPromisifiedKeys(target);

  for (const key of allKeys) {
    const value = target[key];
    if (
      value &&
      key !== "constructor" &&
      !key.startsWith("_") &&
      isClass(value)
    ) {
      const proto = Object.getPrototypeOf(value);
      if (!excludedPrototypes.includes(proto)) {
        promisifyAll2(proto, options);
      }

      promisifyAll2(value, options);
    }
  }

  promisifyAll2(target, options);
}

module.exports.promisifyAll = promisifyAll;
