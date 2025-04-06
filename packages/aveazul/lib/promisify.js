"use strict";

const { copyOwnProperties, isPromisified } = require("./util");

module.exports.promisify = function promisify(fn, _options) {
  if (typeof fn !== "function") {
    throw new TypeError("expecting a function but got " + {}.toString.call(fn));
  }

  if (isPromisified(fn)) {
    return fn;
  }

  const options = {
    Promise: global.Promise,
    multiArgs: false,
    copyProps: true,
    suffix: "",
    ..._options,
  };

  const Promise = options.Promise;
  const multiArgs = !!options.multiArgs;

  const promisifiedFn = function (...args) {
    return new Promise((resolve, reject) => {
      // add a callback to the end of the arguments to transfer the result to the promise
      args.push((err, ...values) => {
        if (err) {
          return reject(err);
        }
        if (multiArgs) {
          resolve(values);
        } else {
          resolve(values[0]);
        }
      });

      // call the original function with the updated args
      fn.call(options.context || this, ...args);
    });
  };

  if (options.copyProps) {
    copyOwnProperties(fn, promisifiedFn);
  }

  Object.defineProperty(promisifiedFn, "__isPromisified__", {
    value: true,
    writable: false,
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(promisifiedFn, "length", {
    value: fn.length,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  Object.defineProperty(promisifiedFn, "name", {
    value: fn.name + options.suffix,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return promisifiedFn;
};
