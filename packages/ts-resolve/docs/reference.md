# @fynjs/ts-resolve reference

`@fynjs/ts-resolve` lets plain `node` run TypeScript sources that import each other with `.js`-style or extensionless specifiers. It only resolves specifiers to `.ts`-family files. Node's own type stripping then compiles them. There is no `load` hook, no transpiler and no runtime dependency. ESM only (`"type": "module"`).

## Imports

```js
// Register side effect (CLI): node --import @fynjs/ts-resolve/register app.ts
import "@fynjs/ts-resolve/register";

// Programmatic
import { install, createTsMapper, createResolveHook } from "@fynjs/ts-resolve";
import type { MapperOptions, FileCheck } from "@fynjs/ts-resolve";
```

Package `exports`: `.` (`dist/index.js`), `./register` (`dist/register.js`), `./package.json`. `sideEffects` lists only `dist/register.js`. `./register` has no exports; importing it runs `install()` with no options. There is no `./register.ts` subpath and no CJS entry. From CommonJS use dynamic `import()`.

Runtime exports of `.`: `install`, `createResolveHook`, `createResolveFilename`, `createTsMapper`, `defaultIsFile`.

Type-only exports of `.`: `MapperOptions`, `FileCheck`.

Not exported: the types `ResolveContext`, `ResolveResult`, `NextResolve`, `MapTs`, `CjsParent`, `ResolveFilename`. They appear in the signatures below and cannot be imported by name. Derive them with `ReturnType` or `Parameters` if needed. The constants `TS_EXTENSIONS`, `JS_TO_TS`, `DEFAULT_SKIP` are internal.

Engines: `^22.22.2 || ^24.15.0 || >=26.0.0`. The code needs `module.registerHooks` (a synchronous in-thread hook API) and node's built-in type stripping.

## Registering

Two ways, same effect.

```sh
node --import @fynjs/ts-resolve/register src/entry.ts
```

```js
import { install } from "@fynjs/ts-resolve";
install();
```

`install()` does two things: it registers an ESM/`require` resolve hook with `module.registerHooks`, and it wraps `Module._resolveFilename` for CommonJS. See `install`. It does not use `module.register` (no async loader thread) and has no CJS `-r` entry.

The entry file itself is not remapped. The specifier passed to the resolve hook for the main entry is not relative, so `node entry.js` does not find `entry.ts`. Pass the real `.ts` path.

## Mapping rules

These rules are implemented by `createTsMapper` and applied by both hooks. Input is a resolved `file:` URL.

Only relative specifiers are considered by the hooks: those starting with `"."`, and only when a parent is known (`context.parentURL` for ESM, `parent.filename` for CJS). Bare specifiers (`pkg`), absolute paths, `file:` URLs, `node:` builtins and `#imports` are always passed to the next resolver.

For each URL, `mapTs` runs this lookup. First match wins:

1. If the URL matches the `skip` regex (default `/\/(node_modules|\.fynpo)\//`), return `null`. This is tested against the whole URL, so it also skips everything when the project itself lives under a directory named `node_modules` or `.fynpo`.
2. If the URL ends with `.js`, `.mjs` or `.cjs` (case-sensitive regex `/\.[mc]?js$/`):
   - If a real file exists at the URL, return `null`. An existing JS file is never shadowed.
   - Otherwise try these candidates with the extension swapped, in order, and return the first that is a file:

   | specifier ends with | candidates, in order |
   | --- | --- |
   | `.js` | `.ts`, `.tsx` |
   | `.mjs` | `.mts`, `.ts` |
   | `.cjs` | `.cts`, `.ts` |

   - If none exists, return `null`.
3. Else, if the URL does not end with an extension (regex `/\.[a-z0-9]+$/i` does not match), try in order:
   - `url + ".ts"`, `".tsx"`, `".mts"`, `".cts"`
   - `url + "/index.ts"`, `"/index.tsx"`, `"/index.mts"`, `"/index.cts"`

   Return the first that is a file. All extension candidates are tried before any `index` candidate.
4. Otherwise return `null`.

Consequences:

- A specifier that already ends in `.ts`, `.mts`, `.cts`, `.tsx`, `.json` or any other extension is never mapped. It goes to the next resolver unchanged.
- Extensionless names that contain a dot, such as `./foo.config`, count as having an extension and are not mapped.
- Uppercase `.JS` is not treated as a JS extension (the JS regex is case-sensitive) but does count as having an extension, so it is not mapped.
- A directory specifier with a trailing slash, such as `./sub/`, does map to the index file, but the URL gets a double slash (`.../sub//index.ts`). The path still stats correctly on POSIX.
- A query string or hash on the specifier (`./a.js?x=1`) makes the URL not end in `.js`, so it is not mapped.
- `.tsx` is mapped, but node cannot strip JSX, so such a file will fail to load at runtime.
- The candidate must be a regular file (`statSync(...).isFile()`). A directory named `foo.ts` is not matched.

What is passed through: every URL for which `mapTs` returns `null` goes to the next resolver untouched. That includes all of `node_modules` (by default), existing `.js` files, bare specifiers and unmatched paths. When nothing maps, errors such as `ERR_MODULE_NOT_FOUND` or `MODULE_NOT_FOUND` come from node, not from this package.

## `install(options?)`

```ts
function install(options?: MapperOptions): void
```

Registers the ESM/synchronous resolve hook and patches the CJS resolver. `options` defaults to `{}`.

Steps, in order:

1. `registerHooks({ resolve: createResolveHook(options) })` from `node:module`.
2. Replaces `Module._resolveFilename` with `createResolveFilename(createTsMapper(options), previous)`, where `previous` is the function in place at call time.

Rules:

- Each call adds another hook and wraps the CJS resolver again. Call it once per process. `./register` already calls it once.
- The two steps use two separate mappers, so they have separate caches. They share the same `options`.
- Why the CJS patch exists (from source comments): below node 26.2, a CommonJS entry file's `require` goes straight to `Module._resolveFilename` and skips `registerHooks`. Without the patch `require("./lib.js")` fails with `MODULE_NOT_FOUND`. From 26.2 both agree. The patch is installed unconditionally and no version check is done.
- Type stripping for `.ts` files handed to the CJS loader is done by node, not by this package.
- Throws whatever `registerHooks` throws, for example when `module.registerHooks` does not exist on an unsupported node. This package adds no checks of its own.
- Returns `undefined`. There is no uninstall.

## `createResolveHook(options?)`

```ts
function createResolveHook(options?: MapperOptions): (
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (specifier: string, context: { parentURL?: string }) => { url: string; shortCircuit?: boolean }
) => { url: string; shortCircuit?: boolean }
```

Builds the resolve hook without registering it. The return value has the shape `registerHooks({ resolve })` expects. Each call creates its own mapper and cache.

Behavior of the returned `resolve(specifier, context, nextResolve)`:

- If `specifier` starts with `"."` and `context.parentURL` is truthy: compute `new URL(specifier, context.parentURL).href` and pass it to the mapper. If the mapper returns a URL, return `{ url: mapped, shortCircuit: true }`.
- Otherwise, return `nextResolve(specifier, context)`, passing both arguments through unchanged.
- The result has no `format` on purpose. Node infers `module-typescript` or `commonjs-typescript` from the `.ts` extension and strips types. Setting `format` would suppress that and the file would load unstripped.
- Missing `parentURL` (for example the main entry) means the specifier is never mapped.
- `new URL(...)` throws a `TypeError` if `parentURL` is not a valid absolute URL. A valid non-`file:` parent such as `data:` does not throw: the mapper's default stat check catches the error from `fileURLToPath` and treats the URL as not a file.
- The hook is synchronous and does not return a promise.

```js
const resolve = createResolveHook({ isFile: url => files.has(url) });
resolve("./a.js", { parentURL: "file:///p/x.ts" }, next); // { url: "file:///p/a.ts", shortCircuit: true } when files has it
```

## `createResolveFilename(mapTs, next)`

```ts
function createResolveFilename(
  mapTs: (url: string) => string | null,
  next: (request: string, parent: { filename?: string | null } | null | undefined, isMain: boolean, options?: unknown) => string
): (request: string, parent: { filename?: string | null } | null | undefined, isMain: boolean, options?: unknown) => string
```

Builds a `Module._resolveFilename` replacement without patching the process. `mapTs` is typically the result of `createTsMapper`. `next` is the resolver to fall back to.

Behavior of the returned function (it uses `this` and forwards it):

- If `request` starts with `"."` and `parent?.filename` is truthy: compute `new URL(request, pathToFileURL(parent.filename)).href`, call `mapTs`, and if it returns a URL, return `fileURLToPath(mapped)` (a path, not a URL).
- Otherwise call `next.call(this, request, parent, isMain, options)` and return its result.
- A `parent` of `null`, `undefined` or one without `filename` always falls through to `next`.
- `mapTs` returning a non-`file:` URL would make `fileURLToPath` throw. The default mapper only returns URLs derived from its input plus an extension.

## `createTsMapper(options?)`

```ts
function createTsMapper(options?: MapperOptions): (url: string) => string | null
```

Builds the mapper from a resolved `file:` URL string to the URL of its TypeScript source, or `null` to leave the URL alone. The mapping rules are in "Mapping rules". The returned function is `mapTs(url)`.

- Input and output are URL strings (`file:///...`), not paths.
- Results are memoized in a `Map` per mapper, keyed by the exact input URL, for the life of the mapper. `null` results are cached too. There is no invalidation, so a file created or deleted after the first lookup of that URL is not noticed.
- Defaults: `isFile` is `defaultIsFile`, `skip` is `/\/(node_modules|\.fynpo)\//`. Each is applied with `??`, so `undefined` selects the default.
- `skip` is applied with `RegExp.prototype.test`. A regex with the `g` or `y` flag keeps `lastIndex` between calls, which can make results inconsistent. Use a regex without those flags.
- Does not throw by itself. Errors thrown by a custom `isFile` propagate.
- The mapper does not check the scheme of the URL. With the default `isFile`, a non-`file:` URL simply is never a file.

## `defaultIsFile`

```ts
const defaultIsFile: (url: string) => boolean
```

The default `FileCheck`. Returns `statSync(fileURLToPath(url)).isFile()`. Any error (missing file, permission, a non-`file:` URL that makes `fileURLToPath` throw) is swallowed and gives `false`. Synchronous. Symlinks are followed by `statSync`.

## `MapperOptions`

```ts
type MapperOptions = {
  isFile?: FileCheck;
  skip?: RegExp;
};
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| `isFile` | `FileCheck` | `defaultIsFile` | Decides whether a candidate URL exists. Called with `file:` URL strings. Also used for the "real `.js` file wins" check. Source comment says it exists to be overridden in tests. |
| `skip` | `RegExp` | `/\/(node_modules\|\.fynpo)\//` | URLs that match are never remapped. Replacing it replaces the default, so to keep skipping `node_modules` your regex must include it. |

## `FileCheck`

```ts
type FileCheck = (url: string) => boolean;
```

Predicate that tests whether a `file:` URL points at a real file. Must be synchronous: the hooks are synchronous and a returned promise would be truthy.

## Interaction with `node_modules`

By default no URL containing `/node_modules/` or `/.fynpo/` is remapped, in either the ESM or the CJS path. Installed packages are expected to ship built JS. The test is on the resolved URL, which for a relative specifier is built from the parent's location. So relative imports between files inside an installed package are skipped, and a relative import that climbs out of `node_modules` into source is not skipped. Pass `skip: /$^/` (matches nothing) to disable skipping.

Specifiers that go through the resolver as bare names (`import "pkg"`) are never examined by this package, so a workspace package whose `exports` point at `.ts` files is resolved by node alone.

## Limits stated in source

- Resolution only. Module syntax is not converted: a `.ts` file with `import`/`export` in a package without `"type": "module"` fails in node (README: `Unexpected token 'export'`).
- No `load` hook, no source maps (node strips types by whitespace replacement so positions stay valid; README claim, not implemented here).
