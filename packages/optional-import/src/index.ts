/**
 * ESM counterpart to `optional-require`.
 *
 * In ESM there is no `require` call to wrap in try/catch -- a static `import` is resolved and
 * linked for the whole reachable graph before any user code evaluates. So optional loading has
 * to go through `import()`, which makes it async.
 *
 * The subtle part is telling "the optional dependency is not installed" apart from "it IS
 * installed but it is broken". `ERR_MODULE_NOT_FOUND` is raised for both, with no structured
 * field naming the specifier that failed, so catching the error from `import()` cannot tell them
 * apart -- a package whose own dependency is missing looks exactly like a package that was never
 * installed, and would silently degrade to the fallback.
 *
 * This module resolves first and imports second. `meta.resolve` only ever fails for the
 * specifier handed to it, never for something nested, which makes the distinction structural
 * instead of a guess based on error message text.
 *
 * That premise holds for *bare* specifiers only. For a path or `file:` URL, node's ESM resolver
 * does no filesystem check, so resolve always succeeds and the missing-file signal would arrive
 * from `import()` instead -- where it is indistinguishable from a broken module. Those
 * specifiers therefore get an explicit existence check after resolving, which restores the same
 * structural split: absent file is "not found", present-but-broken file still fails on import.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * function to log in case the optional module was not found
 *
 * @param message - message to log
 * @param specifier - the specifier the user tried to import
 */
export type LogFunction = (message: string, specifier: string) => void;

const consoleLog: LogFunction = (message: string) => console.log(message);

let defaultLog: LogFunction = consoleLog;

/**
 * set the log function used when the caller did not provide one
 *
 * @param log - function to log the module not found message
 */
export function setDefaultLog(log: LogFunction): void {
  defaultLog = log;
}

/**
 * The caller's `import.meta`.
 *
 * It must be the `import.meta` *object*, not `import.meta.url`: the single argument form of
 * `import.meta.resolve` has no parent parameter, so the bound `resolve` function is the only
 * carrier of the caller's module context. Resolving with our own `import.meta` instead would
 * look for the optional dependency next to *this* package rather than next to the caller.
 */
export type ImportMetaLike = {
  /** url of the calling module, used for error messages only */
  url?: string;
  /** the caller's bound resolver */
  resolve: (specifier: string) => string;
};

/**
 * How to treat `ERR_PACKAGE_PATH_NOT_EXPORTED` -- the package is installed but its `exports`
 * map does not expose the subpath being requested.
 *
 * - `notFound` (default) - the caller cannot use it either way, so treat it like not installed
 * - `fail` - treat it as a broken install and surface it through `fail` / rethrow
 */
export type NotExportedHandling = "notFound" | "fail";

/**
 * Options for calling an optional import
 */
export type OptionalImportOpts = {
  /**
   * `notFound` is a function. If the specifier could not be resolved, then:
   *
   * - call `notFound` if it's provided
   * - else return the `default` value.
   *
   * @param err - the resolve error
   */
  notFound?: (err: Error) => unknown;
  /**
   * `fail` is a function. If the module resolved but importing it threw -- for example it
   * contains a syntax error, throws at module scope, or one of *its* dependencies is missing --
   * then:
   *
   * - call `fail` if it's provided
   * - else rethrow the error
   *
   * @remarks This is a separate callback from `notFound` so a genuinely broken optional
   * dependency is never silently swallowed as if it were simply absent.
   *
   * @param err - the error from importing the module
   */
  fail?: (err: Error) => unknown;
  /**
   * The value to return if the module was not found but `notFound` is not provided.
   */
  default?: unknown;
  /**
   * Tell optional import to log a message if the module is not found.
   * - note: it doesn't log if the module was found but failed to import
   *
   * This field can have these values:
   * 1. `true` - log with default message
   * 2. string - a string to prepend to the message being logged
   */
  message?: true | string;
  /**
   * function to log the module not found message, default log function uses `console.log`
   */
  log?: LogFunction;
  /**
   * `meta` is the `import.meta` from the caller's context.
   *
   * If not provided, then use the one received when creating the optional import function.
   */
  meta?: ImportMetaLike;
  /**
   * How to treat a package that is installed but does not export the requested subpath.
   *
   * @defaultValue `"notFound"`
   */
  notExported?: NotExportedHandling;
};

/** options, or the `message` to log when the module is not found */
export type OptsOrMessage = OptionalImportOpts | string | true;

const ERR_MODULE_NOT_FOUND = "ERR_MODULE_NOT_FOUND";
const ERR_PACKAGE_PATH_NOT_EXPORTED = "ERR_PACKAGE_PATH_NOT_EXPORTED";

function normalizeOpts(optsOrMsg?: OptsOrMessage): OptionalImportOpts {
  if (optsOrMsg === undefined) {
    return {};
  }
  if (optsOrMsg === true || typeof optsOrMsg === "string") {
    return { message: optsOrMsg };
  }
  return optsOrMsg;
}

/**
 * check the caller handed us a real `import.meta` and not, say, `import.meta.url`
 */
function checkMeta(meta: ImportMetaLike | undefined): ImportMetaLike {
  if (!meta || typeof meta.resolve !== "function") {
    throw new TypeError(
      "optional-import: expecting the caller's `import.meta` object (not `import.meta.url`)," +
        " so the optional dependency resolves from the caller's location"
    );
  }
  return meta;
}

/**
 * Is this a path or `file:` URL specifier rather than a bare package specifier?
 *
 * Only these need an existence check -- for a bare specifier, resolve itself already answers
 * "is it installed?".
 */
function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("/") ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith(".\\") ||
    specifier.startsWith("..\\") ||
    specifier.startsWith("file:") ||
    /^[a-zA-Z]:[\\/]/.test(specifier)
  );
}

/**
 * Did a path specifier resolve to something that is not actually there?
 *
 * @remarks Only the literal resolved URL is checked. ESM has no directory resolution and no
 * extension probing, so `./foo` does not fall back to `./foo.js` or `./foo/index.js` the way
 * `optionalRequire` would -- node would not find those either. A path that *is* a directory
 * exists as far as this check goes and fails later on import with
 * `ERR_UNSUPPORTED_DIR_IMPORT`, which is a real error worth surfacing rather than a silent
 * fallback.
 */
function pathSpecifierMissing(specifier: string, url: string): boolean {
  if (!isPathSpecifier(specifier) || !url.startsWith("file:")) {
    return false;
  }
  try {
    return !existsSync(fileURLToPath(url));
  } catch {
    // not a usable file URL - leave the verdict to `import()`
    return false;
  }
}

/**
 * Build the error node itself would have raised, so `notFound` handlers see the same shape
 * whether the specifier was bare or a path.
 */
function makeNotFoundError(specifier: string, from?: string): Error {
  const err = new Error(
    `Cannot find module '${specifier}'${from ? ` imported from ${from}` : ""}`
  ) as NodeJS.ErrnoException;
  err.code = ERR_MODULE_NOT_FOUND;
  return err;
}

/**
 * was the resolve failure "this specifier is not installed"?
 */
function isNotFound(err: Error, opts: OptionalImportOpts): boolean {
  const { code } = err as NodeJS.ErrnoException;
  if (code === ERR_MODULE_NOT_FOUND) {
    return true;
  }
  if (code === ERR_PACKAGE_PATH_NOT_EXPORTED) {
    return (opts.notExported || "notFound") === "notFound";
  }
  return false;
}

function logNotFound(specifier: string, opts: OptionalImportOpts, log: LogFunction): void {
  const { message } = opts;
  if (!message) {
    return;
  }
  const prefix = message === true ? "" : `${message} `;
  (opts.log || log)(`${prefix}optional module not found: ${specifier}`, specifier);
}

/**
 * handle an error from `meta.resolve` -- the only errors that can mean "not installed"
 */
function handleResolveError(
  err: Error,
  specifier: string,
  opts: OptionalImportOpts,
  log: LogFunction
): unknown {
  if (isNotFound(err, opts)) {
    logNotFound(specifier, opts, log);
    return opts.notFound ? opts.notFound(err) : opts.default;
  }
  if (opts.fail) {
    return opts.fail(err);
  }
  throw err;
}

/**
 * Resolve a specifier and confirm a path specifier actually points at something.
 *
 * @returns the resolved url, or the error that makes this a "not found"
 */
function resolveExisting(
  useMeta: ImportMetaLike,
  specifier: string
): { url: string; err?: undefined } | { url?: undefined; err: Error } {
  let url: string;

  try {
    url = useMeta.resolve(specifier);
  } catch (err) {
    return { err: err as Error };
  }

  if (pathSpecifierMissing(specifier, url)) {
    return { err: makeNotFoundError(specifier, useMeta.url) };
  }

  return { url };
}

/**
 * try to resolve an optional module, with optional handling in case it's not found
 *
 * @remarks This is synchronous. Resolving does not evaluate the module, so it can answer "is
 * this dependency available?" without `await`, which is often the whole question.
 *
 * @remarks A resolved URL is not a promise that a file exists -- `meta.resolve` performs
 * resolution, not a filesystem stat. It fails when a bare package cannot be located or an
 * `exports` map refuses a subpath, which is exactly the "is the dependency installed" signal.
 *
 * @param meta - `import.meta` from the caller's context
 * @param specifier - the module specifier to resolve
 * @param optsOrMsg - options, or message to log when the module is not found
 * @returns the resolved URL, or the `default` / `notFound` result when not found
 */
export function tryResolve(
  meta: ImportMetaLike,
  specifier: string,
  optsOrMsg?: OptsOrMessage,
  log: LogFunction = defaultLog
): any {
  const opts = normalizeOpts(optsOrMsg);
  const useMeta = checkMeta(opts.meta || meta);

  const { url, err } = resolveExisting(useMeta, specifier);

  return err ? handleResolveError(err, specifier, opts, log) : url;
}

/**
 * try to import an optional module, with optional handling in case it's not found
 *
 * @remarks Resolution happens first. Once the specifier resolves, any error from importing it
 * is a real error from the module itself and is routed to `fail` (or rethrown) -- never
 * mistaken for the dependency being absent.
 *
 * @remarks The resolved module namespace is returned as-is. For a CJS optional dependency that
 * means `module.exports` is on `.default`, which differs from what `optionalRequire` returns.
 * Auto-unwrapping `.default` is deliberately not done because it would hide the named exports
 * of a real ESM package.
 *
 * @param meta - `import.meta` from the caller's context
 * @param specifier - the module specifier to import
 * @param optsOrMsg - options, or message to log when the module is not found
 * @returns the module namespace, or the `default` / `notFound` result when not found
 */
export async function tryImport(
  meta: ImportMetaLike,
  specifier: string,
  optsOrMsg?: OptsOrMessage,
  log: LogFunction = defaultLog
): Promise<any> {
  const opts = normalizeOpts(optsOrMsg);
  const useMeta = checkMeta(opts.meta || meta);

  const { url, err } = resolveExisting(useMeta, specifier);

  if (err) {
    return handleResolveError(err, specifier, opts, log);
  }

  try {
    return await import(url);
  } catch (err) {
    // the module exists -- this is a genuine failure, not a missing optional dependency
    if (opts.fail) {
      return opts.fail(err as Error);
    }
    throw err;
  }
}

/**
 * function to import a module with optional handling in case it's not found
 */
export type OptionalImportFunction<T = any> = {
  /**
   * @param specifier - the module specifier to import
   * @param optsOrMsg - options, or message to log when the module is not found
   */
  (specifier: string, optsOrMsg?: OptsOrMessage): Promise<T>;
  /**
   * synchronously resolve the module's URL, without evaluating it
   *
   * @param specifier - the module specifier to resolve
   * @param optsOrMsg - options, or message to log when the module is not found
   * @returns the resolved URL, or the `default` / `notFound` result when not found
   */
  resolve: (specifier: string, optsOrMsg?: OptsOrMessage) => any;
  /**
   * synchronously check whether the module is available, without evaluating it
   *
   * @param specifier - the module specifier to check
   * @returns `true` if the specifier resolves
   */
  has: (specifier: string) => boolean;
  /**
   * function to log message, default to use `console.log`, you can replace this with
   * another function.
   */
  log: LogFunction;
};

/**
 * Make an optional import function bound to the caller's `import.meta`.
 *
 * @example
 * ```js
 * const optionalImport = makeOptionalImport(import.meta);
 *
 * // undefined only if chalk is NOT INSTALLED -- if chalk is installed but throws or has a
 * // missing dependency of its own, that error propagates
 * const chalk = await optionalImport("chalk");
 * ```
 *
 * @param meta - `import.meta` from the caller's context
 * @param log - function to log if the module is not found
 * @returns the optional import function
 */
export function makeOptionalImport<T = any>(
  meta: ImportMetaLike,
  log: LogFunction = defaultLog
): OptionalImportFunction<T> {
  checkMeta(meta);

  const optionalImport = ((specifier: string, optsOrMsg?: OptsOrMessage) =>
    tryImport(meta, specifier, optsOrMsg, optionalImport.log)) as OptionalImportFunction<T>;

  optionalImport.log = log;

  optionalImport.resolve = (specifier: string, optsOrMsg?: OptsOrMessage) =>
    tryResolve(meta, specifier, optsOrMsg, optionalImport.log);

  optionalImport.has = (specifier: string) =>
    tryResolve(meta, specifier, { default: undefined }) !== undefined;

  return optionalImport;
}
