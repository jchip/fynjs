# @jchip/error <!-- omit in toc -->

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Utilities for readable node.js error stacks, and an `AggregateError` subclass that prints nested stacks.

### API reference: <https://fynjs.pages.dev/api/modules/_jchip_error> <!-- omit in toc -->

See the [API reference](https://fynjs.pages.dev/api/modules/_jchip_error) for every function, option, and type.

The [Markdown reference](docs/reference.md) has the full API and its runtime behavior in one file, written for AI agents. It also ships in the package as `docs/reference.md`.

# Table of Contents <!-- omit in toc -->

- [Examples](#examples)
  - [`cleanErrorStack`](#cleanerrorstack)
  - [`aggregateErrorStack`](#aggregateerrorstack)
  - [`AggregateError`](#aggregateerror)

## Examples

### `cleanErrorStack`

```js
import { cleanErrorStack } from "@jchip/error";

function loadConfig() {
  return JSON.parse("{ bad json");
}

try {
  loadConfig();
} catch (err) {
  console.log(cleanErrorStack(err));
}
```

Output, run as `node test/app.mjs` from `/home/me/app`:

```
SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
    at loadConfig (test/app.mjs:4:15)
    at test/app.mjs:8:3
```

vs `err.stack`:

```
SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
    at JSON.parse (<anonymous>)
    at loadConfig (file:///home/me/app/test/app.mjs:4:15)
    at file:///home/me/app/test/app.mjs:8:3
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async node:internal/modules/esm/loader:647:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
```

Frames from `node:` internals are dropped. Paths under the current directory become relative, for both ES module `file://` URLs and CommonJS paths.

### `aggregateErrorStack`

Generate stack with aggregate errors from [AggregateError]

Example:

```js
import { aggregateErrorStack, AggregateError } from "@jchip/error";

console.log(aggregateErrorStack(new AggregateError([new Error("error 1")], "test")));
```

Output:

```
AggregateError: test
    at file:///home/me/app/test/app.mjs:3:33
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async node:internal/modules/esm/loader:647:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
  Error: error 1
      at file:///home/me/app/test/app.mjs:3:53
      at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
      at async node:internal/modules/esm/loader:647:26
      at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
```

### `AggregateError`

- Subclass of the built-in [AggregateError]; it does not patch the global
- `stack` includes the stacks of the aggregated errors, indented
- Takes any iterable of errors and the native `{ cause }` option

Example with `cleanErrorStack`:

```js
import { cleanErrorStack, AggregateError } from "@jchip/error";

function loadConfig() {
  return JSON.parse("{ bad json");
}

try {
  loadConfig();
} catch (err) {
  console.log(cleanErrorStack(new AggregateError([err], "config failed")));
}
```

Output:

```
AggregateError: config failed
    at test/app.mjs:10:31
  SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
      at loadConfig (test/app.mjs:4:15)
      at test/app.mjs:8:3
```

vs `new AggregateError([err], "config failed").stack`:

```
AggregateError: config failed
    at file:///home/me/app/test/app.mjs:10:15
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async node:internal/modules/esm/loader:647:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
  SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
      at JSON.parse (<anonymous>)
      at loadConfig (file:///home/me/app/test/app.mjs:4:15)
      at file:///home/me/app/test/app.mjs:8:3
      at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
      at async node:internal/modules/esm/loader:647:26
      at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
```

[aggregateerror]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError

[license-image]: https://img.shields.io/npm/l/@jchip/error.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/@jchip/error.svg
[downloads-url]: https://npm-stat.com/charts.html?package=%40jchip%2Ferror
[npm-badge-png]: https://nodei.co/npm/@jchip/error.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/@jchip/error
