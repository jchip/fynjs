# @fynjs/fetch reference

`@fynjs/fetch` is a zero-dependency HTTP client built on Node core `fetch`. It adds retries, timeouts, hooks, URL and body helpers, typed HTTP errors, and socket-safe body draining. Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`. ESM only (`"type": "module"`).

## Imports

```js
import fynFetch, { createInstance, HttpError, TimeoutError, drain, stream } from "@fynjs/fetch";
// fynFetch is also a named export
import { fynFetch } from "@fynjs/fetch";
```

```ts
import type {
  FynFetchOptions, RetryOptions, FynFetchInstance,
  FynFetchHooks, BeforeRetryContext, SearchParamsInit,
} from "@fynjs/fetch";
```

Runtime exports: `default` (= `fynFetch`), `fynFetch`, `createInstance`, `HttpError`, `TimeoutError`, `drain`, `stream`. Type-only exports: the six types above. The only subpath is `@fynjs/fetch/package.json`. Helpers such as `buildUrl`, `mergeOptions`, `prepareRequest` and `isStream` are internal and not exported.

## `fynFetch`

```ts
const fynFetch: FynFetchInstance; // createInstance({})
fynFetch(url: string | URL, options?: FynFetchOptions): Promise<Response>
```

The default instance with no default options. The call resolves with the `Response` of the final attempt. It does not throw on non-2xx unless `throwOnHttpError` is true. It rejects on network failure, timeout, abort, hook error or option misuse.

Per-call flow:

1. Merge instance defaults with call options (see Merging).
2. Run `hooks.beforeRequest` once, in order. A returned `Response` short-circuits (see Hooks).
3. Build the request: URL, headers, auth, cookies, body (see Request building).
4. Validate `retry` and streaming-body rules.
5. Per attempt: create body (if `bodyFactory`), arm timeout, call global `fetch`, decide on retry, or finalize (`afterResponse` hooks, then `throwOnHttpError`).

All other `RequestInit` fields (`method`, `headers`, `signal`, `redirect`, `dispatcher`, `credentials`, and so on) pass through to `fetch` unchanged.

## `createInstance(defaultOptions?)`

```ts
function createInstance(defaultOptions?: FynFetchOptions): FynFetchInstance
```

Returns a callable instance. `defaultOptions` defaults to `{}`. The object is stored by reference as `instance.defaults`, and is used on every call as the merge base (mutating `instance.defaults` affects later calls on that instance and instances created via `extend` after the mutation).

## `FynFetchInstance`

```ts
interface FynFetchInstance {
  (url: string | URL, options?: FynFetchOptions): Promise<Response>;
  get / post / put / patch / delete / head(url, options?): Promise<Response>;
  json<T = any>(url, options?): Promise<T>;
  text(url, options?): Promise<string>;
  buffer(url, options?): Promise<Buffer>;
  arrayBuffer(url, options?): Promise<ArrayBuffer>;
  blob(url, options?): Promise<Blob>;
  stream(url, destination: string | NodeJS.WritableStream, options?): Promise<Response>;
  drain(res: Response | null | undefined): Promise<void>;
  create(defaultOptions?: FynFetchOptions): FynFetchInstance;
  extend(defaultOptions?: FynFetchOptions): FynFetchInstance;
  defaults: FynFetchOptions;
}
```

### Verb shortcuts

`get`, `post`, `put`, `patch`, `delete`, `head` call the instance with `{ ...options, method: "<VERB>" }`. The verb overrides any `options.method`. They return the `Response` and use the normal `throwOnHttpError` default (`false`).

`head` additionally calls `drain(res)` on the response before returning it, so the socket is released.

### Body shortcuts

`json`, `text`, `buffer`, `arrayBuffer`, `blob` call the instance, then read the body with `res.json()`, `res.text()`, `Buffer.from(await res.arrayBuffer())`, `res.arrayBuffer()`, `res.blob()`.

`throwOnHttpError` for these is `options.throwOnHttpError ?? instance.defaults.throwOnHttpError ?? true`. So the default is `true`, and an explicit `false` (call or instance default) disables it. With `false`, the body of a non-2xx response is read and returned. A body parse failure (for example invalid JSON in `json()`) rejects with the native error. These shortcuts have no extra retry or cleanup logic beyond the core call.

### `instance.stream(url, destination, options?)`

Same as the exported `stream` with instance defaults merged into `options` first. See `stream`.

### `instance.drain`

The exported `drain` function itself.

### `instance.create(opts?)`

Returns `createInstance(opts ?? {})`. Parent defaults are not inherited.

### `instance.extend(opts?)`

Returns `createInstance(mergeOptions(instance.defaults, opts))`. Child inherits parent defaults, merged per the rules below. The merged result is a snapshot at call time.

### Merging

Used for defaults + call options and for `extend`. Result starts as `{ ...base, ...override }` (override wins for scalar options, including `body`, `signal`, `timeout`, `throwOnHttpError`, `prefixUrl`, `json`, `form`, `username`, `password`). Special cases:

| Option | Merge rule |
| --- | --- |
| `headers` | Both normalized to a lowercase-keyed plain object (`Headers`, array of pairs, or record accepted; record values `undefined` or `null` are dropped; others stringified). Override replaces same-named header. |
| `searchParams` | Merged by key. Any key present in override removes all base values of that key, then override values are appended. Repeated keys within one init are kept. Result is a `URLSearchParams`. |
| `hooks` | Concatenated per hook type: base hooks first, then override hooks. Result always has all three arrays. |
| `cookies` | Shallow object merge, override wins. |
| `retry` | If both are objects: shallow merge `{ ...base, ...override }`. If override is a number, it replaces base. If override is an object and base is a number, override object wins (copy). Object values are always cloned so hooks mutating `options.retry` do not write into instance defaults. |

If only one side defines an option it is used as is.

## `FynFetchOptions`

```ts
interface FynFetchOptions extends Omit<RequestInit, "body"> {
  body?: RequestInit["body"] | NodeJS.ReadableStream | null;
  duplex?: "half";
  timeout?: number;
  retry?: number | RetryOptions;
  throwOnHttpError?: boolean;
  bodyFactory?: () => RequestInit["body"] | Promise<RequestInit["body"]>;
  prefixUrl?: string | URL;
  searchParams?: SearchParamsInit;
  json?: any;
  hooks?: FynFetchHooks;
  form?: Record<string, any> | URLSearchParams;
  username?: string;
  password?: string;
  cookies?: Record<string, string>;
}
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `body` | `RequestInit["body"] \| NodeJS.ReadableStream \| null` | none | Request body. Readable streams, web streams and async iterables count as streams (one-shot). |
| `duplex` | `"half"` | auto | Set to `"half"` automatically when the body is a stream and `duplex` is unset. |
| `timeout` | `number` (ms) | none (no timeout) | Per-attempt deadline covering headers and body read. Applies only when `> 0`. See Timeouts. |
| `retry` | `number \| RetryOptions` | none (no retry) | A number `n` is `{ retries: n }`. `undefined` or `0` disables retry. See Retry. |
| `throwOnHttpError` | `boolean` | `false` for the core call and verb shortcuts; `true` for body shortcuts; always `true` for `stream` | When true, a non-`ok` final response throws `HttpError`. |
| `bodyFactory` | `() => body \| Promise<body>` | none | Called to produce a fresh body. Required for retrying streaming bodies. See Retry. |
| `prefixUrl` | `string \| URL` | none | Prepended to a relative `url`. Ignored when `url` is a `URL` object or an absolute URL string. |
| `searchParams` | `SearchParamsInit` | none | Query params applied to the final URL. |
| `json` | `any` | none | If `!== undefined`, body becomes `JSON.stringify(json)`. Sets `content-type: application/json` and `accept: application/json` if absent. |
| `form` | `Record<string, any> \| URLSearchParams` | none | Body becomes URL-encoded. Sets `content-type: application/x-www-form-urlencoded` if absent. Record entries with `undefined`/`null` values are skipped; others are `String()`-ed. |
| `username` | `string` | none | If defined and no `authorization` header exists, sets `authorization: Basic base64(username:password)`. |
| `password` | `string` | `""` | Used only with `username`. |
| `cookies` | `Record<string, string>` | none | If no `cookie` header exists, sets `cookie: k=v; k2=v2`. Entries with `undefined`/`null` values are skipped. No cookie header is set when none remain. Values are not encoded. |
| `hooks` | `FynFetchHooks` | none | See Hooks. |

The options `prefixUrl`, `searchParams`, `json`, `form`, `username`, `password`, `cookies`, `timeout`, `retry`, `throwOnHttpError`, `bodyFactory`, `hooks` are stripped before the call to `fetch`; everything else is forwarded.

### Request building

Order: URL, headers, basic auth, cookies, JSON, form, duplex.

- Header names are lowercased. User-supplied `authorization`, `cookie`, `content-type`, `accept` are never overwritten.
- `json` with `body` throws `TypeError("Cannot provide both 'json' and 'body' options")`.
- `form` with `body` or `json` throws `TypeError("Cannot provide 'form' with 'body' or 'json' options")`.
- These `TypeError`s reject the returned promise. They are thrown after `beforeRequest` hooks run.

### URL building

- Input `URL` object: used as `toString()`; `prefixUrl` is ignored.
- Input string is absolute when it matches `^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/`. `localhost:8080/x` is therefore treated as relative.
- Relative string with `prefixUrl`: leading slashes of the relative part are removed, the prefix path's trailing slashes are removed, and the two are joined with one `/`. A query in the relative part is appended to the prefix's own query params. A hash in the relative part replaces the prefix hash. An empty relative part returns the prefix as is. If the prefix is not parseable as a URL, plain string joining is used.
- Relative string without `prefixUrl`: passed unchanged to `fetch`, which will reject it.
- `searchParams` then override: every key present in `searchParams` removes same-named params already in the URL, then the new values are appended. If the URL cannot be parsed, params are appended to the string with `?` or `&`.

### `SearchParamsInit`

```ts
type SearchParamsInit =
  | string
  | URLSearchParams
  | Record<string, string | number | boolean | undefined | null>;
```

Record values `undefined` and `null` are skipped; others are `String()`-ed. A string is parsed with `URLSearchParams`.

## Timeouts

- `timeout` is per attempt, in ms. With retries the worst case is about `(retries + 1) x timeout` plus backoff.
- The timer starts before `fetch` and stays armed after headers arrive, so it also bounds the body read. On firing, the request is aborted with a `TimeoutError` as abort reason. A body read in progress rejects with that same error.
- The timer is `unref`ed and never keeps the process alive.
- It is cleared on network error, retry, and when `finalizeResponse` throws. It is not cleared when a response is returned to the caller; it fires later as a harmless abort of that response's body (if still unread).
- If `fetch` rejects because the timeout fired and the caller's own `signal` has not aborted, the rejection is replaced with a new `TimeoutError`.
- The caller's `signal` and the timeout controller are combined with `AbortSignal.any`. If the caller aborts, the error from `fetch` is thrown as is, and no retry occurs.
- `timeout` of `0`, negative or missing means no timeout.

## Retry

```ts
interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  factor?: number;
  maxTimeout?: number;
  statusCodes?: number[];
  retryOn?: (err: Error | null, res: Response | null) => boolean;
}
```

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `retries` | `number` | `0` | Retry attempts after the first. Must be a non-negative integer, else `TypeError("'retry.retries' must be a non-negative integer, received <v>")`. Max attempts = `retries + 1`. |
| `minTimeout` | `number` (ms) | `500` | Base delay for the first retry. |
| `factor` | `number` | `2` | Delay multiplier per attempt. |
| `maxTimeout` | `number` (ms) | `10000` | Cap on the base delay. |
| `statusCodes` | `number[]` | `[408, 429, 500, 502, 503, 504]` | Statuses that trigger a retry under the default policy. |
| `retryOn` | `(err, res) => boolean` | none | Replaces the entire default policy, both `statusCodes` and the method restriction. Called with `(error, null)` after a thrown `fetch` error, or `(null, response)` after a response. Return `true` to retry. |

Rules:

- `retry` of `undefined` or `0` disables retry. `retry: {}` has `retries: 0`, so one attempt and no retries.
- Default policy: retry only idempotent methods: `GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS`, `TRACE` (method compared uppercased, missing method counts as `GET`). `POST` and `PATCH` are not retried by default. Opt in with `retryOn`.
- Default policy retries a thrown `fetch` error (network failure, per-attempt `TimeoutError`) for idempotent methods, and a response whose status is in `statusCodes` for idempotent methods.
- A caller-aborted `signal` is never retried. The abort error is thrown.
- No retry is attempted on the final attempt. The last response is then returned (and goes through `afterResponse` hooks and `throwOnHttpError`), or the last error is thrown.
- Delay before retry number `attempt` (1-based): `base = min(minTimeout * factor^(attempt-1), maxTimeout)`, then `delay = base + random() * base * 0.25`. So the delay is at most `1.25 x maxTimeout`.
- When a response is available and has a `Retry-After` header, `base = min(retryAfter, maxTimeout)` instead. `Retry-After` is parsed as numeric seconds, else as an HTTP date; unparseable values fall back to the exponential base. Negative results clamp to `0`. Not used after thrown errors.
- The backoff sleep listens to the caller's `signal`. Aborting during sleep rejects with `signal.reason` (or `Error("Aborted")`).
- Before retrying on a response, the response body is drained (`drain`) so the socket is released, then the timeout timer is cleared. `beforeRetry` hooks run after that, then the sleep. For a thrown error, `beforeRetry` runs, then the sleep.
- Streaming bodies: if `retries > 0` and the initial body is a stream (has `pipe`/`getReader`, or is an async iterable) and no `bodyFactory` is set, the call throws `TypeError("Cannot retry a request with a streaming body without 'bodyFactory'. Provide a 'bodyFactory' function or disable retries.")` before any request.
- `bodyFactory` is awaited for attempt 1 only when no `body` is set, and for every later attempt. A stream result gets `duplex: "half"` when unset.
- Options are re-prepared on each retry (`prepareRequest` re-run on the shared `options`), so `beforeRetry` mutations of `options` (for example headers) take effect on the next attempt. `beforeRequest` hooks do not run again.

## Hooks

```ts
interface FynFetchHooks {
  beforeRequest?: ((options: FynFetchOptions, url: string) => void | Response | Promise<void | Response>)[];
  beforeRetry?: ((context: BeforeRetryContext) => void | Promise<void>)[];
  afterResponse?: ((response: Response, options: FynFetchOptions) => Response | void | Promise<Response | void>)[];
}

interface BeforeRetryContext {
  error: Error | null;     // set when the attempt threw
  response: Response | null; // set when the attempt returned a retryable response (already drained)
  attempt: number;         // 1-based number of the attempt that just failed
  options: FynFetchOptions; // the merged options object, mutable
}
```

Each hook type is an array. Hooks run sequentially, awaited, in order (instance defaults first, then call hooks).

- `beforeRequest(options, url)`: runs once per call, before the first attempt. `url` is the fully resolved URL (`prefixUrl` and `searchParams` applied), recomputed per hook. The hook may mutate `options`. Returning a `Response` skips the network, skips remaining `beforeRequest` hooks, and that response goes through `afterResponse` hooks and `throwOnHttpError`. Other return values are ignored. A thrown error rejects the call.
- `beforeRetry(context)`: runs before each retry sleep. Errors thrown reject the call. `context.response` is already drained, so its body cannot be read.
- `afterResponse(response, options)`: runs on the final response (including short-circuit responses), not on retried ones. Returning a `Response` different from the current one drains the current one and replaces it for later hooks and the caller. If a hook throws, the current response is drained (errors ignored) and the error is rethrown.

After the hooks, if `throwOnHttpError` and `!response.ok`, `HttpError.fromResponse` is thrown.

## `HttpError`

```ts
class HttpError extends Error {
  readonly response: Response;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  data?: any;
  constructor(response: Response, message?: string, data?: any);
  static fromResponse(response: Response, message?: string): Promise<HttpError>;
}
```

`name` is `"HttpError"`. Default message: `HTTP <status>[ <statusText>] for <url>`. `status`, `statusText`, `url` come from `response`. `data` is the parsed body, if any.

Thrown when `throwOnHttpError` is true and the final response is not `ok`, which includes all body shortcuts by default and `stream`. The constructor does not read the body.

`fromResponse(response, message?)`:

- If `response.bodyUsed` is false, reads `response.text()`. Read failures are swallowed (empty body).
- `data` is `JSON.parse(text)` when the `content-type` contains `application/json` (the raw text if parsing fails), else the raw text. If the body was already used, `data` is `undefined`.
- The error's `response` is a rebuilt `Response` with the same status, statusText and headers, minus `content-encoding` and `content-length`, with `url` defined to the original. Its `text()` returns the buffered text, `json()` returns `data` if it is an object else `JSON.parse(text)`, and `clone()` returns an equivalent rebuilt response. Statuses 204, 205, 304 get a null body.
- If `new Response` rejects the status (outside 200-599), the original response is used with `text`, `json` and `clone` patched.
- The original response body is consumed, so the socket is released.

## `TimeoutError`

```ts
class TimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number, message?: string);
}
```

`name` is `"TimeoutError"`. Default message `Request timed out after <ms>ms`. The library throws it with the message `Request to <url> timed out after <ms>ms`. See Timeouts for when. It is retryable under the default policy for idempotent methods.

## `drain`

```ts
function drain(res: Response | null | undefined): Promise<void>
```

Cancels the unread response body so the connection returns to the pool. Rules:

- Resolves with no effect when `res` is nullish, has no body, or the body is already used.
- Throws `TypeError("Cannot drain a locked response body")` when the body stream is locked.
- Cancel errors from closed or aborted streams are suppressed.
- Safe to call more than once.

Call it when you do not read a response body (for example after checking only `status`). The library calls it itself on retried responses, replaced responses, and `head()`.

## `stream`

```ts
function stream(
  url: string | URL,
  destination: string | NodeJS.WritableStream,
  options?: FynFetchOptions
): Promise<Response>
```

Requests via the global `fynFetch` with `throwOnHttpError: true` forced (overrides the option), then pipes the body into `destination` with `stream/promises` `pipeline`. Resolves with the `Response` (body consumed) after the pipeline finishes.

- `destination` string: a file path opened with `fs.createWriteStream`. On a pipeline error the partial file is `unlink`ed (unlink errors ignored) and the error is rethrown.
- `destination` stream: used as is. `pipeline` ends it on completion and destroys it on error. It is not unlinked or otherwise cleaned up.
- No body: throws `Error("Response body is empty for <url>")`. The destination is not created.
- The `timeout` also bounds the body transfer; expiry rejects the pipeline with `TimeoutError`.
- `HttpError` and all other request errors propagate. The module-level `stream` does not apply instance defaults. Use `instance.stream`, which merges them first (hooks from the instance run via the merged options).
- `retry` applies to the request phase only. A failure during piping is not retried.

## Behavior not implemented by this package

There is no proxy, agent, or redirect logic in the source. `redirect`, `dispatcher` and any other `RequestInit` fields are forwarded to Node's global `fetch` unchanged, so their behavior is whatever core `fetch`/undici provides. No `Response` caching, no cookie jar (only the one-shot `cookies` option), and no automatic `Content-Length` handling.
