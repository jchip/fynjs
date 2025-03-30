"use strict";

const xaa = require("xaa");
const { promisify: nodePromisify } = require("node:util");

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
    return this.then(value => {
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
    return this.then(value => xaa.filter(value, fn));
  }

  /**
   * Bluebird-style map() method for array operations
   * Similar to Bluebird's Promise.prototype.map()
   * @param {Function} fn - Map function to apply to each element
   * @returns {Promise} Promise that resolves with the mapped array
   */
  map(fn) {
    return this.then(value => xaa.map(value, fn));
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
    return this.then(value => xaa.each(value, fn));
  }

  /**
   * Bluebird-style delay() method
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after the delay
   */
  delay(ms) {
    return this.then(value => xaa.delay(ms, value));
  }

  /**
   * Bluebird-style timeout() method
   * @param {number} ms - Milliseconds before timeout
   * @param {string} [message] - Optional error message
   * @returns {Promise} Promise that rejects if timeout occurs
   */
  timeout(ms, message = "Operation timed out") {
    return new AveAzul((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(message));
      }, ms);

      this.then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * Bluebird-style try() for wrapping sync/async functions
   * @param {Function} fn - Function to execute
   * @returns {Promise} Promise that resolves with the function's return value
   */
  try(fn) {
    return new AveAzul((resolve, reject) => {
      try {
        const result = fn();
        if (result && typeof result.then === "function") {
          result.then(resolve, reject);
        } else {
          resolve(result);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Bluebird-style props() for object properties
   * @param {Object} obj - Object with promise values
   * @returns {Promise} Promise that resolves with an object of resolved values
   */
  props(obj) {
    const keys = Object.keys(obj);
    const values = keys.map(k => obj[k]);

    return AveAzul.all(values).then(results => {
      const resolved = {};
      keys.forEach((k, i) => {
        resolved[k] = results[i];
      });
      return resolved;
    });
  }

  /**
   * Bluebird-style catchIf() with predicate matching
   * @param {Function|Error} predicate - Error class or predicate function
   * @param {Function} fn - Handler function
   * @returns {Promise} Promise with conditional catch handler
   */
  catchIf(predicate, fn) {
    return this.catch(err => {
      if (
        (typeof predicate === "function" && !predicate.prototype && predicate(err)) ||
        (typeof predicate === "function" && predicate.prototype && err instanceof predicate)
      ) {
        return fn(err);
      }
      throw err;
    });
  }

  /**
   * Bluebird-style tapCatch() for side effects on rejection
   * @param {Function} fn - Function to execute on rejection
   * @returns {Promise} Promise that maintains the rejection
   */
  tapCatch(fn) {
    return this.catch(err => {
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
    return this.then(array => AveAzul.reduce(array, fn, initialValue));
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
    return this.catch(() => AveAzul.throw(reason));
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
    return this.then(value => {
      if (value == null) {
        throw new TypeError("Cannot read property '" + propertyPath + "' of " + value);
      }

      let result = value;
      const props = String(propertyPath).split(".");

      for (const prop of props) {
        if (result == null) {
          throw new TypeError("Cannot read property '" + prop + "' of " + result);
        }
        result = result[prop];
      }

      return result;
    });
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
AveAzul.try = fn => AveAzul.resolve(xaa.wrap(fn));

/**
 * Bluebird-style props() for object properties
 * @param {Object} obj - Object with promise values
 * @returns {Promise} Promise that resolves with an object of resolved values
 */
AveAzul.props = obj => {
  const keys = Object.keys(obj);
  const values = keys.map(k => obj[k]);

  return AveAzul.all(values).then(results => {
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
  const deferred = xaa.makeDefer();
  deferred.promise = AveAzul.resolve(deferred.promise);
  return deferred;
};

/**
 * Bluebird-style promisify() for converting callback-style functions to promises
 * @param {Function} fn - Function to promisify
 * @param {Object} [options] - Options object
 * @param {Object} [options.context] - `this` context to bind the function to
 * @returns {Function} Promisified function that returns an AveAzul promise
 */
AveAzul.promisify = (fn, options = {}) => {
  const promisified = nodePromisify(fn);
  if (options.context) {
    return (...args) => AveAzul.resolve(promisified.apply(options.context, args));
  }
  return (...args) => AveAzul.resolve(promisified(...args));
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
 * Bluebird-style throw() that returns a rejected promise with the given reason
 * @param {*} reason - Value to reject the promise with
 * @returns {Promise} Promise that rejects with the given reason
 */
AveAzul.throw = reason => AveAzul.reject(reason);

/**
 * Bluebird-style promisifyAll() for converting all methods of an object or class to promise-based versions
 * Similar to Bluebird's Promise.promisifyAll()
 * 
 * @param {Object|Function} target - The object or class to promisify
 * @param {Object} [options] - Configuration options
 * @param {string} [options.suffix='Async'] - Suffix to append to promisified method names
 * @param {Function} [options.filter] - Filter function to determine which methods to promisify
 * @param {Function} [options.promisifier] - Custom function to handle promisification
 * @param {boolean} [options.multiArgs=false] - Whether to support multiple callback arguments
 * @param {boolean} [options.excludeMain=false] - Whether to exclude promisifying the main object/class
 * @param {Object} [options.context] - The context (this) to use when calling methods
 * @returns {Object|Function} The promisified object or class
 * @throws {TypeError} If target is null, undefined, or not an object/function
 * 
 * @example
 * // Promisify an object
 * const obj = {
 *   method(cb) { cb(null, 'result'); }
 * };
 * AveAzul.promisifyAll(obj);
 * const result = await obj.methodAsync();
 * 
 * @example
 * // Promisify a class
 * class MyClass {
 *   method(cb) { cb(null, 'result'); }
 * }
 * AveAzul.promisifyAll(MyClass);
 * const instance = new MyClass();
 * const result = await instance.methodAsync();
 * 
 * @example
 * // With custom options
 * const obj = {
 *   method(cb) { cb(null, 'result1', 'result2'); }
 * };
 * AveAzul.promisifyAll(obj, {
 *   suffix: 'Promise',
 *   multiArgs: true,
 *   filter: (name) => name === 'method'
 * });
 * const [result1, result2] = await obj.methodPromise();
 */
AveAzul.promisifyAll = (target, options = {}) => {
  const {
    suffix = 'Async',
    filter = (name, func, targetObj, passedOptions) => {
      return (
        typeof func === 'function' &&
        !func.name.startsWith('_') &&
        !func.name.startsWith('promisify') &&
        !func.name.startsWith('promisifyAll')
      );
    },
    promisifier = (fn, context, multiArgs) => {
      if (multiArgs) {
        return (...args) => {
          return new AveAzul((resolve, reject) => {
            args.push((err, ...results) => {
              if (err) reject(err);
              else resolve(results);
            });
            fn.apply(context, args);
          });
        };
      }
      return AveAzul.promisify(fn, { context });
    },
    multiArgs = false,
    excludeMain = false,
    context = target
  } = options;

  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
    throw new TypeError('target must be an object');
  }

  const targetObj = target.prototype || target;
  const keys = Object.getOwnPropertyNames(targetObj);

  for (const key of keys) {
    const func = targetObj[key];
    if (filter(key, func, targetObj, options)) {
      const promisifiedKey = key + suffix;
      targetObj[promisifiedKey] = promisifier(func, context, multiArgs);
    }
  }

  if (!excludeMain && typeof target === 'function') {
    target.promisify = AveAzul.promisify;
    target.promisifyAll = AveAzul.promisifyAll;
  }

  return target;
};

module.exports = AveAzul;
