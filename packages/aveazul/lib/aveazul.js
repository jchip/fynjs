"use strict";

const xaa = require("xaa");
const { promisify } = require("./promisify");
const { promisifyAll } = require("./promisify-all");
/**
 * Disposer class for resource cleanup
 * @private
 */
class Disposer {
  constructor(data, promise) {
    this._data = data; // The cleanup function
    this._promise = promise; // The promise that resolves to the resource
  }
}

/**
 * AveAzul ("Blue Bird" in Spanish) - Extended Promise class that provides Bluebird-like utility methods
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
    return this.then((value) => {
      fn(value);
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
  map(fn) {
    return this.then((value) => xaa.map(value, fn));
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
    return this.then((value) => xaa.each(value, fn));
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
  timeout(ms, message = "Operation timed out") {
    return AveAzul.resolve(xaa.timeout(ms, message).run(this));
  }

  /**
   * Bluebird-style props() for object properties
   * @param {Object} obj - Object with promise values
   * @returns {Promise} Promise that resolves with an object of resolved values
   */
  props(obj) {
    const keys = Object.keys(obj);
    const values = keys.map((k) => obj[k]);

    return AveAzul.all(values).then((results) => {
      const resolved = {};
      keys.forEach((k, i) => {
        resolved[k] = results[i];
      });
      return resolved;
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
    return this.then((array) => AveAzul.reduce(array, fn, initialValue));
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
   * @param {string|number} propertyPath - Path to the property (can be nested using dot notation)
   * @returns {Promise} Promise that resolves with the property value
   */
  get(propertyPath) {
    return this.then((value) => {
      if (value == null) {
        throw new TypeError(
          "Cannot read property '" + propertyPath + "' of " + value
        );
      }

      let result = value;
      const props = String(propertyPath).split(".");

      for (const prop of props) {
        if (result == null) {
          throw new TypeError(
            "Cannot read property '" + prop + "' of " + result
          );
        }
        result = result[prop];
      }

      return result;
    });
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
AveAzul.map = (value, fn) => AveAzul.resolve(xaa.map(value, fn));

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
AveAzul.each = (items, fn) => AveAzul.resolve(xaa.each(items, fn));

/**
 * Bluebird-style reduce() for array reduction
 * @param {Array} array - Array to reduce
 * @param {Function} fn - Reducer function (value, item, index, length)
 * @param {*} [initialValue] - Optional initial value
 * @returns {Promise} Promise that resolves with the final reduced value
 */
AveAzul.reduce = (array, fn, initialValue) => {
  const hasInitial = arguments.length > 2;
  const len = array.length;

  return AveAzul.resolve().then(async () => {
    let value = hasInitial ? initialValue : array[0];
    const start = hasInitial ? 0 : 1;

    for (let i = start; i < len; i++) {
      value = await fn(value, array[i], i, len);
    }

    return value;
  });
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
 * Bluebird-style using() for resource management
 * @param {Disposer|Array<Disposer>} resources - Resource disposers
 * @param {Function} handler - Handler function
 * @returns {Promise} Promise that resolves with handler result
 */
AveAzul.using = (resources, handler) => {
  const isVariadic = typeof arguments[arguments.length - 1] === "function";
  const resourcesArray = isVariadic
    ? Array.prototype.slice.call(arguments, 0, -1)
    : resources;
  const handlerFn = isVariadic ? arguments[arguments.length - 1] : handler;

  return new AveAzul((resolve, reject) => {
    const values = [];
    const cleanupFns = [];

    const processResource = (resource, index) => {
      if (resource instanceof Disposer) {
        cleanupFns[index] = resource._data;
        return resource._promise;
      }
      return Promise.resolve(resource);
    };

    const cleanup = (startIndex) => {
      for (let i = startIndex; i >= 0; i--) {
        if (cleanupFns[i]) {
          try {
            cleanupFns[i](values[i], Promise.resolve(values[i]));
          } catch (error) {
            console.error(`Cleanup error for resource ${i}:`, error);
          }
        }
      }
    };

    Promise.all(resourcesArray.map(processResource))
      .then((results) => {
        values.push(...results);
        const result = isVariadic
          ? handlerFn.apply(null, values)
          : handlerFn(values);
        if (result instanceof Promise) {
          result.then(
            (value) => {
              cleanup(values.length - 1);
              resolve(value);
            },
            (error) => {
              cleanup(values.length - 1);
              reject(error);
            }
          );
        } else {
          cleanup(values.length - 1);
          resolve(result);
        }
      })
      .catch((error) => {
        cleanup(values.length - 1);
        reject(error);
      });
  });
};

// Expose Disposer class
AveAzul.Disposer = Disposer;

module.exports = AveAzul;
