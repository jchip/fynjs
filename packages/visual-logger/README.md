# visual-logger

[![License][license-image]][license-url]
[![build][build-image]][build-url]

[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

- [API reference](https://fynjs.pages.dev/api/modules/visual-logger) - TypeDoc
- [Markdown reference](docs/reference.md) - the full API and runtime behavior in one file. Also ships in the package.
- [GitHub](https://github.com/jchip/fynjs/tree/main/packages/visual-logger)

Visual CLI logger for NodeJS

This is a simple logger that combines in-place terminal updates for showing things like progress, spinners, etc.

Demo as used in [fyn]:

[![fyn demo][fyn-image]][fyn]

## Install

```bash
npm install visual-logger
```

## Usage

Log lines scroll normally. *Items* are the in-place part: each one owns a line at the bottom of the screen that you update as work progresses, and removing it leaves the scrollback clean.

```js
import VisualLogger from "visual-logger";

const logger = new VisualLogger();

logger.info("starting");

logger.addItem({ name: "install", color: "green", display: "Installing", spinner: true });
logger.updateItem("install", "resolving dependencies");
logger.updateItem("install", { msg: "linking", display: "Linking" });
logger.removeItem("install");

logger.info("done");
```

## API

### Logging

`debug()`, `verbose()`, `info()`, `log()`, `warn()`, `error()` - one per level. Levels are `debug` (10), `verbose` (20), `info` (30), `warn` (40), `error` (50), `fyi` (60) and `none` (100); each gets its own color, exported as `LevelColors`.

Messages below the logger's level are saved to `logData` but not printed. The level defaults to `info`. Set it with the `logLevel` constructor option or the `logLevel` property:

```js
const logger = new VisualLogger({ logLevel: "debug" });
logger.logLevel; // "debug"
logger.logLevel = "warn"; // an unknown name throws TypeError
```

`prefix(str | false)` and `setPrefix(str)` set a prefix on subsequent lines.

### Items

| method | description |
| --- | --- |
| `addItem({ name, color, display, spinner, spinInterval, save })` | add an in-place item; `spinner` may be `true`, a style name or index |
| `updateItem(name, msg \| { msg, display })` | update what the item shows |
| `removeItem(name)` | remove it |
| `clearItems()` | remove all of them |
| `freezeItems(showItems?)` / `unfreezeItems()` | stop and resume in-place updating - useful around output you don't want overwritten |
| `setItemType(type)` | `normal`, `simple`, or `none` to turn in-place rendering off (what CI wants) |

Item names may be strings or symbols.

### Also exported

`VisualLogger` (also the default export), `Levels`, `LevelColors`, `LogItemTypes`, `defaultOutput`, and the `VisualOutput` / `OutputInterface` types for supplying your own output target.

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

[fyn-image]: ./images/fyn.gif
[fyn]: https://github.com/jchip/fynjs/tree/main/packages/fyn

[license-image]: https://img.shields.io/npm/l/visual-logger.svg
[license-url]: LICENSE
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
[downloads-image]: https://img.shields.io/npm/dm/visual-logger.svg
[downloads-url]: https://npm-stat.com/charts.html?package=visual-logger
[npm-badge-png]: https://nodei.co/npm/visual-logger.png?downloads=true&stars=true
[package-url]: https://npmjs.com/package/visual-logger
