# item-queue reference

`item-queue` is an async item processing queue. It runs a `processItem` callback over queued items with bounded concurrency, supports pause and resume, emits events per item, and can report items that take too long. ESM only (`"type": "module"`). Runtime dependency: `xflight`.

## Imports

```js
import { ItemQueue } from "item-queue";
```

```ts
import {
  ItemQueue,
  type ItemQueueOptions,
  type ItemQueueHandlers,
  type ItemQueueResult,
  type WatchData,
} from "item-queue";
```

Everything is a named export from the package root. There is no default export and there are no subpaths (only `item-queue/package.json`).

Runtime exports: `ItemQueue`, `Inflight`.

Type-only exports: `ItemQueueData`, `WatchItemInfo`, `WatchData`, `ItemQueueResult`, `ItemQueueHandler`, `ItemQueueHandlers`, `ProcessCb`, `ItemQueueOptions`, `InflightRecord`, `RecordKey`.

Not exported: the internal `InflightData` type and the control symbols used for pause and resume. `Inflight` is `InflightStore` re-exported from `xflight` (not xflight's own `Inflight` class). `InflightRecord` is xflight's `InflightItem`.

## `ItemQueue`

```ts
class ItemQueue<ItemT = unknown> extends EventEmitter {
  constructor(options: ItemQueueOptions<ItemT>);
  static get pauseItem(): symbol;
  wait(): Promise<void>;
  start(): this;
  resume(): this;
  pause(): this;
  unpause(): this;
  addItem(item: ItemT, noStart?: boolean, stopOnError?: boolean): this;
  addItems(items: ItemT[], noStart?: boolean): this;
  setItemQ(itemQ: ItemT[], noStart?: boolean): this;
  deferProcess(): void;
  get isPause(): boolean;
  get isPending(): boolean;
  get count(): number;
}
```

`ItemQueue` extends Node's `EventEmitter`, so `on`, `once`, `off`, `removeListener` and the rest are available. `addItem`, `addItems`, `setItemQ`, `pause`, `unpause`, `start` and `resume` are chainable. Declared return types are inferred, so they are `this`-like instances of the class.

The queue is reusable. After `done` it accepts more items and runs again.

### Constructor and `ItemQueueOptions`

```ts
type ItemQueueOptions<ItemT = unknown> = {
  Promise?: PromiseConstructor;
  itemQ?: ItemT[];
  concurrency?: number;
  processItem: ProcessCb<ItemT>;
  stopOnError?: boolean;
  timeout?: number;
  watchPeriod?: number;
  watchTime?: number;
  handlers?: ItemQueueHandlers<ItemT>;
};
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| `processItem` | `ProcessCb<ItemT>` | none, required | Called once per item. See `ProcessCb`. |
| `itemQ` | `ItemT[]` | none | Initial items. Added with `addItems(itemQ, true)`, so they are copied and processing does not start. Call `start()`, `resume()` or an add method without `noStart`. |
| `concurrency` | `number` | `15` | Max items in flight. Uses `\|\|`, so `0`, `NaN` and `undefined` give `15`. A negative value is truthy and keeps no slot free, so no item ever starts. |
| `stopOnError` | `boolean` | `undefined` (falsy) | When truthy, the first failed item fails the queue. See Error handling. |
| `timeout` | `number` | none | Stored and never used. It has no effect. |
| `watchPeriod` | `number` (ms) | `500` | Interval between overdue checks. Uses `\|\|`, so `0` gives `500`. |
| `watchTime` | `number` (ms) | none | Elapsed time after which an in-flight item is reported by `watch`. Falsy (unset or `0`) disables the watcher entirely. |
| `handlers` | `ItemQueueHandlers<ItemT>` | none | Each own entry with a truthy value is registered with `this.on(name, fn)`. Any key name is registered, not only the known events. |
| `Promise` | `PromiseConstructor` | global `Promise` | Used to create the promises that `wait()` returns and the promises wrapped around `processItem` results. |

Throws `AssertionError` from the constructor:

- `"ItemQueue: must provide options.processItem callback"` when `options` is missing or `processItem` is not a function.
- `"ItemQueue: No Promise implementation available"` when neither `options.Promise` nor a global `Promise` exists.

### `ProcessCb`

```ts
type ProcessCb<ItemT> = (item: ItemT, id?: number) => Promise<unknown> | void;
```

- `item` is the queued item.
- `id` is a number from a counter that starts at `1` and grows by one for each item the queue starts. Internal resume items also take an id, so ids seen by `processItem` can skip numbers.
- A synchronous return value is wrapped with `Promise.resolve`. Any returned value with a `then` property is used as the promise. The resolved value becomes `res` in the `doneItem` data.
- A synchronous throw is caught and treated as a rejection of that item.
- A returned promise that rejects is a failed item. See Error handling.

### `addItem(item, noStart?, stopOnError?)`

Appends one item to the end of the queue. Sets the internal empty flag to `false`, so `empty` can fire again.

- `noStart`: when falsy, calls `deferProcess()`. When `true`, the queue is not started.
- `stopOnError`: stored on that item. Only `false` has an effect. See Error handling.
- Never throws and does not check the item. Returns the queue.
- If `item` is a `symbol`, it is treated as a control item, not data. See Quirks.

### `addItems(items, noStart?)`

Appends each item with `addItem(x, true)`, then calls `deferProcess()` unless `noStart` is truthy. Throws `AssertionError` `"item-queue: Must pass array to addItems"` when `items` is not an array. Items added this way cannot carry a per-item `stopOnError`. Returns the queue.

### `setItemQ(itemQ, noStart?)`

Replaces the not-yet-started items with a copy of `itemQ`. Items already in flight are not affected. Any queued pause or resume control item is discarded too. Sets the empty flag to `itemQ.length === 0`. Calls `deferProcess()` unless `noStart` is truthy. Throws `AssertionError` `"item-queue: Must pass array to setItemQ"` when `itemQ` is not an array. Returns the queue.

### `deferProcess()`

Schedules one processing pass with `process.nextTick`. Calls made before the tick runs collapse into one pass. The pass does not check `isPause` before starting, but a paused queue starts nothing (see `pause`). Returns `undefined`.

### `start()` and `resume()`

`start()` is exactly `resume()`.

`resume()` returns the queue at once and does the work on the next tick:

1. Set `isPause` to `false` (same as `unpause()`).
2. If the item queue is empty, push one internal resume item. It uses a concurrency slot, runs no callback, resolves immediately, and produces no `doneItem`.
3. Run one processing pass.

Consequences:

- Calling `start()` on a queue with no items still emits `empty` (once) and then `done`.
- If a pause control item is still in the queue, step 3 reaches it and pauses again. See Quirks.

### `pause()`

```ts
pause(): this
```

Puts a pause control item at the front of the queue (`unshift`). It does not set `isPause` and does not start any pass.

The pause takes effect when a processing pass reaches that item. A pass runs when an in-flight item settles, or on `start()`, `resume()` or `deferProcess()`. In-flight items always finish. When the pause item is reached:

- `isPause` becomes `true` and no further items start.
- If nothing is in flight, `pause` is emitted on the next tick.
- Otherwise `pause` is emitted when the last in-flight item settles.

Each `pause()` call queues another pause item. Because the item goes to the front, it runs before every item that is already queued.

### `ItemQueue.pauseItem`

```ts
static get pauseItem(): symbol
```

A special value you can pass to `addItem`, `addItems`, `setItemQ` or the `itemQ` option to pause at that position. Items before it start first. Type it with a cast when `ItemT` does not include `symbol`, for example `addItem(ItemQueue.pauseItem as any)`. All callers get the same symbol.

Pausing through it behaves like `pause()` except for its position.

### `unpause()`

Sets `isPause` to `false`. Returns the queue. It does not start processing and does not remove queued pause items.

### `wait()`

```ts
wait(): Promise<void>
```

Returns a promise that settles when the queue finishes. The check happens at call time:

1. If the queue has failed (stopOnError), returns a promise rejected with the stored error.
2. Else if `isPending` is true, returns a promise that resolves on the next `done` event and rejects on the next `fail` event with `data.error`.
3. Else returns a resolved promise at once.

Rules:

- The resolved value is the `done` payload object `{ startTime, endTime, totalTime }`, though the declared type is `void`.
- A `pause` event does not settle the promise. Waiting on a paused queue hangs until it is resumed and finishes.
- `wait()` does not start the queue. If items were added with `noStart`, the promise stays pending until something starts processing.
- If the queue is empty when `wait()` is called, it resolves at once even if `start()` was just called.
- Failed items without `stopOnError` do not reject `wait()`.
- Each call adds its own listeners, and they are removed once it settles.

### Properties

| property | type | behavior |
| --- | --- | --- |
| `isPause` | `boolean` | `true` once a pause item has been reached, until `unpause()` or `resume()` runs. It is `undefined` (not `false`) until the first pause or unpause. |
| `isPending` | `boolean` | `true` when anything is in flight or any item is queued, including control items. |
| `count` | `number` | In-flight count plus queued count. It includes internal pause and resume control items. |

### Events

Events are emitted with `EventEmitter.emit`. Listeners are synchronous. Register them with `on` or `options.handlers`. Names are exact and case sensitive.

```ts
type ItemQueueHandlers<ItemT = unknown> = {
  done?: (data: { startTime: number; endTime: number; totalTime: number }) => void;
  failItem?: ItemQueueHandler<ItemT>;
  fail?: ItemQueueHandler<ItemT>;
  doneItem?: ItemQueueHandler<ItemT>;
  pause?: () => void;
  empty?: () => void;
  watch?: (data: WatchData<ItemT>) => void;
};
type ItemQueueHandler<ItemT = unknown> = (data: ItemQueueResult<ItemT>) => void;
```

| event | payload | fires when |
| --- | --- | --- |
| `doneItem` | `ItemQueueResult` with `id`, `res`, `item` | A real item settled with a truthy-or-no error. `res` is the resolved value of the `processItem` result. |
| `failItem` | `ItemQueueResult` with `id`, `error`, `item` | A real item rejected or threw a truthy error. Emitted before `fail`. |
| `fail` | same data as the `failItem` that caused it | The failing item's `stopOnError` rule matched (see Error handling). Emitted once, right after `failItem`. |
| `empty` | none | The queued list is empty after an item settles and the empty flag is not set. The flag is then set, so it fires once until `addItem`, `addItems` or a non-empty `setItemQ` resets it. Items may still be in flight. Emitted before `done` in the same step. |
| `pause` | none | A pause item has been reached and nothing is in flight. |
| `done` | `{ startTime, endTime, totalTime }` | Nothing queued, nothing in flight, not paused, not failed. Times are ms epoch values and `totalTime = endTime - startTime`. |
| `watch` | `WatchData` | See Watch. |

Order within one item settling: `doneItem` or `failItem` (then `fail`), then `empty`, then either the next processing pass, or `pause` or `done` when nothing is in flight.

Control items (pause, resume and symbol items) never produce `doneItem` or `failItem`.

After the queue has failed, settling items emit nothing at all.

`done` can fire many times if the queue is reused. `startTime` is set once at the first processing pass and never reset, so `totalTime` on later `done` events includes idle time.

### Concurrency and ordering

- Items start in FIFO order. `addItem` appends. `pause()` is the only call that inserts at the front.
- A processing pass starts items while `queued > 0` and `inFlight < concurrency`. Passes run when an item settles (if not paused and items are queued), and from `deferProcess`, `start` and `resume`.
- Completion order is whatever the callbacks produce. The queue does not preserve result order.
- Items already in flight are never cancelled by pause, `setItemQ` or failure.
- `processItem` is called synchronously during a pass. Items added from inside a callback are picked up on a later tick via `deferProcess`.

### Error handling

A rejected promise or a synchronous throw from `processItem` marks the item failed. `failItem` fires with `error` set to the rejection reason.

An item counts as failed only when the reason is truthy. `Promise.reject(undefined)`, `reject(0)` or `reject("")` are reported as `doneItem`.

The queue fails when both are true: `options.stopOnError` is truthy and the item's own `stopOnError` is not `false`.

| queue `stopOnError` | item `stopOnError` | result |
| --- | --- | --- |
| falsy | any | `failItem` only. Queue keeps going. |
| truthy | `undefined` or `true` | `failItem` then `fail`. Queue fails. |
| truthy | `false` | `failItem` only. Queue keeps going. |

On a failed queue:

- `fail` is emitted once, and `done` is never emitted for that run.
- Items still in the queue are not started, and they stay queued, so `isPending` stays `true`.
- Items already in flight finish quietly with no events.
- `wait()` rejects with the error, including for calls made later.
- The failed state is permanent. There is no reset method.
- Without `stopOnError`, the queue always ends with `done` and `wait()` resolves, even if every item failed. Collect errors from `failItem`.

### Watch

Enabled only when `options.watchTime` is truthy. The watcher checks every `watchPeriod` ms, using an unref'd timer, so it does not keep the process alive. It first runs on the tick after the first processing pass, then repeats while items are in flight or a `watch` report is still open. It starts again on the next processing pass.

```ts
type WatchData<ItemT = unknown> = {
  total: number;
  watchTime: number;
  watched: WatchItemInfo<ItemT>[];
  still: WatchItemInfo<ItemT>[];
};
type WatchItemInfo<ItemT = unknown> = {
  item: ItemT;
  promise: Promise<unknown>;
  time: number;
};
```

On each check, every in-flight item with elapsed time `>= watchTime` is reported:

- In `watched` when at least `watchTime` ms passed since the item's last report (or its start). Reporting resets that timer.
- In `still` otherwise.

`total = watched.length + still.length`. `time` is ms since the item started. `promise` is the internal promise the queue tracks for the item, which settles after the queue handled the item, not the promise your callback returned. An item with a `watched` entry is next reported as `watched` only after another `watchTime` ms. If `watchPeriod` is shorter than `watchTime`, the in-between checks list it in `still`.

If a `watch` event was emitted earlier and a later check finds no overdue items, one last `watch` is emitted with `total: 0` and empty arrays. A final check also runs right before `done`.

### Types

```ts
type ItemQueueData<ItemT = unknown> = {
  item: ItemT;
  stopOnError?: boolean;
  promise?: Promise<unknown>;
  _control?: symbol;
};
type ItemQueueResult<ItemT = unknown> = ItemQueueData<ItemT> & {
  id: number;
  res?: ItemT;
  error?: Error;
};
```

- `ItemQueueData` is the wrapper stored for each queued item. `promise` is declared but never set by the code. `_control` is internal and set only for control items.
- `ItemQueueResult` is the payload of `doneItem`, `failItem` and `fail`. Real payloads contain `id`, `item`, `stopOnError` (the per-item value, usually `undefined`), and either `res` or `error`.
- `res` is typed `ItemT` but is really the resolved value of `processItem`. `error` is typed `Error` but is whatever the item rejected with.

### Quirks

- A `symbol` passed as an item is treated as a control item. Its `item` becomes `undefined`. If it is not `ItemQueue.pauseItem`, `processItem` is still called with `undefined`, and no `doneItem` or `failItem` fires for it.
- `pause()` then `resume()` on an idle queue, before any pass has reached the pause item, ends paused. The pass reached by `resume()` consumes the pause item, so `pause` is emitted and no items start. Call `resume()` again.
- After a stopOnError failure, `addItem` without `noStart` starts a pass that still starts items. Their results are silent because the queue is failed.
- The per-item `stopOnError` flag can only turn failure off for one item. `addItem(x, false, true)` does not fail a queue whose own `stopOnError` is falsy.
- `empty` is not emitted if `setItemQ([])` was called while items were in flight. `done` still follows.
- `concurrency` below `0` stalls the queue. Items stay queued.

## `Inflight`

```ts
class Inflight<V = unknown> {
  add(key: RecordKey, value: V, now?: number): V;
  get(key: RecordKey): V | undefined;
  remove(key: RecordKey): void;
  entries(): IterableIterator<[RecordKey, InflightRecord<V>]>;
  get isEmpty(): boolean;
  get count(): number;
  getStartTime(key: RecordKey): number | undefined;
  time(key: RecordKey, now?: number): number;
  elapseTime(key: RecordKey, now?: number): number;
  getCheckTime(key: RecordKey): number | undefined;
  lastCheckTime(key: RecordKey, now?: number): number;
  elapseCheckTime(key: RecordKey, now?: number): number;
  resetCheckTime(key?: RecordKey, now?: number): this;
}
type RecordKey = string | number | symbol;
type InflightRecord<V> = { readonly start: number; lastXTime: number; value: V };
```

This is the keyed time-tracking store that `ItemQueue` uses internally. It is the `InflightStore` class from `xflight`, re-exported under the name `Inflight`. It is separate from `xflight`'s own `Inflight` (promise de-duplication) class.

- `add` throws `AssertionError` `"xflight: item <key> already exist"` for a key already tracked. It stores `start` and `lastXTime` as `now`, or `Date.now()`.
- `remove` throws `AssertionError` `"xflight: removing non-existing item <key>"` when the key is unknown.
- `time` and `lastCheckTime` return elapsed ms since start or last check, or `-1` for an unknown key. `elapseTime` and `elapseCheckTime` are aliases.
- `resetCheckTime(key)` sets `lastXTime` for one key. Without a key it resets all of them. An unknown key is ignored.
- `ItemQueue` does not expose its own instance, so this export is only useful as a standalone helper.
