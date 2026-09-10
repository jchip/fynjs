# run-verify: FRV-3/4/5 audit and disposition

Date: 2026-09-08

Status: retro record. The design argument lives in
[run-verify-api-redesign.md](run-verify-api-redesign.md). This note keeps the audit
trail for the withdrawn work and the verification evidence, so the design doc does not
carry it.

## Disposition of the isolated changes

| Branch work | Reassessment |
| --- | --- |
| FRV-1 / FRV-2 README | Keep accurate example corrections and useful TDD guidance; lead with the pipeline |
| FRV-3 / FRV-4 redesign | Withdraw the registration harness, mandatory bound verifier, channel-specific error split, and replacement of defer coordination |
| FRV-5 defer handlers | Removed; source and generated runtime restored to the 2.1.1 baseline |

The old timing-test anecdote does not demonstrate a missing runner abstraction.
Measuring the wrong interval needs a corrected measurement; an object binding
the same assertion cannot establish its correctness.

The FRV-5 audit reproduced early success before a delayed handler rejection in
three cases: synchronous resolution during an ordinary step, an explicit
`defer.wait()`, and another defer resolving while a handler is pending.
A single signal delivered after the ordinary steps finished did wait and reject.

In the removed implementation, `onDefer` marked the defer `invoked` before
returned handler Promises settled, while sequence exhaustion and other defer
completions still used `invoked` to decide success. Waiting locally inside one
`onDefer` could not close every completion path.

The baseline discards async handler returns; FRV-5 caught some of those
rejections but could consume them after already reporting success. This is a
completion-handling issue, not evidence against the pipeline architecture.

The two FRV-5 async-handler tests and their obsolete comments were removed.
Nine replacement pipeline tests cover mixed completion and value flow, unified
expected errors, unexpected success, and asynchronous verification after
`defer.wait()`.

A handler return type of `void` does not establish that awaiting a returned
Promise preserves behavior. Awaiting can change timing, failure results, waits,
and cleanup. For existing APIs, asynchronous verification can already run as an
ordinary step after `defer.wait()`.

## Evidence required before runtime work

Some [existing callback-style tests](../packages/run-verify/test/spec/index.spec.ts)
catch failed assertions and call their resolving `done()` in both paths. Others
pass a Promise resolver as an error-first terminal callback, allowing an error
to resolve the test Promise. A green suite alone does not validate those cases.
Use independent assertions that reject or throw on failure.

| Contract | Evidence to establish |
| --- | --- |
| Ordered value flow | Mixed sync, Promise, and callback steps receive actual previous outputs in order |
| Unified expected errors | All three error forms reach the next assertion; ordinary success fails the expectation |
| Assertion boundaries | A following assertion's throw or rejection fails the run |
| Missing completion | Missing callback or signal fails under an explicit deadline |
| Defer coordination | Signal before/after wait, multiple defers, explicit wait, and rearming preserve their semantics |
| Handler awaiting, if pursued | Sequence exhaustion, another defer, and explicit waits cannot bypass a pending handler |
| Existing lifecycle | Characterize result, timeout, failure-hook, and cleanup behavior before changing it |

Run documentation recipes against the restored baseline and this branch.
For a proposed fix, establish the failing case independently before implementing
it. An expected error around an entire test must not conceal which inner step
actually failed.

## Verification runs

Validation on 2026-09-08: all three complete recipes in the design doc and the README's
new opening example passed against both baseline and branch source. Nine additional
checks per revision covered unexpected success, downstream sync/async assertion
failure, missing callbacks/signals, and explicit value forwarding. These checks
validate the examples, not every lifecycle edge.

Executed on 2026-09-08 against installed dependencies:

- `tsc --noEmit -p tsconfig.json` passes.
- `tsc --noEmit -p tsconfig.test.json` passes.
- `vitest run` reports 61 passing tests in 2 files: 52 in `index.spec.ts` and 9 in
  `pipeline.spec.ts`. An earlier revision of the design doc said 54 existing tests;
  the correct split is 52 plus 9.

The suite's green result is subject to the assertion-propagation limitations described
above.

## Defects found in callback inference

Found on 2026-09-08 while verifying the documented parameter rules. Both lived in
`detectWantCallbackByParamName` in
[`packages/run-verify/src/index.ts`](../packages/run-verify/src/index.ts), which infers
a step's completion style by string-matching `Function.prototype.toString()`.

**Both fixed on 2026-09-08**, after the full parameter-form matrix was written down as
failing tests in `packages/run-verify/test/spec/callback-detection.spec.ts`. That spec
pins 29 cases: 10 of them reproduced these two defects before the fix. The parser now
matches a single unparenthesized arrow parameter with a pattern anchored at the start of
the source, and otherwise reads the first parenthesis group, which is allowed to be
empty. A step's body no longer takes part in the decision. The description below is kept
because it explains what the parser was doing and why the shapes below were affected.

A zero-parameter step reaches the helper at all because the arity checks above it only
special-case `AsyncFunction` and `length > 1`, so `length === 0` falls into
single-parameter detection.

**1. A zero-parameter non-async `function` step fails the run.**

```js
await asyncVerify(
  () => "first",
  function () {
    return "second";
  } // Error: runVerify param 1 unable to match arg name
);
```

The fallback regex `/^[^\(]*\(([^\)]+)\)/` requires at least one character between the
parentheses, so an empty `()` never matches and the helper fails the run. `() => {}`
escapes this because the arrow branch handles it, and `async function () {}` escapes it
because `AsyncFunction` never reaches the helper. So the documented zero-parameter form
works and the `function` keyword form does not.

**2. An arrow inside a non-async function body defeats parameter detection.**

```js
await asyncVerify(
  () => "first",
  function (next) {
    const identity = x => x; // the first "=>" in the source
    next(null, identity("ok")); // TypeError: next is not a function
  }
);
```

`fatIx` is the index of the first `=>` anywhere in the source text, including the body.
For a `function` form, `funcStr[0] !== "("` is true, so the arrow branch takes
`substring(0, fatIx)` and parses the body prefix as the parameter list. The result
starts with `function`, not `next`, so the step is treated as taking a result. `next` is
then bound to the previous value and calling it throws.

Both cases fail loudly rather than silently, and `withCallback` works around case 2.
Reproductions are in `.temp/run-verify-readme-contract.spec.ts`, which also locks the
documented parameter and value-flow rules that do pass.
