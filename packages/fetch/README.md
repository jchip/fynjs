# @fynjs/fetch

A hardened, zero-dependency HTTP client based on Node.js core `fetch`.

## Features

- **Zero Dependencies**: Pure TypeScript, built directly on Node's native `fetch` (powered by Undici).
- **Socket Leak Protection**: Idempotent `.drain()` helper to cancel unconsumed response bodies and immediately release TCP sockets back to the connection pool.
- **Bounded Timeouts**: `timeout` is a total budget covering both the response headers and the body read, merged with any caller signal via `AbortSignal.any()`.
- **Resilient Retries**: Configurable exponential backoff (with jitter, honoring `Retry-After`) on network failures and transient HTTP statuses (`408`, `429`, `500`, `502`, `503`, `504`), restricted to idempotent methods by default.
- **Stream Ergonomics**: Automatically applies `duplex: "half"` when `body` is a Node `Readable` stream or WHATWG `ReadableStream`.
- **Stream Body Retries**: Supports `bodyFactory` to recreate a fresh stream for every retry attempt, since a consumed Node stream cannot be re-sent. With `retry` set, a stream `body` without `bodyFactory` is rejected up front with a `TypeError`.
- **Streaming Pipeline Helper**: `fynFetch.stream(url, destination)` directly streams response bodies to disk file paths or writable streams with error handling and automatic cleanup of partial files.
- **Extended Ergonomics**:
  - `prefixUrl`: Normalize and prepend base URLs to relative endpoints.
  - `searchParams`: Clean query string builders accepting objects, strings, or `URLSearchParams`. Params override same-named params from instance defaults and from the URL itself.
  - `json`: Send JSON objects with automatic serialization and default `Content-Type` / `Accept` headers.
  - `form`: Send URL-encoded form data with automatic serialization.
  - HTTP verb shortcuts: `fynFetch.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, and `.head()` (with automatic body drain).
  - Response body helpers: `fynFetch.json()`, `.text()`, `.buffer()`, `.arrayBuffer()`, `.blob()`.
  - Basic Authentication: `username` and `password` options generate standard `Authorization: Basic` headers.
  - `cookies`: Key-value object generates standard `Cookie` headers.
  - Instance factory: `fynFetch.create(defaults)` and `client.extend(overrides)` for preconfigured API clients.
  - Request lifecycle hooks: `beforeRequest`, `beforeRetry`, and `afterResponse`.

## Installation

```sh
fyn add @fynjs/fetch
```

## Options Reference

All standard `RequestInit` options are supported, plus:

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `timeout` | `number` | none | Total budget in ms, covering headers **and** the body read (including `stream()`). Applied **per attempt**, so N retries can take up to N x `timeout`. Exceeding it rejects with `TimeoutError`; if the deadline lands mid-body, the pending body read rejects with that same error. |
| `throwOnHttpError` | `boolean` | `false` | Throw `HttpError` when `!res.ok`. Defaults to `true` in `.json()`, `.text()`, `.buffer()`, `.arrayBuffer()` and `.blob()`; an instance default or a per-call value overrides that. |
| `retry` | `number \| RetryOptions` | none | See below. |
| `prefixUrl` | `string \| URL` | none | Prepended to relative paths. Any query string on the prefix stays attached to the end of the resolved URL. |
| `searchParams` | `string \| URLSearchParams \| object` | none | Overrides same-named params from instance defaults and from the URL. |
| `json` | `any` | none | Serialized body; sets `Content-Type` and `Accept` if unset. |
| `form` | `object \| URLSearchParams` | none | URL-encoded body. |
| `username` / `password` | `string` | none | HTTP Basic auth. |
| `cookies` | `Record<string, string>` | none | Serialized into a `Cookie` header. |
| `bodyFactory` | `() => BodyInit` | none | Required to retry a one-shot (stream / async-iterable) body. |
| `hooks` | `FynFetchHooks` | none | `beforeRequest`, `beforeRetry`, `afterResponse`. |

Header values of `undefined` or `null` are dropped rather than sent as the string `"undefined"`.

### `RetryOptions`

| Field | Default | Notes |
| --- | --- | --- |
| `retries` | `0` | Must be a non-negative integer; anything else throws `TypeError`. |
| `minTimeout` | `500` | Delay before the first retry, in ms. |
| `factor` | `2` | Exponential backoff multiplier. |
| `maxTimeout` | `10_000` | Upper bound on any single delay, including a `Retry-After` value. |
| `statusCodes` | `[408, 429, 500, 502, 503, 504]` | Statuses that trigger a retry. |
| `retryOn` | none | `(err, res) => boolean`. Replaces the **entire** default policy, including the idempotent-method restriction. |

Retries carry up to 25% additive jitter, and honor a `Retry-After` response header
(delta-seconds or HTTP-date) in preference to the computed backoff, capped at `maxTimeout`.

**Idempotent methods only.** The default policy retries `GET`, `HEAD`, `PUT`,
`DELETE`, `OPTIONS` and `TRACE`. `POST` and `PATCH` are never retried by default,
since the server may have processed the first attempt before failing. Opt them in
with an explicit `retryOn`:

```ts
await fynFetch.post(url, {
  json: payload,
  retry: { retries: 2, retryOn: (_err, res) => !!res && res.status >= 500 },
});
```

## Usage

### Basic Request
```ts
import { fynFetch } from "@fynjs/fetch";

const res = await fynFetch("https://example.com/api/data", {
  timeout: 5000,
});
console.log(await res.text());
```

### HTTP Verb Shortcuts & JSON
```ts
import { fynFetch } from "@fynjs/fetch";

// POST with JSON body
const res = await fynFetch.post("https://example.com/api/users", {
  json: { name: "Alice", role: "developer" },
});

// Parse JSON directly
const user = await fynFetch.json<{ id: string; name: string }>("https://example.com/api/users/1");

// Read as Buffer
const buffer = await fynFetch.buffer("https://example.com/api/binary");

// HEAD request (automatically drains response body to avoid socket leaks)
const headRes = await fynFetch.head("https://example.com/api/file");
console.log(headRes.headers.get("content-length"));
```

### Pre-Configured API Clients (`create` / `extend`)
```ts
import { fynFetch } from "@fynjs/fetch";

const github = fynFetch.create({
  prefixUrl: "https://api.github.com",
  headers: {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "my-app",
  },
  timeout: 10_000,
  retry: { retries: 2 },
});

// Relative path automatically resolved with prefixUrl
const repos = await github.json("/orgs/fynjs/repos", {
  searchParams: { per_page: 50 },
});

// Extend with authentication
const authClient = github.extend({
  headers: {
    "Authorization": `Bearer ${token}`,
  },
});
```

### Basic Authentication & Cookies
```ts
import { fynFetch } from "@fynjs/fetch";

const res = await fynFetch("https://example.com/protected", {
  username: "admin",
  password: "supersecretpassword",
  cookies: {
    sessionId: "xyz123",
  },
});
```

### URL-Encoded Form Submission
```ts
import { fynFetch } from "@fynjs/fetch";

const res = await fynFetch.post("https://example.com/login", {
  form: {
    username: "alice",
    grant_type: "password",
  },
});
```

### Lifecycle Hooks
```ts
import { fynFetch } from "@fynjs/fetch";

const client = fynFetch.create({
  hooks: {
    beforeRequest: [
      (options, url) => {
        console.log(`Sending request to ${url}`);
      },
    ],
    beforeRetry: [
      ({ attempt, error }) => {
        console.warn(`Retry attempt ${attempt} due to:`, error?.message);
      },
    ],
    afterResponse: [
      (response) => {
        console.log(`Received status ${response.status}`);
      },
    ],
  },
});
```

### Uploading a Stream
```ts
import { fynFetch } from "@fynjs/fetch";
import fs from "node:fs";

// duplex: "half" is automatically applied
const res = await fynFetch("https://example.com/upload", {
  method: "PUT",
  body: fs.createReadStream("archive.tgz"),
  timeout: 15000,
});

// Immediately release the socket if you don't need the response body
await fynFetch.drain(res);
```

### Retrying Stream Uploads with `bodyFactory`
```ts
import { fynFetch } from "@fynjs/fetch";
import fs from "node:fs";

const res = await fynFetch("https://example.com/upload", {
  method: "PUT",
  retry: 2,
  bodyFactory: () => fs.createReadStream("archive.tgz"),
});
await fynFetch.drain(res);
```

### Streaming Download to Disk
```ts
import { fynFetch } from "@fynjs/fetch";

// destination can be a file path string or a Writable stream
// automatically cleans up partial file if download fails or is aborted
await fynFetch.stream("https://example.com/archive.tgz", "local.tgz");
```

## License

Apache-2.0
