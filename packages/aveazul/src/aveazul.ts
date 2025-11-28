/* eslint-disable @typescript-eslint/no-explicit-any */
import * as xaa from "xaa";
import { promisify, PromisifyOptions } from "./promisify.ts";
import { promisifyAll, PromisifyAllOptions } from "./promisify-all.ts";
import { Disposer } from "./disposer.ts";
import { using } from "./using.ts";
import { isPromise, triggerUncaughtException, toArray } from "./util.ts";
import { AggregateError } from "@jchip/error";
import { OperationalError, isOperationalError, isProgrammerError } from "./operational-error.ts";

export interface MapOptions {
  concurrency?: number;
}

export interface AsCallbackOptions {
  spread?: boolean;
}

export interface FromCallbackOptions {
  multiArgs?: boolean;
}

export interface Deferred<T> {
  promise: AveAzul<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

// Type for the AveAzul class itself (static side)
export interface AveAzulClass {
  new <T>(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void
    ) => void
  ): AveAzul<T>;

  resolve<T>(value: T | PromiseLike<T>): AveAzul<T>;
  resolve(): AveAzul<void>;
  reject<T = never>(reason?: unknown): AveAzul<T>;
  all<T>(values: Iterable<T | PromiseLike<T>>): AveAzul<Awaited<T>[]>;

  delay<T>(ms: number, value?: T): AveAzul<T>;
  map<T, U>(
    value: Iterable<T | PromiseLike<T>>,
    fn: (item: T, index: number, length: number) => U | PromiseLike<U>,
    options?: MapOptions
  ): AveAzul<U[]>;
  mapSeries<T, U>(
    value: Iterable<T | PromiseLike<T>>,
    fn: (item: T, index: number, length: number) => U | PromiseLike<U>
  ): AveAzul<U[]>;
  try<T>(fn: () => T | PromiseLike<T>): AveAzul<T>;
  props<T extends object>(obj: T): AveAzul<{ [K in keyof T]: Awaited<T[K]> }>;
  defer<T>(): Deferred<T>;
  each<T>(
    items: Iterable<T | PromiseLike<T>>,
    fn: (item: T, index: number, length: number) => unknown
  ): AveAzul<T[]>;
  reduce<T, U>(
    array: Iterable<T | PromiseLike<T>>,
    fn: (value: U, item: T, index: number, length: number) => U | PromiseLike<U>,
    initialValue?: U
  ): AveAzul<U>;
  promisify<T = unknown>(
    fn: (...args: any[]) => void,
    options?: PromisifyOptions
  ): (...args: any[]) => AveAzul<T>;
  promisifyAll<T extends object>(target: T, options?: PromisifyAllOptions): T;
  method<T, Args extends any[]>(
    fn: (...args: Args) => T | PromiseLike<T>
  ): (...args: Args) => AveAzul<T>;
  using<R>(...args: any[]): AveAzul<R>;
  join(...args: any[]): AveAzul<any>;
  fromCallback<T>(
    fn: (callback: (err: Error | null, result?: T) => void) => void,
    options?: FromCallbackOptions
  ): AveAzul<T>;
  fromNode<T>(
    fn: (callback: (err: Error | null, result?: T) => void) => void,
    options?: FromCallbackOptions
  ): AveAzul<T>;
  some<T>(
    promises: Iterable<T | PromiseLike<T>>,
    count: number
  ): AveAzul<T[]>;
  any<T>(args: Iterable<T | PromiseLike<T>>): AveAzul<T>;

  ___throwUncaughtError(error: unknown): void;
  OperationalError: typeof OperationalError;
  __notImplementedInstance?: string[];
  __notImplementedStatic?: string[];
}

// Type for AveAzul instances
export type AveAzulInstance<T> = AveAzul<T>;

/**
 * @fileoverview
 * AveAzul ("Blue Bird" in Spanish) - Extended Promise class that provides Bluebird like utility methods
 * This implementation is inspired by and provides similar APIs to the Bluebird Promise library,
 * but built on top of native Promises. The name is a Spanish play on words referencing Bluebird.
 * @extends Promise
 */
class AveAzul<T> extends Promise<T> {
  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void
    ) => void
  ) {
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
   * @param fn - Function to execute with the resolved value
   * @returns Promise that resolves with the original value
   */
  tap(fn: (value: T) => unknown): AveAzul<T> {
    return this.then(async (value) => {
      await fn(value);
      return value;
    }) as AveAzul<T>;
  }

  /**
   * Bluebird-style filter() method for array operations
   * Similar to Bluebird's Promise.prototype.filter()
   * @param fn - Filter function to apply to each element
   * @returns Promise that resolves with the filtered array
   */
  filter(fn: (item: any, index: number, length: number) => any): AveAzul<any[]> {
    return this.then((value) =>
      (xaa as any).filter(value, fn)
    ) as AveAzul<any[]>;
  }

  /**
   * Bluebird-style map() method for array operations
   * Similar to Bluebird's Promise.prototype.map()
   * @param fn - Map function to apply to each element
   * @returns Promise that resolves with the mapped array
   */
  map<U>(fn: (item: any, index: number, length: number) => U | PromiseLike<U>, options: MapOptions = { concurrency: 50 }): AveAzul<U[]> {
    return this.then((value) =>
      (xaa as any).map(value, fn, options)
    ) as AveAzul<U[]>;
  }

  /**
   * Bluebird-style mapSeries() method for array operations
   * Similar to Bluebird's Promise.prototype.mapSeries()
   * @param fn - Map function to apply to each element
   * @returns Promise that resolves with the mapped array
   */
  mapSeries<U>(fn: (item: any, index: number, length: number) => U | PromiseLike<U>): AveAzul<U[]> {
    return this.map(fn, { concurrency: 1 });
  }

  /**
   * Bluebird-style return() method to inject a value into the chain
   * Similar to Bluebird's Promise.prototype.return()
   * @param value - Value to return
   * @returns Promise that resolves with the new value
   */
  return<U>(value: U): AveAzul<U> {
    return this.then(() => value) as AveAzul<U>;
  }

  /**
   * Bluebird-style any() method for waiting for any promises to resolve
   * @returns Promise that resolves with the first resolved promise
   */
  any(): AveAzul<any> {
    return this.then((args) => {
      return AveAzul.any(toArray(args as Iterable<unknown>));
    }) as AveAzul<any>;
  }

  /**
   * Bluebird-style each() method for array iteration
   * Similar to Bluebird's Promise.prototype.each()
   * @param fn - Function to execute for each element
   * @returns Promise that resolves when iteration is complete
   */
  each(fn: (item: any, index: number, length: number) => unknown): AveAzul<any[]> {
    return this.then(async (value) => {
      const arr = value as any[];
      const result: any[] = [];
      for (let i = 0; i < arr.length; i++) {
        let x = arr[i];
        if (isPromise(x)) {
          x = await x;
        }
        await fn(x, i, arr.length);
        result.push(x);
      }
      return result;
    }) as AveAzul<any[]>;
  }

  /**
   * Bluebird-style delay() method
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  delay(ms: number): AveAzul<void> {
    return xaa.delay(ms) as unknown as AveAzul<void>;
  }

  /**
   * Bluebird-style timeout() method
   * @param ms - Milliseconds before timeout
   * @param message - Optional error message
   * @returns Promise that rejects if timeout occurs
   */
  timeout(ms: number, message = "operation timed out"): AveAzul<T> {
    return xaa
      .timeout(ms, message, {
        Promise: AveAzul as unknown as PromiseConstructor,
        TimeoutError: OperationalError,
      })
      .run(this) as AveAzul<T>;
  }

  /**
   * Bluebird-style props() for object properties
   * @returns Promise that resolves with an object of resolved values
   */
  props(): AveAzul<any> {
    return this.then((value) => {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      const values = keys.map((k) => obj[k]);

      return AveAzul.all(values).then((results) => {
        const resolved: Record<string, unknown> = {};
        keys.forEach((k, i) => {
          resolved[k] = results[i];
        });
        return resolved;
      });
    }) as AveAzul<any>;
  }

  /**
   * Bluebird-style tapCatch() for side effects on rejection
   * @param fn - Function to execute on rejection
   * @returns Promise that maintains the rejection
   */
  tapCatch(fn: (err: Error) => unknown): AveAzul<T> {
    return this.catch((err: Error) => {
      fn(err);
      throw err;
    }) as AveAzul<T>;
  }

  /**
   * Bluebird-style reduce() method for array reduction
   * Similar to Bluebird's Promise.prototype.reduce()
   * @param fn - Reducer function to apply to each element
   * @param initialValue - Optional initial value
   * @returns Promise that resolves with the final reduced value
   */
  reduce<U>(fn: (value: U, item: any, index: number, length: number) => U | PromiseLike<U>, initialValue?: U): AveAzul<U> {
    const hasInitial = arguments.length > 1;

    return this.then(async (array) => {
      const arr = array as any[];
      const len = arr.length;
      let value: U;
      let idx: number;
      if (hasInitial) {
        idx = 0;
        value = initialValue as U;
      } else {
        idx = 1;
        value = arr[0] as U;
      }

      value = isPromise(value) ? await value : value;

      for (; idx < len; idx++) {
        let x = arr[idx];
        if (isPromise(x)) {
          x = await x;
        }
        value = await fn(value, x, idx, len);
      }

      return value;
    }) as AveAzul<U>;
  }

  /**
   * Bluebird-style throw() that returns a rejected promise with the given reason
   * @param reason - Value to reject the promise with
   * @returns Promise that rejects with the given reason
   */
  throw(reason: unknown): AveAzul<never> {
    return AveAzul.reject(reason) as AveAzul<never>;
  }

  /**
   * Bluebird-style catchThrow() that catches an error and throws a new one
   * @param reason - Value to reject the promise with
   * @returns Promise that rejects with the new reason
   */
  catchThrow(reason: unknown): AveAzul<T> {
    return this.catch(() => {
      throw reason;
    }) as AveAzul<T>;
  }

  /**
   * Bluebird-style catchReturn() that catches an error and returns a value instead
   * @param value - Value to return
   * @returns Promise that resolves with the given value
   */
  catchReturn<U>(value: U): AveAzul<T | U> {
    return this.catch(() => value) as AveAzul<T | U>;
  }

  /**
   * Bluebird-style get() for retrieving a property value
   * @param key - Key to retrieve
   * @returns Promise that resolves with the property value
   */
  get<K extends keyof T>(key: K): AveAzul<T[K]> {
    return this.then((value) => value[key]) as AveAzul<T[K]>;
  }

  /**
   * Bluebird-style disposer() for resource cleanup
   * @param fn - Cleanup function
   * @returns Disposer object
   */
  disposer(fn: (resource: T) => void | Promise<void>): Disposer<T> {
    if (typeof fn !== "function") {
      throw new TypeError("Expected a function");
    }

    return new Disposer(fn, this);
  }

  /**
   * Bluebird-style spread() method for handling array arguments
   * Similar to Bluebird's Promise.prototype.spread()
   * @param fn - Function to apply to the array arguments
   * @returns Promise that resolves with the function's return value
   */
  spread<U>(fn: (...args: any[]) => U | PromiseLike<U>): AveAzul<U> {
    if (typeof fn !== "function") {
      return AveAzul.reject(
        new TypeError("expecting a function but got " + fn)
      ) as AveAzul<U>;
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
    }) as AveAzul<U>;
  }

  some(count: number): AveAzul<any[]> {
    return this.then((args) => {
      const arr = toArray(args as Iterable<unknown>);

      return new AveAzul<any[]>((resolve, reject) => {
        // If too many promises are rejected so that the promise can never become fulfilled,
        // it will be immediately rejected with an AggregateError of the rejection reasons
        // in the order they were thrown in.
        const errors: Error[] = [];
        // The fulfillment value is an array with count values
        // in the order they were fulfilled.
        const results: any[] = [];
        const len = arr.length;

        let settled = false;

        const addDone = (result: any): void => {
          if (settled) return;
          results.push(result);
          if (results.length >= count) {
            settled = true;
            // Resolve with exactly count results to match Bluebird's behavior
            resolve(results.slice(0, count));
          }
        };

        const addError = (err: Error): void => {
          if (settled) return;
          errors.push(err);
          if (len - errors.length < count) {
            settled = true;
            reject(new AggregateError(errors, `aggregate error`));
          }
        };

        for (let i = 0; i < len; i++) {
          const x = arr[i];
          if (isPromise(x)) {
            (x as Promise<unknown>).then(addDone, addError);
          } else {
            addDone(x);
          }
        }
      });
    }) as AveAzul<any[]>;
  }

  /**
   * Bluebird-style all() method for array operations
   * Similar to Promise.all() but operates on the resolved value of this promise
   * @returns Promise that resolves when all items in the array resolve
   */
  all(): AveAzul<any[]> {
    return this.then((value) => {
      return AveAzul.all(toArray(value as Iterable<unknown>));
    }) as AveAzul<any[]>;
  }

  /**
   * Bluebird-style asCallback() method
   * Attaches a callback to the promise and returns the promise.
   * The callback is invoked when the promise is resolved or rejected.
   *
   * @param cb - Node.js-style callback function (err, value)
   * @param options - Additional options
   * @returns The same promise instance
   */
  asCallback(cb: ((err: Error | null, value?: T) => void) | undefined | null, options: AsCallbackOptions = {}): AveAzul<T> {
    if (typeof cb !== "function") {
      return this;
    }

    const spread = options && options.spread === true;

    this.then(
      (value) => {
        try {
          if (spread && Array.isArray(value)) {
            (cb as any)(null, ...(value as unknown[]));
          } else {
            cb(null, value);
          }
        } catch (err) {
          AveAzul.___throwUncaughtError(err);
        }
      },
      (reason: Error) => {
        try {
          cb(reason);
        } catch (err) {
          AveAzul.___throwUncaughtError(err);
        }
      }
    );

    return this;
  }

  nodeify(cb: ((err: Error | null, value?: T) => void) | undefined | null, options?: AsCallbackOptions): AveAzul<T> {
    return this.asCallback(cb, options);
  }

  /**
   * Bluebird-style call() method for calling a method on the resolved value
   * @param methodName - Name of the method to call
   * @param args - Arguments to pass to the method
   * @returns Promise that resolves with the method's return value
   */
  call(methodName: string, ...args: any[]): AveAzul<any> {
    return this.then(function (obj: any) {
      const method = obj[methodName];
      if (typeof method === "function") {
        return method.call(obj, ...args);
      }
      throw new TypeError(`${String(methodName)} is not a function`);
    }) as AveAzul<any>;
  }

  /**
   * Catches only operational errors and passes them to the handler.
   * Programmer errors (non-operational) are rethrown.
   * @param handler - Function to handle operational errors
   * @returns Promise with the error handled or rethrown
   */
  error(handler: (err: Error) => unknown): AveAzul<T> {
    return this.catch((err: Error) => {
      if (isOperationalError(err)) {
        return handler(err);
      }
      throw err;
    }) as AveAzul<T>;
  }

  /**
   * Static helper methods
   */

  /**
   * Bluebird-style delay() that resolves after specified milliseconds
   * @param ms - Milliseconds to delay
   * @param value - Optional value to resolve with
   * @returns Promise that resolves after the delay
   */
  static delay<U>(ms: number, value?: U): AveAzul<U> {
    if (value === undefined) {
      return AveAzul.resolve(xaa.delay(ms)) as unknown as AveAzul<U>;
    }
    return AveAzul.resolve(xaa.delay(ms, value)) as unknown as AveAzul<U>;
  }

  /**
   * Bluebird-style map() for array operations
   * @param value - Array to map over
   * @param fn - Map function to apply to each element
   * @returns Promise that resolves with the mapped array
   */
  static map<T, U>(value: Iterable<T | PromiseLike<T>>, fn: (item: T, index: number, length: number) => U | PromiseLike<U>, options: MapOptions = { concurrency: 50 }): AveAzul<U[]> {
    return (AveAzul.resolve(value) as AveAzul<any>).map(fn as any, options);
  }

  /**
   * Bluebird-style mapSeries() for array operations
   * @param value - Array to map over
   * @param fn - Map function to apply to each element
   * @returns Promise that resolves with the mapped array
   */
  static mapSeries<T, U>(value: Iterable<T | PromiseLike<T>>, fn: (item: T, index: number, length: number) => U | PromiseLike<U>): AveAzul<U[]> {
    return AveAzul.map(value, fn, { concurrency: 1 });
  }

  /**
   * Bluebird-style try() for wrapping sync/async functions
   * @param fn - Function to execute
   * @returns Promise that resolves with the function's return value
   */
  static try<T>(fn: () => T | PromiseLike<T>): AveAzul<T> {
    return AveAzul.resolve(xaa.wrap(fn)) as AveAzul<T>;
  }

  /**
   * Bluebird-style props() for object properties
   * @param obj - Object with promise values
   * @returns Promise that resolves with an object of resolved values
   */
  static props<T extends object>(obj: T): AveAzul<{ [K in keyof T]: Awaited<T[K]> }> {
    const keys = Object.keys(obj) as (keyof T)[];
    const values = keys.map((k) => obj[k]);

    return AveAzul.all(values as any[]).then((results) => {
      const resolved = {} as { [K in keyof T]: Awaited<T[K]> };
      keys.forEach((k, i) => {
        resolved[k] = results[i] as any;
      });
      return resolved;
    }) as AveAzul<{ [K in keyof T]: Awaited<T[K]> }>;
  }

  /**
   * Bluebird-style defer() for creating a deferred promise
   * @returns Deferred object with promise, resolve, and reject methods
   */
  static defer<T>(): Deferred<T> {
    return xaa.makeDefer(AveAzul as unknown as PromiseConstructor) as unknown as Deferred<T>;
  }

  /**
   * Bluebird-style each() for array iteration
   * @param items - Array to iterate over
   * @param fn - Iterator function to call for each item
   * @returns Promise that resolves when iteration is complete
   */
  static each<T>(items: Iterable<T | PromiseLike<T>>, fn: (item: T, index: number, length: number) => unknown): AveAzul<T[]> {
    return (AveAzul.resolve(items) as AveAzul<any>).each(fn as any) as AveAzul<T[]>;
  }

  /**
   * Bluebird-style reduce() for array reduction
   * @param array - Array to reduce
   * @param fn - Reducer function (value, item, index, length)
   * @param initialValue - Optional initial value
   * @returns Promise that resolves with the final reduced value
   */
  static reduce<T, U>(array: Iterable<T | PromiseLike<T>>, fn: (value: U, item: T, index: number, length: number) => U | PromiseLike<U>, initialValue?: U): AveAzul<U> {
    if (arguments.length > 2) {
      return (AveAzul.resolve(array) as AveAzul<any>).reduce(fn as any, initialValue);
    }
    return (AveAzul.resolve(array) as AveAzul<any>).reduce(fn as any);
  }

  /**
   * Bluebird-style promisify() for converting callback-based functions to promises
   * @param fn - Function to promisify
   * @param options - Options object
   * @returns Promisified function
   */
  static promisify<T = unknown>(fn: (...args: any[]) => void, options?: PromisifyOptions): (...args: any[]) => AveAzul<T> {
    return promisify<T>(fn, {
      ...options,
      Promise: AveAzul as unknown as PromiseConstructor,
    }) as (...args: any[]) => AveAzul<T>;
  }

  /**
   * Bluebird-style promisifyAll() for converting callback-based functions to promises
   * @param target - Object to promisify
   * @param options - Options object
   * @returns Object with promisified methods
   */
  static promisifyAll<T extends object>(target: T, options?: PromisifyAllOptions): T {
    return promisifyAll(target, {
      ...options,
      Promise: AveAzul as unknown as PromiseConstructor,
    });
  }

  /**
   * Bluebird-style method() for creating a method that returns a promise
   * @param fn - Function to create a method for
   * @returns Method function that returns a promise
   */
  static method<T, Args extends any[]>(fn: (...args: Args) => T | PromiseLike<T>): (...args: Args) => AveAzul<T> {
    return function (this: unknown, ...args: Args): AveAzul<T> {
      return new AveAzul<T>((resolve, reject) => {
        try {
          const result = fn.call(this, ...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    };
  }

  /**
   * Bluebird-style using() for resource management. There is only a static version of this method.
   * After the handler finish and returns, regardless of whether it resolves or rejects, the resources will be disposed.
   *
   * @param resources - Resource disposers, either an array of disposers or a variadic argument list
   * @param args - Handler function that will receive the resources as arguments
   * @returns Promise that resolves with handler result
   */
  static using<R>(resources: any, ...args: any[]): AveAzul<R> {
    if (args.length === 0) {
      throw new TypeError("resrouces and handler function required");
    }

    if (Array.isArray(resources)) {
      if (args.length > 1) {
        throw new TypeError(
          "only two arguments are allowed when passing an array of resources"
        );
      }
      return using(
        resources,
        args[0] as any,
        AveAzul as unknown as AveAzulClass,
        true
      ) as AveAzul<R>;
    }
    const handler = args.pop() as any;
    return using(
      [resources, ...args] as any[],
      handler,
      AveAzul as unknown as AveAzulClass,
      false
    ) as AveAzul<R>;
  }

  /**
   * Bluebird-style join() for joining promises
   *
   * @param args - Promises to join
   * @returns Promise that resolves with the handler's return value
   */
  static join(...args: any[]): AveAzul<any> {
    if (args.length > 1 && typeof args[args.length - 1] === "function") {
      const handler = args.pop() as (...values: any[]) => any;
      return AveAzul.all(args).then((results) =>
        handler(...results)
      ) as AveAzul<any>;
    } else {
      return AveAzul.all(args) as AveAzul<any>;
    }
  }

  /**
   * Bluebird-style fromCallback() for converting callback-based functions to promises
   * @param fn - Function to convert
   * @param options - Options object
   * @returns Promise that resolves with the function's return value
   */
  static fromCallback<T>(fn: (callback: (err: Error | null, ...args: T[]) => void) => void, options?: FromCallbackOptions): AveAzul<T> {
    return new AveAzul<T>((resolve, reject) => {
      try {
        fn((err: Error | null, ...args: T[]) => {
          if (err) {
            reject(err);
          } else {
            if (options && options.multiArgs) {
              resolve(args as unknown as T);
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

  static fromNode = AveAzul.fromCallback;

  /**
   * When fatal error and AveAzul needs to crash the process,
   * this method is used to throw the error.
   *
   * @param error - The error to throw.
   */
  static ___throwUncaughtError = triggerUncaughtException;

  /**
   * Bluebird-style some() for waiting for some promises to resolve
   * @param promises - Array or iterable of promises
   * @param count - Number of promises that need to resolve
   * @returns Promise that resolves when count promises have resolved
   */
  static some<T>(promises: Iterable<T | PromiseLike<T>>, count: number): AveAzul<T[]> {
    return (AveAzul.resolve(promises) as AveAzul<any>).some(count) as AveAzul<T[]>;
  }

  /**
   * Bluebird-style any() for waiting for any promise to resolve
   * @param args - Array or iterable of promises
   * @returns Promise that resolves with the first resolved value
   */
  /* v8 ignore next 4 */
  static any<T>(args: Iterable<T | PromiseLike<T>>): AveAzul<T> {
    // Will be overwritten by addStaticAny
    throw new Error("any not initialized");
  }

  static OperationalError = OperationalError;
  static isOperationalError = isOperationalError;
  static isProgrammerError = isProgrammerError;
  static Disposer = Disposer;
  static __notImplementedInstance?: string[];
  static __notImplementedStatic?: string[];
}

// Setup the any method
import { addStaticAny } from "./any.ts";
addStaticAny(AveAzul as unknown as AveAzulClass);

// Setup the not implemented methods
import { setupNotImplemented } from "./not-implemented.ts";
setupNotImplemented(AveAzul as unknown as AveAzulClass);

export { AveAzul };
export default AveAzul;
