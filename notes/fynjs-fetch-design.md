# `@fynjs/fetch`: Hardened HTTP Client Design & Architecture

Architecture and reference document for `@fynjs/fetch`, a zero-dependency, hardened HTTP client
package in the fynjs monorepo.

---

## 1. Context & Rationale

During the modernization of HTTP client usage across the repository (FPO-62, FPM-132, FPM-133),
we eliminated legacy, deprecated, or redundant dependencies:
- **`undici` in `fynpo`**: Removed as an external npm package since it is already integrated into
  Node core powering global `fetch`.
- **`node-fetch-npm` in `fyn`**: Removed an unmaintained npm v5/v6 fork of `node-fetch`.
- **Hand-rolled `http`/`https` in `fyn-global.ts`**: Replaced manual stream/chunk buffering with `fetch`.

While switching to Node core's native `fetch` removed external dependency baggage, production code
reviews highlighted subtle but critical failure modes inherent to using vanilla `fetch` directly in
CLI and monorepo build tools.

### The Pitfalls of Vanilla `fetch` in Node.js

1. **Socket & Connection Pool Exhaustion (Socket Leaks)**:
   Node's native `fetch` (backed by Undici internally) maintains an HTTP connection pool. When a
   request completes, **the underlying socket is NOT returned to the pool until the response
   body stream is completely consumed or explicitly canceled** via `res.body?.cancel()`.
   In tools like `fynpo`, which uploads files at `concurrency: 10`, initiating uploads without
   consuming or canceling response bodies holds sockets checked out until Garbage Collection runs.
   Under high concurrency or large file counts, this causes connection pool exhaustion, socket
   hangs, and stalled processes.

2. **Unbounded Operations & Hanging Builds**:
   Vanilla `fetch` has no default timeout. If a remote registry, cache server, or proxy stalls,
   drops packets, or throttles TCP connections, `fetch` hangs indefinitely. In CI pipelines or
   developer terminal runs, this manifests as silent, hanging builds.
   Wiring `AbortSignal.timeout(ms)` manually at every call site is error-prone and verbose.

3. **Silent Failures on Non-2xx Responses**:
   Unlike legacy clients that threw or surfaced errors on 4xx/5xx responses, `fetch` only rejects on
   fatal network errors. A `500 Internal Server Error` or `404 Not Found` resolves cleanly with
   `res.ok === false`. If caller code fails to check `res.ok`, bad responses are silently treated
   as success (e.g. streaming an error page HTML string into a local cache tarball).

4. **Node Stream Duplex Requirement**:
   In Node's `fetch`, passing a `Readable` stream as the `body` without specifying
   `duplex: "half"` throws a runtime `TypeError: duplex option is required when sending a body`.
   Requiring callers to remember this non-standard Node-specific option creates unnecessary friction.

5. **Wire Protocol & Method Incompatibilities**:
   Legacy libraries like `undici.request(url, { body })` historically defaulted to `GET` even when
   a body was attached. Standardizing on `PUT` or `POST` can run into server-side expectations or
   `405 Method Not Allowed` responses that require graceful fallback.

---

## 2. Alternatives Considered & Detailed Rationale for Rejection

Before creating `@fynjs/fetch`, we evaluated existing Node.js HTTP clients across the ecosystem:

### 1. `axios` (audited v1.7+)
- **Architecture**: Designed primarily as a browser `XMLHttpRequest` abstraction with adapters for
  Node's legacy `http`/`https` core modules and an optional experimental fetch adapter.
- **Why Rejected**:
  1. **Legacy Default**: In Node.js, `axios` defaults to `http.request` / `https.request` wrapped in
     `follow-redirects`.
  2. **External Dependencies**: Pulls in `follow-redirects`, `form-data`, and `proxy-from-env`.
  3. **Stream Pipeline Friction**: `axios` handles streaming response bodies through old Node
     EventEmitter streams (`res.data.pipe(...)`), which do not integrate cleanly with modern
     `stream/promises` pipeline or web `ReadableStream`.
  4. **Browser Bloat**: Carries code for browser XHR, CORS, and browser-specific header workarounds.

### 2. `got` (audited v14+)
- **Architecture**: Kitchen-sink HTTP client built on legacy Node streams and custom HTTP/2 wrappers.
- **Why Rejected**:
  1. **Massive Dependency Tree**: Brings in 15+ direct and transitive dependencies
     (`http2-wrapper`, `cacheable-request`, `mimic-response`, `decompress-response`,
     `form-data-encoder`, `cacheable-lookup`, etc.), adding substantial weight to `node_modules`.
  2. **Ecosystem & Stream Conflicts**: `got` implements proprietary stream wrappers that
     frequently clash with Node core's WHATWG `ReadableStream` and standard Web Streams.
  3. **High Maintenance & Churn**: `got` has undergone multiple aggressive breaking rewrites
     (v11 -> v12 -> v13 -> v14) with shifting TypeScript types and complex hook lifecycles.

### 3. `needle` (audited v3.3+)
- **Architecture**: Lightweight client created in the Node 0.10 era as a streamlined alternative to
  the deprecated `request` library.
- **Why Rejected**:
  1. **Dead-Weight Dependencies (`debug`, `sax`, and `iconv-lite`)**:
     - `sax`: Bundled strictly to auto-parse `application/xml` and `text/xml` responses. Modern
       monorepo caches and npm registries deal exclusively in JSON and binary streams.
     - `iconv-lite`: Bundled for legacy multi-byte character set decoding.
  2. **Legacy Core**: Directly invokes `http.request` and `https.request`. Does not use Node’s
     high-performance Undici engine and lacks modern WHATWG stream integration.
  3. **Maintenance Mode**: Largely dormant; not designed for modern Node 22+ ESM architectures.

### 4. `superagent`
- **Architecture**: One of the earliest Node HTTP clients (dating back to Node 0.6), built around
  fluent callback chaining (`.get().set().send().end()`).
- **Why Rejected**:
  1. **Heavy Dependency Chain**: Pulls in `component-emitter`, `fast-safe-stringify`, `form-data`,
     `formidable`, `methods`, `mime`, `qs`, and others.
  2. **Outdated Paradigm**: Designed around callbacks and legacy stream events with promise wrappers
     bolted on later.
  3. **Zero Native Fetch Integration**: Routes through legacy `http.request`.

### 5. `ky` (audited v1.7+)
- **Architecture**: Lightweight wrapper around the standard `fetch` API, originally tailored for
  browsers and isomorphic apps.
- **Why Rejected as a direct dependency**: See Deep Dive in Section 3 below.

### 6. `node-fetch` / `node-fetch-npm`
- **Architecture**: Polyfill libraries created to bring `fetch` to older Node versions (< Node 18).
- **Why Rejected**:
  1. **Redundant in Modern Node**: Node >= 18 includes global `fetch` backed by Undici.
  2. **Type & Prototype Incompatibilities**: Having `node-fetch` in `node_modules` causes bugs
     where `instanceof Response` fails when crossing boundaries with native globals.
  3. **Transitive Bloat**: Pulls in `data-uri-to-buffer`, `fetch-blob`, and `formdata-polyfill`.

### 7. Direct `undici` npm package
- **Architecture**: Upstream engine powering Node's native `fetch`.
- **Why Rejected**:
  1. **Runtime Duplication**: Undici is compiled into the Node binary. Importing it as an npm
     package duplicates code and causes version drift against the Node runtime.
  2. **Packaging Friction**: Suffered from bundling issues in our monorepo (e.g. `util-types.cjs`
     stubs in `fynpo`).
  3. **Low-Level Complexity**: Undici's raw `Pool` / `request()` API is lower-level and exposes
     socket traps.

---

## 3. Deep Dive: Evaluating `ky` and Adopting Zero-Dep Features

Among external candidates, [`ky`](https://github.com/sindresorhus/ky) was by far the closest match
to our requirements: zero dependencies, ESM-first, wrapping native `fetch`.

However, as an off-the-shelf dependency, `ky` had critical limitations for monorepo CLI tooling:
1. **No Auto-Duplex**: Node's mandatory `duplex: "half"` for streaming uploads is omitted in `ky`.
2. **Stream Bodies Cannot Be Retried**: Re-issuing a request with an already-consumed stream body
   fails. `ky` has no built-in `bodyFactory` concept for streaming uploads.
3. **Response Socket Leaks**: Does not offer a defensive `.drain()` helper to quickly return sockets
   to the connection pool after upload responses.
4. **Buffered Bias**: Designed around in-memory buffering rather than direct disk pipelines.

### Strategy: Adopt `ky` & `needle` Best Features Without Dependencies

Instead of taking on `ky` or `needle` as external dependencies, `@fynjs/fetch` implements their
highest-value, zero-dependency ergonomics natively on Node's built-in APIs:

- **From `ky`**:
  - `prefixUrl`: Normalize and prepend base URLs to relative endpoints.
  - `searchParams`: Query string builder accepting plain objects, strings, or `URLSearchParams`.
  - `json`: Option to auto-serialize JSON and set `Content-Type: application/json` and `Accept: application/json`.
  - HTTP verb shortcuts: `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.head()`.
  - Instance factory: `fynFetch.create(defaults)` and `client.extend(overrides)`.
  - Lifecycle hooks: `beforeRequest`, `beforeRetry`, `afterResponse`.
- **From `needle`**:
  - Basic Auth: `username` and `password` options generate `Authorization: Basic <base64>` header.
  - `cookies`: Key-value map generates standard `Cookie` header.
  - `.buffer()`: Helper returning a Node `Buffer` directly.
  - Form URL-encoded: `form` option serializes body with `Content-Type: application/x-www-form-urlencoded`.
  - HEAD auto-drain: `fynFetch.head()` immediately drains response stream to release the socket.
  - Direct file stream destination: `stream(url, destination)` supports string file paths and
    automatically unlinks partial files on failure.
- **Explicitly Excluded**:
  - Needle's XML parsing (requires external dependency `sax`).
  - Needle's legacy charset decoding (requires `iconv-lite`).

### 3.4. Rejecting a Dedicated Needle-Compatible API & Dual-Response Shape

While Needle's zero-dependency ergonomics were selectively adopted in FFT-4, we explicitly reject creating a 1:1 needle compatibility layer or supporting a needle-style dual response shape:

1. **Zero Monorepo Call Sites**: No package in the `fynjs` monorepo depends on, imports, or has `needle` installed transitively. `fyn` interacts with registries via `npm-registry-fetch` and `pacote`, while `fynpo` already consumes `@fynjs/fetch`. A compatibility layer only justifies its maintenance cost if it reduces active migration friction; here, that migration cost is zero.
2. **Rejecting a Second Response Shape**: Needle returns a custom object with `statusCode` and an auto-parsed `body` property. Providing that alongside the standard WHATWG `Response` would introduce two conflicting response paradigms to document, test, and maintain under 1.x semver.
3. **Excluded Needle Baggage**:
   - Per-phase timeouts, proxies, custom agents, and `rejectUnauthorized` belong to Undici `Dispatcher` concerns, not `RequestInit`.
   - Auto-parsed XML (`sax`) and multi-byte charset decoding (`iconv-lite`) are the exact dependencies we rejected needle for.
   - Redirect following and gzip/brotli decompression are standard defaults in Node core fetch.

### 3.5. Consumer-First Rule (API Surface Freeze at FFT-4)

To prevent creeping featurism and adhere to the Rule of Three:
- **The public option surface of `@fynjs/fetch` is frozen at FFT-4.**
- **Consumer-First Policy**: A new option or helper is only added when an actual `fynjs` call site (e.g. in `fynpo`, `fyn`, or `@fynjs/*` packages) actively requires it.
- **Proxy Support via Dispatcher Pass-Through**: Node's native `fetch` accepts an Undici `dispatcher` (e.g. `ProxyAgent`) in the `init` object. `@fynjs/fetch` already passes standard `RequestInit` fields through transparently. A dedicated, typed `dispatcher` option will be formalized only when `fyn` or `fynpo` requires proxy routing in production.

---

## 4. Architecture & Package Structure

`@fynjs/fetch` lives in `packages/fetch` with zero runtime dependencies.

### Core Modules
- `src/index.ts`: Main entry point, `executeFetch`, `createInstance`, and method shortcuts.
- `src/options.ts`: `mergeOptions`, `prepareRequest`, headers/cookies/auth resolution, stream detection.
- `src/url.ts`: `buildUrl`, `appendSearchParams`, prefixUrl normalizer.
- `src/drain.ts`: `drain(res)` helper for cancelling unconsumed streams.
- `src/stream.ts`: `stream(url, destination, options)` for piping directly to Writable or file paths.
- `src/errors.ts`: `HttpError` (wrapping non-2xx responses) and `TimeoutError`.
- `src/types.ts`: TypeScript interfaces and type definitions.

---

## 5. API Reference

### Options (`FynFetchOptions`)

```ts
export interface RetryOptions {
  retries?: number;        // Default: 0
  minTimeout?: number;     // Default: 500ms
  factor?: number;         // Default: 2
  maxTimeout?: number;     // Default: 10_000ms
  statusCodes?: number[];  // Default: [408, 429, 500, 502, 503, 504]
  retryOn?: (err: Error | null, res: Response | null) => boolean;
}

export interface FynFetchHooks {
  beforeRequest?: ((options: FynFetchOptions, url: string) => void | Response | Promise<void | Response>)[];
  beforeRetry?: ((context: BeforeRetryContext) => void | Promise<void>)[];
  afterResponse?: ((response: Response, options: FynFetchOptions) => Response | void | Promise<Response | void>)[];
}

export interface FynFetchOptions extends Omit<RequestInit, "body"> {
  body?: RequestInit["body"] | NodeJS.ReadableStream | null;
  duplex?: "half";
  timeout?: number;
  retry?: number | RetryOptions;
  throwOnHttpError?: boolean;
  bodyFactory?: () => RequestInit["body"] | Promise<RequestInit["body"]>;

  // ky-inspired
  prefixUrl?: string | URL;
  searchParams?: SearchParamsInit;
  json?: any;
  hooks?: FynFetchHooks;

  // needle-inspired
  form?: Record<string, any> | URLSearchParams;
  username?: string;
  password?: string;
  cookies?: Record<string, string>;
}
```

### Main Function & Instance Methods

```ts
export const fynFetch: FynFetchInstance;

// Verb shortcuts
await fynFetch.get(url, options);
await fynFetch.post(url, { json: { key: "value" } });
await fynFetch.put(url, { body: stream });
await fynFetch.patch(url, { json: { patch: true } });
await fynFetch.delete(url, options);
await fynFetch.head(url, options); // Automatically drains body

// Response shortcuts (default throwOnHttpError: true)
await fynFetch.json<T>(url, options);
await fynFetch.text(url, options);
await fynFetch.buffer(url, options);
await fynFetch.arrayBuffer(url, options);
await fynFetch.blob(url, options);

// Streaming helper
await fynFetch.stream(url, "/path/to/local/file.tgz");
await fynFetch.stream(url, writableStream);

// Socket drain
await fynFetch.drain(res);

// Instance factories
const client = fynFetch.create({ prefixUrl: "https://api.example.com", timeout: 5000 });
const authed = client.extend({ headers: { Authorization: `Bearer ${token}` } });
```

---

## 6. Defensive Implementation Mechanics

### 1. Socket Release via `drain()`
When an HTTP request returns a response whose body is not consumed (e.g. metadata ping, upload
confirmation, or non-2xx error), Node's connection pool holds the socket open.
`fynFetch.drain(res)` cancels the response body if unconsumed and suppresses stream cancellation
errors.

In `HttpError`, the response body is buffered (`err.data`) and the underlying socket
is fully drained immediately before throwing to prevent socket leaks. Caller inspection can read
`err.status`, `err.statusText`, `err.headers`, `err.url`, `err.data`, and call `await err.response.text()`
or `await err.response.json()` without body-lock errors.

### 2. Signal Merging & Timeout vs. Abort Semantics
- `timeout` specifies a per-attempt deadline for receiving response headers using an explicit `AbortController`.
- The timeout timer is automatically disarmed once response headers arrive so subsequent streaming
  body reads are not subjected to the initial request timeout.
- If the internal timeout signal fires before headers arrive, the request fails with a `TimeoutError`.
  Internal timeouts are eligible for retry if `retry` is configured.
- If the caller's own `signal` aborts, it is treated as a **terminal abort**: `@fynjs/fetch` fails
  fast immediately without retrying.
- The backoff delay sleep is abort-aware: if the caller signal aborts while sleeping before a retry,
  the sleep terminates immediately.

### 3. Stream Upload Duplex Auto-Detection & Retry Safety
- If `options.body` is a Node `Readable` stream or WHATWG `ReadableStream`, `duplex: "half"` is
  automatically set.
- Because Node streams are single-use, attempting to configure `retry > 0` with a stream body without
  a `bodyFactory` fails fast at the boundary with a descriptive `TypeError`.
- With `bodyFactory: () => fs.createReadStream(...)`, streaming uploads can safely retry indefinitely.

### 4. Direct Piped Downloads with Rollback
`fynFetch.stream(url, destination)` pipes `res.body` to the destination using `stream/promises` pipeline.
If `destination` is a file path string, any mid-stream failure, abort, or error triggers an automatic
unlink of the partial file, ensuring corrupt artifacts never remain on disk.

---

## 7. Implementation & Migration History

### Shipped Milestones

| Date | Ticket / Commit | Package | Changes |
|---|---|---|---|
| 2026-09-06 | `FFT-1` (`18c991ba`) | `@fynjs/fetch` | Initial package scaffolding with zero dependencies, timeout handling, exponential retries, stream `duplex: "half"`, socket `drain()`, and `stream()` pipeline. |
| 2026-09-06 | `FFT-2` (`fcabef0e`) | `@fynjs/fetch` | Removed redundant `.npmignore` in favor of `files` in `package.json`. |
| 2026-09-06 | `FPO-63` (`20d4a429`) | `fynpo` | Migrated remote cache upload/restore to `@fynjs/fetch`, added `.drain()` to prevent upload socket leaks, PUT -> POST 405 fallback, and `try/catch` build script fallback on download failure. |
| 2026-09-06 | `FFT-3` (`096bda19`) | `@fynjs/fetch` | Expanded `FynFetchOptions.body` type to accept `NodeJS.ReadableStream` directly. |
| 2026-09-06 | `FPM-134` (`a5a8f744`) | `fyn` | Cleaned `fyn-lock.yaml` removing `node-fetch-npm` and transitive subdependencies. |
| 2026-09-06 | `FFT-4` (`92407d6f`) | `@fynjs/fetch` | Adopted zero-dep features from `ky` and `needle`: `prefixUrl`, `searchParams`, `json`, `form`, basic auth, `cookies`, verb shortcuts, `.buffer()`, `.create()`, `.extend()`, and hooks. |
| 2026-09-06 | `FFT-5` (`d4033c43`) | `@fynjs/fetch` | Made caller abort signal terminal (rejects fast without retrying) and made backoff sleep abort-aware. |
| 2026-09-06 | `FFT-7` (`a910edb7`) | `@fynjs/fetch` | Validated that retrying a stream body requires `bodyFactory`, throwing a clear `TypeError` at the boundary. |
| 2026-09-06 | `FFT-6` (`507ebca9`, `db60a2d0`) | `docs` / `@fynjs/fetch` | Synchronized design document and added missing test scenarios (Buffer/string bodies, timing, drain assertions). |
| 2026-09-06 | `FFT-8` | `docs` / `@fynjs/fetch` | Documented needle migration mapping table in README, rejected dual response shape, and formalized consumer-first API freeze policy. |
| 2026-09-06 | `FFT-10` | `@fynjs/fetch` | Set package version to `0.0.1` in package.json and updated downstream consumers. |
| 2026-09-06 | `FFT-11` | `@fynjs/fetch` | Fixed retry loop to not retry non-retryable 4xx/hook errors, buffered error body into `HttpError`, drained replaced responses in `afterResponse`, returned plain object from `mergeHeaders` to preserve spread properties, re-prepared options per retry attempt, prevented swallowing locked stream errors in `drain`, and disarmed timeouts upon response header resolution. |

---

## 8. Test Coverage

`packages/fetch` maintains comprehensive Vitest coverage across 55 automated tests:
- Basic requests (GET, text, JSON, raw string body, Buffer body, stream duplex auto-detection).
- Error handling (`throwOnHttpError`, `HttpError` status/url properties, body buffering and `.json()`/`.text()` usability).
- Bounded timeouts (`TimeoutError`, caller signal precedence, internal timeout retries, timer disarmament after headers).
- Socket drain safety (null, undefined, already-consumed bodies, intermediate retry response draining, locked stream TypeError).
- Exponential backoff retries (500 recovery, retry exhaustion, timing verification, `bodyFactory` stream recreation).
- Non-retryable status safety (404/409 not retried on `throwOnHttpError`, `afterResponse` throw not retried).
- Custom `retryOn` consistency (no duplicate contradictory `(HttpError, null)` invocations).
- Caller abort short-circuit (fails fast without backoff delay).
- Stream retry validation (throws TypeError on one-shot stream without `bodyFactory`).
- Streaming helper (piping to Writable, piping to file path, cleanup on failure, 404 HttpError).
- URL handling (`prefixUrl` leading/trailing slashes, `searchParams` objects and strings).
- Request serialization (`json` with auto headers, `form` urlencoded, basic auth, cookies).
- Method shortcuts (GET, POST, PUT, PATCH, DELETE, HEAD with auto-drain).
- Response helpers (`.buffer()`, `.arrayBuffer()`, `.blob()`).
- Instance factories (`fynFetch.create()`, `client.extend()`).
- Lifecycle hooks (`beforeRequest` mutation, header spreading without losing defaults, `beforeRetry` option mutations, `afterResponse` replacement drain).
