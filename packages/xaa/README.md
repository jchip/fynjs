# xaa

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

async/await and Promise helpers.

github: <https://github.com/jchip/fynjs/tree/main/packages/xaa>

## Install and Usage

```
npm i xaa
```

## APIs

See the [full API reference](docs/reference.md) for every function, option, and type. It also ships in the package at `node_modules/xaa/docs/reference.md`.

Online:

- Reference: <https://fynjs.pages.dev/ref/xaa.md>
- TypeDoc: <https://fynjs.pages.dev/api/modules/xaa>

xaa is ESM only and ships TypeScript types.

## Examples:

### xaa.timeout

```js
import { timeout, delay } from "xaa";

async function test() {
  // will throw TimeoutError
  await timeout(50, "took too long").run(delay(100));
  // will run the two functions and wait for them
  await timeout(50, "oops")
    .run([
      () => delay(10, 1),
      () => delay(15, 2),
      "some value",
      Promise.resolve("more value")
    ])
    .then(results => {
      // results === [1, 2, "some value", "more value"]
    });
}
```

### xaa.map

```js
import { map } from "xaa";

async function test() {
  return await map(
    ["http://url1", "http://url2"],
    async url => fetch(url),
    { concurrency: 2 }
  );
}
```

# License

Licensed under the [Apache License, Version 2.0].

[apache license, version 2.0]: https://www.apache.org/licenses/LICENSE-2.0

[license-image]: https://img.shields.io/npm/l/xaa.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/xaa.svg
[downloads-url]: https://npm-stat.com/charts.html?package=xaa
[npm-badge-png]: https://nodei.co/npm/xaa.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/xaa
