# aveazul reference

`aveazul` is a Bluebird-style drop-in layer on top of native `Promise`. `AveAzul<T>` is a class that `extends Promise<T>`, so `then`, `catch`, `finally`, `race`, `allSettled` and the rest are the native implementations, and `await` and interop work unchanged. Runtime dependencies: `xaa` (map, filter, delay, timeout, defer, wrap) and `@jchip/error` (`AggregateError`). The package is ESM (`"type": "module"`) with a CJS shim.

## Imports

```js
// ESM
import AveAzul from "aveazul";
import { AveAzul, Disposer, OperationalError, isOperationalError, isProgrammerError, promisify, promisifyAll } from "aveazul";

// CJS
const AveAzul = require("aveazul");
```

ESM runtime exports: `default` (the `AveAzul` class), `AveAzul`, `Disposer`, `OperationalError`, `isOperationalError`, `isProgrammerError`, `promisify`, `promisifyAll`.

Type-only exports: `MapOptions`, `AsCallbackOptions`, `FromCallbackOptions`, `Deferred`, `AveAzulClass`, `AveAzulInstance`, `PromisifyOptions`, `PromisifyAllOptions`.

CJS entry (`cjs-entry.cjs`, `main` and the `require` condition): `module.exports = Object.assign(m.default, m)` where `m` is the ESM module. `require("aveazul")` is the `AveAzul` class itself, with the named exports above copied on as static properties, plus `AveAzul` (the class), `default` (the class) and `__esModule`. There are no subpaths other than `aveazul/package.json`.

CJS caveat: `Object.assign` overwrites the class statics `promisify` and `promisifyAll` with the standalone functions of the same name. In CJS, and in an ESM process that has also loaded the CJS entry (both share one class object), `AveAzul.promisify` and `AveAzul.promisifyAll` use the global `Promise` instead of `AveAzul`. Results are then native promises without the Bluebird methods. In pure ESM the static versions return `AveAzul`. See `promisify` and `promisifyAll`.

Not exported: the `using` function and `addStaticAny` are internal, and so are the not-implemented helper functions. `Deferred` is a type only.

Behaviors shared by most methods:

- Static `resolve`, `reject`, `all`, `race`, `allSettled` and instance `then`, `catch`, `finally` are native. They construct through `this`, so they return `AveAzul` instances.
- The internal promise check (`isPromise`) is true for `instanceof Promise`, or an object with both `then` and `catch` functions. A thenable with only `then` is treated as a plain value by `each`, `reduce`, `spread`, `some`, `any` and `using`.
- Methods that take a collection are typed `Iterable`, but several only work for arrays at runtime. Details per method.

## `AveAzul` class

```ts
class AveAzul<T> extends Promise<T> {
  constructor(executor: (resolve: (v: T | PromiseLike<T>) => void, reject: (r?: unknown) => void) => void);
}
```

Same as `new Promise`. Instances are `instanceof Promise`.

## Static: native and re-declared

```ts
static resolve<U>(value: U | PromiseLike<U>): AveAzul<U>; static resolve(): AveAzul<void>;
static reject<U = never>(reason?: unknown): AveAzul<U>;
static all<U>(values: Iterable<U | PromiseLike<U>>): AveAzul<Awaited<U>[]>;
```

Inherited from `Promise`. They are re-declared with `declare static` (nothing emitted) so the return type is `AveAzul`. `race`, `allSettled`, `withResolvers` and any other native static in your Node are inherited the same way, with native semantics. `Promise.all` rejects with the first rejection.

## `AveAzul.delay(ms, value?)`

```ts
static delay<U>(ms: number, value?: U): AveAzul<U>
```

Resolves with `value` after `ms` using `xaa.delay`. With `value === undefined` it resolves with `undefined`. A function `value` is handled by xaa as a producer: `delay(1, () => 5)` resolves with `5` (observed).

## `AveAzul.map(items, fn, options?)`

```ts
static map<T, U>(
  value: Iterable<T | PromiseLike<T>>,
  fn: (item: T, index: number, length: number) => U | PromiseLike<U>,
  options?: MapOptions
): AveAzul<U[]>
interface MapOptions { concurrency?: number }
```

Same as `AveAzul.resolve(value).map(fn, options)`, so `value` may itself be a promise of an array.

| option | type | default | behavior |
|---|---|---|---|
| `concurrency` | `number` | `50` | `> 1` runs up to that many `fn` calls at once through xaa. Any other value (`0`, `1`, negative, or an `options` object without `concurrency`) runs one at a time in order. Bluebird's default is unbounded. |

The default applies only when `options` is `undefined`. Passing `{}` is serial.

Rules:

- The input must be an actual array at runtime. Anything else (`Set`, generator, number, `null`) rejects with an `AssertionError` from xaa: `xaa.map expecting an array but got object`.
- Promise items are awaited before `fn` is called. A rejected item rejects the result.
- Result order matches input order.
- The first error rejects the result and gets a `partial` property (array of results so far, possibly with holes). In-flight calls are not cancelled.
- The third `fn` argument is NOT `length` despite the type. It is xaa's context object `{ array, failed, assertNoFailure }`.
- `fn` is called with no `this`.

## `AveAzul.mapSeries(items, fn)`

```ts
static mapSeries<T, U>(value: Iterable<T | PromiseLike<T>>, fn: (item: T, index: number, length: number) => U | PromiseLike<U>): AveAzul<U[]>
```

`AveAzul.map(value, fn, { concurrency: 1 })`. Same array-only rule and third-argument caveat as `map`.

## `AveAzul.try(fn)`

```ts
static try<T>(fn: () => T | PromiseLike<T>): AveAzul<T>
```

Calls `fn` through `xaa.wrap`. A sync throw or rejected return becomes a rejection. A non-function `fn` rejects with `TypeError: func is not a function` (observed), it does not throw synchronously. No extra arguments or `this` are accepted.

## `AveAzul.props(obj)`

```ts
static props<T extends object>(obj: T): AveAzul<{ [K in keyof T]: Awaited<T[K]> }>
```

Resolves every own enumerable string-keyed value (`Object.keys`) with `AveAzul.all` and returns a new plain object with the same keys. A `Map` is not supported: it yields `{}`. `null` or `undefined` throws a `TypeError` synchronously (from `Object.keys`), not a rejection.

## `AveAzul.defer()`

```ts
static defer<T>(): Deferred<T>
interface Deferred<T> { promise: AveAzul<T>; resolve(value: T | PromiseLike<T>): void; reject(reason?: unknown): void }
```

Returns an `xaa` `Defer` built with `AveAzul` as the promise class. At runtime it also has a `done(err, value)` Node-callback property that is not in the type.

## `AveAzul.each(items, fn)`

```ts
static each<T>(items: Iterable<T | PromiseLike<T>>, fn: (item: T, index: number, length: number) => unknown): AveAzul<T[]>
```

`AveAzul.resolve(items).each(fn)`. See instance `each`.

## `AveAzul.reduce(array, fn, initialValue?)`

```ts
static reduce<T, U>(array: Iterable<T | PromiseLike<T>>, fn: (value: U, item: T, index: number, length: number) => U | PromiseLike<U>, initialValue?: U): AveAzul<U>
```

With 3 or more arguments `initialValue` is used even if it is `undefined`. With 2 arguments see instance `reduce`.

## `AveAzul.some(promises, count)`

```ts
static some<T>(promises: Iterable<T | PromiseLike<T>>, count: number): AveAzul<T[]>
```

`AveAzul.resolve(promises).some(count)`. See instance `some`.

## `AveAzul.any(promises)`

```ts
static any<T>(args: Iterable<T | PromiseLike<T>>): AveAzul<T>
```

Replaces native `Promise.any` (overwritten at module load).

- A non-iterable returns a rejected promise with `TypeError: expecting an array or an iterable object but got <x>`. `Set` input works.
- Empty input rejects with `RangeError: Input array must contain at least 1 items but contains only 0 items`.
- Resolves with the first fulfilled value. Non-promise items count as already fulfilled.
- If all reject, rejects with `new AggregateError(errors)` from `@jchip/error`. It has no message (empty string observed). Errors are in rejection order.

## `AveAzul.join(...args)`

```ts
static join(...args: any[]): AveAzul<any>
```

If there is more than one argument and the last is a function, awaits the earlier arguments with `AveAzul.all` and resolves with `handler(...results)`. Otherwise it resolves with `AveAzul.all(args)`. So `join(fn)` with a single function resolves to `[fn]` and `join()` resolves to `[]`.

## `AveAzul.method(fn)`

```ts
static method<T, Args extends any[]>(fn: (...args: Args) => T | PromiseLike<T>): (...args: Args) => AveAzul<T>
```

Returns a function that calls `fn` with the caller's `this` and arguments, giving an `AveAzul`. Sync throws become rejections. A non-function `fn` fails only when the wrapper is called, as a rejection.

## `AveAzul.promisify(fn, options?)`

```ts
static promisify<T = unknown>(fn: (...args: any[]) => void, options?: PromisifyOptions): (...args: any[]) => AveAzul<T>
```

Calls the standalone `promisify` with `Promise` forced to `AveAzul` (overrides `options.Promise`). Options and rules are in the standalone `promisify` section. In the CJS entry this static is replaced by the standalone function (see Imports).

## `AveAzul.promisifyAll(target, options?)`

```ts
static promisifyAll<T extends object>(target: T, options?: PromisifyAllOptions): T
```

Calls the standalone `promisifyAll` with `Promise` forced to `AveAzul`. Same CJS caveat as `promisify`.

## `AveAzul.using(...)`

```ts
static using<R>(resources: any, ...args: any[]): AveAzul<R>
```

The last argument is the handler. Two call forms:

- Variadic: `using(r1, r2, ..., handler)`, handler is called as `handler(...resolvedResources)`.
- Array: `using([r1, r2], handler)`, handler is called as `handler(resolvedArray)`. An array plus more than one trailing argument throws `TypeError: only two arguments are allowed when passing an array of resources`.

Each resource may be a `Disposer` (from `.disposer()`), a promise of a value or of a `Disposer`, or a plain value (no cleanup). Rules:

- No handler argument throws synchronously `TypeError: resrouces and handler function required` (the typo is in the source). A non-function handler throws synchronously `TypeError: handler must be a function`.
- Resources are acquired through `AveAzul.map` (default concurrency 50), so acquisition is concurrent.
- If any acquisition rejects, all successfully acquired resources are disposed, then the first acquisition error rejects the result. The handler is not called.
- After the handler settles (resolve, reject, or sync throw), resources are disposed in input order, one at a time, through `AveAzul.each`. Bluebird disposes in reverse order.
- A dispose function that throws does not reject the result. The errors are collected and thrown as `AggregateError("cleanup resources failed")` on `setTimeout(0)` via `___throwUncaughtError`, which crashes the process unless an `uncaughtException` handler exists.
- A rejected handler result is rethrown after disposal.

## `AveAzul.fromCallback(fn, options?)` and `AveAzul.fromNode`

```ts
static fromCallback<T>(fn: (callback: (err: Error | null, result?: T) => void) => void, options?: FromCallbackOptions): AveAzul<T>
static fromNode: typeof AveAzul.fromCallback // same function
interface FromCallbackOptions { multiArgs?: boolean }
```

Calls `fn` with a Node callback. A truthy `err` rejects. Otherwise it resolves with the first value, or with the array of all values when `options.multiArgs` is truthy. A sync throw from `fn` rejects.

## `AveAzul.isOperationalError`, `AveAzul.isProgrammerError`, `AveAzul.OperationalError`, `AveAzul.Disposer`

Static aliases of the standalone exports of the same names.

## `AveAzul.___throwUncaughtError(error)`

```ts
static ___throwUncaughtError(error: unknown): void
```

Internal. Schedules `setTimeout(() => { throw err }, 0)`. A non-`Error` is wrapped with `new Error(String(error))`. Used by `asCallback` and `using` for errors that must not be swallowed.

## `AveAzul.__notImplementedInstance`, `AveAzul.__notImplementedStatic`

```ts
static __notImplementedInstance?: string[]
static __notImplementedStatic?: string[]
```

Set at load by `setupNotImplemented`. They list the names from a fixed Bluebird list that the class lacked and that were replaced by throwing stubs. Observed values:

- Instance: `bind`, `isFulfilled`, `isRejected`, `isPending`, `isCancelled`, `value`, `reason`, `cancel`, `reflect`, `suppressUnhandledRejections`, `done`.
- Static: `filter`, `coroutine`, `coroutine.addYieldHandler`, `getNewLibraryCopy`, `noConflict`, `setScheduler`.

Calling a stub logs `console.error("<instance|static> <name> Not implemented in aveazul")` and throws an `Error` with the same text. `coroutine.addYieldHandler` is a single property literally named with a dot, not a nested member.

## Instance methods

### `then`, `catch`, `finally`

Native, typed to return `AveAzul`. `catch` takes only a handler. Bluebird's filtered catch `.catch(ErrorClass, handler)` is NOT supported: the class is used as the handler and called as a function. For example `.catch(TypeError, h)` resolves with a new `TypeError` object and never calls `h`.

### `tap(fn)`

```ts
tap(fn: (value: T) => unknown): AveAzul<T>
```

Awaits `fn(value)`, ignores its result and resolves with the original value. A throw or rejection from `fn` rejects the chain.

### `tapCatch(fn)`

```ts
tapCatch(fn: (err: Error) => unknown): AveAzul<T>
```

On rejection awaits `fn(err)` then rethrows the original error. A throw from `fn` replaces it. No filter overloads.

### `return(value)`

```ts
return<U>(value: U): AveAzul<U>
```

`.then(() => value)`.

### `throw(reason)`

```ts
throw(reason: unknown): AveAzul<never>
```

`.then(() => { throw reason })`. Skipped when this promise rejects.

### `catchReturn(value)`, `catchThrow(reason)`

```ts
catchReturn<U>(value: U): AveAzul<T | U>
catchThrow(reason: unknown): AveAzul<T>
```

`.catch(() => value)` and `.catch(() => { throw reason })`. No filter overloads.

### `error(handler)`

```ts
error(handler: (err: Error) => unknown): AveAzul<T>
```

Catches only operational errors (`isOperationalError(err)`: an `OperationalError` instance or an object with `isOperational === true`) and passes them to `handler`. Other errors are rethrown. `AGENTS.md` lists `error` as not implemented, but the code implements it.

### `get(key)`

```ts
get<K extends keyof T>(key: K): AveAzul<T[K]>
```

`.then(v => v[key])`. A `null` or `undefined` value rejects with a `TypeError`. Negative indexes are not special.

### `call(methodName, ...args)`

```ts
call(methodName: string, ...args: any[]): AveAzul<any>
```

Calls `value[methodName](...args)` with `this` set to the value. A missing or non-function member rejects with `TypeError: <name> is not a function`.

### `spread(fn)`

```ts
spread<U>(fn: (...args: any[]) => U | PromiseLike<U>): AveAzul<U>
```

For an array value: awaits promise elements one by one, replacing them in the original array in place, then calls `fn(...array)`. A non-array value calls `fn(value)`. A non-function `fn` returns a rejected promise with `TypeError: expecting a function but got <fn>` (no sync throw).

### `map(fn, options?)` and `mapSeries(fn)`

```ts
map<U>(fn: (item: any, index: number, length: number) => U | PromiseLike<U>, options?: MapOptions): AveAzul<U[]>
mapSeries<U>(fn: (item: any, index: number, length: number) => U | PromiseLike<U>): AveAzul<U[]>
```

The resolved value goes to `xaa.map` with `options`, default `{ concurrency: 50 }`. See `AveAzul.map` for the option table and rules. `mapSeries` is `map(fn, { concurrency: 1 })`. A non-array resolved value rejects with an `AssertionError`.

### `filter(fn)`

```ts
filter(fn: (item: any, index: number, length: number) => any): AveAzul<any[]>
```

Uses `xaa.filter`. Strictly sequential, no options (Bluebird has `concurrency`). It calls `fn(item, index)` only, so the third argument is `undefined`, not `length`. Items are not unwrapped first: `fn` receives the raw element (a promise element is passed as a promise) and the kept value is the raw element. Keeps elements whose awaited result is truthy. A value without `length` (such as a `Set`) resolves to `[]`. The static `AveAzul.filter` is a throwing stub, so use `AveAzul.resolve(arr).filter(fn)`.

### `each(fn)`

```ts
each(fn: (item: any, index: number, length: number) => unknown): AveAzul<any[]>
```

Sequential. For each element: awaits it if it is a promise, then awaits `fn(item, index, arr.length)`. Resolves with a new array of the awaited items. The `fn` results are ignored. Stops at the first rejection. A value without `length` (such as a `Set`) resolves to `[]`.

### `reduce(fn, initialValue?)`

```ts
reduce<U>(fn: (value: U, item: any, index: number, length: number) => U | PromiseLike<U>, initialValue?: U): AveAzul<U>
```

Sequential. Initial value detection is `arguments.length > 1`, so an explicit `undefined` counts as supplied. Without one, the first element is the accumulator and iteration starts at index 1. So an empty array resolves with `undefined` and a one-element array resolves with that element, with `fn` never called. A promise accumulator or element is awaited. A value without `length` (such as a `Set`) resolves to the initial value, or `undefined`.

### `props()`

```ts
props(): AveAzul<any>
```

Same as `AveAzul.props` applied to the resolved value.

### `all()`, `any()`, `some(count)`

```ts
all(): AveAzul<any[]>
any(): AveAzul<any>
some(count: number): AveAzul<any[]>
```

Apply `AveAzul.all`, `AveAzul.any` or the `some` algorithm to the resolved value, which must be an array or iterable (else rejects with `TypeError: expecting an array or an iterable object but got <x>`).

`some(count)` rules:

- `count` must satisfy `(count | 0) === count && count >= 0`, else returns a rejected promise with `TypeError: expecting a non-negative integer`.
- `count === 0` resolves with `[]` without waiting for this promise.
- `count` greater than the input length rejects with `RangeError: Input array must contain at least <count> items but contains only <len> items`.
- Resolves with exactly `count` values in fulfillment order. Non-promise items count as already fulfilled.
- Rejects with `AggregateError` (message `aggregate error`) once fewer than `count` items can still fulfil. Errors are in rejection order.

### `delay(ms)`

```ts
delay(ms: number): AveAzul<T>
```

After fulfillment waits `ms`, then passes the value through. Rejections pass through without the delay.

### `timeout(ms, message?)`

```ts
timeout(ms: number, message?: string): AveAzul<T>   // message defaults to "operation timed out"
```

Races this promise against a timer using `xaa.timeout(ms, message, ...).run(this)`. On timeout it rejects with `OperationalError(message)` (name `OperationalError`, `isOperational === true`). There is no `TimeoutError` class, and `message` is a string only. The timer is cleared when the promise settles. The underlying work is not cancelled.

### `disposer(fn)`

```ts
disposer(fn: (resource: T) => void | Promise<void>): Disposer<T>
```

Returns `new Disposer(fn, this)`, not a promise. Throws synchronously `TypeError: Expected a function` for a non-function `fn`. Use with `AveAzul.using`.

### `asCallback(cb, options?)` and `nodeify(cb, options?)`

```ts
asCallback(cb: ((err: Error | null, value?: T) => void) | ((err: Error | null, ...values: any[]) => void) | undefined | null, options?: AsCallbackOptions): AveAzul<T>
nodeify(cb, options?): AveAzul<T> // calls asCallback
interface AsCallbackOptions { spread?: boolean }
```

| option | type | default | behavior |
|---|---|---|---|
| `spread` | `boolean` | `false` | Only `=== true` counts. An array value is passed as separate arguments `cb(null, ...value)`. A non-array value is passed as `cb(null, value)`. |

- A non-function `cb` is ignored and the same promise is returned.
- On success calls `cb(null, value)`. On rejection calls `cb(reason)`.
- An exception thrown by `cb` is rethrown asynchronously through `___throwUncaughtError`.
- Returns `this`, not a new promise.

## Standalone exports

### `AveAzul` and `default`

The class above. The named and default exports are the same object.

### `promisify(fn, options?)`

```ts
function promisify<T = unknown>(fn: NodeStyleFunction, options?: PromisifyOptions): (...args: unknown[]) => Promise<T>
interface PromisifyOptions { Promise?: PromiseConstructor; multiArgs?: boolean; copyProps?: boolean; suffix?: string; context?: unknown }
```

| option | type | default | behavior |
|---|---|---|---|
| `Promise` | `PromiseConstructor` | `globalThis.Promise` | Class that builds the result. The standalone default returns a native promise, not `AveAzul`. Use `AveAzul.promisify` or pass `{ Promise: AveAzul }`. |
| `multiArgs` | `boolean` | `false` | Truthy resolves with the array of all callback values after `err`. Otherwise only the first value. |
| `copyProps` | `boolean` | `true` | Copies own properties of `fn` onto the wrapper, except `arity`, `length`, `name`, `arguments`, `caller`, `callee`, `prototype`, `__isPromisified__`. |
| `suffix` | `string` | `""` | Appended to the wrapper's `name` only (`fn.name + suffix`). |
| `context` | `unknown` | `undefined` | `this` for `fn` when truthy. Otherwise the wrapper's own `this`. |

Rules:

- A non-function `fn` throws synchronously `TypeError: expecting a function but got [object X]`.
- A function already promisified (`__isPromisified__ === true`) is returned unchanged and the options are ignored.
- The wrapper appends a Node callback as the last argument. A truthy `err` rejects, otherwise it resolves. A sync throw from `fn` rejects, because `fn` runs inside the promise executor.
- The wrapper's `length` is `fn.length` (not reduced by one). Its `name` is `fn.name + suffix`.
- The wrapper is marked with a non-enumerable `__isPromisified__` property.

### `promisifyAll(target, options?)`

```ts
function promisifyAll<T extends object>(target: T, options?: PromisifyAllOptions): T
interface PromisifyAllOptions extends PromisifyOptions { suffix?: string; filter?: FilterFunction; promisifier?: PromisifierFunction }
type FilterFunction = (name: string, value: unknown, target: object, passesDefaultFilter?: boolean) => boolean
type PromisifierFunction = (fn, defaultPromisifier, options: PromisifyAllOptions) => (...args: any[]) => Promise<unknown>
```

Adds `<name><suffix>` promisified siblings in place and returns `target`. Defaults: `suffix: "Async"`, `filter` is the default filter, `promisifier` is the default promisifier, plus the `promisify` defaults (`Promise` global, `multiArgs` false, `copyProps` true, `context` undefined).

- Throws `TypeError: the target of promisifyAll must be an object or a function` when `typeof target` is neither. `null` passes that check and is returned unchanged.
- Throws `RangeError: suffix must be a valid identifier ...` when `suffix` does not match `/^[a-z$_][a-z$_0-9]*$/i`.
- Default filter: valid identifier, not starting with `_`, not `constructor`, not ending with `Sync`. Only data properties (no getters or setters) on the object and its prototype chain are considered, excluding the `Object`, `Array` and `Function` prototypes. Non-functions, already-promisified functions, and names whose `<name><suffix>` is already set are skipped.
- A custom `filter` replaces the default one entirely. It gets `passesDefaultFilter` as the fourth argument.
- Throws `TypeError: Cannot promisify an API that has normal methods with 'Async'-suffix ...` when a candidate method name already ends with the suffix.
- Any property whose value looks like a class gets its `prototype` and its own statics promisified too (keys starting with `_` and `constructor` are skipped). A function is treated as a class if its prototype has more than one own name, or any non-`constructor` member, or its source text matches `this.x =` and it has own properties.
- The default promisifier calls `promisify(fn, { ...options, copyProps: false })`. `context` is not bound to the target, so promisified methods use the call-site `this`.

### `OperationalError`

```ts
class OperationalError extends Error { isOperational: boolean; constructor(message: string) }
```

`name` is `"OperationalError"`, `isOperational` is `true`, and a stack is captured. Thrown by `.timeout()`. There is no `RejectionError`.

### `isOperationalError(error)` and `isProgrammerError(error)`

```ts
function isOperationalError(error: unknown): boolean
function isProgrammerError(error: unknown): boolean
```

`isOperationalError` is false for non-objects and `null`, true for an `OperationalError` instance or any object with `isOperational === true`. `isProgrammerError` is false for non-objects and `null` (a thrown string is NOT a programmer error), otherwise `!isOperationalError(error)`.

### `Disposer`

```ts
class Disposer<T> { _data: (resource: T) => void | Promise<void>; _promise: Promise<T>; constructor(fn, promise) }
```

Marker returned by `.disposer()` and consumed by `AveAzul.using`. `using` also accepts any object with a defined `_promise` and a function `_data`.

## Not implemented from Bluebird

Throwing stubs, instance: `bind`, `isFulfilled`, `isRejected`, `isPending`, `isCancelled`, `value`, `reason`, `cancel`, `reflect`, `suppressUnhandledRejections`, `done`.

Throwing stubs, static: `filter`, `coroutine`, `coroutine.addYieldHandler`, `getNewLibraryCopy`, `noConflict`, `setScheduler`.

Absent (property is `undefined`, no stub), static: `TimeoutError`, `CancellationError`, `AggregateError`, `RejectionError`, `onPossiblyUnhandledRejection`, `onUnhandledRejectionHandled`, `config`, `is`, `fulfilled`, `rejected`, `cast`, `pending`, `longStackTraces`, `hasLongStackTraces`, `spawn`. Absent, instance: `caught`, `lastly`, `thenReturn`, `thenThrow`, `isResolved`, `toJSON`.

Differences from Bluebird behavior: filtered `catch` is unsupported, `timeout` rejects with `OperationalError`, `map` defaults to concurrency 50, `each` resolves with the awaited items (a new array), `using` disposes in input order, `filter` is sequential and its callback gets no `length`, the `map` callback's third argument is a context object, `tapCatch` and `catchReturn` have no filter overloads, `props` takes plain objects only, and native Promise resolution and unhandled-rejection behavior apply.
