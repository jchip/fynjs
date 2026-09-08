# run-verify API redesign

Date: 2026-09-07

Tracking: FRV-3; follows the README work in FRV-1 and FRV-2.

Status: design proposal. Names, signatures, and stricter behavior below are not
implemented or approved migration decisions.

## Purpose: make the TDD intention explicit

The core intention is test-driven development: write a failing test first, observe
it fail for the intended reason, implement the behavior until the test passes, and
refactor while keeping it passing.

`run-verify` APIs should make that intention explicit and convenient to express.
A passing test should mean that its declared evidence was obtained and verified.
The absence of an exception alone is insufficient: an assertion may never run, an
expected rejection may never occur, or a callback may never be invoked.

This is the negative-confirmation philosophy discussed in the package README:
missing or incorrect required behavior must make the test fail. It applies to
success-path tests as well as tests of errors.

The proposed primary API unit is a **verification obligation**:

- A name identifying the behavior under test.
- A specific required outcome and completion channel.
- An operation or signal source that supplies the evidence.
- A required verifier for that evidence.
- A finite deadline, specified directly or inherited from a verification scope.

The lifecycle is **registered → outcome observed → verification passed**. Observing
an outcome is insufficient until its verifier completes successfully.

## Why this remains useful on modern Node.js

Native async/await, `assert.throws`, `assert.rejects`, event Promises, and deferred
Promises can express these tests. Ordinary Promise-only tests may need nothing
more. The package's value is a consistent contract across mixed synchronous,
Promise, callback, and signal-based tests, with obligations, evidence checking,
completion ownership, deadlines, and diagnostics designed together.

The redesign should build on native constructs and existing assertion libraries.
It should not become a general workflow engine or a competing assertion library.

## Current API assessment

The assessment is based on [the source](../packages/run-verify/src/index.ts),
[the package tests](../packages/run-verify/test/spec/index.spec.ts), and live
consumers. These are design gaps relative to the intended contract, not promises
that the current implementation already provides stronger behavior.

| Current API or behavior | Useful property | Improvement opportunity |
| --- | --- | --- |
| `expectError` | Requires an error rather than silently accepting success | Distinguish a synchronous throw, Promise rejection, and callback error when the test requires a particular channel |
| Separate operation and assertion steps | Assertions run within runner error handling | Bind an outcome to its required verifier so the obligation is visible in one declaration |
| `withCallback` and inferred callback mode | Adapts error-first callbacks | Make callback mode explicit throughout the new surface; preserve all result arguments with tuple types |
| Registered `runDefer` objects | Pending registered defers prevent successful completion | Expose named signal obligations instead of mutable deferred state and rearming mechanics |
| `runTimeout` as a sequence step | Bounds work after the step is reached | Configure deadlines at scope and obligation boundaries |
| `runFinally` | Runs cleanup and supports returned Promises | Specify cleanup ordering, deadlines, and error reporting as part of the lifecycle |
| `onResolve`, `onReject`, `onFailVerify` | Protect synchronous callbacks | Await every verifier consistently in the new contract; current handlers do not await returned Promises |
| Variadic `any` arguments and mutable wrappers | Flexible composition | Use narrow public types and immutable expectation configuration |
| Numeric step diagnostics | Indicate where progress stopped | Name the unmet obligation and distinguish missing occurrence, wrong channel, and failed verification |

### Concrete consumer needs

[AveAzul callback tests](../packages/aveazul/test/asCallback.test.ts) use
`asyncVerify` to exercise callback success and error paths. Its spread-callback
test manually builds a Promise to verify multiple result arguments. An explicit
callback expectation with typed argument tuples would address an existing need.

[XRun tests](../packages/xarc-run/test/spec/xrun.spec.js) combine exit stubs,
`runDefer`, mutable external status, and later assertions. A named signal carrying
the exit status could make that evidence and its verification one obligation.

## Outcome-specific contracts

The broad behavior of `expectError` is convenient when any failure channel is
acceptable. It is too permissive for a test specifically requiring a callback
error: a synchronous throw before the callback may satisfy the existing wrapper.

The proposed explicit surface separates these intentions:

| Proposed scope method | Required outcome | Examples of failures |
| --- | --- | --- |
| `expectThrow` | The operation throws synchronously | Returns normally or only returns a rejected Promise |
| `expectReject` | The operation returns a Promise/thenable that rejects | Throws synchronously, fulfills, or fails to provide an asynchronous result |
| `expectResolve` | The operation returns a Promise/thenable that fulfills | Throws synchronously or rejects |
| `expectCallback` | An error-first callback reports success | Registration throws, callback supplies an error, or callback is missing |
| `expectCallbackError` | The callback supplies an error | Registration throws, callback reports success, or callback is missing |
| `expectEvent` | The specified event occurs | Event is missing, source fails under the declared error policy, or payload verification fails |

All of these also fail when the bound verifier throws, rejects, or exceeds its
deadline. A wrong-channel failure must never satisfy an expected-error obligation.
Operation capture and verifier execution must use separate error handling so an
assertion failure cannot be mistaken for the expected operation failure.

Keep a custom signal adapter for stubs and non-EventEmitter sources. Its exact
public shape can follow the same lifecycle once the core contracts are settled.
Occurrence-only expectations should be explicitly named choices; whether to offer
them in the first release is still open. A required verifier alone cannot prove
that it contains a meaningful assertion.

## Design for LLM-generated code

The objective is code that is easy to generate correctly, inspect, check with the
compiler, and repair from precise feedback. These choices are engineering
hypotheses about improving model-generated test correctness, not measured claims
about LLM performance. The evaluation below is needed to establish their benefit.

### One canonical call shape per intention

Prefer one named options object over positional arguments or fluent modifiers.
Use the same field names wherever their meaning is the same: `name`, `run`,
`verify`, and `timeoutMs`. Event adapters need additional source-specific fields.

The method selects the outcome; do not also require a redundant `kind` field that
can disagree with it. Avoid aliases and overloads that switch execution modes.
Do not infer semantics from parameter names, function arity, or constructor names.

Illustrative proposed usage, not executable against the current package:

```ts
import assert from "node:assert/strict";
import { verify } from "run-verify";

it("reports invalid input through its callback", () =>
  verify({ timeoutMs: 500 }, v => {
    v.expectCallbackError({
      name: "invalid input reaches the error callback",
      run: callback => saveRecord({ id: "" }, callback),
      verify: error => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, "INVALID_INPUT");
      }
    });
  })
);
```

`saveRecord` and `ValidationError` represent the application under test. The
declaration identifies the required channel, names the behavior, and binds the
evidence check. A synchronous `ValidationError` thrown instead of invoking the
callback fails this test even though its type and code match.

### Strong types and runtime validation

Each method should have a narrow options type with required operation/source and
verifier fields. Infer verifier input from operation results or callback argument
tuples. Treat unknown rejection values as `unknown` and demonstrate narrowing in
examples instead of hiding uncertainty with `any`.

Use an internal discriminated union to represent different obligation kinds;
TypeScript can narrow such unions and check exhaustiveness. Separate public
methods avoid forcing callers to construct that union themselves. See the
[TypeScript narrowing documentation](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).

Keep types understandable and avoid deeply conditional overloads that produce
unhelpful compiler errors. TypeScript's own guidance favors simpler signatures
where possible; see [writing good overloads](https://www.typescriptlang.org/docs/handbook/2/functions.html#writing-good-overloads).

Runtime checks remain necessary for JavaScript callers and invalid generated code.
Reject missing verifiers, invalid deadlines, and unknown configuration keys rather
than silently ignoring a misspelled option. Define one verifier convention:
assertions throw or reject on failure. Do not silently interpret a returned
`false` as successful verification; predicate support, if added, needs a separate
explicit contract. Exact permitted verifier return types remain a design decision
because assertion libraries have different return conventions.

### Let the scope own completion

Creating an expectation through the scope should immediately register it. The
outer `verify` Promise must not fulfill until the body and all registered
obligations, including asynchronous verifiers, complete successfully. Individual
awaitable handles may allow sequencing, but forgetting an individual `await` must
not detach an already registered obligation.

The test still must return or await the outer Promise. Document that requirement
in every canonical recipe, and consider a narrow runner adapter or lint rule only
if evidence shows that it is needed.

Expectations inside branches that never run remain invisible. The scope should
reject an empty verification by default, but this catches only the empty case.
Examples should declare required expectations before triggering work. Required
counts or runner assertion plans can provide additional coverage; none proves the
semantic quality of a verifier.

The scope must define when registration closes and report attempts to register
after closure. Callback adapters must declare which completion channel they own:
some real callback APIs also return Promises. Handling a returned Promise's errors
must not accidentally let that Promise satisfy a callback obligation.

### Precise feedback for the next coding iteration

Report stable error categories with structured fields as well as readable text.
Possible categories are invalid contract, missing outcome, wrong channel, failed
verifier, and cleanup failure. Proposed names for error codes are not finalized.

For example:

```text
RV_WRONG_CHANNEL
Obligation: invalid input reaches the error callback
Expected: callback(error)
Observed: synchronous throw before callback
Cause: ValidationError: invalid input
```

```text
RV_TIMEOUT
Obligation: saved record has the requested ID
Phase: waiting for event "saved"
Deadline: 500 ms
```

Distinguish waiting for occurrence from waiting for an asynchronous verifier.
Preserve the original error, assertion details, and stack; add the declaration
location and obligation context without destroying them. Report all still-pending
obligation names at a scope deadline where practical.

The diagnostic should explain the mismatch, not recommend weakening the test to
accept the observed behavior. That distinction matters during automated repair.

### Canonical, executable documentation

Publish one short, complete recipe per outcome with the same call shape used by
the type declarations. Each recipe should have a paired red case and green case:
the missing/broken behavior fails for the intended reason, and the implemented
behavior passes. Include a verifier that rejects asynchronously in contract tests.

Check examples in CI once the proposed APIs exist. Keep the published reference
consistent with the installed version. Separate legacy API documentation from
the recommended new surface so generated code does not combine incompatible
styles. Describe common wrong patterns next to their precise failures: missing
callback, wrong error channel, skipped evidence check, and missing outer await.

## Event, count, deadline, and cleanup semantics

Event expectations must install listeners before their trigger can run. On scope
failure or completion, remove owned listeners and timers. Specify the policy for
source errors and preserve all event arguments for verification.

Prefer one-shot obligations to mutable rearming through `clear` and `waitAgain`.
Repeated events should be separate observations or a deliberately bounded stream
contract, not implicit reuse of a completed expectation.

“Exactly once” and “never occurs” need an explicit observation boundary, such as
an operation's completion or a finite observation window. Fulfilling a Promise on
the first callback cannot prove no second callback will arrive later. Scope-owned
resources make detection possible while the scope remains active, not forever.

Use a finite scope deadline and optional per-obligation overrides. The specific
default or requirement to supply it must be decided before implementation. Define
when each deadline begins and whether a verifier shares its occurrence deadline.

A verification timeout does not cancel arbitrary application work. Expose
cooperative cancellation where the source supports it and clean up owned resources.
Cleanup needs a defined order and its own bounded completion policy. Attempt all
registered cleanup actions and preserve primary verification failures alongside
cleanup failures rather than obscuring the original reason the test failed.

## Validate the API against the philosophy

The library's own tests should demonstrate both the red and green behavior of each
contract. The intended failure reason is part of the assertion.

| Scenario | Required result |
| --- | --- |
| Callback never runs | Named missing-outcome/deadline failure |
| Callback-error expectation sees a synchronous throw | Wrong-channel failure |
| Expected rejection fulfills | Expected-rejection failure |
| Correct channel supplies incorrect evidence | Original verifier failure with obligation context |
| Asynchronous verifier rejects or remains pending | Failure or deadline; never early success |
| One of several registered signals is missing | Scope cannot pass; missing signal identified |
| Invalid or empty declaration | Contract error before misleading success |
| Event is emitted synchronously by its trigger | Armed expectation observes it |
| Additional invocation occurs inside a declared exact-count window | Count failure |
| Cleanup fails after verification fails | Both failures remain inspectable |
| Correct outcome and evidence complete | Successful verification |

For LLM evaluation, compare the existing and proposed APIs on a fixed collection
of callback, Promise, event, and mixed-interface tasks. Keep task specifications,
model settings, and evaluation budgets comparable; run multiple generations.
Evaluate generated tests against correct implementations and hidden faulty
implementations, rather than asking only whether the generated code compiles.

Measure false passes on missing/wrong behavior, false failures on correct behavior,
contract misuse, and repair success using compiler/runtime diagnostics. Also record
generation and repair cost. Include failures that occur through the wrong channel
and verifiers that are skipped or not awaited. A model that makes a test green by
loosening its obligation has not successfully repaired it.

No such model evaluation has been run for this proposal. A TDD helper cannot prove
that an author observed the initial red phase; red-case execution and mutation
checks supply that evidence separately.

## Priorities and migration decisions

The first increment should establish explicit outcome adapters, bound asynchronous
verification, typed callback tuples, scope ownership, and named deadlines and
diagnostics. Event and custom-signal convenience APIs can build on that shared
lifecycle. Count and absence contracts should follow only after observation
boundaries are fully specified.

An additive explicit surface is a candidate strategy, not an approved migration.
Do not silently change `expectError` channel acceptance, callback inference,
timeout defaults, defer reuse, or cleanup behavior in existing callers.

Before implementation, discuss migration with the user as required by AGENTS.md.
Decisions include public names and exports, coexistence with the old runner,
deadline policy, invocation-count policy, verifier return conventions, cleanup
semantics, and which consumers should adopt the new surface. This document
authorizes no runtime changes or consumer migration.
