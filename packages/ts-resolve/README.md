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

Node >= 22.15, for the synchronous in-thread `module.registerHooks` API.
