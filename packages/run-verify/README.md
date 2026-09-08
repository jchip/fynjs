# run-verify

Explicit verification obligations for asynchronous tests.

**A test should fail unless its required verifications actually happen and pass.**
No reported error is not enough: an expected rejection might never occur, a callback
might never run, or an assertion might sit in a branch that is never reached.

`run-verify` centers tests around this philosophy of **negative confirmation**:
declare the required outcome, verify its evidence, and fail when the outcome is
wrong or the verification does not complete before a deadline. It works with your
assertion library and test runner across synchronous code, Promises, callbacks,
and deferred signals.

This puts **test-driven development (TDD)** at the center of usage: write a failing
test first, observe it fail for the intended reason, then implement the behavior
until the test passes. Explicit verification obligations help ensure that missing
behavior produces a failing test instead of silently skipping its assertions.

**The `run-verify` APIs are designed to make that intention explicit and convenient
to express in the test code.** `expectError` declares that failure is required;
`withCallback` identifies a required callback step; registered `runDefer` objects
identify signals that must complete; and `runTimeout` puts a deadline on the work.
The following assertion steps specify the evidence that makes each outcome correct.

```bash
$ fyn add --dev run-verify
```

## Contents

- [run-verify](#run-verify)
  - [Verification is an obligation](#verification-is-an-obligation)
  - [Use it with TDD: fail first, then pass](#use-it-with-tdd-fail-first-then-pass)
  - [Make the obligation explicit](#make-the-obligation-explicit)
  - [Value on modern Node.js](#value-on-modern-nodejs)
  - [Scope of the guarantee](#scope-of-the-guarantee)
  - [`expect` Test Verifications](#expect-test-verifications)
    - [Verifying Events and `callbacks` without Promise](#verifying-events-and-callbacks-without-promise)
    - [Verifying with Promisification](#verifying-with-promisification)
    - [Verifying with run-verify](#verifying-with-run-verify)
      - [Using `runVerify` with `done`](#using-runverify-with-done)
      - [Using Promisified `asyncVerify`](#using-promisified-asyncverify)
  - [Verifying Expected Failures](#verifying-expected-failures)
    - [Verifying Failures with callbacks](#verifying-failures-with-callbacks)
    - [Verifying Failures with Promise](#verifying-failures-with-promise)
    - [Verifying Failures with `run-verify`](#verifying-failures-with-run-verify)
- [`checkFunc`](#checkfunc)
  - [0 Parameter](#0-parameter)
  - [1 Parameter](#1-parameter)
  - [2 Parameters](#2-parameters)
- [APIs](#apis)
  - [`runVerify`](#runverify)
  - [`asyncVerify`](#asyncverify)
  - [`runFinally`](#runfinally)
  - [`runTimeout`](#runtimeout)
  - [`runDefer`](#rundefer)
  - [`wrapCheck`](#wrapcheck)
  - [`wrapCheck` decorators and shortcuts](#wrapcheck-decorators-and-shortcuts)
    - [`expectError`](#expecterror)
    - [`expectErrorHas`](#expecterrorhas)
    - [`expectErrorToBe`](#expecterrortobe)
    - [`withCallback`](#withcallback)
    - [`onFailVerify`](#onfailverify)
  - [`wrapVerify`](#wrapverify)
  - [`wrapAsyncVerify`](#wrapasyncverify)
- [License](#license)

## Verification is an obligation

Consider a test that only verifies an error inside `catch`:

```js
it("rejects invalid input", async () => {
  try {
    await operation("invalid");
  } catch (err) {
    assert.equal(err.code, "INVALID_INPUT");
  }
});
```

If the operation succeeds, the assertion never runs and the test passes. Declaring
the expected failure closes that gap:

```js
import assert from "node:assert/strict";
import { asyncVerify, expectError, runTimeout } from "run-verify";

it("rejects invalid input", () =>
  asyncVerify(
    runTimeout(500),
    expectError(() => operation("invalid")),
    err => assert.equal(err.code, "INVALID_INPUT")
  )
);
```

There are three ways this test can fail: the operation succeeds unexpectedly, its
error fails verification, or it does not complete before the deadline. Passing
requires both the expected failure and successful verification of its error.

## Use it with TDD: fail first, then pass

1. **Write the test first.** Declare the required outcome and the assertions that
   verify it. Add a deadline for asynchronous completion.
2. **Run it and observe the intended failure.** Before implementing invalid-input
   handling, the test above must fail if the operation succeeds. Before implementing
   an event or callback, its test must fail when the required signal never arrives.
   An import error or unrelated exception does not establish that the test detects
   the missing behavior.
3. **Implement the behavior until the test passes.** Passing should require both
   the declared outcome and successful verification of its details.
4. **Refactor while keeping the tests passing.** Preserve the obligations as the
   implementation changes.

`run-verify` supports this red–green–refactor cycle; it cannot prove that you observed
the red step. Run the test against the missing or deliberately broken behavior to
confirm it detects the failure it was written to catch. Prefer specific error
checks over accepting any error, so an unrelated failure cannot satisfy the test.

## Make the obligation explicit

Tests should make their required evidence easy to see. The current APIs express
these obligations:

| Required evidence | API pattern |
| --- | --- |
| An operation throws, rejects, or calls back with an error | `expectError(operation)`, followed by an error-verification step |
| The error has a required message | `expectErrorHas(operation, text)` or `expectErrorToBe(operation, text)` |
| An error-first callback completes successfully and supplies the expected result | `withCallback(register)`, followed by a result-verification step |
| An event or custom signal occurs and supplies the expected value | Register a `runDefer`, resolve it from the signal, then verify with `defer.wait()` and a following step |
| Every registered deferred obligation completes | Include each defer in `asyncVerify`; it waits for all registered defers before succeeding |
| Required work finishes within a deadline | Put `runTimeout(ms)` before the work |

For callback APIs, prefer `withCallback` to make the callback contract visible
without relying on the parameter-name inference described under [`checkFunc`](#checkfunc):

```js
import assert from "node:assert/strict";
import { asyncVerify, runTimeout, withCallback } from "run-verify";

it("loads the requested record", () =>
  asyncVerify(
    runTimeout(500),
    withCallback(next => loadRecord("record-1", next)),
    record => assert.equal(record.id, "record-1")
  )
);
```

Here `loadRecord` uses the Node-style `callback(error, result)` convention. The
verification runs as a protected step after the callback supplies its result.
If the callback never runs, the deadline fails the test.

For an event, explicitly register the signal before starting the operation, verify
its payload in a separate step, and arrange listener cleanup:

```js
import assert from "node:assert/strict";
import { asyncVerify, runDefer, runFinally, runTimeout } from "run-verify";

it("emits the saved record", () => {
  const saved = runDefer();
  const onSaved = record => saved.resolve(record);

  return asyncVerify(
    runTimeout(500),
    runFinally(() => store.off("saved", onSaved)),
    saved,
    () => {
      store.once("saved", onSaved);
      return store.save("record-1");
    },
    saved.wait(),
    record => assert.equal(record.id, "record-1")
  );
});
```

The event arriving is only part of the evidence: its payload must also pass the
assertion. A missing event cannot produce a successful completion. If verification
itself is asynchronous, use an `async` step or return its Promise so the runner
waits for it.

## Value on modern Node.js

Node.js 26 provides the primitives to write these tests directly:

- [`assert.throws()` and `assert.rejects()`](https://nodejs.org/api/assert.html)
  require an expected failure and can validate its details.
- [`events.once()` and `events.on()`](https://nodejs.org/api/events.html)
  expose events as Promises or async iteration.
- [`Promise.withResolvers()`](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.withresolvers)
  provides a one-shot deferred Promise; `Promise.all()` can await multiple obligations.
- [`node:test`](https://nodejs.org/api/test.html) supports deadlines, cleanup hooks,
  and `t.plan()` to require a count of assertions made through `t.assert` and subtests.

For a Promise-only test, `await assert.rejects(...)` may express the entire
obligation clearly. `async`/`await` also handles ordinary sequencing naturally.
Neither syntax nor a Promise alone, however, ensures that an assertion in an
unreached branch executes or that detached work is awaited.

`run-verify` adds a consistent, convenient way to express required outcomes across
mixed synchronous, Promise, callback, and signal-based tests. Its value is making
verification obligations explicit and keeping completion, failure propagation,
and deadlines together. Native async constructs are its foundation; the testing
contract is the reason to use it.

## Scope of the guarantee

- Return or await `asyncVerify()` from the test, or pass the test runner's `done`
  callback to `runVerify()`, so the runner observes completion and failure.
- Register every required signal and include explicit verification steps. The
  library cannot detect assertions hidden in branches that never execute or work
  you leave detached from the verification sequence.
- Configure a deadline with `runTimeout(ms)` or the test runner. There is no default
  package timeout. A timeout reports incomplete verification; it does not cancel
  the underlying operation. Use `runFinally` for cleanup as needed.
- Keep assertions in verification steps. Arbitrary assertions in later event
  listeners are not automatically caught. `runDefer.onResolve` and `onReject`
  protect synchronous handlers, but do not await Promises those handlers return.
- Callback and defer completion are not invocation-count assertions. Testing
  "exactly once" or "must never occur" requires separate checks and, for absence,
  a defined observation period.

Within that scope, a passing sequence means its declared verification steps passed
and its registered deferred obligations completed.

## `expect` Test Verifications

### Verifying Events and `callbacks` without Promise

Assertions in detached event listeners and callbacks need a path back to the test
runner. Whether the assertion library is built into the runner does not remove
that asynchronous boundary.

For example, the `expect` failure below escapes the callback as an
[UncaughtException] instead of being delivered through `done(err)`:

```js
it("should emit an event", done => {
  foo.on("event", data => {
    expect(data).to.equal("expected value");
    done();
  });
});
```

> test runners generally watch for uncaught errors, but it doesn't always work well and the stack trace may be all confusing.

See below for discussions on some common patterns for writing tests that need to verify results from async events and callbacks, and how run-verify helps with them.

The first and obvious solution is you need to enclose verifications in `try/catch`:

```js
it("should emit an event", done => {
  foo.on("event", data => {
    try {
      expect(data).to.equal("expected value");
      done();
    } catch (err) {
      done(err);
    }
  });
});
```

However, it gets very messy like callback hell when a test deals with multiple async events.

Even with a test runner that takes a Promise as a return result, the same thing must be done:

```js
it("should emit an event", () => {
  return new Promise((resolve, reject) => {
    foo.on("event", data => {
      try {
        expect(data).to.equal("expected value");
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
});
```

### Verifying with Promisification

The test verification can be written nicely with promisification like:

```js
const promisifiedFooEvent = () => new Promise(resolve => foo.once("event", resolve));
```

So the verification is now like this:

```js
it("should emit an event", done => {
  return promisifiedFooEvent()
    .then(data => {
      expect(data).to.equal("expected value");
    })
    .then(done)
    .catch(done);
});
```

The `.then(done).catch(done)` can be avoided if the test runner takes a Promise as return result:

```js
it("should emit an event", () => {
  return promisifiedFooEvent().then(data => {
    expect(data).to.equal("expected value");
  });
});
```

It's even nicer if `async/await` is supported:

```js
it("should emit an event", async () => {
  const data = await promisifiedFooEvent();
  expect(data).to.equal("expected value");
});
```

### Verifying with run-verify

But if you prefer not to wrap with promisification or facing a complex scenario, **run-verify** always allows you to write test verification nicely:

#### Using `runVerify` with `done`

Using `runVerify` if you are using the `done` callback from the test runner:

```js
import { runVerify } from "run-verify";

it("should emit an event", done => {
  runVerify(
    next => foo.once("event", data => next(null, data)),
    data => expect(data).to.equal("expected value"),
    done
  );
});
```

#### Using Promisified `asyncVerify`

Using `asyncVerify` if you are returning a Promise to the test runner:

```js
import { asyncVerify } from "run-verify";

it("should emit an event", () => {
  return asyncVerify(
    next => foo.once("event", data => next(null, data)),
    data => expect(data).to.equal("expected value")
  );
});
```

## Verifying Expected Failures

When you need to verify that a function actually throws an error, you can do:

```js
it("should throw", () => {
  expect(() => foo("bad input")).to.throw("bad input passed");
});
```

Callback APIs need an explicit error path; Promise APIs can use `assert.rejects()`.
In either case, a test must also fail if the expected error never occurs.

See below for some common patterns on how to verify async functions return errors and how **run-verify** helps.

### Verifying Failures with callbacks

```js
it("should invoke callback with error", done => {
  foo("bad input", err => {
    if (!err) {
      return done(new Error("expected callback error"));
    }
    if (err) {
      try {
        expect(err.message).includes("bad input passed");
        done();
      } catch (err2) {
        done(err2);
      }
    }
  });
});
```

### Verifying Failures with Promise

Use an assertion that requires rejection and verifies the error. With Node's
assertion library:

```js
import assert from "node:assert/strict";

it("should reject", () =>
  assert.rejects(() => promisifiedFoo("bad input"), /bad input passed/)
);
```

### Verifying Failures with `run-verify`

`run-verify` has an [`expectError`](#expecterror) decorator to declare that a
[`checkFunc`](#checkfunc) must throw, reject, or invoke an error-first callback with
an error. Successful completion fails the verification; simply returning an
`Error` object does not satisfy this obligation.

Example that uses a `done` callback from the test runner:

```js
import { expectError, runVerify } from "run-verify";

it("should invoke callback with error", done => {
  runVerify(
    expectError(next => foo("bad input", next)),
    err => expect(err.message).includes("bad input passed"),
    done
  );
});
```

Example that returns a Promise to the test runner:

```js
import { expectError, asyncVerify } from "run-verify";

it("should invoke callback with error", () => {
  return asyncVerify(
    expectError(next => foo("bad input", next)),
    err => expect(err.message).includes("bad input passed")
  );
});
```

Example when everything is promisified:

```js
import { expectError, asyncVerify } from "run-verify";

it("should invoke callback with error", () => {
  return asyncVerify(
    expectError(() => promisifiedFoo("bad input")),
    err => expect(err.message).includes("bad input passed")
  );
});
```

# `checkFunc`

`runVerify` takes a list of functions as [`checkFunc`](#checkfunc) to be invoked serially to run the test verification.

Each [`checkFunc`](#checkfunc) can take 0, 1, or 2 parameters.

### 0 Parameter

```js
() => {};
```

- Assume to be a sync function
- But if it's intended to be async, then it should return a Promise
  - The Promise's resolved value is passed to next [`checkFunc`](#checkfunc).

### 1 Parameter

```js
(next | result) => {};
```

With only 1 parameter, it gets ambiguous whether it wants a `next` callback or a sync/Promise function taking a result.

`runVerify` does the following to disambiguate the [`checkFunc`](#checkfunc)'s single parameter:

- It's expected to be the `next` callback if:
  - the parameter name starts with one of the following:
    - `next`, `cb`, `callback`, or `done`
    - The name check is case insensitive
  - The function is decorated with the [withCallback](#withcallback) decorator
- Otherwise it's expected to take the result from previous [`checkFunc`](#checkfunc)
  - And its behavior is treated the same as the [0 parameter checkFunc](#0-parameter)
- A native `AsyncFunction` is always expected to take the result and returns a Promise.

ie:

```js
async result => {};
```

### 2 Parameters

```js
(result, next) => {};
```

This is always treated as an async function taking the `result` and a `next` callback:

- `result` - result from previous [`checkFunc`](#checkfunc)
- `next` - callback to invoke the next [`checkFunc`](#checkfunc)

# APIs

## `runVerify`

```js
runVerify(...checkFuncs, done);
```

The main API, params:

| name         | description                                                         |
| ------------ | ------------------------------------------------------------------- |
| `checkFuncs` | variadic list of functions to invoke to run tests and verifications |
| `done`       | `done(err, result)` callback after verification is done or failed   |

- See details about [checkFunc](#checkfunc).

Each [`checkFunc`](#checkfunc) is invoked serially, with the result from one passed to the next, depending on its parameters.

`done` is invoked at the end, but if any [`checkFunc`](#checkfunc) fails, then `done` is invoked immediately with the error.

## `asyncVerify`

```js
asyncVerify(...checkFuncs);
```

The promisified version of [runVerify](#runverify). Returns a Promise.

> Make sure no `done` callback is passed as the last parameter.

## `runFinally`

```js
runFinally(finallyFunc);
```

Create a callback that's always called.

- The `finally` callback can return a Promise.
- If any of them throws or rejects, then `done` is called with the error.
- They can appear in any order and there can be multiple of them.

ie:

```js
runVerify(
  runFinally(() => {}),
  () => {
    // test code
    return "foo";
  },
  runFinally(() => promiseCleanup()),
  result => {
    // expect result === "foo
  },
  done
)
```

## `runTimeout`

```js
runTimeout(ms);
```

Set a timeout in `ms` milliseconds for the test.

Each timeout step starts a deadline when reached, replacing the previous runner deadline. Put one before work that must complete within that time.

example:

```js
import { asyncVerify, runTimeout } from "run-verify";

it("should verify events", () => {
  return asyncVerify(
    runTimeout(50),
    next => foo.on("event1", msg => next(null, msg)),
    msg => expect(msg).equal("ok"),
    runTimeout(20),
    next => bar.on("event2", msg => next(null, msg)),
    msg => expect(msg).equal("done")
  );
});
```

## `runDefer`

```js
runDefer([ms]);
```

Create a defer object for waiting on events.

- `ms` - optional timeout in `ms` milliseconds for this defer.

Returns: the defer object with these methods:

- `resolve(result)` - resolve the defer object: `resolve("OK")`.
- `reject(error)` - reject with error: `reject(new Error("fail"))`.
- `wait([ms])` - Wait for the defer object.
- `clear()` - Put resolved defer back into pending status.

NOTES:

> - All registered `defer` must resolve for the test to complete.
> - Any rejection not waited on will fail the test immediately.
> - You can decorate `wait` with [expectError](#expecterror).

example:

Explicitly wait on the defer objects:

```js
import { asyncVerify, runDefer } from "run-verify";

it("should verify events", () => {
  const defer = runDefer();
  const defer2 = runDefer();

  return asyncVerify(
    () => foo.on("event1", msg => defer.resolve(msg)),
    // explicitly wait for defer before continuing with the test
    defer.wait(50),
    msg => expect(msg).equal("ok"),
    () => bar.on("event2", msg => defer2.resolve(msg)),
    // explicitly wait for defer before continuing with the test
    defer2.wait(20),
    msg => expect(msg).equal("done")
  );
});
```

Just put defer anywhere as long as they resolve:

```js
import { asyncVerify, runDefer } from "run-verify";

it("should verify events", () => {
  const defer = runDefer();
  const defer2 = runDefer();

  return asyncVerify(
    // just telling runVerify that there are two defer events that must
    // resolve for the test to finish, but you can't verify on their results.
    defer,
    defer2,
    () => foo.on("event1", msg => defer.resolve(msg)),
    () => bar.on("event2", msg => defer2.resolve(msg))
  );
});
```

## `wrapCheck`

```js
wrapCheck(checkFunc);
```

Wrap a [`checkFunc`](#checkfunc) with these decorators:

- [`expectError`](#expecterror), [`expectErrorHas`](#expecterrorhas), [`expectErrorToBe`](#expecterrortobe)
- [`withCallback`](#withcallback)
- [`onFailVerify`](#onfailverify)

For example:

```js
runVerify(wrapCheck(next => foo("bad input", next)).expectError.withCallback, done);
```

## `wrapCheck` decorators and shortcuts

### `expectError`

```js
expectError(checkFunc);
```

Shortcut for:

```js
wrapCheck(checkFunc).expectError;
```

Decorate a [`checkFunc`](#checkfunc) expected to throw, reject, or invoke an error-first callback with an error. Its error will be passed to the next [`checkFunc`](#checkfunc).

This uses [wrapCheck](#wrapcheck) internally so [withCallback](#withcallback) is also available after:

```js
expectError(() => {}).withCallback;
```

### `expectErrorHas`

```js
expectErrorHas(checkFunc, msg);
```

Shortcut for:

```js
wrapCheck(checkFunc).expectErrorHas(msg);
```

Decorate a [`checkFunc`](#checkfunc) expected to throw, reject, or invoke an error-first callback with an error with message containing `msg`. Its error will be passed to the next [`checkFunc`](#checkfunc).

### `expectErrorToBe`

```js
expectErrorToBe(checkFunc, msg);
```

Shortcut for:

```js
wrapCheck(checkFunc).expectErrorToBe(msg);
```

Decorate a [`checkFunc`](#checkfunc) expected to throw, reject, or invoke an error-first callback with an error with message to be `msg`. Its error will be passed to the next `checkFunc`.

### `withCallback`

```js
withCallback(checkFunc);
```

Shortcut for:

```js
wrapCheck(checkFunc).withCallback;
```

Decorate a [`checkFunc`](#checkfunc) that takes a single parameter to expect a `next` callback for that parameter.

This uses [wrapCheck](#wrapcheck) internally so [expectError](#expecterror) is also available after:

```js
withCallback(() => {}).expectError;
```

### `onFailVerify`

```js
onFailVerify(checkFunc);
```

Shortcut for:

```js
wrapCheck(checkFunc).onFailVerify;
```

Decorate a [`checkFunc`](#checkfunc) that will be called with `err` if the `checkFunc` right before it failed.

It's skipped if the `checkFunc` right before it passed.

- Its returned value will be ignored.
- Any exceptions from it will be caught and used as the new error for failing the test.

Example:

```js
return asyncVerify(
  () => {
    throw new Error("oops");
  },
  onFailVerify(err => {
    console.log("test failed with", err);
  })
);
```

## `wrapVerify`

```js
wrapVerify(...checkFuncs, done);
```

- Returns a function that wraps [`runVerify`](#runverify).
- The new function takes a single parameter and pass it to the first `checkFunc`.

## `wrapAsyncVerify`

```js
wrapAsyncVerify(...checkFuncs);
```

The promisified version of [`wrapVerify`](#wrapverify)

# License

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)

---

[uncaughtexception]: https://nodejs.org/api/process.html#process_event_uncaughtexception
