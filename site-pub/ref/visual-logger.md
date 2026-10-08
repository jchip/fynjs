# visual-logger reference

`visual-logger` is a console logger for Node.js CLIs. It prints log lines and can keep a block of live "items" (status lines with optional spinners) redrawn below them on a TTY. On a non-TTY it prints plain lines and optional progress dots. ESM only (`"type": "module"`). Runtime dependencies: `chalk`, `log-update`.

## Imports

```js
import { VisualLogger, Levels, LevelColors, LogItemTypes, defaultOutput } from "visual-logger";
import VisualLogger from "visual-logger"; // default export, same class
```

```ts
import type {
  LogLevel, LogItemType, ItemOptions, UpdateData, VisualLoggerOptions,
  VisualOutput, OutputInterface
} from "visual-logger";
```

Runtime exports: `VisualLogger` (also the default export), `Levels`, `LevelColors`, `LogItemTypes`, `defaultOutput`.

Type-only exports: `LogLevel`, `LogItemType`, `ItemOptions`, `UpdateData`, `VisualLoggerOptions`, `VisualOutput`, `OutputInterface`.

There are no subpaths (only `visual-logger/package.json`). Not exported: the internal `SpinState` and `SpinTimer` types, although `ItemOptions` references `SpinState` through `_spinning`.

## Concepts

- Log line: a message written with `debug`, `verbose`, `info`, `log`, `warn`, `error` or `fyi`. Written to `output.write` with a trailing newline.
- Item: a named status line added with `addItem` and changed with `updateItem`. Rendered as `<display>: <msg>`, optionally prefixed by a spinner frame.
- Item type (`LogItemTypes`): `normal` is the live redrawn display, `simple` prints dots, `none` prints nothing for items.
- Visual mode: items are drawn live. It is on only when all three hold: item type is `normal`, the log level is `<= info`, and the output is a TTY (see "Rendering modes").
- Log level: there is no public API to change it. It is fixed at `info` (30). See `Levels`.

## `VisualLogger`

```ts
class VisualLogger {
  constructor(options?: VisualLoggerOptions);

  get logData(): string[];
  get color(): boolean;
  set color(enable: boolean);

  static get spinners(): string[];
  static get Levels(): typeof Levels;
  static get LogItemTypes(): typeof LogItemTypes;

  debug(...args: any[]): this;
  verbose(...args: any[]): this;
  info(...args: any[]): this;
  log(...args: any[]): this;
  warn(...args: any[]): this;
  error(...args: any[]): this;
  fyi(...args: any[]): this;

  setPrefix(prefixStr?: string): this;
  prefix(x?: string | false): this;

  addItem(options: ItemOptions): this;
  hasItem(name: string | symbol): boolean;
  updateItem(name: string | symbol, data?: string | UpdateData): this;
  removeItem(name: string | symbol): this;
  setItemType(flag?: string | false): this;

  clearItems(): this;
  freezeItems(showItems?: boolean): this;
  unfreezeItems(): this;
  shutdown(showItems?: boolean): void;
}
```

All methods return `this` (chainable) except `hasItem` (boolean) and `shutdown` (void). The class has no `setLogLevel` or level property. Private members are prefixed with `_`.

### Constructor options: `VisualLoggerOptions`

```ts
interface VisualLoggerOptions {
  renderFps?: number;
  output?: OutputInterface;
  maxDots?: number;
  updatesPerDot?: number;
  color?: boolean;
  saveLogs?: boolean;
}
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| `renderFps` | `number` | `30` | Maximum redraws per second. The render interval is `Math.floor(1000 / renderFps + 0.5)` ms. Throws `Error("VisualLogger renderFps must be >= 1 and < 1000")` when `< 1` or `>= 1000`. |
| `output` | `OutputInterface` | `defaultOutput` | Where text goes. Used when falsy-checked with `\|\|`, so any falsy value selects `defaultOutput`. |
| `maxDots` | `number` | `80` | Simple mode: a newline is written once the current dot count reaches this value. Only `undefined` selects the default, so `0` is kept. |
| `updatesPerDot` | `number` | `5` | Simple mode: one `.` is written per this many item updates. Non-finite values (`NaN`, `Infinity`, `undefined`) select `5`. A value of `0` is kept and means no dot is ever written. |
| `color` | `boolean` | `true` | Enables chalk coloring of prefixes and item display names. Only `undefined` selects `true`; other values are passed through `Boolean()`. |
| `saveLogs` | `boolean` | `true` (saved) | When exactly `false`, nothing is appended to `logData`. Any other value saves. |

Constructor behavior:

- Options are merged as `{ renderFps: 30, ...options }`. Passing `renderFps: undefined` explicitly overrides the default with `undefined`. The range check then does not throw (`undefined < 1` is false) and the render interval becomes `NaN`. Do not pass it.
- `renderFps: NaN` also passes the range check, giving a `NaN` interval.
- The range check runs after the fields are set but before `setPrefix()`, so a thrown constructor leaves no usable object.
- The constructor does not call `setItemType`. The item type starts as `normal`. The log level starts at `info`.
- Calls `setPrefix()` so the default prefix is `"> "`.

### `logData`

```ts
get logData(): string[]
```

Returns the live internal array, not a copy. Each saved entry is one string. It is never cleared by the library. Saved entries:

- Every log call, after prefix and `util.format`, including prefix color escape codes. Entries are saved even when the level filter suppresses the output (for example `debug` and `verbose`).
- Every `updateItem` call that passes `data`, saved as the item's full line text (`<display>: <msg>`, colored display, without a spinner frame). Not saved when the item was added with `save: false` or when `UpdateData._save === false`.
- `addItem` and spinner-only updates (`updateItem(name)` with no data) save nothing.

### `color`

```ts
get color(): boolean
set color(enable: boolean)
```

The setter stores the value as given (no `Boolean()` coercion) and calls `setPrefix()` with no argument. Consequences:

- A custom default prefix set earlier with `setPrefix("x")` is reset to `"> "`.
- Items already added keep their previously computed `_display`; only new items and later `UpdateData.display` values follow the new setting.

### Static members

```ts
static get spinners(): string[]
static get Levels(): typeof Levels
static get LogItemTypes(): typeof LogItemTypes
```

- `VisualLogger.spinners` returns a new 4-element array each access. Each element is a string of frames, indexed by character position:
  - `0`: `"|/-\\"`
  - `1`: a braille sequence of 29 frames (`"⠁⠁⠉⠙⠚⠒⠂⠂⠒⠲⠴⠤⠄⠄⠤⠠⠠⠤⠦⠖⠒⠐⠐⠒⠓⠋⠉⠈⠈"`). This is the one used for `spinner: true`.
  - `2`: `"⢹⢺⢼⣸⣇⡧⡗⡏"`
  - `3`: `"⣾⣽⣻⢿⡿⣟⣯⣷"`
- `VisualLogger.Levels` is the same object as the exported `Levels`.
- `VisualLogger.LogItemTypes` is the same object as the exported `LogItemTypes`.

### Log methods

```ts
debug(...args: any[]): this
verbose(...args: any[]): this
info(...args: any[]): this
log(...args: any[]): this   // alias of info
warn(...args: any[]): this
error(...args: any[]): this
fyi(...args: any[]): this
```

Each call, in order:

1. Builds the line: `prefix + util.format(...args)`. `util.format` rules apply (printf-style `%s %d %o`, objects inspected).
2. Appends the line to `logData` (unless `saveLogs === false`). This happens regardless of level filtering.
3. If `Levels[level] >= 30` (the fixed log level): `clearItems()`, then ends any dot line (see `Simple mode`), then `output.write(line + "\n")`, then schedules an item redraw if visual mode is on.
4. Otherwise nothing is printed. `debug` (10) and `verbose` (20) are therefore always suppressed in the current code. `info`, `log`, `warn`, `error` and `fyi` always print.

Prefix choice:

- If a one-shot prefix was set by `prefix(x)`, it is used once and cleared. It is consumed even when the line is filtered out. It is not colored.
- Otherwise the colored default prefix for the level is used. If `chalk.level` changed since the prefixes were built, they are rebuilt first with the current default prefix.
- Prefix color applies only when `color` is true, the level has a color in `LevelColors`, and `chalk.level > 0`. `info` and `none` have no color, so `info` and `log` use the plain prefix.

Logging does not remove items. It clears the live block, writes the line, then the block is redrawn on the next render tick, so items stay below the newest log line.

### `setPrefix(prefixStr?)`

```ts
setPrefix(prefixStr?: string): this
```

Sets the default prefix and rebuilds the per-level colored prefixes. `undefined` gives `"> "`. An empty string `""` is a valid prefix. The prefix text is colored per level with the colors in `LevelColors` when `color` is true and `chalk.level > 0`. Also records the current `chalk.level`.

### `prefix(x?)`

```ts
prefix(x?: string | false): this
```

Sets a one-shot prefix for the next log call only. `false` means an empty prefix for the next call. `undefined` cancels a pending one-shot prefix. `""` is an empty prefix. It overrides the colored default and is not colored.

### `addItem(options)`

```ts
addItem(options: ItemOptions): this
```

Adds a named item at the bottom of the item list. See `ItemOptions` for fields.

- If an item with the same `name` already exists, returns `this` with no change. The new options are ignored.
- Any currently running spinner on other items is restarted: its state resets to frame 0 and its line is rebuilt. This is so all spinners stay in step.
- `spinInterval` defaults to `100` (ms). `color` defaults to `"white"` when falsy. The display text is `options.display || String(name)`, colored with chalk using `color`.
- The initial line is `<display>: ` (empty message), with the spinner frame in front if the spinner starts.
- Spinners start only while visual mode is on at this moment (see `spinner` in `ItemOptions`).
- Does not draw immediately and does not schedule a render. The item shows on the next render, which is triggered by a log call, `updateItem` or `removeItem`.
- `color` must be a chalk color or modifier function name (such as `"red"`, `"green"`, `"bold"`) because the code calls `chalk[color](str)` when `color` is true. An unknown name throws a `TypeError` from `addItem`. When `color` is false in the logger, the name is not looked up and no error occurs.

### `hasItem(name)`

```ts
hasItem(name: string | symbol): boolean
```

`true` when an item with that name exists.

### `updateItem(name, data?)`

```ts
updateItem(name: string | symbol, data?: string | UpdateData): this
```

Does nothing (returns `this`) when no item has that name. Otherwise:

1. If `data` is not `undefined`, the item's text is replaced with `<display>: <msg>`:
   - String `data`: the string is the message, the display name is unchanged.
   - `UpdateData`: message is `data.msg || ""`. If `data.display` is truthy it replaces the display name for this and later updates (colored with the item's `color`). Without `display`, the item's current display text is kept.
   - The new text is saved to `logData` unless the item has `save === false` or `data._save === false`. Saved text is the whole `<display>: <msg>` line.
   - If `data._render === false`, returns now. The visible line is not refreshed and no dot is counted.
2. In visual mode:
   - With `data === undefined`, the spinner advances one frame. If the item has no running spinner, nothing happens and nothing is redrawn.
   - The item's line is rebuilt (spinner frame plus text) and a redraw is scheduled.
3. Not in visual mode: the item's stored line is set to the plain text (no spinner) and one update is counted for the dot output. In `simple` item type, one `.` is written every `updatesPerDot` updates. In `none` type nothing is written.

An update with `data` clears nothing in visual mode. Rendering is throttled to `renderFps`, so several updates in one interval produce one write.

### `removeItem(name)`

```ts
removeItem(name: string | symbol): this
```

No-op when the name is unknown. Otherwise: calls `clearItems()`, removes the item and its line, stops its spinner, and schedules a redraw of the remaining items. If no items remain, the redraw is skipped, so the live block disappears. The item's `logData` entries are kept.

### `setItemType(flag?)`

```ts
setItemType(flag?: string | false): this
```

Chooses how items are shown.

| flag | resulting type |
| --- | --- |
| `"normal"` | `normal`, but downgraded to `simple` when `output.isTTY()` is falsy at call time |
| `"simple"` | `simple` |
| `"none"`, `false`, `undefined`, `""`, any unknown string | `none` |

- Calls `output.isTTY()` directly. An `output` without an `isTTY` function throws a `TypeError` here only when `flag` is `"normal"`. (For other flags `isTTY` is not called.)
- When the type changes and visual mode was on, the live block is cleared and all spinners are stopped. When the change turns visual mode on, spinners are started for all items.
- Setting `simple` resets the dot counter to 0.
- Before any call to `setItemType`, the type is `normal`. On a non-TTY output visual mode is still off (the TTY check is also made on every render decision), but no dots are written either, because dots are only written when the type is exactly `simple`. Call `setItemType("simple")` or `setItemType("normal")` on a non-TTY to get dots.

### `clearItems()`

```ts
clearItems(): this
```

- Visual mode: cancels any pending redraw. If a frame has been drawn, calls `output.visual.clear()` and marks no frame drawn. If nothing was drawn, does nothing.
- Otherwise: if the type is `simple` and the dot count reached `maxDots`, writes `"\n"` and resets the count.

Items themselves are kept. A later update or log call redraws them.

### `freezeItems(showItems?)`

```ts
freezeItems(showItems?: boolean): this
```

Stops all spinners, cancels any pending redraw, clears a drawn frame, and ends a partial dot line (writes `"\n"` when the dot count is above 0). If `showItems` is truthy, writes the current item lines joined by `"\n"` plus a trailing `"\n"` with `output.write`. The lines are written as last stored, so a spinner frame may be included. (With no items, `showItems` writes a single `"\n"`.) Then saves the current item type and sets the type to `none`. Items are then not drawn, and updates only store text.

Calling `freezeItems` twice in a row saves `none` as the type to restore, so the following `unfreezeItems()` does not restore the display.

### `unfreezeItems()`

```ts
unfreezeItems(): this
```

If a non-`none` type was saved by `freezeItems`, restores it and restarts spinners for all items (if visual mode is on). Otherwise does nothing.

### `shutdown(showItems?)`

```ts
shutdown(showItems?: boolean): void
```

Calls `freezeItems(showItems)` and cancels any pending redraw. Use it before exit to leave a clean terminal. Timers are `unref`ed, so they never keep the process alive. The method returns nothing, but the logger can still be used and `unfreezeItems()` still works afterward.

## Rendering modes

Visual mode is evaluated on each decision as: item type is `normal`, and log level `<= Levels.info`, and the output reports a TTY. The TTY test is `output.isTTY()` coerced to boolean. An `output` where `isTTY` is not a function is treated as a TTY.

Visual mode (TTY):

- A redraw is scheduled with `setTimeout` at the render interval. The timer is `unref`ed. Only one is pending at a time, so writes are throttled to `renderFps`.
- On fire, if visual mode is still on and items exist, writes all item lines joined by `"\n"` (no trailing newline) with `output.visual.write`, which replaces the previous frame.
- Log lines go through `output.write`, after the frame is cleared with `output.visual.clear()`.
- Spinner timers: one `setInterval` per distinct `spinInterval`, unref'ed. Each tick advances every spinning item with that interval and schedules a redraw. A timer is cleared when no item with that interval is still spinning.

Simple mode (item type `simple`, or any item type on non-TTY after `setItemType("normal")`):

- Item updates write nothing but a `.` every `updatesPerDot` updates (only when `data` is not `_render: false`).
- Once the dot count reaches `maxDots`, a newline is written and the count resets (checked after each dot and when `clearItems` runs).
- Before a log line, or on `freezeItems`, a pending dot line is ended with `"\n"`.
- No spinner is shown and none runs.

None mode (`none`, or frozen): items are stored but never written. Log lines still print.

Color:

- `color: false` (or the `color` setter) turns off chalk use for prefixes and item display names. Item message text is never colored by the logger.
- With `color: true`, chalk decides the output. When chalk's level is 0 (for example not a TTY or `NO_COLOR`), escape codes are not emitted.
- Level prefixes are colored only when `chalk.level > 0`. Prefix colors are rebuilt lazily when `chalk.level` changes.

## `ItemOptions`

```ts
interface ItemOptions {
  name: string | symbol;
  color?: string;
  display?: string;
  spinner?: string | boolean | number;
  spinInterval?: number;
  save?: boolean;
  _display?: string;
  _msg?: string;
  _spinning?: SpinState;
  spinIx?: number;
}
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| `name` | `string \| symbol` | required | Unique key. Passed to `updateItem`, `hasItem`, `removeItem`. Duplicates are ignored by `addItem`. |
| `color` | `string` | `"white"` | chalk function name used for the display text. |
| `display` | `string` | `String(name)` | Label shown before the colon. |
| `spinner` | `string \| boolean \| number` | none | `true` selects `VisualLogger.spinners[1]`. A number from `0` to `3` selects that entry. A non-empty string is used as the frame list, one frame per character. `false` and `0`-length strings mean no spinner. A number outside `0..3` is kept as is and misbehaves (frames render as `undefined`), so avoid it. |
| `spinInterval` | `number` | `100` | Milliseconds between frames. Items with the same interval share one timer. |
| `save` | `boolean` | saved | When exactly `false`, `updateItem` does not add this item's updates to `logData`. |
| `_display` | `string` | computed | Internal. Overwritten by `addItem`. |
| `_msg` | `string` | computed | Internal. Overwritten by `addItem`. |
| `_spinning` | `SpinState` | internal | Internal spinner state: `0` off, `1` started, `2` running. |
| `spinIx` | `number` | internal | Internal current frame index. |

Spinner notes:

- The spinner only starts if visual mode is on when the item is added (or when visual mode is turned on later by `setItemType` or `unfreezeItems`). Otherwise `spinner` is stored and unused.
- The `spinner` value on the stored options is replaced with the resolved frame string when the spinner is first started.
- A rendered line is `<frame> <display>: <msg>` while spinning, and `<display>: <msg>` without a spinner. Frame indexing is by JavaScript string index, so frames outside the BMP would split. The built-in sets are all BMP.
- Do not set the underscore fields or `spinIx` yourself.

## `UpdateData`

```ts
interface UpdateData {
  msg?: string;
  display?: string;
  _save?: boolean;
  _render?: boolean;
}
```

| field | type | default | behavior |
| --- | --- | --- | --- |
| `msg` | `string` | `""` | The message shown after `<display>: `. A missing or empty `msg` shows an empty message. |
| `display` | `string` | item display | Replaces the label (colored with the item `color`). Falsy keeps the current label. |
| `_save` | `boolean` | saved | When exactly `false`, this update is not added to `logData`. |
| `_render` | `boolean` | renders | When exactly `false`, the item text is changed but the display is not refreshed and no dot is counted. |

## `Levels`

```ts
const Levels: {
  readonly debug: 10; readonly verbose: 20; readonly info: 30; readonly warn: 40;
  readonly error: 50; readonly fyi: 60; readonly none: 100;
}
type LogLevel = keyof typeof Levels; // "debug" | "verbose" | "info" | "warn" | "error" | "fyi" | "none"
```

A log method prints when its level value is `>=` the logger's level. The logger's level is a private field initialized to `Levels.info` (30) and no code changes it. Effects:

- `debug` and `verbose` never print (they are still saved to `logData`).
- `info`, `log`, `warn`, `error`, `fyi` print.
- `none` (100) has no log method.
- The `<= info` clause of visual mode is always true.

## `LevelColors`

```ts
const LevelColors: Record<LogLevel, string>
```

`{ debug: "blue", verbose: "cyan", info: "", warn: "yellow", error: "red", fyi: "magenta", none: "" }`. The value is the chalk color name used for that level's prefix. An empty string means no color. The object is mutable, but prefixes are built from it in `setPrefix`, so changes apply only after the next `setPrefix` call, `color` setter call or `chalk.level` change.

## `LogItemTypes`

```ts
const LogItemTypes: { readonly normal: 9; readonly simple: 1; readonly none: 0 }
type LogItemType = keyof typeof LogItemTypes; // "normal" | "simple" | "none"
```

- `normal`: live redrawn items (TTY only).
- `simple`: progress dots, for non-TTY output.
- `none`: items are not displayed.

## `defaultOutput`

```ts
const defaultOutput: OutputInterface
```

The output used when `options.output` is not given. Targets `process.stdout`:

- `isTTY()` returns `process.stdout.isTTY`. This is `true` on a TTY and `undefined` otherwise (read each call).
- `write(x)` calls `process.stdout.write(x)` and returns its boolean.
- `visual.write` is `log-update`'s function (replaces the previous frame in place). `visual.clear` is `log-update`'s `clear`.

## `OutputInterface` and `VisualOutput`

```ts
interface VisualOutput {
  write: (text: string) => void;
  clear: () => void;
}

interface OutputInterface {
  isTTY: () => boolean | undefined;
  write: (text: string) => boolean;
  visual: VisualOutput;
}
```

Custom output contract:

- `write(text)` receives log lines (with a trailing `"\n"`), dot characters, newline chars, and the `freezeItems(true)` listing.
- `visual.write(text)` receives the multi-line item block without a trailing newline. It must replace the previous block.
- `visual.clear()` removes the last block. It is called only after a block has been drawn.
- `isTTY()` is called with the output as `this` for the visual-mode check, and as a method call by `setItemType("normal")`. The type requires it, but at runtime visual-mode checks tolerate a missing one (treated as a TTY).
- `visual` is dereferenced only when a frame is drawn or cleared.

## Example

```js
import VisualLogger from "visual-logger";

const logger = new VisualLogger();
logger.setItemType("normal"); // dots instead when stdout is not a TTY
logger.addItem({ name: "build", color: "green", spinner: true });
logger.updateItem("build", "compiling");
logger.info("started");
logger.updateItem("build", { msg: "done", display: "built" });
logger.shutdown(true); // freeze and print the final item lines
```
