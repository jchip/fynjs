# munchy reference

`munchy` is a producer Node `Readable` stream. You hand it a queue of mixed sources (strings, buffers, streams, iterables, promises) and it emits them as one ordered stream. ESM only (`"type": "module"`), no runtime dependencies. Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`.

## Imports

```js
import { Munchy } from "munchy";
import Munchy from "munchy"; // default export, same class
```

```ts
import { Munchy, type MunchyOptions, type MunchySource, type StreamErrorResult } from "munchy";
```

Runtime exports: `Munchy` (named) and `default` (the same class).

Type-only exports: `MunchyOptions`, `MunchySource`, `StreamErrorResult`.

Not exported: the helpers `isPlainOptions`, `isStreamLike` and `streamToAsyncIter`. There are no subpaths (only `munchy/package.json`).

## `Munchy`

```ts
class Munchy extends Readable {
  constructor(opts?: MunchyOptions | MunchySource, ...sources: MunchySource[]);
  munch(...sources: MunchySource[]): this;
  destroy(err?: Error): this;
}
```

`Munchy` extends `node:stream` `Readable`. Every inherited `Readable` API works (`pipe`, `on("data")`, `read`, `resume`, `pause`, `for await`, `Readable.prototype.destroy` semantics, `highWaterMark`, `objectMode`, `encoding`). Only the members below are Munchy specific.

### Core model

- Sources are queued in order and processed one at a time, strictly in queue order. A stream source is fully drained before the next source starts. Streams are never read concurrently.
- Nothing is read until the first `_read` call, which happens when a consumer attaches (`pipe`, `on("data")`, `resume`, `read`, `for await`). Constructing and calling `munch()` before that only queues sources.
- The stream does not end by itself. When the queue is empty it parks and waits for more `munch()` calls. Only a `null` source ends it (see `null` below). `pipe(dest)` therefore never calls `dest.end()` unless `null` is munched.
- Backpressure: after each `push`, if `push` returns `false`, the read loop parks until the consumer calls `_read` again. Streams being drained are paused while Munchy is parked (see Node `Readable` sources below). Items from a single sync iterable are pushed one at a time with the same check.
- `autoDestroy` (the Node default) applies: after `end`, Node calls `destroy()`, then `close` is emitted.

### Constructor

```ts
new Munchy(opts?: MunchyOptions | MunchySource, ...sources: MunchySource[])
```

Argument handling, in order:

1. `opts` is `null` or `undefined`: no options. All remaining arguments are sources. `null` here is NOT an end-of-stream source.
2. `opts` is a "plain options" object: it is the options, and `sources` are the sources.
3. Anything else: `opts` is the first source, and the sources are `[opts, ...sources]`.

An object counts as plain options only if it is non-null, `typeof` is `"object"`, it is not a `Uint8Array`, and it has none of: a `pipe` function, a `Symbol.asyncIterator` function, a `Symbol.iterator` function, a `then` function. Consequences:

- Strings, numbers, functions, arrays, `Buffer`, streams, promises and iterables passed first are sources.
- A plain object (such as `{ a: 1 }`) passed first is read as options, not as a source. To use such an object as an `objectMode` source, pass `{}` (or `null`) as the first argument, or `munch()` it later.
- `new Munchy({}, ...)` is the way to pass no options and keep a plain-object source later in the list.

Options are passed whole to the `Readable` constructor, so every `ReadableOptions` field applies. `handleStreamError` is extra and is ignored by `Readable`. If `sources` is non-empty they are queued with `munch()`.

#### `MunchyOptions`

```ts
type MunchyOptions = ReadableOptions & {
  handleStreamError?: (err: any) => StreamErrorResult | void | undefined | null;
};
```

| option | type | default | behavior |
| --- | --- | --- | --- |
| any `ReadableOptions` field | see Node docs | Node defaults | Forwarded to `Readable`. Includes `objectMode`, `highWaterMark`, `encoding`, `signal`, `autoDestroy`. |
| `handleStreamError` | `(err) => StreamErrorResult \| void \| null \| undefined` | `undefined` | Called when a source fails. See Error handling. |

Caveat: a `read` function in the options replaces `_read` on the instance (Node `Readable` behavior). Munchy would then never pull from its sources. Do not pass `read`.

#### `StreamErrorResult`

```ts
type StreamErrorResult = {
  result?: any;
  remit?: boolean;
};
```

| field | type | default | behavior |
| --- | --- | --- | --- |
| `result` | any | none | If truthy, pushed to the output before anything else. A falsy value (`""`, `0`) is not pushed. In non-object mode it must be a string or `Uint8Array`, otherwise `push` itself errors. |
| `remit` | boolean | see below | `false` means swallow the error and keep going. Any other value (including absent) re-emits the error and destroys. |

#### `MunchySource`

```ts
type MunchySource = string | Uint8Array | Readable | AsyncIterable<any> | Iterable<any> | Promise<any> | null | any;
```

Because of the trailing `any`, the type accepts everything. The runtime rules are in the next section.

### Source kinds

Each source is taken from the queue and handled by the first matching rule. A source that is a thenable (`then` is a function) is awaited first, and the resolved value is then matched against the rules. The resolved value is not re-awaited, so a promise resolving to a promise is pushed as is.

| order | source (after awaiting) | behavior |
| --- | --- | --- |
| 0 | `null` (queued directly, not from a promise) | Ends the stream. See `null`. |
| 1 | `string`, `Uint8Array` (so also `Buffer`) | Pushed as one chunk. |
| 2 | has `getReader` function (Web `ReadableStream`) | Converted with `Readable.fromWeb`, then handled as rule 3. |
| 3 | object with `pipe` function, or `Symbol.asyncIterator` function, or `getReader` function | Drained. See below. |
| 4 | has a `Symbol.iterator` function (arrays, `Set`, generators, `Map`) | Each item is pushed in order. |
| 5 | anything else | Pushed as is. |

Notes by kind:

- Strings and buffers: pushed unchanged. In non-object mode `Readable` converts a string to a `Buffer` unless `encoding` or `decodeStrings` says otherwise. An empty string pushes nothing observable and does not end the stream.
- Node `Readable` and other `pipe` sources (rule 3 with `pipe`): Munchy attaches `data`, `error` and `end` listeners and queues chunks. On every chunk it calls `pause()` (if the source has `pause` and `resume`), and calls `resume()` only when its internal queue is empty and it is ready for more. This is how backpressure reaches the source. Listeners are removed when draining stops. The source is switched into flowing mode, so do not read it elsewhere.
- Async iterables without `pipe` (async generators, objects with only `Symbol.asyncIterator`): iterated with `for await`, one value per `push`. Backpressure is natural (the next value is not requested while parked).
- Web `ReadableStream`: converted to a Node `Readable` and drained like one. The `draining` and `drained` payload `stream` is the converted Node `Readable`, not the original web stream. `Readable.fromWeb` throws on a locked stream (see Error handling).
- Sync iterables: iterated with `for...of`. Items are not recursed into, so an array of arrays pushes arrays. A `Uint16Array` or similar is iterable and pushes numbers, which errors in non-object mode (`Uint8Array` is handled earlier as a chunk). Strings never reach this rule.
- Fallback (rule 5): numbers, plain objects, functions and so on are pushed as is. In non-object mode a number or object makes `push` raise a Node `ERR_INVALID_ARG_TYPE` error. In `objectMode` they are emitted as items.
- Promises: awaited at the time the read loop reaches them, not at `munch()` time. A rejection goes through Error handling, with no `draining` or `drained` events.

#### `null`

A `null` source at the head of the queue ends the stream. Munchy calls `push(null)`, discards every source queued after it, resets the queue (emitting `munched`) and stops the read loop. `end` fires once the consumer drains the buffered data, then `close` via `autoDestroy`.

Edge cases:

- `new Munchy(null, ...)` and `new Munchy(undefined, ...)` treat the first argument as "no options", not as a source.
- A promise that resolves to `null` also calls `push(null)` (rule 5), which ends the stream. Unlike a queued `null`, the read loop continues and sources after it are not delivered. Prefer a queued `null`.
- An iterable or async iterable that yields `null` also ends the stream through `push(null)`, with the same loop continuation (see Quirks).
- `undefined` as a source pushes `undefined`. In default non-object mode Node ignores it, so nothing is emitted and the stream continues. It does not end the stream.

### `munch(...sources)`

```ts
munch(...sources: MunchySource[]): this
```

Appends sources to the queue and returns `this` (chainable). Safe to call at any time: before reading starts, while draining, or when parked on an empty queue (which wakes the read loop). `munch()` with no arguments does nothing useful.

If reading has started and there is more to do, a read is scheduled with `process.nextTick`.

Calls after the stream has been destroyed (including after normal end, because of `autoDestroy`) schedule a read that emits `error` with message `munchy _read called after destroy`. If no `error` listener is attached, that is an uncaught exception. Do not `munch()` after `null`/end.

Calling `munch()` while the stream is backpressured releases the park once, so one more chunk may be pushed past `highWaterMark`. Backpressure resumes right after.

### `destroy(err?)`

```ts
destroy(err?: Error): this
```

Overrides `Readable.destroy`. In order: clears the pending queue (emits `munched` if at least one source had already been consumed, see Events), wakes any parked loop so it exits, calls `destroy()` on the source currently being drained (if it has a `destroy` method; exceptions are swallowed), then calls `super.destroy(err)`. Returns `this`. Remaining queued sources are dropped, never processed. It is idempotent in the usual `Readable` way.

When the current source is an event stream and is destroyed without an error, it emits `close` but not `end`, and no `drained` event is emitted for it.

### Events

All `Readable` events (`data`, `end`, `error`, `close`, `readable`, `pause`, `resume`) behave as in Node. Munchy adds three:

| event | payload | when |
| --- | --- | --- |
| `draining` | `{ stream }` | Just before a stream source (Node stream, async iterable, or converted web stream) starts draining. |
| `drained` | `{ stream }` | After that source ends normally, or after its error was recovered by `handleStreamError` (`remit: false`). Not emitted when the error is re-emitted, nor on destroy. |
| `munched` | none | When the queue has been reset after at least one source was consumed. That is when all queued sources are done and Munchy is idle waiting for more (can fire repeatedly), after a `null` ends the stream, and on `destroy()` if queued sources remained. |

`draining` and `drained` fire for stream-like sources only, never for strings, buffers, promises of plain values, or sync iterables. `munched` is emitted synchronously, so a `munch()` called from its handler is picked up.

### Error handling

Failures of two kinds go through `handleStreamError`: a rejected promise source, and an error thrown or emitted by a stream-like source (Node stream `error` event, async iterator throwing, web stream error). If the error value is falsy it is replaced by `new Error("munchy - source stream emitted error")`.

Algorithm:

1. Call `handleStreamError(err)` if set. A falsy return is treated as `{}`.
2. `remit` is `true` when there is no handler, or when `remit !== false`.
3. If `result` is truthy it is pushed. If that push signals backpressure and `remit` is false, Munchy waits for the consumer before continuing.
4. If `remit` is true: emit `error` with the original error, call `destroy()` and stop. Any pushed `result` is still delivered before the error.
5. If `remit` is false: continue with the next source. If the failed source was a stream, `drained` is emitted for it.

So with no handler, or a handler that returns nothing, the first source failure emits `error` and destroys. Only `{ remit: false }` recovers.

```js
const m = new Munchy({
  handleStreamError: err => ({ result: `[failed: ${err.message}]`, remit: false })
});
m.munch(Promise.reject(new Error("x")), "after", null);
// output: "[failed: x]" then "after"
```

Errors that bypass `handleStreamError`:

- An exception thrown by the handler itself.
- An exception thrown while iterating a sync iterable.
- `Readable.fromWeb` failing (such as a locked web stream).
- Errors from `push` itself (such as a number pushed in non-object mode).

For these the read loop rejects, Munchy emits `error` with the exception and calls `destroy()`. Because the read loop is released before the error is emitted, a consumer that keeps reading may start a new loop first and still receive later queued data, even `end`, before `error` arrives. Treat `error` as terminal and ignore data after it.

The `error` event is emitted manually (`emit("error")` then `destroy()`), not through `destroy(err)`. A listener must be attached or Node throws the error as uncaught.

### Quirks

- A stream source that already ended, or was destroyed without an error, before Munchy attaches never emits `end` or `error` to Munchy. Draining then waits forever, and later queued sources are never reached. Pass streams that are still live.
- Promises queued behind a long source are not awaited until reached. A promise that rejects before then triggers Node's `unhandledRejection` even though Munchy would later handle it.
- A queued `null` ends the stream cleanly. A `null` pushed by a promise or iterable ends the stream but leaves the loop running, so later queued sources are pushed after EOF and are dropped.
- `munch()` after end or destroy emits `error` (`munchy _read called after destroy`).
- A plain object as the first constructor argument is options, not a source.
- Public typings expose internal fields `_sources`, `_index`, `_started`, `_reading`, `_canPush`, `_triggered`, `_handleStreamError` and methods `_moreSources`, `_resetSources`, `_triggerRead`, `_read`. They are internals. Do not rely on them.
