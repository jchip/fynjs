# @jchip/error <sup>[![Version Badge][npm-version-svg]][package-url]</sup> <!-- omit in toc -->

[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]
[![build][build-image]][build-url]
[![coverage][coverage-image]][coverage-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Utilities and polyfill for node.js errors

### API reference: <https://jchip.github.io/error> <!-- omit in toc -->

# Table of Contents <!-- omit in toc -->

- [Examples](#examples)
  - [`cleanErrorStack`](#cleanerrorstack)
  - [`aggregateErrorStack`](#aggregateerrorstack)
  - [`AggregateError`](#aggregateerror)

## Examples

### `cleanErrorStack`

```ts
import { cleanErrorStack } from "@jchip/error";

try {
  require("oops");
} catch (err) {
  console.log(cleanErrorStack(err));
}
```

Output:

```
Error: Cannot find module 'oops'
Require stack:
- /Users/joel/error/test/samples.ts
    at Object.<anonymous> (test/samples.js:4:3)
```

vs:

```
Error: Cannot find module 'oops'
Require stack:
- /Users/joel/error/test/samples.js
    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:933:15)
    at Function.Module._load (node:internal/modules/cjs/loader:778:27)
    at Module.require (node:internal/modules/cjs/loader:1005:19)
    at require (node:internal/modules/cjs/helpers:94:18)
    at Object.<anonymous> (/Users/joel/error/test/samples.js:4:3)
    at Module._compile (node:internal/modules/cjs/loader:1101:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
    at Function.Module._load (node:internal/modules/cjs/loader:822:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:79:12)
```

### `aggregateErrorStack`

Generate stack with aggregate errors from [AggregateError]

Example:

```ts
import { aggregateErrorStack, AggregateError } from "@jchip/error";

console.log(aggregateErrorStack(new AggregateError([new Error("error 1")], "test")));
```

Output:

```
AggregateError: test
    at Object.<anonymous> (/Users/joel/error/test/samples.js:3:33)
    at Module._compile (node:internal/modules/cjs/loader:1101:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
    at Function.Module._load (node:internal/modules/cjs/loader:822:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:79:12)
    at node:internal/main/run_main_module:17:47
  Error: error 1
      at Object.<anonymous> (/Users/joel/error/test/samples.js:3:53)
      at Module._compile (node:internal/modules/cjs/loader:1101:14)
      at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
      at Module.load (node:internal/modules/cjs/loader:981:32)
      at Function.Module._load (node:internal/modules/cjs/loader:822:12)
      at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:79:12)
      at node:internal/main/run_main_module:17:47
```

### `AggregateError`

- Polyfill for [AggregateError]
- node.js 15+ has built-in [AggregateError]

Example with `cleanErrorStack`:

```ts
import { cleanErrorStack, AggregateError } from "@jchip/error";

try {
  require("bad");
} catch (err) {
  console.log(cleanErrorStack(new AggregateError([err], "require failed")));
}
```

Output:

```
AggregateError: require failed
    at Object.<anonymous> (test/samples.js:12:31)
  Error: Cannot find module 'bad'
  Require stack:
  - /Users/joel/error/test/samples.js
      at Object.<anonymous> (test/samples.js:10:3)
```

vs:

```
AggregateError: require failed
    at Object.<anonymous> (/Users/joel/error/test/samples.js:12:15)
    at Module._compile (node:internal/modules/cjs/loader:1101:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
    at Function.Module._load (node:internal/modules/cjs/loader:822:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:79:12)
    at node:internal/main/run_main_module:17:47
  Error: Cannot find module 'bad'
  Require stack:
  - /Users/joel/error/test/samples.js
      at Function.Module._resolveFilename (node:internal/modules/cjs/loader:933:15)
      at Function.Module._load (node:internal/modules/cjs/loader:778:27)
      at Module.require (node:internal/modules/cjs/loader:1005:19)
      at require (node:internal/modules/cjs/helpers:94:18)
      at Object.<anonymous> (/Users/joel/error/test/samples.js:10:3)
      at Module._compile (node:internal/modules/cjs/loader:1101:14)
      at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
      at Module.load (node:internal/modules/cjs/loader:981:32)
      at Function.Module._load (node:internal/modules/cjs/loader:822:12)
      at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:79:12)
```

[aggregateerror]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
[license-image]: https://img.shields.io/npm/l/@jchip/error.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/error/actions/workflows/node.js.yml/badge.svg
[build-url]: https://github.com/jchip/error/actions/workflows/node.js.yml
[coverage-image]: https://coveralls.io/repos/github/jchip/error/badge.svg?branch=main
[coverage-url]: https://coveralls.io/github/jchip/error?branch=main
[downloads-image]: https://img.shields.io/npm/dm/@jchip/error.svg
[downloads-url]: https://npm-stat.com/charts.html?package=%40jchip%2Ferror
[deps-svg]: https://david-dm.org/jchip/error.svg
[deps-url]: https://david-dm.org/jchip/error
[dev-deps-svg]: https://david-dm.org/jchip/error/dev-status.svg
[dev-deps-url]: https://david-dm.org/jchip/error#info=devDependencies
[npm-badge-png]: https://nodei.co/npm/@jchip/error.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/@jchip/error
[npm-version-svg]: https://versionbadg.es/jchip/error.svg
