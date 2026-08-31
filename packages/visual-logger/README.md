[![NPM version][npm-image]][npm-url] [![Build Status][build-image]][build-url]

# visual-logger

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
[npm-image]: https://badge.fury.io/js/visual-logger.svg
[npm-url]: https://npmjs.org/package/visual-logger
[build-image]: https://github.com/jchip/fynjs/actions/workflows/ci.yml/badge.svg
[build-url]: https://github.com/jchip/fynjs/actions/workflows/ci.yml
