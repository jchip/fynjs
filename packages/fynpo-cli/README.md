[![NPM version][npm-image]][npm-url] [![Build Status][build-image]][build-url]

# fynpo-cli

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

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

[fynpo]: https://github.com/jchip/fynjs/tree/main/packages/fynpo
[npm-image]: https://badge.fury.io/js/fynpo-cli.svg
[npm-url]: https://npmjs.org/package/fynpo-cli
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
