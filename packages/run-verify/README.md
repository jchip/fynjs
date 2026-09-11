# run-verify

Run test steps in order across sync functions, Promises, callbacks, and events.

`asyncVerify(step1, step2, step3, ...)` calls each step in the order you passed it, and
passes each step's result to the next one. A step can do work, assert on its input, or
change a value. `runVerify(...steps, done)` runs the same sequence and calls `done` at
the end. That is the whole model. See
[Core design](#core-design-one-api-an-ordered-step-pipeline) for the exact rules.

The same pipeline is also available as a typed chain, where each step is added by an
explicit `.step()` call instead of by its argument position. Both surfaces are exported
and you can pick per test. See [`verify`](#verify-the-explicit-chain-api).

```js
import assert from "node:assert/strict";
import { asyncVerify, withCallback } from "run-verify";

await asyncVerify(
  () => 2,
  async value => value * 3,
  withCallback((value, next) => next(null, value + 1)),
  value => assert.equal(value, 7)
);
```

An assertion step that returns nothing passes `undefined` to the next step. Return its
input when a later step needs that value.

**A test should fail unless the checks you asked for actually ran and passed.** A test
that reports no error is not proof. An expected rejection may never happen. A callback
may never run. An assertion may sit in a branch that nothing reaches.

`run-verify` closes those gaps. You say what must happen, then check the result. The
test fails if the outcome is wrong, or if the work never finishes before a deadline. It
works with any assertion library and any test runner.

Write the test first. Watch it fail for the right reason. Then write the code until it
passes.

Each API states one requirement:

- `expectError` says this step must fail.
- `withCallback` says this step reports through a callback.
- A registered `runDefer` says this signal must settle.
- `runTimeout` puts a deadline on the work.

The assertion steps after them say what makes the result correct.

```bash
$ fyn add --dev run-verify
```

## Contents

- [run-verify](#run-verify)
  - [Core design: one API, an ordered step pipeline](#core-design-one-api-an-ordered-step-pipeline)
    - [How a step finishes, and what the next step gets](#how-a-step-finishes-and-what-the-next-step-gets)
    - [What a step gets depends on its parameters](#what-a-step-gets-depends-on-its-parameters)
    - [Steps that do not change the value](#steps-that-do-not-change-the-value)
  - [A test must require its checks](#a-test-must-require-its-checks)
  - [Use it with TDD: fail first, then pass](#use-it-with-tdd-fail-first-then-pass)
  - [Say what the test requires](#say-what-the-test-requires)
  - [Value on modern Node.js](#value-on-modern-nodejs)
  - [What this does and does not cover](#what-this-does-and-does-not-cover)
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
- [`verify`: the explicit chain API](#verify-the-explicit-chain-api)
  - [A step can be a value](#a-step-can-be-a-value)
  - [`asyncStep`](#asyncstep)
  - [`callbackStep`](#callbackstep)
  - [Modifiers](#modifiers)
  - [Config](#config)
  - [Signals](#signals)
  - [Why you might pick it](#why-you-might-pick-it)
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

## Core design: one API, an ordered step pipeline

There is **one** runner. It comes in two forms:

```js
runVerify(...steps, done); // finishes by calling done
asyncVerify(...steps); // finishes by resolving a Promise
```

The runner does one thing:

> It takes a list of steps as function parameters. It calls them one at a time, in the
> order you passed them. The value each step finishes with becomes the input to the
> next step.

A step is a plain function. It can do work, assert on its input, change a value, or
all three. You never build a step object. Plain functions are the only building block.
Every other export in this package either creates a step or changes how one step
behaves.

```js
import assert from "node:assert/strict";
import { asyncVerify } from "run-verify";

const result = await asyncVerify(
  () => 2, // finishes with 2
  value => value * 3, // gets 2, finishes with 6
  value => value + 1, // gets 6, finishes with 7
  value => {
    assert.equal(value, 7); // gets 7
    return value; // finishes with 7, so asyncVerify resolves 7
  }
);
```

The run stops at the first step that fails. `runVerify` then calls `done(err)` and
`asyncVerify` rejects, so your test runner sees the failure. If every step finishes,
the value from the last step is the result of the run.

### How a step finishes, and what the next step gets

| Step finishes by | Next step gets |
| --- | --- |
| Returning a value | That value |
| Returning a Promise | The value it resolves with |
| Calling `next(null, value)` in callback mode | `value` |
| Throwing, rejecting, or calling `next(err)` | Nothing. The run fails with that error. |
| Failing inside [`expectError`](#expecterror) | The error, as a normal input value |

A step that returns nothing finishes with `undefined`, and the next step gets
`undefined`. The runner does **not** carry the old value past a step that ignored it.
This is easy to miss with assertion steps:

```js
await asyncVerify(
  () => ({ id: "record-1" }),
  record => assert.equal(record.id, "record-1"), // finishes with undefined
  record => record.id // gets undefined, not the record
);
```

Return the value when a later step needs it:

```js
record => {
  assert.equal(record.id, "record-1");
  return record; // finishes with the record
},
```

### What a step gets depends on its parameters

The runner reads a step's parameters to decide how it finishes. See
[`checkFunc`](#checkfunc) for the full rules.

| Step signature | What it gets | How it finishes |
| --- | --- | --- |
| `() => {}` | Nothing. Its return value still forwards. | Return value, or returned Promise |
| `result => {}` | The previous value | Return value, or returned Promise |
| `async result => {}` | The previous value | Its Promise. An `async` function is never callback mode. |
| `(result, next) => {}` | The previous value and a callback | `next(err, value)` |
| `next => {}` or [`withCallback`](#withcallback)`(next => {})` | Only the callback. The previous value is not passed. | `next(err, value)` |

A callback step finishes only through `next`. If it also returns a Promise, the runner
ignores it. There is no race between the two.

### Steps that do not change the value

A few helpers take a spot in the list but do not transform the value:

| In the list | What it does to the run | What it does to the value |
| --- | --- | --- |
| [`runTimeout(ms)`](#runtimeout) | Starts a deadline here and replaces the runner's old one | Passes the current value through |
| A [`runDefer()`](#rundefer) object | Registers a signal that must settle before the run can finish. The run keeps going. | Passes the current value through |
| [`defer.wait([ms])`](#rundefer) | Waits here until that signal settles | Gives the signal's value. **Drops** the previous one. |
| [`runFinally(fn)`](#runfinally) | Cleanup. Collected no matter where you put it, and run when the run ends. | Not part of the sequence |
| [`onFailVerify(fn)`](#onfailverify) | Runs only if the run failed at this spot | Skipped when the run is passing |

A registered defer does not block. So a test can set up listeners, start the work, and
then check the result at an explicit `wait()`, even if the signal already arrived.

If you would rather state each step's role explicitly than rely on these positional
rules, [`verify()`](#verify-the-explicit-chain-api) runs the same pipeline as a typed
chain of `.step()` calls.

## A test must require its checks

Consider a test that only checks an error inside `catch`:

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

This test can now fail in three ways. The operation succeeds when it should not. The
error fails the check. The work does not finish before the deadline. To pass, the
operation must fail and the check on its error must pass.

## Use it with TDD: fail first, then pass

1. **Write the test first.** Say what must happen and add the checks for it. Add a
   deadline for async work.
2. **Run it and watch it fail for the right reason.** Before you write the
   invalid-input handling, the test above must fail when the operation succeeds. Before
   you write an event or callback, its test must fail when the signal never arrives. An
   import error or some unrelated exception does not prove the test catches the missing
   behavior.
3. **Write the code until the test passes.** To pass, the outcome must be right and the
   checks on it must pass.
4. **Refactor and keep the tests passing.** Keep the same requirements as the code
   changes.

`run-verify` supports this red, green, refactor cycle. It cannot prove you watched the
red step. Run the test against the missing or broken behavior to confirm it catches the
failure you wrote it for. Check for a specific error instead of any error, so an
unrelated failure cannot pass the test.

## Say what the test requires

A test should show what it requires. These APIs say it:

| What you require | How to write it |
| --- | --- |
| An operation throws, rejects, or calls back with an error | `expectError(operation)`, then a step that checks the error |
| The error has a given message, and optionally a code | `expectErrorHas(operation, text, code?)` or `expectErrorToBe(operation, text, code?)` |
| A callback runs and gives the expected result | `withCallback(register)`, then a step that checks the result |
| A signal fires and gives the expected value | Register a `runDefer`, resolve it from the signal, then `defer.wait()` and a step that checks the value |
| Every registered signal settles | Pass each defer to `asyncVerify`. It waits for all of them before it passes. |
| The work finishes before a deadline | Put `runTimeout(ms)` before the work |

For callback APIs, use `withCallback`. It shows the callback up front, so you do not
depend on the parameter-name guessing described under [`checkFunc`](#checkfunc):

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

`loadRecord` uses the Node style `callback(error, result)`. The check runs as the next
step, after the callback gives its result. If the callback never runs, the deadline
fails the test.

For an event, register the signal before you start the operation, check its payload in
its own step, and clean up the listener:

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

The event arriving is not enough. Its payload must also pass the assertion. If the
event never fires, the run cannot pass. If your check is async, use an `async` step or
return its Promise, so the runner waits for it.

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

For a Promise-only test, `await assert.rejects(...)` may say all you need, and
`async`/`await` handles plain ordering fine. But neither one makes an assertion run in
a branch nothing reaches, and neither one waits for work you left detached.

`run-verify` gives you one way to state what a test requires across sync, Promise,
callback, and signal tests. It keeps ordering, failures, and deadlines in one place. It
builds on the native async features. The reason to use it is the testing contract.

## What this does and does not cover

- Return or await `asyncVerify()` in your test, or pass the test runner's `done`
  callback to `runVerify()`. The runner has to see the run end.
- Register every signal you need and write a step for each check. This library cannot
  find assertions in branches that never run, or work you left outside the sequence.
- Set a deadline with `runTimeout(ms)` or in your test runner. There is no default
  timeout. A timeout says the run did not finish. It does not cancel the operation
  underneath. Use `runFinally` to clean up.
- Keep assertions in steps. An assertion inside a later event listener is not caught
  for you. `runDefer.onResolve` and `onReject` catch throws from sync handlers, but they
  do not wait for a Promise those handlers return.
- A callback or defer settling is not a call count. To test "exactly once" or "never
  happens", write your own check. For "never happens", you also need a window of time
  to watch.

Within that scope, a run that passes means its check steps passed and its registered
signals settled.

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

# `verify`: the explicit chain API

`verify()` runs the same pipeline as `asyncVerify()`, with each step added by an
explicit `.step()` call instead of being implied by its argument position. Both are
exported and both work; pick whichever you prefer per test.

```js
import assert from "node:assert/strict";
import { verify } from "run-verify";

const count = await verify({ timeout: 500 })
  .step(() => 2)
  .step(value => value * 3)                     // gets 2, finishes with 6
  .keep.step(value => assert.equal(value, 6))   // asserts, forwards 6
  .step(value => `count=${value}`);             // resolves "count=6"
```

There is one step primitive, `.step()`. Anything that changes how a step behaves is a
modifier on that step. Anything that is not part of the sequence goes in the config.

The chain is thenable, so `await` starts the run and the last step's value is the
result. There is no terminal call to forget. It is also immutable, so a prefix is a
reusable value:

```js
const withStore = verify({ timeout: 500, cleanup: closeStore }).step(() => makeStore());

await withStore.step(s => s.save("a")).keep.step(r => assert.ok(r.id));
await withStore.step(s => s.save("b")).keep.step(r => assert.ok(r.id));
```

Each branch runs independently, and awaiting the same chain twice runs it once. Every
branch is its own run, so the prefix's steps and the config's `cleanup` run once per
branch. In the example above that means two stores created and two closed.

A prefix that declares [signals](#signals) is the one thing you cannot branch or run
twice. A signal stands for a single occurrence, so reusing it is not meaningful, and the
second run rejects saying so. Create the signals and the chain inside each test.

TypeScript infers the value through the whole chain with no annotations, so a step whose
input does not match the previous step's output is a compile error.

## A step can be a value

`.step()` takes a function or a value. A Promise, or any thenable, is adopted: the run
waits for it and its settled value goes to the next step.

```js
// these are the same test
await expect(save(bad)).rejects.toBeInstanceOf(ValidationError);

await verify({ timeout: 500 })
  .expectError.step(save(bad))
  .step(err => assert.ok(err instanceof ValidationError));
```

So the subject reads the same way it does with `expect`, and the error arrives as an
ordinary value, which is what makes several assertions on it read naturally.

Any other value, an array included, is passed straight on, which is a convenient way to seed a chain:

```js
await verify()
  .step(41)
  .step(value => value + 1); // resolves 42
```

One difference from the function form: a value is **already running** when you pass it,
exactly as it is when you hand it to `expect`. A function is not called until the
sequence reaches it, so use a function when the work must not start early.

Everything except a function is detected from the value itself. A bare function is the
one case that cannot be: nothing distinguishes a step that returns a value from one that
wants a callback. That is why [`callbackStep`](#callbackstep) is a separate method rather
than another shape `.step()` detects, and why giving it a value is an error.

## `asyncStep`

```js
verify().asyncStep(promiseOrArrayOrFn);
```

Waits for async work. A Promise, or any thenable, is awaited. An array resolves
element-wise like `Promise.all`, keeping its tuple positions. A function is called with
the previous value when the sequence reaches it, and what it returns is handled the same
way.

```js
const [a, b] = await verify({ timeout: 500 }).asyncStep([save("a"), save("b")]);
```

This is separate from `.step()` because an array's intention cannot be known.
`[p1, p2]` may be work to wait for, or may be a value the next step wants to hold on to
and race or inspect itself. `.step()` therefore passes an array on untouched, whether it
was handed one or a function returned it:

```js
// the promises arrive as promises, so the step can race them
await verify()
  .step([slow, fast])
  .step(promises => Promise.race(promises));
```

A single thenable is not ambiguous in the same way, so `.step()` does adopt that. Use
`asyncStep` when you want an array resolved.

The function form is what defers the work. A value is already running when you pass it,
so the promises in `.asyncStep([save("a"), save("b")])` start before the chain does. Pass
a function when they must not:

```js
const [a, b] = await verify({ timeout: 500 }).asyncStep(() => [save("a"), save("b")]);
```

## `callbackStep`

```js
verify().callbackStep(fn);
```

Adds a step that finishes by calling an error-first callback instead of by returning.
How many parameters the function declares decides what it gets:

```js
// one parameter: the callback alone. The previous value is not passed.
.callbackStep(next => loadRecord("record-1", next))

// two parameters: the previous value and the callback
.step(() => "record-1")
.callbackStep((id, next) => loadRecord(id, next))
```

This mirrors the positional API, where a single callback-named parameter also receives
only the callback. The function's return value is ignored, so a Promise it happens to
return is not a second completion path.

It is a separate method rather than a shape `.step()` detects because a bare function is
the one ambiguous case: nothing distinguishes a step that returns a value from one that
wants a callback. Everything else is detected from the value.

The [modifiers](#modifiers) below apply to it as well, so
`.expectError.callbackStep(next => ...)` requires the callback to report an error.

Two notes for TypeScript. The callback's value type cannot be inferred, since it only
appears in the callback's parameter position, so it defaults to `unknown`; pass it as
`.callbackStep<string>(...)` where a later step needs the type. And because the two
arities are overloads, only the one-parameter form is contextually typed: a
two-parameter function must annotate its parameters to be checked under `strict`.

## Modifiers

| Modifier | Effect on the next `.step` |
| --- | --- |
| `.expectError` | The step must fail. A throw, a rejection and `next(err)` all satisfy it, and the error becomes the next step's value. Success fails the run. |
| `.expectErrorToBe(msg, code?)` | Like `.expectError`, the error message must equal `msg`, and its code must equal `code` when given. |
| `.expectErrorHas(msg, code?)` | Like `.expectError`, the error message must contain `msg`, and its code must equal `code` when given. |
| `.keep` | The step passes its input through, whatever it returns. Use it for assertions that should not consume the value. |


A modifier applies to the next `.step()` only. Modifiers combine in either order:

```js
await verify({ timeout: 500 })
  .step(() => 1)
  .expectError.callbackStep(next => next(new Error("failed")))
  .step(err => assert.equal(err.message, "failed"));
```

`.keep` is the answer to the `undefined` rule described in
[Core design](#core-design-one-api-an-ordered-step-pipeline). `.step` forwards what the
function returns, `.keep.step` forwards the input.

An expected error's value is typed `unknown`, not `Error`, because a rejection value can
be anything.

Choose the narrowest expected-error modifier that states the requirement:

- Use `.expectError` when the test needs only a failure or has a message check more
  complex than exact/substring matching.
- Use `.expectErrorToBe(msg, code?)` instead of a following
  `expect(error.message).toBe(msg)` or equivalent exact-equality assertion.
- Use `.expectErrorHas(msg, code?)` instead of a following
  `expect(error.message).toContain(msg)` or equivalent substring assertion.

When `code` is given, it is compared with strict equality to the top-level error's
`.code`. Codes may be strings, as in Node errors, or numbers, as in HTTP-style errors.

The two message forms keep a whole test on one line when the message is all you need to
check:

```js
await verify().expectErrorToBe("Task foo not found").callbackStep(next => run("foo", next));
await verify()
  .expectErrorHas("not found", "TASK_NOT_FOUND")
  .step(() => loadTask("foo"));
```

They still forward the error to the following step, so keep that step for additional
structural checks and remove only the redundant message assertion:

```js
await verify()
  .expectErrorHas("not found", "TASK_NOT_FOUND")
  .step(() => loadTask("foo"))
  .step(error => assert.equal(error.task, "foo"));
```

Both message modifiers inspect the top-level error's `.message` and, when given, `.code`.
Use `.expectError` and a following step for regular expressions, normalized messages,
nested errors such as `error.cause.message`, or any other custom predicate.

## Config

```js
verify({ timeout, cleanup, signals });
```

| Option | What it does |
| --- | --- |
| `timeout` | Deadline in ms for the whole run. There is no default. |
| `cleanup` | A function, or an array of them, always run once the run ends. |
| `signals` | A named map of [signals](#signals) that must settle before the run can finish. |

These are config rather than positions in the chain because that is how they are used in
practice: one deadline for the test, and cleanup that does not care where it sits.

## Signals

A signal stands for work that completes outside the sequence, such as an event.
Declaring one in `config.signals` registers it, which makes it an obligation: the run
cannot finish until it settles. `.awaiting(name)` waits for it and passes its value to
the next step.

```js
import assert from "node:assert/strict";
import { verify, signal } from "run-verify";

it("emits the saved record", async () => {
  const saved = signal();
  const onSaved = record => saved.resolve(record);

  const id = await verify({
    timeout: 500,
    signals: { saved },
    cleanup: () => store.off("saved", onSaved)
  })
    .step(() => {
      store.once("saved", onSaved);
      return store.save("a");
    })
    .awaiting("saved")
    .step(record => record.id);

  assert.equal(id, "a");
});
```

Registering does not block, so the sequence can arrange the listener, trigger the work,
and then wait, even when the event arrives before the wait is reached. `.awaiting()`
replaces the current value with the signal's, dropping the previous one.

`.awaiting()` also takes the signal itself, so the name need not be repeated as a
string:

```js
    .awaiting(saved)
```

Both forms mean the same wait. The signal still has to be declared in
`config.signals` — that declaration is what makes it an obligation, and awaiting an
undeclared signal throws saying so. **Prefer the value form wherever the name is not
type-checked**, such as a plain `.js` spec: there a mistyped string is caught only when
the chain is built, while a mistyped variable is caught by the runtime as an undefined
reference and by any linter immediately.

In TypeScript, `signal<T>()` types what the signal carries, and both `.awaiting("saved")`
and `.awaiting(saved)` take the next step's input type from it. An unknown *name* is a
compile error. An undeclared *signal* is not: structural typing cannot express "this
exact object is in that map", so that one is enforced at runtime rather than pretending
to a guarantee it cannot make.

`signal` is also reachable as `verify.signal`, which is the same function. The bare
export is shorter; the namespaced form is there because `signal` is a common local name
— Node's own `(code, signal)` exit handler shadows it — so a caller that collides has
somewhere to go without renaming the import.

A signal settles once, so `.awaiting()` the same name twice in one chain is an error, and
a chain that declares signals cannot be branched or awaited as a reused prefix. Declare a
second signal if a test needs to wait twice.

`signal()` returns `{ resolve, reject, pending, defer }`. The `defer` is the underlying
`runDefer` object, so a signal can be handed to the positional API when mixing the two.

## Why you might pick it

- Each step's role is explicit, so the code explains itself without knowing positional
  rules.
- Full type inference through the chain, with no arity limit, so a step whose input does
  not match the previous step's output is a compile error.
- Nothing is read from a step's source text. A modifier states the shape, so the
  parameter-name rules under [`checkFunc`](#checkfunc) do not apply and a callback
  parameter can be named anything.
- Reusable prefixes, since the chain is a value.

The positional API remains the smaller surface and reads with less punctuation, so it
stays a reasonable choice for short tests.

# `checkFunc`

A `checkFunc` is one step. `runVerify` and `asyncVerify` take a list of them as
function parameters, call them one at a time in order, and pass each one's result to
the next. See [Core design](#core-design-one-api-an-ordered-step-pipeline) for how a
step finishes and what the next one gets.

This section covers one detail of that: how the runner uses a step's parameters to
decide whether it finishes by returning a value, by returning a Promise, or by calling
a `next` callback. Each `checkFunc` can take 0, 1, or 2 parameters.

### 0 Parameter

```js
() => {};
```

- Assume to be a sync function
- But if it's intended to be async, then it should return a Promise
  - The Promise's resolved value is passed to next [`checkFunc`](#checkfunc).

Any syntax works: `() => {}`, `function () {}`, `function named() {}`, a method
shorthand, or an `async` form. A zero-parameter step is called with no arguments at
all.

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

Only the parameter list decides this. A step's body can contain anything, including
arrow functions, without changing how the step is read.

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

This section covers the positional API. The chain API, `verify` and `signal`, is
documented under [`verify`: the explicit chain API](#verify-the-explicit-chain-api).

## `runVerify`

```js
runVerify(...checkFuncs, done);
```

The one runner. Params:

| name         | description                                                       |
| ------------ | ----------------------------------------------------------------- |
| `checkFuncs` | The steps to run, passed as function parameters                   |
| `done`       | `done(err, result)`, called once the run ends or fails            |

`runVerify` calls each [`checkFunc`](#checkfunc) one at a time, in the order you passed
them. The value each step finishes with becomes the input to the next step. Which
parameters a step declares decides what it gets and how it finishes. See
[Core design](#core-design-one-api-an-ordered-step-pipeline) and
[`checkFunc`](#checkfunc).

`done` is called at the end with the result of the last step. If any step fails, the
run stops there and `done` is called right away with that error.

## `asyncVerify`

```js
asyncVerify(...checkFuncs);
```

The same runner as [runVerify](#runverify), returning a Promise instead of taking a
`done` callback. The steps behave exactly the same way. The Promise resolves with the
result of the last step, and rejects with the error from the first step that fails.

> Do not pass a `done` callback as the last parameter. `asyncVerify` adds its own.

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
expectErrorHas(checkFunc, msg, code?);
```

Shortcut for:

```js
wrapCheck(checkFunc).expectErrorHas(msg, code?);
```

Decorate a [`checkFunc`](#checkfunc) expected to throw, reject, or invoke an error-first callback with an error whose message contains `msg`. When `code` is given, its top-level `code` must also equal it. The error is passed to the next [`checkFunc`](#checkfunc).

### `expectErrorToBe`

```js
expectErrorToBe(checkFunc, msg, code?);
```

Shortcut for:

```js
wrapCheck(checkFunc).expectErrorToBe(msg, code?);
```

Decorate a [`checkFunc`](#checkfunc) expected to throw, reject, or invoke an error-first callback with an error whose message equals `msg`. When `code` is given, its top-level `code` must also equal it. The error is passed to the next `checkFunc`.

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
