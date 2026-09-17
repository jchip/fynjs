# run-verify API reference

This reference documents `verify` and its lower-level positional APIs. All of these APIs
are exported from the package root.

## Imports

All supported imports come from the package root:

```js
import { signal, verify } from "run-verify";
```

There is no public subpath for the chain API.

## `verify(config?)`

```ts
verify(config?: ChainConfig): Chain<undefined>
```

Starts an immutable, thenable chain. Adding a step returns a new chain. Awaiting the
chain starts the run. Calling `.then()` or `.catch()` also starts it. There is no
terminal method.

An empty chain resolves `undefined`. Otherwise, the final step supplies the result. A
step or signal failure rejects the run. A missed deadline also rejects it. Errors from
user code keep their original identity.

### Config

```ts
interface ChainConfig<S extends SignalMap = SignalMap> {
  timeout?: number;
  cleanup?: (() => unknown) | (() => unknown)[];
  signals?: S;
}
```

| Option | Behavior |
| --- | --- |
| `timeout` | Whole-run deadline in milliseconds. There is no default. Reaching it fails the run but does not cancel underlying work. |
| `cleanup` | One function or an array of functions run after success or failure. Returned Promises are awaited. |
| `signals` | Named signals registered before the first step. Every registered signal must settle before the run can finish. |

The run invokes multiple cleanup functions in array order. It awaits their returned
Promises together. Put ordered cleanup inside one async function. Use `try`/`finally`
when later cleanup must run after an earlier failure.

### Execution and reuse

Awaiting the same chain more than once starts it once and shares its result. The chain is
immutable, so a prefix can produce independent branches. Each branch is a separate run
with the prefix's setup and cleanup.

A config containing signals is single-use. Its signals represent one occurrence. A
signal-bearing chain cannot be branched or run again. Create the signals and chain
inside each test.

## Step methods

### `.step(fn)`

```ts
chain.step(fn: (input: Current) => Next): Chain<Awaited<Next>>
```

Calls `fn` when the sequence reaches it. The current value is its argument, and the
return value becomes the next value. A returned thenable is awaited. A returned array
passes through unchanged, including an array of promises.

A function that returns nothing changes the value to `undefined`. Use `.keep.step(fn)`
when an assertion or side effect should preserve the input.

### `.step(value)`

```ts
chain.step(value): Chain<Awaited<typeof value>>
```

Replaces the current value with a non-function value. A thenable is adopted. Other
values, including arrays, pass through unchanged.

The value form is eager: a Promise has already started before the chain reaches the
step. Pass a function when work must start only after earlier steps finish.

A function is always treated as work to call. Use a wrapper such as `() => fn` when a
function itself must be the value.

### `.asyncStep(fnOrValue)`

```ts
chain.asyncStep(fnOrValue): Chain<ResolvedValue>
```

Handles one Promise like `.step()`. It resolves an array like `Promise.all` and preserves
tuple positions. The rule applies to a direct value or a function's return value.

The function form receives the current value and starts work when its turn arrives. The
value form is already running.

Use `.step()` instead when an array of promises should remain available for a later
operation such as `Promise.race`.

### `.callbackStep(fn)`

```ts
chain.callbackStep<Result>(fn): Chain<Result>
```

Adds an explicit error-first callback step. Its declared parameter count determines
what it receives:

```js
// One parameter receives only the callback.
.callbackStep(next => load("record-1", next))

// Two parameters receive the current value and callback.
.step(() => "record-1")
.callbackStep((id, next) => load(id, next))
```

The callback signature is `(err?, value?)`. An error fails the step. Otherwise, `value`
becomes the next chain value. The function's return value is ignored, including a
returned Promise.

TypeScript cannot infer the success type from a callback parameter, so the result
defaults to `unknown`. Supply `.callbackStep<Result>()` when a later step needs its
structure. Under strict checking, annotate both parameters in the two-parameter form.
The exported `StepCallback<Result>` type covers the callback.

## Step modifiers

Modifiers affect only the next step method. You can compose them in either order.

### `.keep`

Waits for the next step to finish, then forwards that step's input instead of its
result. A failure still fails the run.

```js
const id = await verify()
  .step(() => ({ id: "a" }))
  .keep.step(record => assert.equal(record.id, "a"))
  .step(record => record.id);
```

### `.expectError`

Requires the next step to fail. A throw, rejection, or callback error satisfies the
requirement. Successful completion fails the run. Returning an `Error` counts as
success, so it does not satisfy the requirement.

The failure becomes the next value. It has the `unknown` type because JavaScript may
throw any value.

### `.expectErrorToBe(message, code?)`

Like `.expectError`. The top-level error's `message` must equal `message`. A supplied
`code` must also match with strict equality. Codes may be strings or numbers.

### `.expectErrorHas(text, code?)`

Like `.expectError`. The top-level error's `message` must contain `text`. The optional
`code` check matches `.expectErrorToBe()`.

Use `.expectError` followed by an inspection step for custom predicates. Examples
include regular expressions and nested causes.

## Signals

### `signal<T>(timeout?)`

```ts
signal<T>(timeout?: number): Signal<T>
verify.signal<T>(timeout?: number): Signal<T>
```

Both forms are the same function. A signal represents one external occurrence, such as
an event. `timeout` is an optional deadline for that signal alone.

```ts
interface Signal<T> {
  resolve(value: T): void;
  reject(error: Error): void;
  pending(): boolean;
  readonly defer: DeferObject;
}
```

- `resolve(value)` settles the signal successfully.
- `reject(error)` fails the run using the signal.
- `pending()` reports whether it has not settled.
- `defer` exposes the underlying defer used by the positional API.

Declaring a signal in `config.signals` registers it before any step runs. Registration
does not block the sequence. The run cannot finish until every registered signal
settles.

### `.awaiting(signalOrName, ms?)`

Waits at this point for a configured signal. The signal's value replaces the current
value. The signal may already have settled. `ms` sets an optional deadline for this
wait.

The object and name forms have the same behavior:

```js
.awaiting(saved)
.awaiting("saved")
```

The signal must appear in `config.signals`. TypeScript checks named keys and infers the
signal's value type in both forms. The object form avoids string typos in JavaScript.
One signal can be awaited only once in a chain.

## Promise-like methods

### `.then(onfulfilled?, onrejected?)`

Starts the chain. It handles the result like `Promise.then()`.

### `.catch(onrejected?)`

Starts the chain. It handles a rejection like `Promise.catch()`.

## Modern TypeScript exports

| Export | Purpose |
| --- | --- |
| `Chain<Out>` | The immutable, thenable chain. `Out` is its current output type. |
| `ChainConfig<S>` | `verify()` configuration. |
| `Signal<T>` | A typed external signal. |
| `SignalMap` | A string-keyed map of signals. |
| `StepCallback<T>` | Error-first callback type used by `.callbackStep()`. |
| `VerifyFn` | The callable `verify` entry point, including `verify.signal`. |

## Low-level positional API

The positional runner does the work behind `verify`, and its helpers are exported too.
This API is not type-safe between steps. Single-parameter callback detection depends on
the declared parameter name.

### Positional step rules

`runVerify` and `asyncVerify` take positional steps and run them in order. Each ordinary
result becomes the next step's input.

| Step signature | Input | Completion |
| --- | --- | --- |
| `() => value` | None | Returned value or Promise. |
| `value => nextValue` | Previous value | Returned value or Promise, unless the parameter is callback-named. |
| `async value => nextValue` | Previous value | Returned Promise. Native async functions are never callback mode. |
| `(value, next) => {}` | Previous value and callback | `next(err, result)`. |
| `next => {}` | Callback only | `next(err, result)` when the parameter name starts with `next`, `cb`, `callback`, or `done`. |

`withCallback(fn)` selects callback-only mode for a one-parameter function. A callback
step completes only through `next`. A returned Promise is ignored.

A step that returns nothing supplies `undefined` to the next step. Throwing, rejecting,
or calling `next(err)` stops the run unless the step is wrapped with an expected-error
helper.

### `runVerify(...steps, done)`

Runs the positional steps and calls `done(err, result)` once. The run stops on its first
failure. On success, `result` is the last step's result.

### `asyncVerify(...steps)`

Runs the same positional sequence and returns a Promise. The Promise resolves with the
last step's result or rejects on the first failure. Do not pass a final `done` callback.
`asyncVerify` supplies its own.

### `runTimeout(ms)`

Creates a pass-through entry that starts a runner deadline when reached, replacing any
earlier runner deadline. There is no default. This is one deadline for the remaining
run, not a separate timer around each step.

`runTimeout(ms, fn)` is also accepted. It calls `fn` with the timeout error if the
deadline expires. The normal public pattern is the standalone pass-through entry.

### `runFinally(fn)`

Registers cleanup for the end of the run. Cleanup runs after success or failure. The
runner collects cleanup entries before execution, so their positions do not affect
value flow. More than one may be supplied. Returned Promises are awaited.

### `runDefer(timeout?)`

Creates an external signal for the positional runner. Put the defer itself in the
positional list to register it. Registration does not block. Every registered defer must
settle before the run can finish. Put `defer.wait(ms?)` in the list to wait at a specific
point. Its value then passes to the next step.

The returned `DeferObject` provides:

| Member | Behavior |
| --- | --- |
| `resolve(value?)` | Settle successfully. |
| `reject(error)` | Settle with a failure. |
| `pending()` | Return `true` until settlement. |
| `wait(ms?)` | Return a positional wait step. The defer may be waited once. |
| `waitAgain(ms?)` | Return another wait step for intentional reuse. |
| `clear()` | Reset settlement and wait state. Return a function that can reset it again. |
| `onResolve(fn)` | Add a handler for successful settlement. Return the defer. |
| `onReject(fn)` | Add a handler for failed settlement. Return the defer. |

The constructor's `timeout` applies while the registered defer is outstanding. A
timeout passed to `wait()` or `waitAgain()` applies to that wait. `setAwait()` and the
symbol-bearing fields are runner plumbing. Do not call them directly.

### Expected-error helpers

These wrap one positional step:

| Helper | Requirement |
| --- | --- |
| `expectError(fn)` | The step must fail. A throw or rejection counts. A callback error also counts. |
| `expectErrorToBe(fn, message, code?)` | Require an exact top-level message. Optionally require an exact code. |
| `expectErrorHas(fn, text, code?)` | Require a top-level message substring. Optionally require an exact code. |

When the requirement passes, the failure value goes to the next positional step.
Returning an `Error` as a value does not satisfy the requirement.

### `withCallback(fn)`

Marks a one-parameter function as callback-only without relying on its parameter name.
The function receives `next`, not the previous result. A two-parameter step already
receives `(result, next)` and does not need this wrapper.

### `onFailVerify(fn)`

Creates a positional failure hook. The hook is skipped while the run is passing. It
receives an error from the preceding step. Its return value is ignored. An exception
from the hook replaces the run's error.

### `wrapCheck(fn)` and `wrapFn(fn)`

`wrapCheck` creates the mutable wrapper used by the positional helpers. It exposes the
expected-error modifiers. It also exposes `.withCallback`, `.onFailVerify`, and
`.runTimeout(ms)`.

`wrapFn` creates the undecorated internal wrapper shape. Prefer the named helper that
states the intended behavior.

### `wrapVerify(...steps, done)`

Returns a function that takes one value. Calling it starts `runVerify`. That value is
the first positional result. The supplied steps and `done` follow it.

### `wrapAsyncVerify(...steps)`

This is the Promise form of `wrapVerify`. It returns a function that takes one value.
The result settles like `asyncVerify`.

### Low-level TypeScript exports

| Export | Purpose |
| --- | --- |
| `CheckFunction` | Untyped positional step function. |
| `DoneCallback` | Final callback type. |
| `NextCallback` | Positional error-first callback type. |
| `ErrorCode` | `string | number`. |
| `DeferHandlers` | Handler arrays used by a defer. |
| `DeferObject` | Full positional defer shape. |
| `WrapObject` | Mutable positional wrapper shape. |

### Internal exports

`_asyncVerifyFrom`, `WRAPPED_FN`, `IS_FINALLY`, `DEFER_EVENT`, `DEFER_WAIT`, and
`DEFER_OBJ` are exported from the root module because the implementation shares them.
They are internal plumbing. Do not use them directly.
