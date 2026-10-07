import Path from "path";


const defaultPathFilter = [
  new RegExp(`/node_modules.*/(pirates/|isomorphic-loader/lib/extend-require)`),
] as (string | RegExp)[];

/** options for cleanErrorStack */
type CleanErrorStackOptions = {
  /** string to replace part of the stack trace paths */
  replacePath?: false | string;
  /** list of string or RegExp to match stack trace paths to ignore */
  ignorePathFilter?: (string | RegExp)[];
};

/**
 * Return the stack text of an error with internal modules removed
 *
 * @param error - error
 * @param options - clean error stack options
 * @returns cleaned up stack trace
 */
export function cleanErrorStack(
  error: Error,
  { replacePath = `${process.cwd()}/`, ignorePathFilter = [] }: CleanErrorStackOptions = {}
): string {
  const stack = error && (error.stack || error.message);
  if (!stack) {
    return String(stack);
  }

  const result = stack
    .split("\n")
    .map((line) => {
      // keep all non stack tracing lines
      if (!line.match(/ {4,}at/)) {
        return line;
      }
      // "    at name (location)" or "    at location", the second for anonymous functions and
      // ESM top-level code. The location runs to the last ")" so a ")" inside it does not cut it short.
      const match = line.match(/( {4,}at )(?:([^(]*\()(.+)(\).*)|(.+))/);
      const [, at, name = "", location = match?.[5], tail = ""] = match || [];
      // keep only locations that are absolute paths or "scheme://path" (ie: file://, webpack://)
      if (!location || (!location.match(/[^:]+:\/\//) && !Path.isAbsolute(location))) {
        return false;
      }
      const path = location.replace(/\\/g, "/");
      if (
        defaultPathFilter
          .concat(ignorePathFilter)
          .find((s) => s && (s instanceof RegExp ? path.match(s) : path.includes(s)))
      ) {
        return false;
      }
      let path2 = path;
      if (replacePath && replacePath.length > 1) {
        // an ESM location is a file:// URL, so drop the scheme along with replacePath
        path2 = path.startsWith(`file://${replacePath}`)
          ? path.slice(`file://${replacePath}`.length)
          : path.replace(replacePath, "");
      }
      return `${at}${name}${path2}${tail}`;
    })
    .filter((x) => x !== false)
    .join("\n");

  return result;
}

/**
 * Build stack of aggregate errors
 *
 * @param stack - top error
 * @param errors - aggregated errors
 * @returns aggregate stack
 */
export function aggregateStack(stack: string, errors: any[]): string {
  return [stack]
    .concat(
      errors &&
        errors.map &&
        errors.map((e) => {
          const s = e && (e.stack || e.message);
          return (s || String(e)).replace(/^/gm, "  ");
        })
    )
    .join("\n");
}

/**
 * build the aggregate stack of an AggregateError
 *
 * @param error aggregate error
 * @returns aggregate stack
 */
export function aggregateErrorStack(error: AggregateError): string {
  // our AggregateError's stack getter calls this, so only read stack from other errors
  const stack = error.__stack || (error instanceof AggregateError ? "" : (error as Error).stack);
  return aggregateStack(stack || error.message || String(error), error.errors);
}

/**
 * AggregateError
 * - https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-aggregate-error-objects
 */
export class AggregateError extends globalThis.AggregateError {
  /** "AggregateError" */
  readonly name: string;
  /** errors collected */
  errors: any[];
  /** aggregate stack */
  stack: string;
  /** original error stack before generating an aggregate one */
  __stack: string;
  constructor(errors?: Iterable<any>, msg?: string, options?: { cause?: unknown }) {
    if (!errors || !(errors[Symbol.iterator] instanceof Function)) {
      throw new TypeError(`input errors must be iterable but it's ${typeof errors}`);
    }
    // spread once: super() would consume a one-shot iterator such as a generator
    const list = Array.from(errors);
    super(list, msg, options);

    // Using defineProperty to replicate behavior of Object.keys(new Error()) returns []
    Object.defineProperty(this, "name", { value: "AggregateError" });

    let aggStack: string;

    Object.defineProperties(this, {
      // specify errors according to spec
      errors: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: list,
      },
      // save original stack
      __stack: {
        enumerable: false,
        value: this.stack,
      },
      // make aggregate stack
      stack: {
        get() {
          return aggStack || (aggStack = aggregateErrorStack(this));
        },
      },
    });
  }
}
