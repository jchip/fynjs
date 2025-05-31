"use strict";

const { promisify } = require("./promisify");
const {
  isIdentifier,
  isClass,
  isConstructor,
  isPromisified,
  getObjectDataKeys,
  isExcludedPrototype,
} = require("./util");

const defaultSuffix = "Async";

const defaultFilter = function (name) {
  return isIdentifier(name) && name.charAt(0) !== "_" && name !== "constructor";
};

const defaultPromisifier = (fn, _defaultPromisifier, options) => {
  return promisify(fn, {
    ...options,
    copyProps: false,
  });
};

const excludedClasses = [Array, Object, Function];

// Helper function to determine if a class extends from any excluded class
function isExcludedClass(obj) {
  if (excludedClasses.includes(obj)) {
    return true;
  }

  // Check if obj extends from any excluded class using instanceof
  if (typeof obj === "function" && obj.prototype) {
    // Check if prototype is instance of any excluded class
    for (const excludedClass of excludedClasses) {
      if (obj.prototype instanceof excludedClass) {
        return true;
      }
    }
  }

  return false;
}

function promisifyAll2(obj, options) {
  if (isExcludedClass(obj)) {
    return;
  }

  const allKeys = getObjectDataKeys(obj);

  for (const key of allKeys) {
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

    if (key.endsWith(options.suffix)) {
      throw new TypeError(
        "Cannot promisify an API that has normal methods with '%s'-suffix\u000a\u000a    See http://goo.gl/MqrFmX\u000a".replace(
          "%s",
          options.suffix
        )
      );
    }

    obj[promisifiedKey] = options.promisifier(value, defaultPromisifier, {
      // context: obj, // promisified function should get the binded object using this
      copyProps: false,
      multiArgs: options.multiArgs,
      Promise: options.Promise,
    });
  }
}

function promisifyAll(target, _options) {
  if (typeof target !== "function" && typeof target !== "object") {
    throw new TypeError("the target of promisifyAll must be an object or a function");
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

  const allKeys = getObjectDataKeys(target);

  for (const key of allKeys) {
    const value = target[key];
    if (value && key !== "constructor" && !key.startsWith("_") && isClass(value)) {
      const proto = Object.getPrototypeOf(value);
      if (!isExcludedPrototype(proto)) {
        promisifyAll2(proto, options);
      }

      promisifyAll2(value, options);
    }
  }

  promisifyAll2(target, options);
}

module.exports.promisifyAll = promisifyAll;
