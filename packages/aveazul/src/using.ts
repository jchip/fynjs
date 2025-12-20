/* eslint-disable @typescript-eslint/no-explicit-any */
import { Disposer } from "./disposer.ts";
import { isPromise } from "./util.ts";
import { AggregateError } from "@jchip/error";
import type { AveAzulClass } from "./aveazul.ts";

const SYM_FN_DISPOSE = Symbol("fnDispose");

interface ProcessedResource {
  _result?: any;
  _error?: Error;
  [SYM_FN_DISPOSE]?: (resource: any) => void | Promise<void>;
  ___promise?: Promise<unknown>;
}

/**
 * The using function is a utility function that allows you to acquire resources,
 * process them, and then dispose of them in an error-safe manner.
 *
 * @param resources - An array of resources to acquire.
 * @param handler - A function that will be called with the acquired resources.
 * @param PromiseCtor - The Promise implementation to use. AveAzul or Bluebird.
 * @param asArray - Whether to return the result as an array.
 * @returns A promise that resolves to the result of the handler function.
 */
export function using<R>(
  resources: any[],
  handler: (...args: any[]) => R,
  PromiseCtor: AveAzulClass,
  asArray: boolean
): any {
  if (typeof handler !== "function") {
    throw new TypeError("handler must be a function");
  }

  // resources is guaranateed to be an array of disposer, promise like, or any value
  // first process all resources by mapping the resources array:
  // 1. if it's a disposer, get its promise and resolve its value
  // 2. if it's a promise like, get its value
  // 3. otherwise, return the value
  // Expect Promise to be AveAzul or Bluebird that has map method
  const acquisitionErrors: Error[] = [];

  // Helper function to process a disposer
  const processDisposer = async (
    resource: ProcessedResource,
    disposer: Disposer<any>
  ): Promise<ProcessedResource> => {
    try {
      const res = await disposer._promise;
      resource._result = res;
      resource[SYM_FN_DISPOSE] = disposer._data as (
        resource: any
      ) => void | Promise<void>;
    } catch (error) {
      acquisitionErrors.push(error as Error);
      resource._error = error as Error;
    }
    return resource;
  };

  // Helper to check if something is a disposer
  const isDisposer = (obj: unknown): obj is Disposer<any> =>
    obj != null &&
    (obj instanceof Disposer ||
      ((obj as Disposer<any>)._promise !== undefined &&
        typeof (obj as Disposer<any>)._data === "function"));

  const acquireResources = (): any => {
    const promiseRes = resources.map((resource) => {
      // if it's a promise-like, wait for its resolved value
      if (isPromise(resource)) {
        return { ___promise: resource } as ProcessedResource;
      }
      return resource as ProcessedResource;
    });

    return PromiseCtor.map(
      promiseRes,
      async (resource: ProcessedResource | Disposer<any>) => {
        // If it's directly a disposer
        if (isDisposer(resource)) {
          return processDisposer({} as ProcessedResource, resource);
        }

        // if it's a promise like, wait for its resolved value
        if (resource && (resource as ProcessedResource).___promise) {
          try {
            const res = await (resource as ProcessedResource).___promise;
            // Check if the resolved value is a disposer
            if (isDisposer(res)) {
              return processDisposer(
                resource as ProcessedResource,
                res
              );
            } else {
              (resource as ProcessedResource)._result = res;
            }
          } catch (error) {
            acquisitionErrors.push(error as Error);
            (resource as ProcessedResource)._error = error as Error;
          }
          return resource as ProcessedResource;
        }

        return { _result: resource } as ProcessedResource;
      }
    );
  };

  const disposeResources = (
    processedResources: ProcessedResource[]
  ): any => {
    const errors: Error[] = [];
    return (
      PromiseCtor.each(processedResources, async (resource: any) => {
        // dispose all resources that were acquired without errors
        if (resource && resource[SYM_FN_DISPOSE]) {
          try {
            await resource[SYM_FN_DISPOSE]!(resource._result);
          } catch (error) {
            errors.push(error as Error);
          }
        }
      })
    ).finally(() => {
      if (errors.length > 0) {
        PromiseCtor.___throwUncaughtError(
          new AggregateError(errors, "cleanup resources failed")
        );
      }
    });
  };

  return acquireResources().then((processedResources: ProcessedResource[]) => {
    if (acquisitionErrors.length > 0) {
      return disposeResources(processedResources).tap(() => {
        throw acquisitionErrors[0];
      });
    }

    // now collect all the results into an array
    const results: any[] = [];
    for (const resource of processedResources) {
      results.push(resource._result);
    }

    let handlerPromise: any;

    try {
      // now call the handler with the results
      handlerPromise = PromiseCtor.resolve(
        asArray ? handler(results) : handler(...results)
      );
    } catch (error) {
      // catch sync error from handler
      handlerPromise = PromiseCtor.reject(error);
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
