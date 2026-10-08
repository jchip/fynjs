# optional-import reference

`optional-import` loads an optional ESM dependency and tells "not installed" apart from "installed but broken". It resolves the specifier first and imports second, so only a failed resolve counts as "not installed". ESM only (`"type": "module"`), no runtime dependencies, Node `^22.22.2 || ^24.15.0 || >=26.0.0`.

## Imports

```js
import { makeOptionalImport, tryImport, tryResolve, setDefaultLog } from "optional-import";
import * as optionalImport from "optional-import";
```

```ts
import type {
  LogFunction,
  ImportMetaLike,
  NotExportedHandling,
  OptionalImportOpts,
  OptsOrMessage,
  OptionalImportFunction,
} from "optional-import";
```

Everything is a named export from the package root. There is no default export and there are no subpaths (only `optional-import/package.json`).

Runtime exports: `setDefaultLog`, `tryResolve`, `tryImport`, `makeOptionalImport`.

Type-only exports: `LogFunction`, `ImportMetaLike`, `NotExportedHandling`, `OptionalImportOpts`, `OptsOrMessage`, `OptionalImportFunction`.

Not exported: the internal helpers `normalizeOpts`, `checkMeta`, `isPathSpecifier`, `windowsPathToFileUrl`, `pathSpecifierMissing`, `makeNotFoundError`, `isNotFound`, `logNotFound`, `handleResolveError`, `resolveExisting`.

## How "not installed" is decided

Every entry point (`tryImport`, `tryResolve`, and the bound function from `makeOptionalImport`) runs the same steps.

1. `meta` is checked (see `ImportMetaLike`). A bad `meta` throws `TypeError`.
2. The specifier is resolved with `meta.resolve(specifier)`. If it matches `/^[a-zA-Z]:[\\/]/` (a Windows drive path), it is first rewritten to a `file:///` URL, on every OS.
3. If `meta.resolve` threw, that error is classified (below).
4. If it returned and the specifier is a path specifier whose resolved URL starts with `file:`, the file is checked with `existsSync(fileURLToPath(url))`. A missing file produces a synthetic "not found" error. If `fileURLToPath` throws, the specifier is treated as present.
5. Otherwise the resolved URL is used. `tryImport` then runs `import(url)`.

Classification of a resolve error `err`, by `err.code`:

| `err.code` | Result |
| --- | --- |
| `ERR_MODULE_NOT_FOUND` | not installed |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | not installed when `notExported` is `"notFound"` or unset, else a failure |
| anything else (for example `ERR_INVALID_MODULE_SPECIFIER`, `ERR_PACKAGE_IMPORT_NOT_DEFINED`, `ERR_INVALID_PACKAGE_CONFIG`, or no code) | a failure |

Only `err.code` is read. Message text is never inspected.

What happens in each case:

| Case | Behavior |
| --- | --- |
| not installed | log if `message` is truthy, then return `notFound(err)` if `notFound` is set, else `default` (`undefined` if unset). Nothing is thrown. |
| resolve failure | return `fail(err)` if `fail` is set, else rethrow `err`. No logging. |
| resolved, `import()` throws (`tryImport` only) | return `fail(err)` if `fail` is set, else rethrow. No logging. Covers syntax errors, module-scope throws, and a missing dependency of the module itself. |
| resolved, import succeeds | return the module namespace object. |

Path specifiers are those that start with `/`, `./`, `../`, `.\`, `..\`, or `file:`, or match a drive-letter path `X:\` or `X:/`. Only these get the existence check. Not path specifiers, so never checked: `.`, `..`, bare names (`pkg`, `pkg/sub.js`), `node:` and `#imports` specifiers.

The synthetic not-found error is `new Error("Cannot find module '<specifier>'" + (meta.url ? " imported from <meta.url>" : ""))` with `code` set to `"ERR_MODULE_NOT_FOUND"`. `<specifier>` is the original text, not the rewritten drive URL.

The check is on the literal resolved URL. There is no extension probing and no `index.js` lookup. A path that is a directory exists, so it is not "not installed". Importing it then fails with `ERR_UNSUPPORTED_DIR_IMPORT`, which goes to `fail` or is rethrown.

Known gap: a subpath of an installed bare package with no `exports` map (`"pkg/missing.js"`) resolves without error, so it is not checked. `tryImport` then fails on `import()` with `ERR_MODULE_NOT_FOUND`, which goes to `fail` or is rethrown, not to `notFound`/`default`. `has("pkg/missing.js")` returns `true`.

## Resolution base and caching

Resolution is relative to the module whose `import.meta` was passed. `import.meta.resolve` has no parent argument, so the bound `meta.resolve` function carries the location. `meta.url` is used only in the synthetic not-found message.

An `opts.meta` on a single call overrides the `meta` argument (or the one bound by `makeOptionalImport`) for that call. A falsy `opts.meta` falls back to the bound one.

The package keeps no cache. Each call re-runs resolve, the existence check and `import()`. Module caching is whatever the Node module map does for `import(url)`. The only module-level state is the default log function.

## `setDefaultLog(log)`

```ts
function setDefaultLog(log: LogFunction): void
```

Replaces the module-level default log function. The initial default is `(message) => console.log(message)`; it ignores the `specifier` argument. No validation, returns nothing.

When the default is read:

- `tryResolve` and `tryImport` read it as a default parameter value on each call that omits `log` (or passes `undefined`).
- `makeOptionalImport` reads it once, when called. A function made earlier keeps its previously captured `log` and is not changed by a later `setDefaultLog`.

## `ImportMetaLike`

```ts
type ImportMetaLike = {
  url?: string;
  resolve: (specifier: string) => string;
};
```

The caller's `import.meta` object, not `import.meta.url`. A value is accepted when it is truthy and `typeof meta.resolve === "function"`. Otherwise `TypeError` is thrown with a message starting `optional-import: expecting the caller's \`import.meta\` object (not \`import.meta.url\`)`. `url` is optional and used only in the synthetic not-found message.

When the check throws:

- `makeOptionalImport(meta)`: synchronously.
- `tryResolve`: synchronously.
- `tryImport`: as a rejected promise, since it is `async`.
- the bound function and its `.resolve`: the check runs on `opts.meta || boundMeta` on every call. The bound `meta` was already checked at creation, so only a bad `opts.meta` can throw.

## `OptionalImportOpts`

```ts
type OptionalImportOpts = {
  notFound?: (err: Error) => unknown;
  fail?: (err: Error) => unknown;
  default?: unknown;
  message?: true | string;
  log?: LogFunction;
  meta?: ImportMetaLike;
  notExported?: NotExportedHandling;
};
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| `notFound` | `(err: Error) => unknown` | unset | Called when not installed. Its return value is returned as is. `default` is ignored when this is set. If it throws, the error propagates. |
| `fail` | `(err: Error) => unknown` | unset | Called for a non-not-found resolve error, or for an `import()` error. Its return value is returned. When unset the error is rethrown. Never called for "not installed". |
| `default` | `unknown` | `undefined` | Returned when not installed and `notFound` is unset. |
| `message` | `true \| string` | unset | When truthy and the module is not installed, logs `"<message> optional module not found: <specifier>"`. `true` gives `"optional module not found: <specifier>"` with no prefix. A string is prepended followed by one space. An empty string is falsy and logs nothing. Never logs for failure cases. |
| `log` | `LogFunction` | the function passed to the entry point (default: module default log) | Used instead of that function for this call. Called as `log(text, specifier)`. |
| `meta` | `ImportMetaLike` | the bound `meta` | Overrides the resolution base for this call. |
| `notExported` | `"notFound" \| "fail"` | `"notFound"` | Treatment of `ERR_PACKAGE_PATH_NOT_EXPORTED` from resolve. |

Logging happens before `notFound` or `default` is applied.

## `NotExportedHandling`

```ts
type NotExportedHandling = "notFound" | "fail";
```

An unset value or the exact string `"notFound"` gives not-installed treatment. Any other value (a typo, in JS) is treated as `"fail"`.

- `"notFound"`: the package is installed but its `exports` map does not expose the subpath. Handled as not installed.
- `"fail"`: handled as a failure, so `fail(err)` is returned or `err` is rethrown.

## `OptsOrMessage`

```ts
type OptsOrMessage = OptionalImportOpts | string | true;
```

The third argument of `tryResolve` and `tryImport`, and the second of the bound function and its `.resolve`. `undefined` becomes `{}`. `true` or any string becomes `{ message: <value> }`. An object is used as is. `null` is not handled and throws `TypeError` (a property read on `null`); in `tryImport` that is a rejected promise. `false` is used as is and behaves like no options.

## `LogFunction`

```ts
type LogFunction = (message: string, specifier: string) => void;
```

`message` is the full text to log. `specifier` is the specifier as passed by the caller.

## `tryResolve(meta, specifier, optsOrMsg?, log?)`

```ts
function tryResolve(
  meta: ImportMetaLike,
  specifier: string,
  optsOrMsg?: OptsOrMessage,
  log?: LogFunction // default: current default log, read per call
): any
```

Synchronous. Resolves without evaluating the module, using the steps in "How not installed is decided".

Returns the resolved URL string when found. When not installed, returns `notFound(err)` or `default`. On a failure, returns `fail(err)` or throws.

- A returned URL is not proof the target exists for a bare specifier: `meta.resolve` does no filesystem stat there. Path and `file:` specifiers do get the existence check.
- `undefined` is ambiguous (not installed with no `default`, or a `notFound`/`fail` that returned `undefined`).
- Node built-ins resolve (`tryResolve(import.meta, "node:fs")` returns `"node:fs"`).

## `tryImport(meta, specifier, optsOrMsg?, log?)`

```ts
async function tryImport(
  meta: ImportMetaLike,
  specifier: string,
  optsOrMsg?: OptsOrMessage,
  log?: LogFunction // default: current default log, read per call
): Promise<any>
```

Resolves as `tryResolve` does, then returns `await import(url)` when it resolved.

- The namespace object is returned unmodified. For a CJS dependency, `module.exports` is on `.default`. There is no auto-unwrapping.
- Not installed: resolves to `notFound(err)` or `default`.
- Import errors go to `fail` or reject. A broken installed module never turns into the default.
- All errors surface as promise rejection, including the `TypeError` for a bad `meta`.

## `makeOptionalImport(meta, log?)`

```ts
function makeOptionalImport<T = any>(
  meta: ImportMetaLike,
  log?: LogFunction // default: current default log, read when called
): OptionalImportFunction<T>
```

Validates `meta` immediately (throws `TypeError` if bad) and returns a function bound to it.

```js
const optionalImport = makeOptionalImport(import.meta);
const chalk = await optionalImport("chalk", { default: null });
if (optionalImport.has("chalk")) { /* ... */ }
```

## `OptionalImportFunction<T>`

```ts
type OptionalImportFunction<T = any> = {
  (specifier: string, optsOrMsg?: OptsOrMessage): Promise<T>;
  resolve: (specifier: string, optsOrMsg?: OptsOrMessage) => any;
  has: (specifier: string) => boolean;
  log: LogFunction;
};
```

- Call: `tryImport(meta, specifier, optsOrMsg, optionalImport.log)`. `T` is only a type annotation, nothing is checked at runtime.
- `.resolve(specifier, optsOrMsg?)`: `tryResolve(meta, specifier, optsOrMsg, optionalImport.log)`. Synchronous.
- `.has(specifier)`: `tryResolve(meta, specifier, { default: undefined }) !== undefined`. Synchronous. `true` when the specifier resolves (and, for path specifiers, the file exists), `false` when not installed. It takes no options, uses the bound `meta`, and does not log. A resolve failure that is not "not installed" (an invalid specifier, an undefined `#import`) throws instead of returning `false`.
- `.log`: a plain writable property, initially the `log` argument. It is read on every call, so reassigning it affects later calls on this function. A per-call `opts.log` still wins.
