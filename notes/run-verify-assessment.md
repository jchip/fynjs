# run-verify: independent assessment

Date: 2026-09-08

Status: review, not an approved plan. Answers four questions: what the library is
worth, whether it is still worth using on modern Node, how the API could improve, and
why a frontier model misread it. The design argument it builds on is in
[run-verify-api-redesign.md](run-verify-api-redesign.md). Defects found along the way
are in [run-verify-frv5-audit-2026-09-08.md](run-verify-frv5-audit-2026-09-08.md).

All numbers here were measured on 2026-09-08 against run-verify 2.1.1 with
dependencies installed. Test suite: 61 passing in 2 files (52 in `index.spec.ts`, 9 in
`pipeline.spec.ts`), both source and test type-checks clean, TypeScript 7.0.2.

## What the library is worth

Strip the framing and one mechanism remains: **a test can pass because its assertions
never ran, and run-verify turns that into a failure.** Everything else is packaging.

Export usage across `packages/*/test`, which includes run-verify's own suite:

| Export | Uses | What modern Node offers instead |
| --- | --- | --- |
| `asyncVerify` | 131 | `await`. Sequencing is solved. |
| `expectError` | 70 | `assert.rejects` covers 1 of the 3 failure channels |
| `runVerify` | 45 | nothing, for callback-terminated tests |
| `runDefer` | 38 | `Promise.withResolvers` plus per-test boilerplate |
| `runTimeout` | 31 | a runner-level timeout, with worse diagnostics |
| `runFinally` | 31 | `t.after`, or try/finally |
| `expectErrorToBe` | 12 | `expectError` plus an assertion in the next step |
| `onFailVerify` | 7 | |
| `withCallback` | 6 | |
| `expectErrorHas` | 5 | `expectError` plus an assertion in the next step |
| `wrapCheck` | 4 | |
| `wrapVerify` | 3 | a one-line wrapper users can write |
| `wrapAsyncVerify` | 3 | a one-line wrapper users can write |
| `wrapFn` | 0 | dead in this repo |

Six exports carry the library. The tail of eight accounts for about 40 of roughly 380
call sites. The heavily used features are `runDefer`, `runFinally`, and `expectError`,
which is exactly the set Node has not replaced. That is a real signal, not inertia.

## Is it still worth using

Yes, but for a narrower reason than the README used to claim, and the surface should
shrink rather than grow.

What Node 26 genuinely took over: sequencing with `await`, promise failure with
`assert.rejects`, single events with `events.once`, and promisifying a callback with
`util.promisify` or `Promise.withResolvers`. The original pitch of putting sync,
promise, and callback work into one readable sequence is mostly obsolete. You would
just `await`.

What Node still does not give you in one expression:

- **"This callback must fire."** Promisify a callback that never runs and you get a
  hang. That surfaces as a runner timeout with a stack pointing into the runner.
  run-verify fails at the deadline with the stack captured at the `asyncVerify` call
  site, via `errorFromCall` and `Error.captureStackTrace`. This diagnostic difference
  is the most underrated thing in the library.
- **Several independent signals that must all settle**, registered before the trigger,
  inspected in a chosen order, each with its own deadline, plus cleanup. Doing this by
  hand costs roughly 15 lines of boilerplate per test. A registered defer plus `wait()`
  costs 3. There are 22 bare defer registrations in the test suites, so this is used.
- **Unified expected failure** across a throw, a rejection, and `next(err)`.
  `assert.rejects` handles one channel. `t.plan()` counts only assertions made through
  `t.assert` and subtests, so it does not work with `node:assert` or chai.

**Decision rule.** Use it for callback and event obligations and for multi-signal
coordination. Do not use it for promise-only tests, where
`await assert.rejects(fn, {message})` is clearer and needs no dependency. By that rule
`aveazul/test/asCallback.test.ts` is the right tool for its job and a promise-only spec
is not.

Do not add API surface. Invest in typing, in fixing inference, and in shrinking.

## The core design flaw

**Completion mode is inferred from the function's source text.**
`detectWantCallbackByParamName` in `packages/run-verify/src/index.ts` calls
`checkFunc.toString()` and string-matches the parameter list against
`next|cb|callback|done`. That single decision causes the rest:

- The two crash bugs recorded in the audit note, both since fixed.
- **Renaming a parameter silently changes semantics.** Verified: a step written as
  `(n) => n(null, "x")` is not treated as a callback step. The previous value is bound
  to `n`, and calling it throws `n is not a function`. Any minifying or mangling
  transform over a test bundle changes behavior with nothing failing at build time.
- **It inspects the consumer's functions, not the library's**, so this package's
  `target: ES2018` protects nothing. A consumer whose tests downlevel `async` to ES2016
  loses the `AsyncFunction` fast path. A two-parameter async step is then treated as
  callback mode and hangs until the deadline.
- **It cannot be typed.** `CheckFunction = (...args: any[]) => any` follows directly.

The migration cost is the obstacle. In `aveazul` and `xarc-run` tests there are **107
callback steps relying on name inference and zero uses of `withCallback`**, plus one
two-parameter step. Removing the inference is a major version that touches every
callback test in the repo.

## Diagnostics

Two verified defects, both in reported step positions:

- **`runFinally` shifts every reported index.** `checkFuncs` is `args` with the
  `IS_FINALLY` entries filtered out, but reported indices are indices into the filtered
  array. A step the user wrote at argument position 2, behind two `runFinally` entries,
  is reported as "check function number 0".
- **Numbering is inconsistent.** `expectError` failures report 0-based (`prevIndex`).
  The timeout message reports 1-based (`index + 1`).

Constraint on any fix: four existing tests pin these strings, including three copies of
`"runVerify expecting error from check function number 0"` and one
`"runVerify param 0 is not a function: type string"`. So the numbering fix has to make
the timeout message 0-based. Renumbering `expectError` to 1-based would break the suite
and change a published error format.

## Improvements, ranked by leverage

1. **Type the chain.** See the prototype results below. This is the only change that
   makes the design machine-readable instead of prose a reader has to trust.
2. **Rename `CheckFunction` to `Step<In, Out>`.** Free, and it shifts the mental model
   on its own.
3. **Add `tap(fn)`.** Three lines. It removes the most common bug class, which is the
   `undefined`-forwarding rule: `tap(r => assert.equal(r.id, "x"))` asserts and
   forwards. This is also the rule an LLM gets wrong when writing tests against the
   library, as opposed to describing it.
4. **Make modes explicit, but stage the removal.** Add explicit adapters, document them
   as the only path, keep name inference working with a deprecation notice, and remove
   it in 3.0. 107 call sites depend on it.
5. **Shrink from 14 exports to about 7.** `wrapFn` is unused. `expectErrorHas` and
   `expectErrorToBe` are `expectError` plus an assertion the next step could make.
   `wrapVerify` and `wrapAsyncVerify` are one-liners. Fewer exports means fewer
   attractors for a wrong guess.
6. **Fix the index reporting**, and name the failing step from `checkFunc.name` when it
   has one.

## Why a frontier model misread the API

Astra proposed an object-registration redesign: a registration harness, a mandatory
bound verifier per operation, and a channel-specific error split. Working from the
documentation and types alone, that was close to the only reachable answer. This is
worth recording because the causes are all fixable properties of the library, not of
the reader.

- **The type surface encoded nothing.** `runVerify(...args: any[]): void` and
  `CheckFunction = (...args: any[]) => any` say nothing about order, value flow, or
  which arguments are not steps. Models weight signatures heavily and there was no
  signal in them.
- **`WrapObject` looks like a registration record.** Twelve optional fields,
  `_expectError`, `_withCallback`, `_onFailVerify`, `_timeout`. Pattern-matching on that
  shape yields "an object binding an operation to a verifier", which is exactly what was
  proposed. The type was pointing at the wrong model.
- **The vocabulary points at the wrong model too.** `verify`, `check`, `wrap`, `expect`,
  across 14 exports, reads like an assertion framework. The actual model is closer to
  `pipeline()` or `compose()`, and nothing in the naming says so.
- **The README led with why, not what.** Given a strong rationale and no mechanism
  statement, a reader invents a mechanism consistent with the rationale. "Verification
  is an obligation" plus `wrapCheck` composes cleanly into "each operation must be bound
  to a verifier."

The conclusion is that the core design existed only in the implementation. Anyone
working from the README or the `.d.ts` would confabulate, and a confident writer
confabulates confidently.

Fixed on 2026-09-08: the mechanism is now the first content section of the README, the
first line of the module docstring, and on hover for `runVerify` and `asyncVerify`. The
remaining work is typing.

## Chain typing prototype: verified results

Prototype at `.temp/run-verify-typing-prototype.ts`, checked with TypeScript 7.0.2. It
uses type-level equality assertions, so a wrong output type fails compilation.

**Approach 1, positional overloads.** Each step's output is inferred, then the next
step's parameter is contextually typed from it.

- Values thread with no annotations at all, across sync and async steps. Clean under
  full `--strict`.
- A mismatched step is a real compile error. This is the whole point.
- **Callback steps cannot infer their output.** The type of `next` is contextual, so
  there is nothing for TypeScript to infer the output from. It lands on `unknown` unless
  the step's types are given explicitly.

**Approach 2, one recursive conditional type over the variadic tuple.** This is the only
shape that can express positional pass-through steps.

- Pass-through, `wait()`, and `runFinally` markers are all expressible, and the computed
  output types are correct when parameters are annotated.
- **It cannot thread contextual inference, and this is the blocker.** Each tuple element
  is inferred on its own with no contextual type from the step before it. An
  un-annotated parameter is implicitly `any`. Under `--strict` that is a hard error
  (TS7006). With `--strict false`, which is this package's current setting, there is **no
  error at all**: the chain type computes and checks nothing.

That second point is exactly the trap the design doc warns about. Under the package's
current settings this approach would look like it works while checking nothing.

**Approach 3, hoist the positional concerns then use overloads.** Move `timeout`,
`defers`, and `finally` into a leading options argument and the two techniques stop
fighting. Full inference and the positional concerns, together, clean under `--strict`.

This costs almost nothing here: **22 of 23 `runTimeout` call sites are already a single
leading timeout.** The one mid-sequence use is run-verify's own test for that feature.
So the positional timeout is a documented capability with essentially no real consumer.

Two smaller findings:

- An expected-error step's output must be `unknown`, not `Error`. A rejection value can
  be anything, so `Error` would be unsound.
- In overload position that step's input must be `unknown`, not `never`.
  `strictFunctionTypes` checks the parameter contravariantly and rejects `never`. The
  `never` parameter only works inside the Approach 2 conditional.

**Recommendation.** Approach 3 for a 3.0, or Approach 1 alone if the positional
constructs must stay in the list and a broken chain type after each of them is
acceptable. Do not ship Approach 2 under non-strict settings.

### Correction, same day

The framing above understates what overloads can do, and a later section of this note
called the flat list untypeable. Both are wrong.

The blocker was not the overloads. It was that the steps were **bare functions**, so a
pass-through like `runTimeout(ms)` was not a function of the chain's shape and could not
participate in the sequence. Wrap every element into a uniform `Step<In, Out>` and a
pass-through is simply `Step<T, T>`, needing no special case.

Verified: a flat positional list with uniform wrappers threads types fully under
`--strict`, with un-annotated parameters and with `timeout()` and `cleanup()` sitting
mid-chain. So the trade is not beauty against types. It is that this shape needs 12 to
16 hand-written overloads and then falls off a cliff past that arity, where a method
chain needs one signature per verb with no cap.

The design decision that followed from this is in
[run-verify-explicit-api-proposal.md](run-verify-explicit-api-proposal.md), which also
records the rejected alternatives. The positional list was ultimately rejected for being
implicit, not for being untypeable.

## Fixed since

All three defects this note recorded were fixed on 2026-09-08, each after its failing
tests were written down first:

| Defect | Fix | Tests |
| --- | --- | --- |
| Step index reporting: numbers indexed into the runFinally-filtered list, and the timeout used a different base | Keep each step's original argument position and report that. Move the timeout onto the same 0-based base. | `test/spec/index-reporting.spec.ts`, 7 cases |
| Zero-parameter `function` step crashed with `unable to match arg name` | The parenthesis group is allowed to be empty | `test/spec/callback-detection.spec.ts`, 29 cases |
| An arrow in a step's body hijacked the parameter parse, silently misreading a callback step | Match a bare arrow parameter with a start-anchored pattern, so only the parameter list is read | same spec |

One limitation remains, and is covered by a test rather than left implicit: when the
sequence has run out and the run is waiting on an outstanding defer, the reported number
names the last step reached rather than the defer. It stays inside the caller's argument
range, where the old `index + 1` pointed past the last argument at the done callback.

## Caveats on this assessment

Usage counts come from grep over test directories, so they are approximate and count
textual occurrences rather than distinct semantic uses. `aveazul` and `xarc-run` are
older codebases whose style may not represent how these tests would be written today,
so "heavily used" is evidence of past need, not proof of present need.
