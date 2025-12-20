import { copyOwnProperties, isPromisified } from "./util.ts";

export interface PromisifyOptions {
  Promise?: PromiseConstructor;
  multiArgs?: boolean;
  copyProps?: boolean;
  suffix?: string;
  context?: unknown;
}

type NodeCallback<T> = (err: Error | null, ...values: T[]) => void;
type NodeStyleFunction = (...args: unknown[]) => void;
type PromisifiedFunction<T> = (...args: unknown[]) => Promise<T>;

export function promisify<T = unknown>(
  fn: NodeStyleFunction,
  _options?: PromisifyOptions
): PromisifiedFunction<T> {
  if (typeof fn !== "function") {
    throw new TypeError(
      "expecting a function but got " + {}.toString.call(fn)
    );
  }

  if (isPromisified(fn)) {
    return fn as unknown as PromisifiedFunction<T>;
  }

  const options: Required<PromisifyOptions> = {
    Promise: globalThis.Promise,
    multiArgs: false,
    copyProps: true,
    suffix: "",
    context: undefined,
    ..._options,
  };

  const PromiseCtor = options.Promise;
  const multiArgs = !!options.multiArgs;

  const promisifiedFn = function (
    this: unknown,
    ...args: unknown[]
  ): Promise<T> {
    return new PromiseCtor((resolve, reject) => {
      // add a callback to the end of the arguments to transfer the result to the promise
      args.push(((err: Error | null, ...values: unknown[]) => {
        if (err) {
          return reject(err);
        }
        if (multiArgs) {
          resolve(values as T);
        } else {
          resolve(values[0] as T);
        }
      }) as NodeCallback<unknown>);

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
    value: (fn as { name?: string }).name + options.suffix,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return promisifiedFn;
}
