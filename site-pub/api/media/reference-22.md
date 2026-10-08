# xaa reference

`xaa` provides small async/await and Promise helpers: delay, deferred promises, timeouts, and sequential or concurrent array iteration. It has no runtime dependencies. ESM only (`"type": "module"`).

## Imports

```js
import { delay, map, timeout } from "xaa";
import * as xaa from "xaa";
```

Everything is a named export from the package root. There is no default export and there are no subpaths (only `xaa/package.json`). Use `import * as xaa` to get an `xaa.` namespace.

Runtime exports: `isPromise`, `Defer`, `makeDefer`, `defer` (alias of `makeDefer`), `TimeoutError`, `delay`, `TimeoutRunner`, `timeout`, `runTimeout`, `mapSeries`, `map`, `each`, `filter`, `tryCatch`, `try` (alias of `tryCatch`), `wrap`.

Type-only exports: `MapError`, `MapOptions`, `MapContext`, `MapFunction`.

Not exported: the types `Task`, `Tasks`, `Runnable`, `TimeoutRunnerOptions`, `Consumer`, `Producer`, `Predicate`, `ValueOrErrorHandler`. `TimeoutRunnerOptions` appears in signatures but cannot be imported by name. There is no `defeer` export (a doc comment in the source mentions it, the code does not define it). `try` is a reserved word, so import it with a rename: `import { try as attempt } from "xaa"`, or use `xaa.try`.

## `isPromise(p)`

```ts
function isPromise<T>(p: any): p is Promise<T>
```

Returns a truthy value when `p` has both `then` and `catch` as functions. A thenable with only `then` is not a promise here.

The return value is not strictly boolean. For a falsy `p` (`null`, `undefined`, `0`, `""`) it returns `p` itself. Other values give `true` or `false`.

`map`, `mapSeries` and `each` use this check to decide whether an array item is awaited. `tryCatch` uses it to tell a promise from a function. A thenable without `catch` is treated as a plain value by these helpers.

## `Defer<T>` and `makeDefer`

```ts
class Defer<T> {
  constructor(ThePromise?: PromiseConstructor); // default global.Promise
  promise: Promise<T>;
  resolve: (result?: T) => void;
  reject: (reason?: any) => void;
  done: (err: Error, ...args: any[]) => void;
}

function makeDefer<T>(ThePromise?: PromiseConstructor): Defer<T>
const defer: typeof makeDefer // same function
```

A promise whose `resolve` and `reject` are exposed as properties. `makeDefer(P)` is `new Defer(P)`. `ThePromise` is used to build `promise`, so a custom constructor (such as Bluebird) can be supplied.

- `resolve` and `reject` are the Promise executor functions. Settling more than once is a no-op.
- `done(err, ...args)` is a Node-style callback. A truthy `err` calls `reject(err)`. Otherwise it calls `resolve(args[0])`. Arguments after the first result are dropped.
- `resolve`, `reject` and `done` are own properties bound at construction, so they can be passed as detached callbacks.
- `done` is not declared with an optional `err`, so call it as `done(null, value)`.
- Nothing is thrown by the constructor or by these methods.

```js
const d = xaa.makeDefer();
emitter.once("event", data => d.resolve(data));
const data = await d.promise;
```

## `TimeoutError`

```ts
class TimeoutError extends Error {
  constructor(msg: string);
}
```

`name` is `"TimeoutError"`. Thrown by `timeout().run()`, `runTimeout()` and `TimeoutRunner.cancel()`.

The constructor calls `assert(msg)` after `super(msg)`. An empty or falsy `msg` throws a Node `AssertionError` instead of creating the error. See `timeout` for the consequence of an empty `rejectMsg`.

## `delay(delayMs, valOrFunc?)`

```ts
function delay(delayMs: number): Promise<void>
function delay<T = void>(delayMs: number, valOrFunc: T): Promise<T>
```

Waits `delayMs` using `setTimeout`, then resolves.

- If `valOrFunc` is a function, it is called after the wait with no arguments, lazily. Its return value is the result, and a returned Promise is awaited.
- Otherwise `valOrFunc` is the result. A Promise passed as a value is adopted by the async return.
- With no second argument, the result is `undefined`.
- If the function throws or rejects, the returned promise rejects with that error.
- `delayMs` follows `setTimeout` rules. Negative, `NaN` and `undefined` behave like the minimum timer delay.
- There is no cancel. The timer is not unref'd, so it keeps the process alive until it fires.
- Declared typing note: the overload types the second argument as `T`, not as a function. TypeScript users passing a function get `Promise<() => X>` from the overload, though the runtime returns the function's result.

```js
await xaa.delay(500);
await xaa.delay(500, "Result");
await xaa.delay(500, () => "Result");
```

## `timeout(maxMs, rejectMsg?, options?)`

```ts
function timeout<T>(
  maxMs: number,
  rejectMsg?: string, // default "xaa TimeoutRunner operation timed out"
  options?: TimeoutRunnerOptions // default { TimeoutError, Promise: global.Promise }
): TimeoutRunner<T>

type TimeoutRunnerOptions = {
  TimeoutError: typeof TimeoutError;
  Promise: PromiseConstructor;
}
```

Creates a `TimeoutRunner` and starts its timer immediately, at creation, not when `run()` is called.

| Parameter | Type | Default | Behavior |
| --- | --- | --- | --- |
| `maxMs` | number | none | Milliseconds until the runner rejects with `TimeoutError`. |
| `rejectMsg` | string | `"xaa TimeoutRunner operation timed out"` | Message of the `TimeoutError`. The default applies only when the argument is `undefined`. |
| `options` | `TimeoutRunnerOptions` | `{ TimeoutError, Promise: global.Promise }` | Both fields are required if `options` is passed. `TimeoutError` is the class constructed on timeout. `Promise` is used for `Promise.all`, `Promise.race` and the internal defer. |

Edge cases:

- Passing `rejectMsg` as `""` skips the default. When the timer fires, `new TimeoutError("")` throws inside the timer callback. That surfaces as an uncaught exception, not a rejection.
- If the timer fires before `run()` is called, the internal rejection is stored. It becomes an unhandled rejection unless `run()` attaches to it. A later `run()` still rejects with the `TimeoutError`, though its tasks are started anyway.
- The timeout does not cancel running tasks. The runner stops waiting. The tasks continue.

```js
await xaa.timeout(1000, "timeout fetching data").run(() => fetch(url));
await xaa.timeout(1000).run([promise1, promise2]);
```

## `TimeoutRunner<T>`

```ts
class TimeoutRunner<T> {
  constructor(maxMs: number, rejectMsg: string, options: TimeoutRunnerOptions);
  run<U extends Runnable<T>>(tasks: U): Promise<T | T[]>;
  cancel(msg?: string): void; // default "xaa TimeoutRunner operation cancelled"
  clear(): void;
  hasError(): boolean;
  hasResult(): boolean;
  isDone(): boolean;
  maxMs: number;
  rejectMsg: string;
  error?: Error;
  result?: T | T[];
  ThePromise: PromiseConstructor;
  TimeoutError: typeof TimeoutError;
}
```

Prefer `timeout()` or `runTimeout()` over constructing this directly. The constructor takes all three arguments with no defaults, and starts the timer at once.

Task type accepted by `run` (not exported): `Task<T> = Promise<T> | (() => Promise<T>)`. An array form is `Task` per element.

### `run(tasks)`

- A non-array `tasks` is one task. An array is a list of tasks. Detection uses `Array.isArray`.
- Each task is processed as: a function is called with no arguments and its result used, anything else is used as is. Despite the type, non-promise values such as `"some value"` pass through as results. Functions are called when `run` is called, all in array order, synchronously before any await.
- A function that throws synchronously becomes a rejection, because the processing step is async.
- An array runs concurrently and resolves like `Promise.all`: results are in task order, not completion order. The first rejection rejects the run.
- The run races the tasks against the timer. If the timer wins, `run` rejects with `TimeoutError(rejectMsg)`.
- On success the timer is cleared, `result` is set, and `result` is returned. On any failure the timer is cleared, `error` is set, and the error is rethrown unchanged (task errors keep their identity).
- Tasks already started are never cancelled. After a timeout or `cancel`, their later results or errors are ignored.
- Calling `run` more than once on one runner is not guarded. The timer is already cleared after the first run, so later runs have no timeout and overwrite `result` or `error`.

### Other members

| Member | Behavior |
| --- | --- |
| `cancel(msg?)` | Clears the timer and rejects the internal promise with `new TimeoutError(msg)`. A pending `run` rejects with it. `msg` defaults to `"xaa TimeoutRunner operation cancelled"`. An empty string throws `AssertionError` from `TimeoutError`. If `run` was never called, the rejection is unhandled until it is. |
| `clear()` | Clears the timer handle only. Does not settle anything. Safe to call repeatedly. |
| `hasError()` | True once `run` has failed. Uses an own-property check on `error`. |
| `hasResult()` | True once `run` has succeeded. Uses an own-property check on `result`. |
| `isDone()` | `hasResult() \|\| hasError()`. |
| `error`, `result` | Set by `run` only. Absent before. A successful run whose result is `undefined` still has `hasResult()` true. |
| `maxMs`, `rejectMsg`, `ThePromise`, `TimeoutError` | The values given at construction. |

## `runTimeout(tasks, maxMs, rejectMsg?, options?)`

```ts
function runTimeout<T>(tasks: Task<T>, maxMs: number, rejectMsg?: string, options?: TimeoutRunnerOptions): Promise<T>
function runTimeout<T extends readonly any[]>(tasks: Tasks<T>, maxMs: number, rejectMsg?: string, options?: TimeoutRunnerOptions): Promise<T[]>
```

Equivalent to `timeout(maxMs, rejectMsg, options).run(tasks)`. Defaults, ordering, errors and no-cancel behavior are the same as `timeout` and `run`. `undefined` for `rejectMsg` or `options` selects the defaults.

## `map(array, func?, options?)`

```ts
function map<T, O>(
  array: readonly T[],
  func?: MapFunction<T, O>,
  options?: MapOptions // default { concurrency: 50 }
): Promise<O[]>

type MapFunction<T, O> = (value: Awaited<T>, index: number, context: MapContext<T>) => O | Promise<O>

type MapOptions = {
  concurrency: number;
  thisArg?: any;
}

type MapContext<T> = {
  failed?: boolean;
  array: readonly T[];
  assertNoFailure: () => void;
}

interface MapError<T> extends Error {
  partial: T[];
}
```

Maps an array with a callback and an in-flight limit. Similar to `bluebird.map`.

### Options

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `concurrency` | number | 50 when `options` is omitted | Maximum callbacks in flight. Greater than 1 uses the concurrent engine. 1, 0, negative, or `undefined` use `mapSeries`. |
| `thisArg` | any | `undefined` | `this` inside `func`. Use a non-arrow function. |

The default of 50 applies only when the whole `options` argument is omitted. `{ thisArg }` alone has no `concurrency`, which means serial.

### Behavior

- `array` must satisfy `Array.isArray`. Otherwise `map` rejects with an `AssertionError` with message `xaa.map expecting an array but got <typeof array>`. The rejection is a promise rejection, not a sync throw.
- Result order matches input order, not completion order. An empty array resolves `[]`.
- Items that pass `isPromise` are awaited and `func` receives the resolved value. A rejected item fails the whole map. A thenable without `catch` is passed to `func` as is.
- Concurrent mode starts up to `concurrency` callbacks synchronously on call, then starts the next item as each completes. A slot is held by an item while its promise is awaited.
- `func` may return a value or a promise. A returned promise is awaited by the slot.
- `func` is called with `(value, index, context)`.
- `func` omitted: the call throws a `TypeError`, which is reported as a failure.

### Failure

- The first failure rejects `map` with the original error object. Its `partial` property is set to the result array so far.
- In concurrent mode, `partial` is the live result array with the full input length. Unfinished slots are holes, and it may keep filling as in-flight callbacks finish. In serial mode it holds only completed results, dense.
- No new items start after a failure. In-flight callbacks are not cancelled. Their later failures are ignored.
- `context.failed` becomes true at failure. `context.assertNoFailure()` throws `new Error("assertNoFailure")` when `failed` is true. A long-running callback can call it to stop early.
- `partial` is assigned on the thrown value. If that value is not an object (for example a thrown string), the assignment throws a `TypeError` in strict mode, which is what the caller then sees.
- Concurrent mode, known gap: a synchronous throw from `func` when the item was a promise is not caught. It becomes an unhandled rejection and the `map` promise never settles. Synchronous throws for non-promise items are handled as normal failures. Return a rejected promise or use an `async` function to avoid this.

```js
const pages = await xaa.map(urls, async url => (await fetch(url)).text(), { concurrency: 2 });
```

## `mapSeries(array, func?, options?)`

```ts
function mapSeries<T, O>(array: readonly T[], func?: MapFunction<T, O>, options?: MapOptions): Promise<O[]>
```

Serial map. Exported, and `map` calls it when `concurrency <= 1`.

- Iterates with `for...of`. It does not check `Array.isArray`, so any iterable works. Non-iterables throw `TypeError` as a rejection.
- Each item: an `isPromise` item is awaited, then `await func.call(options?.thisArg, item, i, context)`. One callback at a time, in order.
- `options` is optional and only `thisArg` is read. `concurrency` is ignored.
- On any error, `context.failed` is set, `error.partial` is set to the completed results (dense array), and the original error is rethrown.
- Same non-object error caveat as `map` for `partial`.

## `each(array, func)`

```ts
function each<T>(array: readonly T[], func: Consumer<T>): Promise<T[]>
// Consumer<T> = (item: T, index?: number) => unknown
```

Async `forEach`. Serial, in order.

- Iterates with `for...of`, so any iterable works. No array check.
- Each item that passes `isPromise` is awaited first. Then `await func(item, index)`.
- Resolves to an array of the resolved items, not of the callback results.
- The first error from an item or the callback rejects with that error. Later items are not processed. There is no `partial`.
- There is no `thisArg` and no context argument.

```js
await xaa.each([1, 2, 3], async val => await xaa.delay(val));
```

## `filter(array, func)`

```ts
function filter<T>(array: readonly T[], func: Predicate<T>): Promise<T[]>
// Predicate<T> = (item: T, index?: number) => boolean | Promise<boolean>
```

Async filter. Concurrency is fixed at 1: each predicate result is awaited before the next call.

- Iterates by index up to `array.length`, so array-likes work.
- Items are not awaited. A promise item is passed to `func` as is, and a kept promise is returned as is.
- Keeps the original item when the awaited result is truthy.
- A predicate error rejects with that error. There is no `partial`.
- Resolves to a new array in input order.

## `tryCatch(funcOrPromise, valOrFunc?)` and `try`

```ts
function tryCatch<T, TAlt>(
  funcOrPromise: Promise<T> | (() => T | Promise<T>),
  valOrFunc?: ValueOrErrorHandler<TAlt>
): Promise<T | TAlt>

// ValueOrErrorHandler<T> = T extends Function ? never : T | Promise<T> | ((err?: Error) => T | Promise<T>)
```

`try` is the same function exported under a second name.

- If `funcOrPromise` passes `isPromise`, it is awaited. Otherwise it is called with no arguments and the result is awaited.
- On success, resolves to that value.
- On any exception or rejection, if `valOrFunc` is a function it is called with the error and its return value is the result. A returned Promise is adopted. Otherwise `valOrFunc` itself is the result, so omitting it gives `undefined`.
- Errors thrown by the `valOrFunc` handler propagate as a rejection.
- If `funcOrPromise` is neither a promise nor a function, calling it throws a `TypeError` that is caught like any other error, so the fallback is returned.
- It never rethrows the original error. Use `valOrFunc` to inspect it.
- A function passed as a plain fallback value is always treated as a handler. Wrap it as `() => fn` to return a function.

## `wrap(func, ...args)`

```ts
function wrap<T, F extends (...args: any[]) => T>(func: F, ...args2: Parameters<F>): Promise<T>
```

Calls `func(...args)` inside an async function and returns its result as a promise. Similar to `bluebird.try`.

- `func` is invoked synchronously during the `wrap` call.
- A synchronous throw becomes a rejection with the same error.
- A returned Promise is adopted. A returned value is wrapped.
- `this` is not bound.
