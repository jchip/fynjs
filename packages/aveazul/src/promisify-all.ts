/* eslint-disable @typescript-eslint/no-explicit-any */
import { promisify, PromisifyOptions } from "./promisify.ts";
import { isIdentifier, isClass, isPromisified, getObjectDataKeys } from "./util.ts";

const defaultSuffix = "Async";

type FilterFunction = (
  name: string,
  value: unknown,
  target: object,
  passesDefaultFilter?: boolean
) => boolean;

type PromisifierFunction = (
  fn: (...args: any[]) => void,
  defaultPromisifier: (fn: (...args: any[]) => void, dp: any, options: PromisifyAllOptions) => (...args: any[]) => Promise<unknown>,
  options: PromisifyAllOptions
) => (...args: any[]) => Promise<unknown>;

export interface PromisifyAllOptions extends PromisifyOptions {
  suffix?: string;
  filter?: FilterFunction;
  promisifier?: PromisifierFunction;
}

const defaultFilter: FilterFunction = function (name: string): boolean {
  return (
    isIdentifier(name) &&
    name.charAt(0) !== "_" &&
    name !== "constructor" &&
    !name.endsWith("Sync")
  );
};

const defaultPromisifier: PromisifierFunction = (fn, _defaultPromisifier, options) => {
  return promisify(fn, {
    ...options,
    copyProps: false,
  });
};

function promisifyAll2(
  obj: Record<string, any>,
  options: Required<PromisifyAllOptions>
): void {
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

    obj[promisifiedKey] = options.promisifier(
      value as (...args: any[]) => void,
      defaultPromisifier,
      {
        // context: obj, // promisified function should get the binded object using this
        copyProps: false,
        ...options,
      }
    );
  }
}

export function promisifyAll<T extends object>(
  target: T,
  _options?: PromisifyAllOptions
): T {
  if (typeof target !== "function" && typeof target !== "object") {
    throw new TypeError(
      "the target of promisifyAll must be an object or a function"
    );
  }

  const options: Required<PromisifyAllOptions> = {
    suffix: defaultSuffix,
    filter: defaultFilter,
    promisifier: defaultPromisifier,
    Promise: globalThis.Promise,
    multiArgs: false,
    copyProps: true,
    context: undefined,
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
    const value = (target as Record<string, unknown>)[key];
    if (
      value &&
      key !== "constructor" &&
      !key.startsWith("_") &&
      isClass(value)
    ) {
      promisifyAll2(
        (value as any).prototype,
        options
      );
      promisifyAll2(value as Record<string, any>, options);
    }
  }

  promisifyAll2(target as Record<string, any>, options);

  return target;
}
