# run-verify

**run-verify gives tests a controlled progression.** Organize actions and assertions
into explicit steps, each checked before the next begins. Coordinate callbacks, promises,
and events in the order your test requires, with a deadline to keep the run bounded.

Turn an expected error into a positive outcome. When a step must fail, the expected error
satisfies that step and becomes the input to the next, ready for further assertions.
Unexpected success fails the test.

```bash
fyn add --dev run-verify
```

## Quick start

```js
import assert from "node:assert/strict";
import { verify } from "run-verify";

await verify({ timeout: 500 })
  .step(() => 2)
  .step(value => value * 3)
  .keep.step(value => assert.equal(value, 6))
  .step(value => `count=${value}`)
  .step(label => assert.equal(label, "count=6"));
```

A plain `.step()` replaces the current value with what it returns. An assertion usually
returns `undefined`. Use `.keep.step()` when an assertion should preserve its input.

The chain is thenable and has no terminal method. Awaiting it starts the run. A thrown
error or rejected Promise rejects the run. TypeScript infers the value at each step and
reports incompatible steps at compile time.

## Choose a step

| Method | Use it for |
| --- | --- |
| `.step(fn)` | Synchronous work or a Promise-returning function. The function receives the current value. |
| `.step(value)` | A value or Promise that already exists. A direct Promise has already started. |
| `.asyncStep(fnOrValue)` | Async work where an array should resolve element by element, like `Promise.all`. |
| `.callbackStep(fn)` | An error-first callback API. One parameter receives `next`. Two receive `(value, next)`. |

Pass a function when work must wait for its turn in the chain:

```js
const [a, b] = await verify({ timeout: 500 }).asyncStep(() => [save("a"), save("b")]);
```

`.step()` adopts a single Promise. It passes arrays through unchanged. Use
`.asyncStep()` when an array of promises must settle before the next step.

Callback steps make callback completion explicit:

```js
const record = await verify({ timeout: 500 })
  .callbackStep(next => loadRecord("record-1", next))
  .keep.step(value => assert.equal(value.id, "record-1"));
```

In TypeScript, a callback result defaults to `unknown`. Its type cannot be inferred from
an error-first callback. Provide the type when later steps need its structure:

```ts
const id = await verify({ timeout: 500 })
  .callbackStep<{ id: string }>(next => loadRecord("record-1", next))
  .step(record => record.id);
```

## Require an expected failure

Add an expected-error modifier immediately before the step that must fail:

```js
await verify({ timeout: 500 })
  .expectErrorHas("not found", "TASK_NOT_FOUND")
  .step(() => loadTask("missing"))
  .step(error => assert.equal(error.task, "missing"));
```

| Modifier | Requirement |
| --- | --- |
| `.expectError` | The next step must fail. A throw or rejection counts. A callback error also counts. |
| `.expectErrorToBe(message, code?)` | The top-level message must equal `message`. A supplied `code` must also match. |
| `.expectErrorToBe(Constructor, code?)` | The failure must be an instance of `Constructor`; the next step receives that instance type. A supplied `code` must also match. |
| `.expectErrorHas(message, code?)` | The top-level message must contain `message`. A supplied `code` must also match. |
| `.keep` | The next step must finish. Its input remains the chain value. |

A successful step fails an expected-error requirement. A matching failure becomes the
next value. That value has the `unknown` type. JavaScript can throw any value.

Modifiers affect only the next step method. You can combine modifiers.

## Deadlines and cleanup

Pass run-wide concerns to `verify()`:

```js
let connection;

await verify({
  timeout: 1000,
  cleanup: async () => {
    if (connection) await connection.close();
  }
})
  .step(() => openConnection())
  .step(opened => {
    connection = opened;
    return opened.load();
  })
  .keep.step(result => assert.ok(result));
```

| Option | Effect |
| --- | --- |
| `timeout` | Deadline in milliseconds for the whole run. There is no default. |
| `cleanup` | One function or an array. It runs after success or failure. |
| `signals` | Named external signals that must settle before the run can finish. |

Declare cleanup before fallible setup. Keep that setup inside the chain when cleanup
must cover a partial setup or timeout.

## Require an event or external signal

`signal()` represents work that finishes outside the step sequence. A declaration in
`config.signals` makes the signal required. `.awaiting()` waits for its value at a
deliberate point in the chain.

```js
import { signal, verify } from "run-verify";

const saved = signal();
const onSaved = record => saved.resolve(record);

await verify({
  timeout: 500,
  signals: { saved },
  cleanup: () => store.off("saved", onSaved)
})
  .step(() => {
    store.once("saved", onSaved);
    return store.save("record-1");
  })
  .awaiting(saved)
  .step(record => record.id)
  .step(id => assert.equal(id, "record-1"));
```

Registering a signal does not block the chain. The listener can be ready before the work
starts. The signal can resolve before `.awaiting()` is reached. Rejecting it fails the
run.

`signal<T>()` types the value supplied to the next step. `.awaiting("saved")` uses the
matching key from `config.signals`. The signal-object form avoids string typos in
JavaScript. A signal represents one occurrence. It can be awaited only once.

`verify.signal()` is the same helper as the standalone `signal()` export.

## Reuse

Chains are immutable. You can branch a prefix:

```js
const withStore = verify({ timeout: 500, cleanup: closeStore }).step(() => makeStore());

const a = await withStore.step(store => store.save("a"));
const b = await withStore.step(store => store.save("b"));
```

Each branch is a separate run with its own setup and cleanup. Awaiting the same chain
more than once runs it once. A chain with configured signals cannot be branched or
reused. Each signal represents one occurrence. Create the signals and chain inside each
test.

## API reference

See the [full API reference](docs/reference.md) for every `verify` method, option, type,
and runtime rule.

`verify` uses lower-level runner APIs to do the work. Those APIs are also exported. See
the [low-level API reference](docs/reference.md#low-level-positional-api) for details.

## License

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
