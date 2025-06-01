"use strict";

const { promisify } = require("./promisify");
const {
  isIdentifier,
  isClass,
  isPromisified,
  getObjectDataKeys,
} = require("./util");

const defaultSuffix = "Async";

const defaultFilter = function (name) {
  return isIdentifier(name) && name.charAt(0) !== "_" && name !== "constructor" && !name.endsWith("Sync");
};

const defaultPromisifier = (fn, _defaultPromisifier, options) => {
  return promisify(fn, {
    ...options,
    copyProps: false,
  });
};


function promisifyAll2(obj, options) {
  const allKeys = getObjectDataKeys(obj);

  for (const key of allKeys) {
    const value = obj[key];
    const promisifiedKey = key + options.suffix;
    const passesDefaultFilter =
      options.filter === defaultFilter ? true : defaultFilter(key, value, obj);
    if (
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
      ...options
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
      promisifyAll2(value.prototype, options);
      promisifyAll2(value, options);
    }
  }

  promisifyAll2(target, options);
}

module.exports.promisifyAll = promisifyAll;
