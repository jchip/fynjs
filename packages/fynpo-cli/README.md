# fynpo-cli

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

The global launcher for the `fynpo` command.

Install this package globally and you get a `fynpo` binary. It carries no logic and no dependencies of its own - it finds the [fynpo] installed in the repo you're standing in and runs that, so every repo gets the fynpo version it declares rather than whichever one happens to be installed globally.

## Install

```bash
npm install -g fynpo-cli
```

Then, in a monorepo that has `fynpo` as a dev dependency:

```bash
fynpo bootstrap
```

If you'd rather not install anything globally, run the local one directly - `npx fynpo` or `fyn fynpo` - and skip this package entirely.

## API reference

See the [full API reference](docs/reference.md) for how `fynpo` is resolved and run, and its error cases.

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

[fynpo]: https://github.com/jchip/fynjs/tree/main/packages/fynpo

[license-image]: https://img.shields.io/npm/l/fynpo-cli.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/fynpo-cli.svg
[downloads-url]: https://npm-stat.com/charts.html?package=fynpo-cli
[npm-badge-png]: https://nodei.co/npm/fynpo-cli.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/fynpo-cli
