# fyn's registry fetch stack: replacement research

Researched 2026-10-03. Decision: **keep the current stack.** This note records what it would
take to swap the HTTP layer under `pacote` for a thin wrapper on Node's built-in `fetch`, and
why that isn't worth it.

## 1. The stack

All registry traffic goes through `pacote`. That covers packuments (`pacote.packument`),
tarballs (`RemoteFetcher.tarballStream`), and git/URL manifests (`pacote.manifest` with
Arborist). `@fynjs/fetch` is only used for the fynpo meta memoizer and a few CLI calls.
`lib/audit/audit-report.ts` calls `npm-registry-fetch` directly for the bulk advisories POST.

```
pacote
 └─ npm-registry-fetch     registry URLs, auth tokens, scoped registries, error mapping
     └─ make-fetch-happen  cacache HTTP cache, retries, redirects, integrity checks
         ├─ minipass-fetch the HTTP client: a node-fetch v2 fork on http/https, minipass bodies
         └─ @npmcli/agent  socket pool: keep-alive, maxSockets, http/https/socks proxies
```

Who depends on what, from `packages/fyn/fyn-lock.yaml`:

| Package | Depended on by |
|---|---|
| `npm-registry-fetch` | `pacote`, `@npmcli/arborist` |
| `make-fetch-happen` | `npm-registry-fetch`, `@sigstore/sign` |
| `minipass-fetch` | `make-fetch-happen`, `npm-registry-fetch` |
| `@npmcli/agent` | `make-fetch-happen` |

fyn reads the HTTP cache directly. It looks up `make-fetch-happen:request-cache:<url>` cacache
keys in `lib/pkg-src-manager.ts` and `lib/util/trimmed-packument.ts`. It also tracks the
30-minute metadata freshness through bucket mtimes in `lib/cacache-util.ts`. Any replacement
of `make-fetch-happen` must keep that key and metadata format, or migrate existing caches.

## 2. Replacing `minipass-fetch` with a Node fetch wrapper

`minipass-fetch` is the cleanest seam. Only two packages use it, so an `overrides` entry would
redirect both. Everything above it, including `pacote`, stays unchanged.

The wrapper is more than a `fetch()` call. `make-fetch-happen` builds `Request` objects itself
and serves cache hits as `Response` objects with Node stream bodies. The wrapper must provide:

- `fetch()`, plus `Request`, `Response`, `Headers` and `FetchError` with `minipass-fetch`
  semantics.
- Bodies as Node streams. Consumers call `.pipe()` and `.on('data')` on `res.body`. Node fetch
  returns a web `ReadableStream`, so each body needs `Readable.fromWeb()`.
- Error mapping. undici throws `TypeError: fetch failed` with a `cause.code`. The retry logic in
  `make-fetch-happen` decides on `err.code`, so this must become a `FetchError` with
  `code`/`errno`.
- The `timeout`, `size`, `compress` and `redirect: 'manual'` options. `make-fetch-happen`
  follows redirects itself so it can cache each hop. undici returns the real 3xx response in
  manual mode, so that part works.

Estimated size: 200 to 300 lines plus tests.

### The hard part: the `agent` option

`make-fetch-happen` passes an `@npmcli/agent` agent on every request. Node fetch ignores
`agent` and takes an undici `dispatcher` instead.

- **Socket count.** `--concurrency` reaches the network as `maxSockets` on that agent
  (`lib/pkg-src-manager.ts`). The pnpm benchmark work found this wiring is what lets more
  sockets help (see [pnpm-benchmark-replication.md](pnpm-benchmark-replication.md)). A wrapper
  would have to build an undici `Agent({ connections })` from the same setting.
- **Proxies.** npm-config `proxy`, `https-proxy` and `noproxy` would need undici's `ProxyAgent`.
  socks proxies have no built-in undici equivalent. `@fynjs/fetch` has no dispatcher option yet.

### Performance risk

This sits on the install hot path. Every packument and tarball goes through it. Node fetch adds
web-stream overhead, plus a web-to-Node conversion on every tarball. Any attempt would need a
prototype behind an override and a run of the pnpm benchmark harness first.

What it would remove: `minipass-fetch`, `minizlib` and `minipass-sized`. If the wrapper also
took over the socket pool, `@npmcli/agent` and its proxy agents would go too.

## 3. Replacing `make-fetch-happen` instead

`make-fetch-happen`'s public API is small: `fetch(url, opts)`, `fetch.defaults()`, and the
re-exported `minipass-fetch` classes. Its roughly 1,100 lines are mostly the cache. Two ways to
replace it:

| | Fork and patch | Full rewrite on Node fetch |
|---|---|---|
| Change | Private copy, swap only `lib/cache/policy.js` (the one file using `http-cache-semantics`) | Reimplement the API: cache, retries, integrity, redirects, agent |
| Effort | About a day | Several days to two weeks |
| Risk | Low | High: cache format, stream types, proxies, socket pool |

Wrapping `npm-registry-fetch` alone does not remove `make-fetch-happen`, because
`@sigstore/sign` also depends on it directly.

## 4. sigstore is loaded but never used

The only chain to `@sigstore/sign` is `pacote` → `sigstore` → `@sigstore/sign`.
`pacote/lib/registry.js` requires `sigstore` at the top of the file. It calls `sigstore.verify`
only when `verifyAttestations` is set, and fyn never sets it. `@sigstore/sign` is the signing
half, used by `npm publish` provenance. Its `make-fetch-happen` use talks to signing services
(Fulcio, Rekor) that fyn never reaches. An override could stub `sigstore` if that tree ever
needs to go.

## 5. The `http-cache-semantics` advisory doesn't apply

GHSA-ch52-4w7c-c8xp (published 2026-09-18, no patched release) covers shared caches that serve
more than one user. `make-fetch-happen` builds its policy with `shared: false`, and fyn's cache
serves one user. So the audit alert is noise for fyn. npm uses the same stack, so an upstream
fix should eventually clear it with a lockfile bump.

## 6. Decision

Keep the stack. The wrapper needs a fair amount of compatibility work, and the agent and proxy
pieces are the risky part. Install benchmarks already look good, so the potential gain doesn't
justify the risk on the hot path.

Revisit only if one of these changes:
- benchmarks show the HTTP layer is a bottleneck
- `@npmcli/agent` or `minipass-fetch` stop being maintained
- `@fynjs/fetch` gains a dispatcher option and fyn needs it for other reasons
