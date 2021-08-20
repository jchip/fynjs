import Path from "path";

/* eslint-disable @typescript-eslint/ban-ts-comment */

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
      const match = line.match(/( {4,}at)([^\(]+\()([^\)]+\))(.*)/);
      // skip any stack tracing line not in these formats:
      // - "    at Blah (/foo/bar:##:##)" format
      // - "scheme://path" (ie: webpack://path)
      if (!match || (!match[3].match(/[^:]+:\/\//) && !Path.isAbsolute(match[3]))) {
        return false;
      }
      const path = match[3].replace(/\\/g, "/");
      if (
        defaultPathFilter
          .concat(ignorePathFilter)
          .find((s) => s && (s instanceof RegExp ? path.match(s) : path.includes(s)))
      ) {
        return false;
      }
      const path2 = replacePath && replacePath.length > 1 ? path.replace(replacePath, "") : path;
      return `${match[1]}${match[2]}${path2}${match[4]}`;
    })
    .filter((x) => x)
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
export function aggregateErrorStack(error: AggregateError) {
  return aggregateStack(error.__stack || error.message || String(error), error.errors);
}

/**
 * AggregateError
 * - https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-aggregate-error-objects
 */
export class AggregateError extends Error {
  /** "AggregateError" */
  readonly name: string;
  /** errors collected */
  errors: any[];
  /** aggregate stack */
  stack: string;
  /** original error stack before generating an aggregate one */
  __stack: string;
  constructor(errors?: any[], msg?: string) {
    if (!errors || !(errors[Symbol.iterator] instanceof Function)) {
      throw new TypeError(`input errors must be iterable but it's ${typeof errors}`);
    }
    super(msg);

    // Using defineProperty to replicate behavior of Object.keys(new Error()) returns []
    Object.defineProperty(this, "name", { value: "AggregateError" });

    let aggStack: string;

    Object.defineProperties(this, {
      // specify errors according to spec
      errors: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: [].concat(errors),
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
