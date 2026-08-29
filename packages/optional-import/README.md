# optional-import

ESM optional dependency loading that tells **"not installed"** apart from **"installed but broken"**.

The ESM counterpart to [optional-require]. Where `optional-require` wraps a `require` call,
there is no call to wrap in ESM — a static `import` is resolved and linked for the entire
reachable graph before any of your code evaluates. Optional loading therefore has to go through
`import()`, which makes it async.

## Install

```bash
fyn add optional-import
```

## Usage

```js
import { makeOptionalImport } from "optional-import";

const optionalImport = makeOptionalImport(import.meta);

// undefined only if chalk is NOT INSTALLED
const chalk = await optionalImport("chalk");

// with a fallback
const chalk = await optionalImport("chalk", { default: plainFormatter });

// synchronous availability check — no await, no evaluation
if (optionalImport.has("chalk")) {
  /* ... */
}
```

Pass `import.meta`, **not** `import.meta.url`. The single-argument form of
`import.meta.resolve` has no parent parameter, so the bound `resolve` function is the only
carrier of your module's location. Passing the url string throws a `TypeError`.

## Why not just catch the error from `import()`

Because Node raises the same error for a missing dependency and for a dependency that is
installed but whose *own* dependency is missing:

```
import("totally-not-installed")  ->  ERR_MODULE_NOT_FOUND
                                     Cannot find package 'totally-not-installed' ...

import("broken-nested")          ->  ERR_MODULE_NOT_FOUND
                                     Cannot find package 'a-dep-that-is-not-installed' ...
```

Same `code`, and the error carries no structured field naming the specifier that failed — the
message even names the *nested* one. So a `try/catch` around `import()` cannot tell them apart,
and a genuinely broken install silently degrades into your fallback, presenting as "feature
unavailable" rather than "your install is broken".

`optional-import` resolves first and imports second:

```js
let url;
try {
  url = meta.resolve(specifier);  // only ever fails for `specifier` itself
} catch (err) {
  return handleNotFound(err);
}
return await import(url);          // any throw here is REAL — propagate it
```

`meta.resolve` never fails on behalf of a nested specifier, which makes the distinction
**structural** rather than a guess based on error message text.

```js
// installed, but its own dependency is missing — throws, does NOT return "FALLBACK"
await optionalImport("broken-nested", { default: "FALLBACK" });
```

## API

### `makeOptionalImport(meta, log?)`

Returns an optional import function bound to the caller's `import.meta`.

- `optionalImport(specifier, optsOrMsg?)` → `Promise` of the module namespace
- `optionalImport.resolve(specifier, optsOrMsg?)` → resolved URL, **synchronously**
- `optionalImport.has(specifier)` → `boolean`, **synchronously**
- `optionalImport.log` — the log function, replaceable

### `tryImport(meta, specifier, optsOrMsg?)` / `tryResolve(meta, specifier, optsOrMsg?)`

Standalone forms, for when you do not want to build a bound function.

### `setDefaultLog(log)`

Replace the default log function (`console.log`) used when no other is given.

### Options

Mirrors `optional-require`:

| option | description |
| --- | --- |
| `default` | value returned when the module is not installed |
| `notFound(err)` | called instead of returning `default` when the module is not installed |
| `fail(err)` | called when the module resolved but importing it threw; otherwise the error is rethrown |
| `message` | `true` for a default not-found message, or a string to prepend |
| `log` | log function for this call |
| `meta` | override the bound `import.meta` for this call |
| `notExported` | `"notFound"` (default) or `"fail"` — how to treat `ERR_PACKAGE_PATH_NOT_EXPORTED` |

As a shorthand, `optsOrMsg` may be a string or `true`, equivalent to `{ message }`.

## Differences from `optional-require`

**It is async.** There is no synchronous ESM equivalent. `optionalImport.resolve()` and
`.has()` are synchronous, because resolution does not evaluate the module — that covers
availability checks, which is often the whole question.

**It returns the module namespace unmodified.** For a CJS optional dependency, `module.exports`
lands on `.default`. `.default` is deliberately not auto-unwrapped, because that would hide the
named exports of a real ESM package.

## Caveats

**`meta.resolve` does not stat the filesystem.** It performs resolution, not an existence
check. `./does-not-exist.js` resolves to a URL without error, and so does a subpath of a package
with no `exports` map. It fails when a bare package cannot be located, or when an `exports` map
refuses a subpath — which is exactly the "is this dependency installed" signal, so use it with
bare package specifiers.

**Conditions differ from `optional-require`.** Resolution here runs under the `import`
condition, so a package with divergent conditional exports may resolve to a different file than
`optionalRequire` would load.

**Top-level `await` has a cost.** Awaiting an optional import at module scope makes your module
async, and `require()` of an ESM graph containing top-level await throws
`ERR_REQUIRE_ASYNC_MODULE`. If your package has CJS consumers relying on `require(esm)`, call
this from inside an async function instead, or stay on `optional-require`.

## Things that do not work (verified on Node 26)

- **`imports`/`exports` fallback arrays.** `{"#opt": ["maybe-missing", "./stub.js"]}` looks
  purpose-built for this and does not fall back — a missing package throws
  `ERR_MODULE_NOT_FOUND` rather than moving to the next entry.
- **Registering loader hooks from inside the graph.** `import "./register-hooks.js"` followed by
  `import x from "maybe-missing"` in the same module still throws, because linking precedes all
  evaluation. Hooks must be installed via `--import` or a separate entry.

## License

Apache-2.0

[optional-require]: https://www.npmjs.com/package/optional-require
