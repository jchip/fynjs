"use strict";

const { Disposer } = require("./disposer");
const { isPromise } = require("./util");

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
      if (resource instanceof Disposer) {
        try {
          const res = await resource._promise;
          resource._result = res;
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
      if (!resource._error && resource.hasOwnProperty("_result")) {
        if (resource instanceof Disposer) {
          try {
            await resource._data(resource._result);
          } catch (error) {
            errors.push(error);
          }
        }
      }
    }).finally(() => {
      if (errors.length > 0) {
        Promise.___throwUncaughtError(new Error("cleanup resources failed"));
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

    let handlerResult;
    let handlerSyncError;
    try {
      // now call the handler with the results
      if (asArray) {
        handlerResult = handler(results);
      } else {
        handlerResult = handler(...results);
      }
    } catch (error) {
      // catch sync error from handler
      handlerSyncError = error;
    }

    return disposeResources(processedResources).then(() => {
      if (handlerSyncError) {
        throw handlerSyncError;
      }
      return handlerResult;
    });
  });
}

module.exports.using = using;
