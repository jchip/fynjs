# run-verify: preserve and clarify the step pipeline

Date: 2026-09-08

Status: replaces the withdrawn object-registration redesign. The isolated FRV-5
runtime changes have been removed, restoring run-verify 2.1.1 behavior. The audit trail
for that withdrawal is in
[run-verify-frv5-audit-2026-09-08.md](run-verify-frv5-audit-2026-09-08.md).

## Start with the actual abstraction

`asyncVerify(step1, step2, step3, ...)` executes an ordered sequence. A step
performs an operation, checks a result, or does both. Its completion supplies the
next step's input. `runVerify(...steps, done)` exposes the same runner through a
final callback; `asyncVerify` exposes it through a Promise.

The unit of composition is the **step**. Ordinary functions already compose
operations, assertions, transformations, and reusable sequences. An object
containing an operation and a required verifier would replace this abstraction.

| Step completes through | Next step receives |
| --- | --- |
| Synchronous return | The returned value |
| Returned Promise fulfillment | The fulfilled value |
| `next(null, result)` in callback mode | `result` |
| Throw, rejection, or callback error | The run fails, unless this step expects an error |
| Expected error | The error as the next step's ordinary input |

An assertion step participates in exactly this flow. If it returns nothing, its
output is `undefined`; the runner does not silently preserve the previous value.
Return the value explicitly when another step needs it.

A step's declared parameters also decide whether it *receives* the previous value.
A two-parameter step is called as `(result, next)`. A one-parameter step in callback
mode, reached through `withCallback` or a recognized parameter name, is called as
`(next)` only: the previous value is dropped, not passed. `withCallback` therefore
changes behavior only for a one-parameter step; on a two-parameter step it is a no-op,
because arity alone already selects callback mode.

This complete example uses only existing APIs:

```js
import assert from "node:assert/strict";
import { asyncVerify, runTimeout } from "run-verify";

const result = await asyncVerify(
  runTimeout(500),
  () => ({ id: "record-1", count: 1 }),
  async record => ({ ...record, count: record.count + 1 }),
  (record, next) => {
    queueMicrotask(() => next(null, { ...record, saved: true }));
  },
  record => {
    assert.deepEqual(record, { id: "record-1", count: 2, saved: true });
    return record.id;
  },
  id => id.toUpperCase()
);

assert.equal(result, "RECORD-1");
```

The practical value is putting mixed completion styles into one readable test
sequence, with errors delivered to the test runner. Required callbacks and
explicit waits keep downstream assertions from being skipped by an early pass;
a deadline makes missing completion fail. TDD remains the author's process:
run the test against missing or incorrect behavior and verify that it fails for
the intended reason. No API shape proves an assertion is meaningful.

## expectError is a unified step modifier

`expectError(operation)` means that this step must fail. A synchronous throw,
Promise rejection, and `next(err)` all satisfy that expectation. Successful
completion fails it. Returning an `Error` as a normal value is still success
and therefore fails an error expectation.

The error then flows into the following step, where the author verifies its
identity, message, or application-specific properties. Put the wrapper on the
operation being exercised. Keeping assertions downstream separates their failures
from the error the operation was expected to produce.

```js
import assert from "node:assert/strict";
import { asyncVerify, expectError, runTimeout } from "run-verify";

const expected = new Error("invalid record");
const operations = [
  () => { throw expected; },
  () => Promise.reject(expected),
  next => { queueMicrotask(() => next(expected)); }
];

for (const operation of operations) {
  await asyncVerify(
    runTimeout(500),
    expectError(operation),
    err => {
      assert.equal(err, expected);
      assert.equal(err.message, "invalid record");
    }
  );
}
```

`expectErrorHas` and `expectErrorToBe` add message checks and still pipe the error
forward. `wrapCheck(fn).withCallback.expectError` combines existing modifiers on
one step; it does not restrict the error to a callback channel.

If a particular test must prove that a callback was invoked, it can record that
invocation in its adapter and assert it downstream. That is additional evidence
for that test, not a reason to change `expectError`. Separate
`expectCallbackError` / `expectReject` APIs are not part of this proposal.

## Sequential work can coordinate signals outside the sequence

`runDefer` complements the pipeline. Including a defer registers an outstanding
signal while allowing subsequent steps to run. Including `defer.wait()` creates
an explicit point where the sequence waits and receives that signal's value.
This lets a test arrange listeners, trigger work, and inspect events even when
those events arrive before the wait step is reached.

```js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { asyncVerify, runDefer, runFinally, runTimeout } from "run-verify";

const store = new EventEmitter();
const saved = runDefer();
const onSaved = record => saved.resolve(record);

await asyncVerify(
  runTimeout(500),
  runFinally(() => { store.off("saved", onSaved); }),
  saved,
  () => {
    store.once("saved", onSaved);
    store.emit("saved", { id: "record-1" });
  },
  saved.wait(),
  async record => {
    await Promise.resolve();
    assert.equal(record.id, "record-1");
  }
);

assert.equal(store.listenerCount("saved"), 0);
```

Assertions after `wait()` use the normal step machinery, including returned
Promises. A bound handler is unnecessary for this recipe. Existing
`onResolve` / `onReject` handlers and defer rearming are separate patterns whose
lifecycle must be understood before changing them.

Several signals may occur independently while the test inspects their results
in an intentional order. Preserve `clear`, `waitAgain`, and
registration-versus-wait semantics until there is a specific, agreed reason to
change them. Replacing them with one-shot registrations would lose useful
orchestration.

## Preserve distinctions within the runner

Not every item in the argument list is an ordinary transforming step:

| Existing construct | Role to preserve |
| --- | --- |
| Plain function / `withCallback` | Work or assertion with result forwarding; a one-parameter callback step receives only `next` |
| `expectError` and message variants | Interpret this step's failure as its expected output |
| `runTimeout(ms)` | At this position, start or replace the runner timer; preserve the current value |
| Registered defer | Track a signal without blocking progression at registration |
| `defer.wait()` | Wait at this position and supply the signal value |
| `runFinally(fn)` | Register cleanup, extracted from the ordinary sequence |
| `onFailVerify(fn)` | Existing positional failure hook, skipped on successful progression |
| `wrapAsyncVerify` / `wrapVerify` | Adapt a reusable sequence to accept an external initial value |

In 2.1.1, `runTimeout` is not an independent timer around each operation, even
though it uses wrapper machinery. There is no default package deadline.
`runFinally` callbacks are collected regardless of position; current behavior
does not guarantee sequential awaited cleanup or attempting every cleanup after
one throws.

Callback inference also exists: native async functions use Promise completion;
ordinary functions with two parameters receive `(result, next)`; single-parameter
callback detection uses the wrapper or recognized parameter-name prefixes, and such a
step receives only `next`. Examples can use `withCallback` without removing inference
from existing code, but only a one-parameter step is affected by it.
A callback-mode operation's returned Promise is not a second completion path
to race against `next`.

Inference is implemented by string-matching `Function.prototype.toString()`, and two
defects in that helper are recorded in
[run-verify-frv5-audit-2026-09-08.md](run-verify-frv5-audit-2026-09-08.md). Typing work
should not assume the current detection accepts every function form.

## Improve the pipeline before adding API surface

First, lead documentation with result flow, mixed steps, unified expected errors,
and arrange-trigger-wait-assert examples. Show reusable functions and spreadable
step arrays. Explain when an assertion needs to return its input.

Next, investigate **typing the connections between steps**. Today
`CheckFunction`, `WrapObject`, and variadic runner signatures erase most
input/output information. A useful type design would retain those types through
modifiers, unwrap Promise outputs, and check adjacent steps. Expected-error output
must not assume arbitrary rejection values always have the shape of `Error`.

Validate proposed typings against existing consumers, callback inputs, reusable
arrays, defers, and modifier composition. Stricter declarations can break builds
with identical JavaScript. Do not hide unsupported cases behind a permissive
fallback and claim full checking.

Diagnostics should identify the **step that stopped the sequence**, its failure,
and the active timeout. Investigate preserving original assertion stacks and
adding step context before adding a public naming wrapper. Named functions
already provide useful vocabulary; exact fields and any new wrapper are undecided.

Concrete consumer evidence supports improving recipes before inventing helpers:

- [AveAzul callback tests](../packages/aveazul/test/asCallback.test.ts) already
  pipe callback success and expected errors into ordinary assertion steps. Its
  spread-callback case can package results with `next(err, values)` rather than
  requiring a new runner result convention.
- [XRun tests](../packages/xarc-run/test/spec/xrun.spec.js) use the same
  `expectError` for Promise and callback failures. Exit stubs can already supply
  status with `defer.resolve(status)` and inspect it after `defer.wait()`, instead
  of storing that status outside the sequence.

These are ordered design directions, not an approved API surface. A new use case
should first be expressed as a composition of existing steps.

## Audit trail

The disposition of the withdrawn FRV-3/4/5 work, the evidence table for any future
runtime change, the verification runs, and two defects found in callback inference are
recorded in [run-verify-frv5-audit-2026-09-08.md](run-verify-frv5-audit-2026-09-08.md).

