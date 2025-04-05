"use strict";

const xaa = require("xaa");
const { promisify } = require("./promisify");
const { promisifyAll } = require("./promisify-all");
const { Disposer } = require("./disposer");
const { using } = require("./using");
const { isPromise, triggerUncaughtException } = require("./util");

/**
 * @fileoverview
 * AveAzul ("Blue Bird" in Spanish) - Extended Promise class that provides Bluebird like utility methods
 * This implementation is inspired by and provides similar APIs to the Bluebird Promise library,
 * but built on top of native Promises. The name is a Spanish play on words referencing Bluebird.
 * @extends Promise
 */
class AveAzul extends Promise {
  constructor(executor) {
    super(executor);
  }

  /**
   * Note: Per ECMAScript specification, when extending Promise, both .then() and static methods
   * (resolve, reject, all, etc) must return instances of the derived class (AveAzul), so there's
   * no need to explicitly wrap returns in new AveAzul(). This behavior is standard across all
   * spec-compliant JS engines (V8, SpiderMonkey, JavaScriptCore, etc).
   */

  /**
   * Bluebird-style tap() method that lets you perform side effects in a chain
   * Similar to Bluebird's Promise.prototype.tap()
   * @param {Function} fn - Function to execute with the resolved value
   * @returns {Promise} Promise that resolves with the original value
   */
  tap(fn) {
    return this.then(async (value) => {
      await fn(value);
      return value;
    });
  }

  /**
   * Bluebird-style filter() method for array operations
   * Similar to Bluebird's Promise.prototype.filter()
   * @param {Function} fn - Filter function to apply to each element
   * @returns {Promise} Promise that resolves with the filtered array
   */
  filter(fn) {
    return this.then((value) => xaa.filter(value, fn));
  }

  /**
   * Bluebird-style map() method for array operations
   * Similar to Bluebird's Promise.prototype.map()
   * @param {Function} fn - Map function to apply to each element
   * @returns {Promise} Promise that resolves with the mapped array
   */
  map(fn, options = { concurrency: 50 }) {
    return this.then((value) => xaa.map(value, fn, options));
  }

  /**
   * Bluebird-style mapSeries() method for array operations
   * Similar to Bluebird's Promise.prototype.mapSeries()
   * @param {Function} fn - Map function to apply to each element
   * @returns {Promise} Promise that resolves with the mapped array
   */
  mapSeries(fn) {
    return this.map(fn, { concurrency: 1 });
  }

  /**
   * Bluebird-style return() method to inject a value into the chain
   * Similar to Bluebird's Promise.prototype.return()
   * @param {*} value - Value to return
   * @returns {Promise} Promise that resolves with the new value
   */
  return(value) {
    return this.then(() => value);
  }

  /**
   * Bluebird-style each() method for array iteration
   * Similar to Bluebird's Promise.prototype.each()
   * @param {Function} fn - Function to execute for each element
   * @returns {Promise} Promise that resolves when iteration is complete
   */
  each(fn) {
    return this.then(async (value) => {
      const result = [];
      for (let i = 0; i < value.length; i++) {
        let x = value[i];
        if (isPromise(x)) {
          x = await x;
        }
        await fn(x, i, value.length);
        result.push(x);
      }
      return result;
    });
  }

  /**
   * Bluebird-style delay() method
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after the delay
   */
  delay(ms) {
    return xaa.delay(ms);
  }

  /**
   * Bluebird-style timeout() method
   * @param {number} ms - Milliseconds before timeout
   * @param {string} [message] - Optional error message
   * @returns {Promise} Promise that rejects if timeout occurs
   */
  timeout(ms, message = "operation timed out") {
    return AveAzul.resolve(xaa.timeout(ms, message).run(this));
  }

  /**
   * Bluebird-style props() for object properties
   * @param {Object} obj - Object with promise values
   * @returns {Promise} Promise that resolves with an object of resolved values
   */
  props() {
    return this.then((value) => {
      const keys = Object.keys(value);
      const values = keys.map((k) => value[k]);

      return AveAzul.all(values).then((results) => {
        const resolved = {};
        keys.forEach((k, i) => {
          resolved[k] = results[i];
        });
        return resolved;
      });
    });
  }

  /**
   * Bluebird-style tapCatch() for side effects on rejection
   * @param {Function} fn - Function to execute on rejection
   * @returns {Promise} Promise that maintains the rejection
   */
  tapCatch(fn) {
    return this.catch((err) => {
      fn(err);
      throw err;
    });
  }

  /**
   * Bluebird-style reduce() method for array reduction
   * Similar to Bluebird's Promise.prototype.reduce()
   * @param {Function} fn - Reducer function to apply to each element
   * @param {*} [initialValue] - Optional initial value
   * @returns {Promise} Promise that resolves with the final reduced value
   */
  reduce(fn, initialValue) {
    const hasInitial = arguments.length > 1;

    return this.then(async (array) => {
      const len = array.length;
      let value;
      let idx;
      if (hasInitial) {
        idx = 0;
        value = initialValue;
      } else {
        idx = 1;
        value = array[0];
      }

      value = isPromise(value) ? await value : value;

      for (; idx < len; idx++) {
        let x = array[idx];
        if (isPromise(x)) {
          x = await x;
        }
        value = await fn(value, x, idx, len);
      }

      return value;
    });
  }

  /**
   * Bluebird-style throw() that returns a rejected promise with the given reason
   * @param {*} reason - Value to reject the promise with
   * @returns {Promise} Promise that rejects with the given reason
   */
  throw(reason) {
    return AveAzul.reject(reason);
  }

  /**
   * Bluebird-style catchThrow() that catches an error and throws a new one
   * @param {*} reason - Value to reject the promise with
   * @returns {Promise} Promise that rejects with the new reason
   */
  catchThrow(reason) {
    return this.catch(() => {
      throw reason;
    });
  }

  /**
   * Bluebird-style catchReturn() that catches an error and returns a value instead
   * @param {*} value - Value to return
   * @returns {Promise} Promise that resolves with the given value
   */
  catchReturn(value) {
    return this.catch(() => value);
  }

  /**
   * Bluebird-style get() for retrieving a property value
   * @param {string|number} key - Key to retrieve
   * @returns {Promise} Promise that resolves with the property value
   */
  get(key) {
    return this.then((value) => value[key]);
  }

  /**
   * Bluebird-style disposer() for resource cleanup
   * @param {Function} fn - Cleanup function
   * @returns {Disposer} Disposer object
   */
  disposer(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("Expected a function");
    }

    return new Disposer(fn, this);
  }

  /**
   * Bluebird-style spread() method for handling array arguments
   * Similar to Bluebird's Promise.prototype.spread()
   * @param {Function} fn - Function to apply to the array arguments
   * @returns {Promise} Promise that resolves with the function's return value
   */
  spread(fn) {
    if (typeof fn !== "function") {
      return AveAzul.reject(
        new TypeError("expecting a function but got " + fn)
      );
    }

    return this.then(async (args) => {
      if (Array.isArray(args)) {
        for (let i = 0; i < args.length; i++) {
          if (isPromise(args[i])) {
            args[i] = await args[i];
          }
        }
        return fn(...args);
      } else {
        return fn(args);
      }
    });
  }

  some(count) {
    return this.then((args) => {
      if (!Array.isArray(args)) {
        // Check if args is iterable
        if (args != null && typeof args[Symbol.iterator] === "function") {
          // Convert iterable to array, must do this to get the length, in order
          // to detect if too many errors occurred and completion is impossible.
          args = Array.from(args);
        } else {
          throw new TypeError(
            "expecting an array or an iterable object but got " + args
          );
        }
      }

      return new AveAzul((resolve, reject) => {
        // If too many promises are rejected so that the promise can never become fulfilled,
        // it will be immediately rejected with an AggregateError of the rejection reasons
        // in the order they were thrown in.
        const errors = [];
        // The fulfillment value is an array with count values
        // in the order they were fulfilled.
        const results = [];
        const len = args.length;

        const addDone = (result) => {
          results.push(result);
          if (results.length >= count) {
            // Resolve with exactly count results to match Bluebird's behavior
            resolve(results.slice(0, count));
          }
        };

        const addError = (err) => {
          errors.push(err);
          if (len - errors.length < count) {
            reject(new AggregateError(errors, `aggregate error`));
          }
        };

        for (let i = 0; i < len; i++) {
          const x = args[i];
          if (isPromise(x)) {
            x.then(addDone, addError);
          } else {
            addDone(x);
          }
        }
      });
    });
  }

  /**
   * Bluebird-style all() method for array operations
   * Similar to Promise.all() but operates on the resolved value of this promise
   * @returns {Promise} Promise that resolves when all items in the array resolve
   */
  all() {
    return this.then((value) => {
      if (!Array.isArray(value)) {
        // Check if value is iterable
        if (value != null && typeof value[Symbol.iterator] === "function") {
          // Convert iterable to array
          value = Array.from(value);
        } else {
          throw new TypeError(
            "expecting an array or an iterable object but got " + value
          );
        }
      }

      return AveAzul.all(value);
    });
  }

  /**
   * Bluebird-style asCallback() method
   * Attaches a callback to the promise and returns the promise.
   * The callback is invoked when the promise is resolved or rejected.
   *
   * @param {Function} cb - Node.js-style callback function (err, value)
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.spread=false] - Pass array values as arguments to callback
   * @returns {Promise} The same promise instance
   */
  asCallback(cb, options = {}) {
    if (typeof cb !== "function") {
      return this;
    }

    const spread = options && options.spread === true;

    this.then(
      (value) => {
        try {
          if (spread && Array.isArray(value)) {
            cb(null, ...value);
          } else {
            cb(null, value);
          }
        } catch (err) {
          AveAzul.___throwUncaughtError(err);
        }
      },
      (reason) => {
        try {
          cb(reason);
        } catch (err) {
          AveAzul.___throwUncaughtError(err);
        }
      }
    );

    return this;
  }

  nodeify(cb, options) {
    return this.asCallback(cb, options);
  }
}

/**
 * Static helper methods
 */

/**
 * Bluebird-style delay() that resolves after specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @param {*} [value] - Optional value to resolve with
 * @returns {Promise} Promise that resolves after the delay
 */
AveAzul.delay = (ms, value) => {
  if (value === undefined) {
    return AveAzul.resolve(xaa.delay(ms));
  }
  return AveAzul.resolve(xaa.delay(ms, value));
};

/**
 * Bluebird-style map() for array operations
 * @param {Array} value - Array to map over
 * @param {Function} fn - Map function to apply to each element
 * @returns {Promise} Promise that resolves with the mapped array
 */
AveAzul.map = (value, fn, options = { concurrency: 50 }) =>
  AveAzul.resolve(value).map(fn, options);

/**
 * Bluebird-style mapSeries() for array operations
 * @param {Array} value - Array to map over
 * @param {Function} fn - Map function to apply to each element
 * @returns {Promise} Promise that resolves with the mapped array
 */
AveAzul.mapSeries = (value, fn) => AveAzul.map(value, fn, { concurrency: 1 });

/**
 * Bluebird-style try() for wrapping sync/async functions
 * @param {Function} fn - Function to execute
 * @returns {Promise} Promise that resolves with the function's return value
 */
AveAzul.try = (fn) => AveAzul.resolve(xaa.wrap(fn));

/**
 * Bluebird-style props() for object properties
 * @param {Object} obj - Object with promise values
 * @returns {Promise} Promise that resolves with an object of resolved values
 */
AveAzul.props = (obj) => {
  const keys = Object.keys(obj);
  const values = keys.map((k) => obj[k]);

  return AveAzul.all(values).then((results) => {
    const resolved = {};
    keys.forEach((k, i) => {
      resolved[k] = results[i];
    });
    return resolved;
  });
};

/**
 * Bluebird-style defer() for creating a deferred promise
 * @returns {Object} Deferred object with promise, resolve, and reject methods
 */
AveAzul.defer = () => {
  return xaa.makeDefer(AveAzul);
};

/**
 * Bluebird-style each() for array iteration
 * @param {Array} items - Array to iterate over
 * @param {Function} fn - Iterator function to call for each item
 * @returns {Promise} Promise that resolves when iteration is complete
 */
AveAzul.each = function (items, fn) {
  return AveAzul.resolve(items).each(fn);
};

/**
 * Bluebird-style reduce() for array reduction
 * @param {Array} array - Array to reduce
 * @param {Function} fn - Reducer function (value, item, index, length)
 * @param {*} [initialValue] - Optional initial value
 * @returns {Promise} Promise that resolves with the final reduced value
 */
AveAzul.reduce = function (array, ...args) {
  return AveAzul.resolve(array).reduce(...args);
};

/**
 * Bluebird-style promisify() for converting callback-based functions to promises
 * @param {Function} fn - Function to promisify
 * @param {Object} [options] - Options object
 * @returns {Function} Promisified function
 */
AveAzul.promisify = (fn, options) => {
  return promisify(fn, {
    ...options,
    Promise: AveAzul,
  });
};

/**
 * Bluebird-style promisifyAll() for converting callback-based functions to promises
 * @param {Object} target - Object to promisify
 * @param {Object} [options] - Options object
 * @returns {Object} Object with promisified methods
 */
AveAzul.promisifyAll = (target, options) => {
  return promisifyAll(target, { ...options, Promise: AveAzul });
};

/**
 * Bluebird-style method() for creating a method that returns a promise
 * @param {Function} fn - Function to create a method for
 * @returns {Function} Method function that returns a promise
 */
AveAzul.method = (fn) => {
  return function (...args) {
    return new AveAzul((resolve, reject) => {
      try {
        const result = fn.call(this, ...args);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  };
};

/**
 * Bluebird-style using() for resource management. There is only a static version of this method.
 * After the handler finish and returns, regardless of whether it resolves or rejects, the resources will be disposed.
 *
 * @param {Disposer|Array<Disposer>} resources - Resource disposers, either an array of disposers or a variadic argument list
 * @param {Function} handler - Handler function that will receive the resources as arguments
 * @returns {Promise} Promise that resolves with handler result
 */
AveAzul.using = (resources, ...args) => {
  if (args.length === 0) {
    throw new TypeError("resrouces and handler function required");
  }

  if (Array.isArray(resources)) {
    if (args.length > 1) {
      throw new TypeError(
        "only two arguments are allowed when passing an array of resources"
      );
    }
    return using(resources, args[0], AveAzul, true);
  }
  const handler = args.pop();
  return using([resources, ...args], handler, AveAzul, false);
};

/**
 * Bluebird-style join() for joining promises
 *
 * @param {...Promise} args - Promises to join
 * @param {Function} handler - Handler function to apply to the joined results
 * @returns {Promise} Promise that resolves with the handler's return value
 */
AveAzul.join = function (...args) {
  if (args.length > 1 && typeof args.at(-1) === "function") {
    const handler = args.pop();
    return AveAzul.all(args).then((results) => handler(...results));
  } else {
    return AveAzul.all(args);
  }
};

function fromCallback(fn, options) {
  return new AveAzul((resolve, reject) => {
    try {
      fn((err, ...args) => {
        if (err) {
          reject(err);
        } else {
          if (options && options.multiArgs) {
            resolve(args);
          } else {
            resolve(args[0]);
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

AveAzul.fromNode = fromCallback;

/**
 * Bluebird-style fromCallback() for converting callback-based functions to promises
 * @param {Function} fn - Function to convert
 * @param {Object} [options] - Options object
 * @returns {Promise} Promise that resolves with the function's return value
 */
AveAzul.fromCallback = fromCallback;

/**
 * @description
 * When fatal error and AveAzul needs to crash the process,
 * this method is used to throw the error.
 *
 * @param {Error} error - The error to throw.
 */
AveAzul.___throwUncaughtError = triggerUncaughtException;

/**
 * Bluebird-style some() for waiting for some promises to resolve
 * @param {Array|Iterable} promises - Array or iterable of promises
 * @param {number} count - Number of promises that need to resolve
 * @returns {Promise} Promise that resolves when count promises have resolved
 */
AveAzul.some = function (promises, count) {
  return AveAzul.resolve(promises).some(count);
};

// Setup the not implemented methods
const { setupNotImplemented } = require("./not-implemented");
setupNotImplemented(AveAzul);

module.exports = AveAzul;
