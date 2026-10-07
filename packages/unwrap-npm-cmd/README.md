# unwrap-npm-cmd

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

- [API reference](https://fynjs.pages.dev/api/modules/unwrap-npm-cmd) - TypeDoc
- [Markdown reference](docs/reference.md) - the full API and runtime behavior in one file. Also ships in the package.
- [GitHub](https://github.com/jchip/fynjs/tree/main/packages/unwrap-npm-cmd)

Unwrap npm's node.js bin CMD batch for js files on Windows.

[Sample](./test/fixtures/sample.js):

```js
const unwrapNpmCmd = require("unwrap-npm-cmd");
console.log(unwrapNpmCmd("npm test"));
console.log(unwrapNpmCmd("npx mocha", { relative: true }));
console.log(unwrapNpmCmd("mocha test", { jsOnly: true }));
console.log(unwrapNpmCmd(`find "name" package.json`));
console.log(unwrapNpmCmd("hello world", { path: __dirname }));
```

Output:

```cmd
"C:\Users\userid\nvm\nodejs\bin\node.exe" "C:\Users\userid\nvm\nodejs\bin\node_modules\npm\bin\npm-cli.js" test
"C:\Users\userid\nvm\nodejs\bin\node.exe" "..\nvm\nodejs\bin\node_modules\npm\bin\npx-cli.js" mocha
"C:\Users\userid\unwrap-npm-cmd\node_modules\mocha\bin\mocha" test
"C:\WINDOWS\system32\find.EXE" "name" package.json
"C:\Users\userid\unwrap-npm-cmd\test\fixtures\hello.CMD" world
```

## Usage

```js
child.spawnSync(unwrapNpmCmd("mocha test", { relative: true }));
```

Would effectivly be doing:

```js
child.spawnSync(
  `"C:\\Users\\userid\\nvm\\nodejs\\bin\\node.exe" ".\\node_modules\\mocha\\bin\\_mocha" test`
);
```

## API

```js
unwrapNpmCmd(cmd, options);
```

`options`:

| name       | description                                                |
| ---------- | ---------------------------------------------------------- |
| `path`     | Use instead of the `PATH` environment variable.            |
| `jsOnly`   | Return only the JS file as command without node exe.       |
| `relative` | Convert JS file to relative path from CWD.                 |
| `cwd`      | Use instead of `process.cwd()` to find relative path from. |

# License

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)

[license-image]: https://img.shields.io/npm/l/unwrap-npm-cmd.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/unwrap-npm-cmd.svg
[downloads-url]: https://npm-stat.com/charts.html?package=unwrap-npm-cmd
[npm-badge-png]: https://nodei.co/npm/unwrap-npm-cmd.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/unwrap-npm-cmd
