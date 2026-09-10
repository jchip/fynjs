# What converting to run-verify found

Log of concrete defects and anti-patterns turned up while migrating existing packages'
test suites onto `run-verify`'s `verify()` chain (the FRV-3 adoption pass, distinct from
`run-verify-explicit-api-proposal.md` and `run-verify-frv5-audit-2026-09-08.md`, which are
about the library's own design). Packages converted so far, in order: `xarc-run`, `munchy`,
`xsh`, `item-queue`, `fyn` (one spec), `http-server` (one spec), `xaa` (fully converted).
`aveazul` is partially converted (3 of ~26 test files) from earlier work.

The point of this log is to separate **real defects found** from **style-parity churn** —
not every conversion is equally justified, and the anti-pattern catalog below is what to
grep for first when picking the next migration target, ahead of mechanically replacing
event-wait boilerplate for consistency alone.

## A second axis: structural legibility, independent of bugs

The anti-pattern catalog below asks "does native code get this wrong." That is not the only
question worth asking. Per the user (2026-09-10): even when native async/await or Promise
code is already correct, forcing a test into `verify()`'s bounded `.step()`/`.expectError`/
`.awaiting()` sequence still has value, because the test's structure becomes self-evident
from the code itself. A reader (or an editor making a later change) does not have to
mentally simulate free-form control flow — nesting order, what happens on error, what is
guaranteed before what — the chain states it. This is a distinct, additional axis, not a
replacement for the bug-finding one.

In practice: weigh this alongside the anti-pattern catalog, not instead of it. A single,
one-shot promisify wrapper used identically everywhere (e.g. `http-server`'s
`async-event-emitter.spec.ts` `emitAsync` helper, see below) has less to gain from this
axis, since there is no real multi-step sequence to make legible. A test with genuine
multi-step orchestration - setup, trigger, wait, assert, cleanup, especially interleaved
with conditionals - gains real value from being forced into explicit steps even when the
current native version has no bug in it.

## Anti-pattern catalog

These are the shapes worth searching for. In order of how strong a justification they are
for conversion:

1. **Assertion inside a raw async callback, escaping via manual try/catch.** e.g.
   `emitter.on("x", () => { try { expect(...); resolve(); } catch (e) { reject(e); } })`.
   If the assertion fails, without the guard it becomes an uncaught exception instead of a
   clean test failure. This is, per the user directly, one of the founding motivations for
   building run-verify in the first place (see the memory
   `run-verify-origin-motivation.md` — the user confirmed this on 2026-09-09 after the
   `xsh` conversion). `callbackStep` + a following `.step()` removes the need for the guard
   structurally: the callback only signals completion, assertions live downstream where a
   throw is an ordinary rejection.
2. **Assertion that only runs inside a `catch`, with no check outside it.** e.g.
   `try { await op(); } catch (err) { expect(err).toBeTruthy(); }` with nothing after the
   try/catch. If `op()` stops rejecting (a regression), the test passes having verified
   nothing. `.expectError.step(...)` fails the run if the operation *doesn't* fail, closing
   the gap.
3. **Manual resource/intercept cleanup that isn't guarded.** `xstdout.intercept()` or similar
   called without a `try/finally`, or with the `finally` missing on some but not all paths.
   A failure or early return leaks the intercepted state into later tests. `cleanup` in
   `verify()`'s config is a guaranteed backstop regardless of how the run ends.
4. **A hand-rolled promisify wrapper for an error-first callback API**, duplicated at the
   top of a spec file. `callbackStep` is the same adapter, generically, without the
   bespoke per-file helper — but only where the callback's error and success values are
   truly either/or; see the `xsh` caveat below for when they aren't.
5. **Manual `try/finally` around `xstdout.intercept()`/similar, repeated per test.** Not a
   bug by itself (the `finally` is there), but mechanical, repetitive boilerplate that
   `cleanup` replaces 1:1. Worth doing for consistency; weakest justification on its own.

## xarc-run

Two real bugs found in `test/spec/cli/task-file.spec.js`: `xstdout.intercept()` called with
**no** `try/finally` at all in two tests (`"should handle TypeScript file load error"`,
`"should handle ESM TypeScript file"`). If `loadTaskFile` rejected unexpectedly, or an
assertion after the intercept failed, stdout would stay intercepted for every test that ran
afterward. Fixed via `verify({ cleanup: () => intercept.restore() })`.

Also converted `logger.spec.js` and `print-tasks.spec.js` — repeated manual
`try { ... } finally { intercept.restore(); }` boilerplate (anti-pattern #5), no bugs there,
pure consistency win.

## munchy

No bugs found. `test/spec/index.spec.ts` had ~42 tests manually wrapping event waits in
`new Promise(resolve => emitter.on(event, resolve))`. Converted 28 of 45 tests to
`verify({ timeout: 500 }).step(() => once(emitter, "event"))` (Node's built-in
`events.once`, not a run-verify feature by itself, composed with the chain). Two side
benefits, not bug fixes:

- `events.once` rejects if `"error"` fires while awaiting a *different* event, so a
  misbehaving stream now fails with the real error instead of hanging until vitest's
  implicit 5000ms default.
- Explicit `timeout: 500` per test instead of relying on that implicit default.

The other 17 tests were left alone — either fully synchronous or waiting on a fixed
`setTimeout` settle-delay with no event to await, where `verify()` adds nothing.

## xsh

`test/spec/exec.spec.ts`. One clear instance of anti-pattern #1:
`"should emit stdout data before complete @callback"` had `expect()` inside a raw callback,
guarded by `try { ...; resolve(); } catch (e) { reject(e); }`. Converted to
`callbackStep` + a following `.step()`, removing the guard's reason to exist.

Also removed a file-local `execCb` promisify wrapper (anti-pattern #4) and converted two
`.catch(err => error = err).then(...)` / manual two-arg `.then(ok, fail)` tests to
`.expectError.step(...)` (anti-pattern #2's cousin — these were already safe, since the
assertion ran outside the capture, so this was a readability win, not a bug fix).

**Caveat surfaced here**: `xsh.exec`'s callback delivers `(err, output)` where `output` is
meaningful *even when `err` is truthy* — not a strict either/or. `callbackStep` only
forwards one value downstream (the error, in the `expectError` path), so the second arg is
otherwise dropped. Where a test needed both (`"should failed for unknown command"`, which
cross-checks `err.output.stderr === output.stderr`), the fix was to capture `output` via an
outer closure variable inside the `callbackStep` function rather than relying on the
chain to carry it — confirmed safe by reading `src/exec.ts`, where `err.output` and the
callback's second arg are literally the same object reference.

## item-queue

`test/spec/item-queue.spec.ts`. Two real bugs found (`inflight.spec.ts` is fully
synchronous, nothing to convert):

- `"should stop on error"` was anti-pattern #2 exactly: `expect(err).toBeTruthy()` only
  inside the `catch`, nothing outside. Fixed with `.expectError.step(() => pq.wait())`.
- The shared `testConcurrency` helper (used by 2 tests) was anti-pattern #1: the final
  assertion ran inside a bare `setTimeout` callback with no try/catch, and the enclosing
  `Promise` only resolved via a separate `done()` call later in that same callback — so a
  failing assertion there would both throw uncaught *and* leave the test hanging until
  vitest's global timeout, with no attribution to the real cause. Fixed with `signal()` +
  `.awaiting()` for the `"done"` event, moving the assertion into a `.step()`.

`"should reject in wait if Q failed"` and `"should reject in subsequent wait if Q failed"`
were already safe (assertion outside the try/catch) — converted for consistency only.

## fyn

`test/spec/lifecycle-scripts.spec.ts`. No bugs found. 8 of 11 tests shared a file-local
`failRestore(err, intercept)` helper (anti-pattern #4/#5 combined: a hand-rolled cleanup
wrapper called from `.catch()`) that ran `intercept.restore()` then rethrew. Every call site
already restored on the success path too, so nothing leaked - this was boilerplate, not a
bug. Converted to `verify({ cleanup: () => intercept.restore() })`, deleting the helper
entirely, matching the idiom already established in `xarc-run`'s `logger.spec.js` and
`task-file.spec.js` (manual `intercept.restore()` before assertions, `cleanup` as the
backstop for any path that doesn't reach it).

One test (`"should silently execute a fail script from package.json"`) expected `execute()`
to reject; it already asserted unconditionally after the `.catch()` (not gated inside it), so
converting to `.expectError.step()` is readability, not a bug fix - same category as xsh's
already-converted patterns.

Considered but skipped: `http-server`'s `async-event-emitter.spec.ts` has a single
`emitAsync` promisify helper (anti-pattern #4 shape) used uniformly by all 13 tests via
vitest's own `.resolves`/`.rejects` - already correct, no swallowed errors, and replacing it
with `callbackStep` would be a lateral rewrite with no bug fixed and no consistency win.
Not every anti-pattern-shaped helper is worth converting; this one didn't clear the bar.

## xaa

`test/spec/xaa.spec.ts`. No bugs found - every test that expected an error already guarded
correctly (a `throw new Error("should have thrown")` after the operation, inside `try`, so
the test would have failed on its own if the operation stopped rejecting). First pass
converted only the subset that cleared the bar on one of the two axes:

- **`"should wrap direct throws into async"` / `"should wrap async error"`** - the same
  `.then(() => { throw "expecting error" }).catch(err => error = err).then(() => expect(error)...)`
  shape `xsh` already converted. `.expectError.step()` states the requirement directly
  instead of simulating it with a re-throwing `.then()`.
- **`"should cancel run"` / `"should ignore cancel if already resolved"` / `"should cancel
  run with custom message"`** - genuine multi-step orchestration (start a run, act on it
  mid-flight via `cancel()`, then await the outcome) - a structural-legibility case per the
  axis above, not a bug fix. **Caveat found while converting**: `.step()` adopts a returned
  Promise and awaits it before advancing, so `.step(() => too.run(...))` would make the
  chain await the run to settle *before* the next step's `cancel()` ever gets a chance to
  run - silently breaking the "start, then cancel mid-flight" ordering the test exists to
  check. Fixed by returning `{ promise: too.run(...) }` (a plain, non-thenable value) from
  the first step, so it passes through unawaited, and only awaiting it - via `.expectError`
  or an `async` step - in the following step where `cancel()` runs first.

On continuation, converted the remaining ~13 `try { op(); throw("should have thrown") }
catch (err) { expect(...) }` blocks too (in `defer`, `timeout`, and `map`), for full-file
consistency now that the file was already partway converted - same "already safe,
readability only" category as the rest, no additional bugs found. One (`"should set
context.failed..."`) used `expect(true).toBe(false)` as its guard instead of a throw;
normalized to the same `.expectError.step()` shape as the others. `testInflight`, a
two-test shared helper, converts to returning the `verify()` chain directly rather than
`async`/`await`, matching `item-queue`'s `testConcurrency` precedent.

Left alone: `map`/`each`/`filter`/`tryCatch`/`delay`/`wrap` tests with no error path at all
(nothing to bound), and `"should return defer object that can reject"`, which already uses
vitest's own `expect(...).rejects.toThrow()` - already the best-practice idiom, nothing to
gain by wrapping it further.

## http-server

`test/spec/http-server.spec.ts`. No bugs found. 13 tests shared the shape
`const err = await httpServer(...).catch(e => e); expect(err.code)...` - already safe, since
the assertions run unconditionally after the `.catch()`, not gated inside it (so a
regression that stopped the operation from rejecting would still fail the test on the
`undefined` it produced). Converted to `.expectError.step()` for readability, same category
as xsh's already-converted `.catch(err => error = err).then(...)` pattern - `expectError`
also makes the requirement explicit up front rather than implicit in an unconditional
assertion after a catch-all.
