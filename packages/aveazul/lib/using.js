"use strict";

const { Disposer } = require("./disposer");
const { isPromise } = require("./util");
const { AggregateError } = require("@jchip/error");

const SYM_FN_DISPOSE = Symbol("fnDispose");
/**
 * @description
 * The using function is a utility function that allows you to acquire resources,
 * process them, and then dispose of them in an error-safe manner.
 *
 * @param {Array} resources - An array of resources to acquire.
 * @param {Function} handler - A function that will be called with the acquired resources.
 * @param {Promise} Promise - The Promise implementation to use. AveAzul or Bluebird.
 * @param {boolean} asArray - Whether to return the result as an array.
 * @returns {Promise} A promise that resolves to the result of the handler function.
 */
function using(resources, handler, Promise, asArray) {
  if (typeof handler !== "function") {
    throw new TypeError("handler must be a function");
  }

  // resources is guaranateed to be an array of disposer, promise like, or any value
  // first process all resources by mapping the resources array:
  // 1. if it's a disposer, get its promise and resolve its value
  // 2. if it's a promise like, get its value
  // 3. otherwise, return the value
  // Expect Promise to be AveAzul or Bluebird that has map method
  const acquisitionErrors = [];

  const acquireResources = () => {
    const promiseRes = resources.map((resource) => {
      // if it's a promise-like, wait for its resolved value
      if (isPromise(resource)) {
        return { ___promise: resource };
      }
      return resource;
    });

    return Promise.map(promiseRes, async (resource) => {
      if (
        resource &&
        (resource instanceof Disposer ||
          (resource._promise && typeof resource._data === "function"))
      ) {
        try {
          const res = await resource._promise;
          resource._result = res;
          resource[SYM_FN_DISPOSE] = resource._data;
        } catch (error) {
          acquisitionErrors.push(error);
          resource._error = error;
        }
        return resource;
      }

      // if it's a promise like, wait for its resolved value
      if (resource && resource.___promise) {
        try {
          const res = await resource.___promise;
          resource._result = res;
        } catch (error) {
          acquisitionErrors.push(error);
          resource._error = error;
        }
        return resource;
      }

      return { _result: resource };
    });
  };

  const disposeResources = (processedResources) => {
    const errors = [];
    return Promise.each(processedResources, async (resource) => {
      // dispose all resources that were acquired without errors
      if (resource && resource[SYM_FN_DISPOSE]) {
        try {
          await resource[SYM_FN_DISPOSE](resource._result);
        } catch (error) {
          errors.push(error);
        }
      }
    }).finally(() => {
      if (errors.length > 0) {
        Promise.___throwUncaughtError(
          new AggregateError(errors, "cleanup resources failed", errors)
        );
      }
    });
  };

  return acquireResources().then((processedResources) => {
    if (acquisitionErrors.length > 0) {
      return disposeResources(processedResources).tap(() => {
        throw acquisitionErrors[0];
      });
    }

    // now collect all the results into an array
    const results = [];
    for (const resource of processedResources) {
      results.push(resource._result);
    }

    let handlerPromise;

    try {
      // now call the handler with the results
      handlerPromise = Promise.resolve(
        asArray ? handler(results) : handler(...results)
      );
    } catch (error) {
      // catch sync error from handler
      handlerPromise = Promise.reject(error);
    }

    return handlerPromise
      .tap(() => {
        return disposeResources(processedResources);
      })
      .tapCatch(() => {
        return disposeResources(processedResources);
      });
  });
}

module.exports.using = using;
