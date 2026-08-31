# fynjs <!-- omit in toc -->

[![License][license-image]][license-url]
[![build][build-image]][build-url]

**fynjs is the monorepo for [fyn] and [fynpo] — a node.js package manager and a zero setup
monorepo manager — plus the ~25 small packages they are built from.**

- [fyn] — the node.js package manager. Installs from npm, and links local packages in a
  monorepo without symlink hacks.
- [fynpo] — zero setup monorepo/colorepo manager: bootstrap, run scripts in topological order,
  version, changelog, and publish.
- [docs](https://jchip.github.io/fynpo/docs/intro)

See [this express monorepo PoC](https://github.com/jchip/express-monorepo), which puts
[express](https://expressjs.com/) and all its dependencies in one monorepo, sources cloned
straight from their own repos.

## Packages

Everything lives in [`packages/`](packages) and is published independently.

| | |
|---|---|
| **Tools** | [fyn], [fynpo], [`@fynpo/base`](packages/fynpo-base), [`fynpo-cli`](packages/fynpo-cli), [`@fynjs/run`](packages/xarc-run) |
| **CLI** | [`@fynjs/cli-args`](packages/cli-args), [`chalker`](packages/chalker), [`visual-logger`](packages/visual-logger), [`visual-exec`](packages/visual-exec), [`xsh`](packages/xsh), [`unwrap-npm-cmd`](packages/unwrap-npm-cmd) |
| **Async** | [`aveazul`](packages/aveazul), [`xaa`](packages/xaa), [`item-queue`](packages/item-queue), [`xflight`](packages/xflight) |
| **Packaging** | [`publish-util`](packages/publish-util), [`pkg-preper`](packages/pkg-preper), [`check-pkg-new-version`](packages/check-pkg-new-version), [`check-pkg-new-version-engine`](packages/check-pkg-new-version-engine) |
| **Misc** | [`@jchip/error`](packages/error), [`filter-scan-dir`](packages/filter-scan-dir), [`optional-import`](packages/optional-import), [`run-verify`](packages/run-verify), [`string-array`](packages/string-array), [`xenv-config`](packages/xenv-config) |

## Development

Requires node.js `>=22.12.0` and [fyn] + [fynpo] installed globally.

```sh
npm install -g fyn fynpo   # once
fyn bootstrap              # clone forked deps, install, bootstrap all packages
fyn test                   # run every package's tests
fyn ci:check               # what CI runs: typecheck + tests
```

`bootstrap` clones two patched forks into `_w/` over ssh. Without a github ssh key, clone them
with https first:

```sh
mkdir -p _w && cd _w
git clone https://github.com/jchip/npm-packlist.git
git clone https://github.com/jchip/ignore-walk.git
```

Design and planning documents are in [`notes/`](notes/README.md).

## License

Copyright (c) 2022-2026 Joel Chen

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).

[fyn]: packages/fyn
[fynpo]: packages/fynpo

<!-- License badges -->

[license-image]: https://img.shields.io/badge/license-Apache--2.0-blue.svg
[license-url]: LICENSE

<!-- CI badge -->

[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
