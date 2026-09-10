# run-verify: an explicit step API on top of the positional runtime

Date: 2026-09-08

Status: **implemented** on 2026-09-08 as `verify()` in
`packages/run-verify/src/chain.ts`, now with 61 tests in `test/spec/chain.spec.ts` and a
README section. Additive: `asyncVerify` is unchanged. This note is kept for the design
rationale and the rejected alternatives.

**The shipped API has since diverged from the design below. The README is the current
reference; read this note for the reasoning, not the shape.** Three changes, all from
`49fe6916` and `33630fce`:

| Proposed here | Shipped |
| --- | --- |
| `.withCallback.step(fn)` | `.callbackStep(fn)`, a method rather than a modifier |
| `.step(fn)` for every completion style | `.step` / `.asyncStep` / `.callbackStep`, split by what is knowable from the value |
| `.awaiting(name)` as a modifier | `.awaiting(name)` as a chain method (already noted under [Open question](#open-question)) |

The principle behind the split is that the only thing `.step()` cannot detect is whether
a bare function wants a callback; a thenable can be adopted and an array cannot have its
intention guessed, so an array gets its own method. `.step()` also takes a value, not
only a function, and `.expectErrorToBe` / `.expectErrorHas` were added. Occurrences of
the superseded shape are marked inline below.

The migration trial proposed at the end of this note has happened:
`xarc-run/test/spec/{finally,sample1,reporters/sample1}.spec.js` and aveazul's specs are
on the chain, and `xrun.spec.js` is partly converted.

Builds on [run-verify-assessment.md](run-verify-assessment.md), which argues what the
library is worth and why the current API cannot explain itself. This note covers what
to do about it. The design argument for the pipeline is in
[run-verify-api-redesign.md](run-verify-api-redesign.md).

## The problem

The positional argument list is too implicit. Order carries the meaning, a step's role
is inferred from its position, and its completion style is inferred from its source
text. Nothing in the call expression or the types says any of that, which is why a
reader working from the README or the `.d.ts` cannot reconstruct the design.

The flat list is also not visually consistent, which matters because consistent looking
tests were the point of building it:

```js
asyncVerify(
  runTimeout(500),                                // wrapped call
  runFinally(() => store.off("saved", onSaved)),  // wrapped call
  saved,                                          // bare object
  () => { store.once("saved", onSaved); return store.save("a"); },  // bare arrow
  saved.wait(),                                   // method call
  record => expect(record.id).to.equal("a")       // bare arrow
);
```

Six lines, four shapes.

## Design constraints

These came out of the design discussion and are decisions, not open questions.

- **No generator or coroutine syntax.** Rejected outright.
- **No positional argument list.** Too implicit to fix by adding wrappers.
- **One step primitive.** `.step()` is the single thing that mirrors the flat list. The
  explicitness comes from each step being explicitly added, not from a vocabulary of
  verbs. No `.run`, `.check`, `.event`.
- **Modifiers, not verbs.** Anything that changes how a step behaves is a modifier on
  that step.
- **Out-of-band concerns go in a config object.** Supported by the data: 22 of 23
  `runTimeout` call sites are already a single leading timeout, and the one
  mid-sequence use is run-verify's own test for that feature.
- **One flowing expression.** The chain is thenable, so `await` starts the run and the
  last step's value is the result. No terminal `.run()` to forget.

## The design

```js
await verify({ timeout: 500 })
  .step(() => 2)
  .step(value => value * 3)
  .step(async value => `count=${value}`)
  .step(value => value.length);            // resolves 7, inferred as number

await verify({ timeout: 500, cleanup: closeStore })
  .step(() => store.save("a"))
  .keep.step(record => assert.equal(record.id, "a"))   // asserts, forwards the record
  .step(record => record.id);

await verify()
  .step(() => 41)
  .withCallback.step((value, next) => next(null, value + 1));  // shipped: .callbackStep(...)

await verify({ timeout: 500 })
  .expectError.step(() => store.reject("a"))
  .step(err => assert.match(err.message, /cannot save/));

await verify({ timeout: 500 })
  .step(() => 1)
  .withCallback.expectError.step((_input, next) => next(boom))  // shipped: .expectError.callbackStep(...)
  .step(err => err);
```

Modifiers:

| Modifier | Effect on the next `.step` |
| --- | --- |
| `.withCallback` — superseded by the `.callbackStep` method | the step takes `(input, next)` and finishes through `next` |
| `.expectError` | the step must fail; the error becomes the value, typed `unknown` |
| `.keep` | the step passes its input through, whatever it returns |

`.keep` is what retires the `undefined`-forwarding trap without adding a verb.
`.step` forwards what the function returns, `.keep.step` forwards the input.

A modifier is a getter that returns a new builder with a different type. Because the
chain is immutable this is safe: it returns a new object rather than flagging and
returning `this`, so there is no aliasing hazard and it types cleanly.

## Verified results

Prototype at `.temp/run-verify-step-chain-prototype.spec.ts`, which is outside version
control. 10 of 10 runtime tests pass and every type-level assertion holds under full
`--strict` with TypeScript 7.0.2. An earlier fluent variant is at
`.temp/run-verify-fluent-prototype.spec.ts`, 9 of 9.

- Values thread with **no annotations**, across sync and async steps.
- Modifiers compose in either order, and do not leak to the following step.
- `.expectError` yields `unknown`, not `Error`. A rejection value can be anything, so
  `Error` would be unsound.
- A mismatched step is a real compile error.
- Config `cleanup` runs on the failure path.
- The chain is immutable, so a prefix is reusable and two branches run independently.
  Awaiting the same chain twice runs it once.
- A zero-parameter `function () {}` step works, which the positional API cannot do.
- **No overload cliff.** One generic signature per modifier, no arity limit, and no
  fallback to a loose signature past some N.

## Why a facade, not a rewrite

Every prototype is a pure facade over the unmodified 2.1.1 runtime. They all ran green
against `src/` with **zero source changes**.

| Explicit surface | Translates to |
| --- | --- |
| `.step(fn)` | arity-1 wrapper `(input) => fn(input)` appended to the list |
| `.keep.step(fn)` | arity-1 wrapper that returns its input |
| `.withCallback.step(fn)` — shipped as `.callbackStep(fn)` | arity-2 wrapper `(input, next) => fn(input, next)` |
| `.expectError.step(fn)` | `expectError(wrapper)` |
| `.withCallback.expectError.step(fn)` — shipped as `.expectError.callbackStep(fn)` | `expectError(arity-2 wrapper)`, the existing `wrapCheck(fn).withCallback.expectError` path |
| `config.timeout` | a leading `runTimeout(ms)` |
| `config.cleanup` | `runFinally(fn)` entries |

Two consequences worth stating.

**The facade fixes the inference defects for free.** Every wrapper has a fixed arity
and a neutral parameter name, so the runner never inspects a caller's function source.
The two crash bugs in the audit note are unreachable through the new surface without
touching `src`.

**Both surfaces coexist, so migration is optional forever.** This is the main argument
for a facade over a rewrite. A rewrite forces the migration. A facade makes it
opportunistic. `asyncVerify` stays as it is, the chain is additive on 2.x, and existing
tests keep passing untouched.

One known seam. `errorFromCall` captures the stack at the `asyncVerify` call site,
which under a facade is the facade rather than the test. Verified: a user's error keeps
its own identity and its stack still points at the test file, because the runtime passes
the original error through to `done`. Only library-generated messages (timeout,
"expecting error", "param N is not a function") use `errorFromCall`, so those gain
facade frames. That is cosmetic and does not affect the diagnostic property that makes
the library worth using.

## Migration surface

If a migration is wanted, this is the whole of it:

| File | verify calls | callback steps |
| --- | --- | --- |
| `xarc-run/test/spec/xrun.spec.js` | 68 | 72 |
| `aveazul/test/asCallback.test.ts` | 4 | 4 |
| `xarc-run/test/spec/finally.spec.js` | 3 | 3 |
| `xarc-run/test/spec/sample1.spec.js` | 3 | 5 |
| `xarc-run/test/spec/reporters/sample1.spec.js` | 2 | 3 |
| **5 consumer files** | **80** | **87** |

85% of it is one file. run-verify's own `index.spec.ts`, another 72 calls, should **stay**
on the positional API, because it is the test suite for the positional runtime the
facade sits on. Migrating it would delete the coverage of the layer underneath.

Mechanical translation, as shipped (the last two lines were proposed as
`.withCallback.step`):

```
asyncVerify(a, b, c)        ->  verify().step(a).step(b).step(c)
leading runTimeout(n)       ->  verify({ timeout: n })
runFinally(f)               ->  verify({ cleanup: f })
expectError(fn)             ->  .expectError.step(fn)
(result, next) => ...       ->  .callbackStep((result, next) => ...)
next => ...                 ->  .callbackStep(next => ...)
```

One part needs human judgment rather than a codemod: choosing `.step` versus
`.keep.step` for assertion steps, which depends on whether a later step uses the value.
That is exactly the rule the positional API made invisible, so the migration doubles as
an audit of where a test was silently relying on `undefined`.

## Proposed next step

Add the chain as an additive export on 2.x. Migrate nothing. Then port
`xarc-run/test/spec/xrun.spec.js` and nothing else, as a single contained trial.

That file is 85% of the surface and the most callback-heavy code in the repo, so it
answers the one question no prototype can: whether the chain still reads well once
there are 68 of them in a file, or whether `.step` per line grates at that volume. That
is a taste judgment on real code, and it needs real code.

If it grates, one file of work is lost and the positional API is untouched. If it reads
well, there is a proven path and a reference example.

## Open question

Deferred signals are the only genuinely positional concern left, because registration
has to happen before the trigger and waiting after it. Config alone cannot express that
ordering. The proposal that stays inside the constraints is a modifier that takes an
argument:

```js
const saved = signal();
await verify({ timeout: 500, signals: { saved }, cleanup: () => store.off("saved", onSaved) })
  .step(() => { store.once("saved", onSaved); return store.save("a"); })
  .awaiting("saved").step(record => assert.equal(record.id, "a"));
```

Registration in config, waiting as a modifier that consumes it. Because `signals` is a
named map, `.awaiting("saved")` can take the next step's input type from that signal's
type and stay inferred.

**Resolved.** This shipped, with one change: `.awaiting(name)` is a chain method rather
than a modifier, because it appends the wait itself and retypes the value. It does not
change how a following `.step` behaves, so calling it a modifier would have been
misleading. `.step` remains the only way to add a function to the sequence. Verified
that the named-signal typing works and that an unknown name is a compile error.

## Rejected alternatives

**Coroutine driver.** `verify(function* () { const record = yield store.save("a"); ... })`
with the toolkit as the generator's parameter. Prototype at
`.temp/run-verify-coroutine-prototype.spec.ts`, 9 of 9 passing, including unmet
obligations, a required failure that did not happen, a deadline attributed to the
stalled step, and assertion propagation. It reads as ordinary sequential code, needs no
per-step ceremony, and makes `runFinally` unnecessary because `try`/`finally` inside the
generator handles cleanup.

Rejected on the syntax, by decision. It also has a hard technical cost: TypeScript gives
a generator one shared "next" type across all yields, so heterogeneous `yield` results
cannot be typed. Confirmed under `--strict` that assigning a `string` result to a
`number` and reading a made-up field both pass silently.

**Uniform wrappers in the flat positional list.** Keep the argument list, make every
element a `verb(...)` call so each names its own role, and thread types with overloads
over a `Step<In, Out>` type. Verified that this **does** typecheck fully, including
un-annotated parameters and pass-through steps sitting mid-chain, which corrects an
earlier claim in the assessment note that the flat list could not be typed.

Rejected because it is still a positional argument list, and because it needs 12 to 16
hand-written overloads and then falls off to a loose signature past that arity. The
chain needs one signature per modifier with no cap.

**A verb vocabulary on the chain** (`.run`, `.check`, `.event`). Rejected: it abandons
the single-primitive constraint and stops mirroring the flat list.

**Mutable builder with flag-setting getters.** Rejected: a getter that sets a flag and
returns `this` breaks under aliasing and is hard to type. Immutability makes the getter
form correct.
