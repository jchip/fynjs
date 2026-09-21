[![NPM version][npm-image]][npm-url] [![Build Status][build-image]][build-url]

# @fynpo/base

The package-graph and config layer under [fynpo] and [fyn].

It answers the questions a monorepo tool keeps asking: which directories in this repo are packages, how do they depend on each other, what order can they be built in, and what does the repo's `fynpo` config say. Nothing here drives a command - it's the shared model that fynpo's commands and fyn's local-package resolution are both built on.

## Install

```bash
npm install @fynpo/base
```

## Usage

```js
import { FynpoDepGraph, FynpoConfigManager, readFynpoPackages } from "@fynpo/base";

const graph = new FynpoDepGraph({ cwd: process.cwd() });
await graph.resolve();

// packages found, and how they relate
console.log(Object.keys(graph.packages.byName));
```

## What's in it

### `FynpoDepGraph`

Reads the repo's packages and builds the dependency graph between them - direct and indirect, across `dependencies`, `devDependencies`, `optionalDependencies` and `peerDependencies`. Gives you topological ordering for running tasks in dependency order, and resolves a `name@<semver>` reference to the local `name@version` that satisfies it.

Its `autoSearched` flag records whether packages were discovered by walking the repository
rather than explicit scan patterns. Auto-search is enabled by default and stops at package
directories, so nested demos and test fixtures are not discovered automatically.

Explicit `packages.include` paths (or entries in the legacy `packages` array) can cross these
boundaries. For example, include `dev-tools/create-fynapp/examples/*` to manage those examples
while keeping automatic discovery bounded elsewhere. Excludes still apply.

Set `packages.autoSearch.stopOnPackageJsonFound: false` to continue below package directories.
With this opt-in, nested packages remain in the local dependency graph, but carry
`managed: false` unless their path directly matches `packages.include`; fynpo skips those
packages for lifecycle and release commands while still maintaining their local dependency
ranges during `prepare`.

`stopOnPackageJsonFound` affects discovery only; it has no effect when auto-search is disabled.

### `FynpoConfigManager`

Loads and normalizes the repo's `fynpo.json` / `fynpo.config.js`.

### `readFynpoPackages(options)` and `makePkgDeps(packages, opts)`

The lower-level pieces if you want the package list or the dep relations without the graph object.

### `PackageRef`, `pkgId`, `getDepSection`, `makeDepStep`

Helpers for parsing and formatting package references and dependency sections.

### `caching`

Exported as a namespace (`import { caching } from "@fynpo/base"`) - input/output hashing used for fynpo's task caching: `processInput`, `processOutput`, `processLifecycleInput`, `readHashDigest`.

### `gitignore` helpers and `posixify`

Small utilities shared by the tools.

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

[fynpo]: https://github.com/jchip/fynjs/tree/main/packages/fynpo
[fyn]: https://github.com/jchip/fynjs/tree/main/packages/fyn
[npm-image]: https://badge.fury.io/js/%40fynpo%2Fbase.svg
[npm-url]: https://npmjs.org/package/@fynpo/base
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
