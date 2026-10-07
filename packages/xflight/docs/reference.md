# xflight reference

`xflight` dedupes inflight async work by key. `Inflight.promise(key, factory)` runs the factory once per key while its promise is pending and hands every concurrent caller the same promise. It has no runtime dependencies. ESM only (`"type": "module"`).

## Imports

```js
import Inflight from "xflight";
import { Inflight, InflightStore } from "xflight";
```

```ts
import type { Timestamp, RecordKey, PromiseFactory, InflightItem } from "xflight";
```

Runtime exports: `Inflight` (named and default), `InflightStore`.

Type-only exports: `Timestamp`, `RecordKey`, `PromiseFactory`, `InflightItem`.

Not exported: the internal `assert` helper. There are no subpaths (only `xflight/package.json`). The default export is the same class as the named `Inflight` export, so `Inflight` is the only name that matters for deduplication.

## Types

```ts
type Timestamp = number;                       // ms since epoch
type RecordKey = string | number | symbol;     // any Map key of these kinds
type PromiseFactory<T> = () => Promise<T>;

interface InflightItem<V> {
  readonly start: Timestamp;     // when the entry was added
  lastXTime: Timestamp;          // last check time, set to start on add
  readonly value: V;             // the tracked value
}
```

Keys are compared by `Map` identity rules (`SameValueZero`). `1` and `"1"` are different keys.

## `InflightStore<V>`

```ts
class InflightStore<V = unknown> {
  protected readonly _inflights: Map<RecordKey, InflightItem<V>>;
  add(key: RecordKey, value: V, now?: Timestamp): V;
  get(key: RecordKey): V | undefined;
  remove(key: RecordKey): void;
  entries(): IterableIterator<[RecordKey, InflightItem<V>]>;
  get isEmpty(): boolean;
  get count(): number;
  getStartTime(key: RecordKey): Timestamp | undefined;
  time(key: RecordKey, now?: Timestamp): number;
  elapseTime(key: RecordKey, now?: Timestamp): number;
  getCheckTime(key: RecordKey): Timestamp | undefined;
  lastCheckTime(key: RecordKey, now?: Timestamp): number;
  elapseCheckTime(key: RecordKey, now?: Timestamp): number;
  resetCheckTime(key?: RecordKey, now?: Timestamp): this;
}
```

A keyed store of in-progress work with start-time and last-check-time tracking. It stores any value type `V` and knows nothing about promises. It has no constructor arguments. `Inflight` extends it, so every method below also exists on `Inflight`. Use `InflightStore` directly when the tracked value is not a promise, or when keys are numbers.

The store never removes entries on its own. The caller calls `remove`. Nothing here settles, awaits or times out anything.

`now` is a caller-supplied timestamp in ms, used for tests or a shared clock. It is checked with `??`, so `0` is honored. When omitted it is `Date.now()`.

### `add(key, value, now?)`

Tracks `value` under `key` and returns `value`. Sets `start` and `lastXTime` to `now ?? Date.now()`.

Throws `Error("xflight: item <key> already exist")` when the key is present. The key is printed with `String(key)`.

### `get(key)`

Returns the tracked value, or `undefined` when the key is absent. Does not touch timestamps.

### `remove(key)`

Deletes the entry and returns `undefined`. Throws `Error("xflight: removing non-existing item <key>")` when the key is absent. Calling `remove` twice for one key throws on the second call.

### `entries()`

Returns the live `Map` iterator of `[key, record]` pairs, in insertion order. `record` is the `InflightItem`, so `record.value`, `record.start` and `record.lastXTime` are readable. The records are the stored objects, not copies. Because it is a live iterator, adding or removing entries while iterating follows `Map` iteration rules.

### `isEmpty`, `count`

Getters, not methods. `isEmpty` is `true` when there are no entries. `count` is the number of entries.

### Timing methods

| Method | Returns |
| --- | --- |
| `getStartTime(key)` | `start` of the entry, or `undefined` when absent |
| `time(key, now?)` | `(now ?? Date.now()) - start`, or `-1` when absent |
| `elapseTime(key, now?)` | alias of `time` |
| `getCheckTime(key)` | `lastXTime` of the entry, or `undefined` when absent |
| `lastCheckTime(key, now?)` | `(now ?? Date.now()) - lastXTime`, or `-1` when absent |
| `elapseCheckTime(key, now?)` | alias of `lastCheckTime` |

None of these throw. `-1` marks a missing key. A real elapsed value can also be negative if `now` is earlier than the stored time, so `-1` alone is not proof of absence. Use `get` or `getStartTime` to test presence.

`lastXTime` starts equal to `start`. Only `resetCheckTime` changes it. Reading it never updates it.

### `resetCheckTime(key?, now?)`

Sets `lastXTime` to `now ?? Date.now()` and returns `this` for chaining.

- With a key: updates that entry. An absent key is a silent no-op, no throw.
- With no key (or `undefined`): updates every entry to the same timestamp.

`start` is never changed.

## `Inflight<T>`

```ts
class Inflight<T = unknown> extends InflightStore<Promise<T>> {
  readonly Promise: PromiseConstructor;
  constructor(PromiseImpl?: PromiseConstructor);
  promise(key: RecordKey, factory: PromiseFactory<T>): Promise<T>;
}
export default Inflight;
```

All entries hold `Promise<T>` values. One `T` applies to every key of an instance. Inherited methods are documented under `InflightStore<V>` with `V = Promise<T>`.

### Constructor

| Argument | Type | Default | Behavior |
| --- | --- | --- | --- |
| `PromiseImpl` | `PromiseConstructor` | `globalThis.Promise` | Stored as the public readonly property `inflight.Promise`. |

Nothing is thrown. No Promise library is detected or loaded. The custom implementation is used for exactly one thing: building the rejected promise that `promise()` returns when the factory fails (see below). Promises returned by the factory are stored and returned unchanged, whatever their class.

### `promise(key, factory)`

Returns the promise tracked for `key` if one exists. Otherwise calls `factory()` once, tracks the result, and returns it.

Flow:

1. `get(key)` is truthy: return that stored promise. The factory is not called.
2. Call `factory()` with no arguments.
3. If the result is falsy or has no function `then`, fail (see below). Any object with a `then` function is accepted. It need not be a native promise.
4. Store it with `add(key, p)` (start and check time set to now). Attach `then(cleanup, cleanup)` to it.
5. Return `p` itself, not a wrapper.

What callers receive:

- First caller and every concurrent caller get the identical object (`===`) returned by the factory. Success value, rejection reason and any extra methods of a custom promise class are the same for all of them.
- On resolve or reject, all holders of that promise see the same outcome. There is no per-caller copy and no retry.
- The factory runs once per key per inflight period. Arguments, closures and side effects of later callers' factories are discarded because those factories are never called.

When an entry is removed:

- The entry is deleted when the stored promise settles, resolved or rejected. The delete happens in a handler attached when the entry was added, so it runs before handlers attached later by callers.
- Cleanup uses a plain map delete. It does not throw if the entry was already removed manually.
- Cleanup handles the rejection of its own derived promise only. The promise `p` returned to the caller still rejects normally, so callers must handle it.
- After settle, the next `promise(key, ...)` call runs its factory again. A resolved result is not cached.

When no entry is created:

- If `factory()` throws synchronously, the error is caught and `promise()` returns `this.Promise.reject(err)`. No entry exists. The next call for that key calls the factory again. `promise()` itself never throws for factory errors.
- If `factory()` returns a non-thenable (including `undefined`, `null`, `0`, `""`), `promise()` returns a rejected promise with `Error("xflight: promiseFactory for key <key> didn't return a promise")`. No entry exists.
- A factory that returns a promise that is already rejected does add an entry. It is removed after the cleanup handler runs, a microtask later.

Because sync failures come back as rejected promises, `promise()` always returns a thenable and callers need only one error path.

```ts
const inflight = new Inflight<Response>();
const [a, b] = await Promise.all([
  inflight.promise("user:123", () => fetch("/api/user/123")),
  inflight.promise("user:123", () => fetch("/api/user/123")),
]);
// one fetch, a === b
```

### Manual use with inherited methods

`add` on an `Inflight` is typed `add(key, value: Promise<T>, now?)`. It adds no cleanup handler. An entry added with `add` stays until `remove` is called, even after its promise settles. `promise(key, ...)` for such a key returns the stored promise, settled or not.

Other `InflightStore` behaviors carry over: `add` throws on a duplicate key, `remove` throws on an absent key, `get` returns `undefined` when absent.

## Edge cases and caveats

- Manual `remove(key)` then a new `promise(key, f2)` while the first promise `p1` is still pending: when `p1` settles, its cleanup deletes `key` unconditionally. That drops the entry for the newer promise `p2`, even though `p2` is still pending. A third caller then starts a new factory run. Cleanup does not check that the stored value is still `p1`.
- `promise()` checks `get(key)` for truthiness. A falsy value stored with the inherited `add` (possible only by bypassing types) is treated as absent, and the following `add` throws `already exist`. That error is caught, so `promise()` returns a rejected promise.
- Timing data is by `Date.now()`, so it is wall clock, not monotonic.
- Elapsed time is not auto-tracked against a timeout. `Inflight` never cancels or times out a pending factory. Sweep `entries()` with `time` or `lastCheckTime` for overdue detection.
- `Symbol` keys work and are printed in error messages through `String(key)`.
