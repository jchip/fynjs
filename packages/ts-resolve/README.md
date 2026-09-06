# @fynjs/ts-resolve

Run this repo's TypeScript on plain `node`, with no transpiler.

Node already strips TypeScript types natively. What it deliberately does **not**
do is rewrite import specifiers, so `./foo.js` will not find `foo.ts` and
extensionless `./foo` will not resolve at all. That gap is the only reason a
runner like `tsx` was needed here.

This package fills exactly that gap: a `resolve` hook, and nothing else. Once it
hands back a `.ts` URL, node's own type stripping compiles it. There is no
`load` hook, no transpiler dependency, no native binary, and no postinstall.

## Usage

```sh
node --import @fynjs/ts-resolve/register src/entry.ts
```

Or programmatically:

```js
import { install } from "@fynjs/ts-resolve";
install();
```

## What it maps

| specifier | resolves to |
| --- | --- |
| `./foo.js` | `./foo.ts`, `./foo.tsx` |
| `./foo.mjs` | `./foo.mts`, `./foo.ts` |
| `./foo.cjs` | `./foo.cts`, `./foo.ts` |
| `./foo` | `./foo.ts`, `.tsx`, `.mts`, `.cts`, then `./foo/index.*` |

A real `.js` file always wins - an existing file is never shadowed by a `.ts`
of the same name. `node_modules` and the fynpo store are never remapped.

## Why no source maps

Node replaces type annotations with whitespace rather than re-printing the
file, so line **and** column numbers survive stripping untouched. Stack traces
point at the original `.ts` with no source map involved.

## Limits

Node's stripping erases types; it never converts module syntax. A `.ts` file
using `import`/`export` inside a package that is not `"type": "module"` will
fail with `Unexpected token 'export'`. The fix belongs in that package's
`package.json`, not here.

JSX is not supported - node cannot strip it. This repo has no `.tsx` sources.

## Requirements

Node >= 22.18, for two reasons: the synchronous in-thread `module.registerHooks` API
(node 22.15), and node's native TypeScript type-stripping being on by default (node
22.18) so that `--import @fynjs/ts-resolve/register.ts` can load at all. Below 22.18
the hook's own entry point cannot be read.

## How `require()` is covered

`install()` registers the resolve hook *and* wraps `Module._resolveFilename`.

The wrap is not redundant. A CommonJS file run as the entry point is loaded
through the ESM loader's CJS translator, and below node 26.2 the `require` that
translator hands it goes straight to `Module._resolveFilename` without
consulting `registerHooks` - so the hook never sees those specifiers and
`require("./lib.js")` fails with `MODULE_NOT_FOUND`. From 26.2 the hook covers
that path too and the wrap simply agrees with it.

Resolution is all that was ever missing: node's CJS loader already strips types
from a `.ts` file it is handed, on every version this package supports.
