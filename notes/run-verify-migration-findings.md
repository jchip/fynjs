# What converting to run-verify found

Log of concrete defects and anti-patterns turned up while migrating existing packages'
test suites onto `run-verify`'s `verify()` chain (the FRV-3 adoption pass, distinct from
`run-verify-explicit-api-proposal.md` and `run-verify-frv5-audit-2026-09-08.md`, which are
about the library's own design). Packages converted so far, in order: `xarc-run`, `munchy`,
`xsh`, `item-queue`. `aveazul` is partially converted (3 of ~26 test files) from earlier work.

The point of this log is to separate **real defects found** from **style-parity churn** —
not every conversion is equally justified, and the anti-pattern catalog below is what to
grep for first when picking the next migration target, ahead of mechanically replacing
event-wait boilerplate for consistency alone.

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
