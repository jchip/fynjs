# fyn install performance

How fast fyn installs today, how an install runs, what we kept and dropped along the way, and what
is still open. Most numbers come from pnpm's benchmark harness on the Mac, with a short Linux check. See
[pnpm-benchmark-replication.md](pnpm-benchmark-replication.md) for the rig, the fixture
(`alotta-files`, about 1.3k packages and 42k files) and how to run it.

## Where fyn stands

### Mac

"default" sets no store options, so on macOS fyn clones from the central store. "copy" turns the
store off. pnpm 12 ran in the same session. Seconds, one sample per cell:

| Scenario | 15 ms: copy | default | pnpm 12 | 50 ms: copy | default | pnpm 12 |
|---|---|---|---|---|---|---|
| clean | 5.69 | **5.72** | 18.68 | 7.14 | **7.09** | 18.36 |
| lockfile | 5.11 | **5.00** | 16.52 | 5.09 | **5.04** | 16.48 |
| cache | 4.16 | **1.68** | 3.17 | 4.20 | **1.66** | 3.11 |
| cache + lockfile | 4.10 | **1.58** | 2.85 | 4.12 | **1.57** | 2.85 |
| repeat | 0.11 | 0.09 | **0.04** | 0.10 | 0.10 | **0.04** |
| update | 1.58 | **1.46** | 3.09 | 1.77 | **1.65** | 3.23 |

- **The default matches copy on installs that download,** and is 2.5x faster on warm-cache
  installs. The central store costs nothing extra.
- **fyn beats pnpm 12 on every row but repeat.** pnpm 12's cold installs are slow on macOS because
  it writes every file twice. Repeat is startup, and pnpm 12 is a native binary.
- **Noise.** A second sample of the same build differed by 0.1-0.4s per row, so treat single
  differences under about 0.3s as noise.
- The store-protocol, validation and messaging changes below came after this table. A spot check
  after them showed clean and lockfile flat within noise.

### Linux

A 4-core i5-4570T with ext4 and Node 24.21.0, at 15 ms / 200 Mbps, with the registry and the
latency proxy on the same box. fyn runs its Linux default, the central store with hardlinks.
Seconds, as the range of 3-4 runs:

| Scenario | fyn |
|---|---|
| clean | 6.9-7.1 |
| lockfile | 4.5-4.6 |
| cache | 2.46-2.49 |

- **Warm cache is slower than the Mac's clone mode,** since hardlinking every file costs more than
  one dir clone per package.
- **pnpm 12 is still faster on this box.** It keeps all 4 cores busy, while fyn's main thread is
  its serial limit.
- **The registry shares the box.** It uses CPU the install could otherwise use, mostly serving
  packuments on clean installs.

## How an install runs

```
main thread   [ resolve: packument HTTP ][ fetch: tarball HTTP ][ place ]
fs workers      unzip, parse, trim        verify, untar,          copy or clone files,
                packuments                write store entry       return package.json
```

- **Resolve, then fetch.** Resolution fetches each packument to pick versions. Tarball downloads
  start after the whole tree resolves, because a package's `node_modules` dir depends on promotion.
- **The main thread is the limit.** It stays nearly saturated through resolve and fetch, running
  HTTP, resolution and job dispatch. Every change that paid off either moved work off it or cut
  work from it.
- **fs workers do the CPU and disk work.** The pool uses cores - 1 workers, capped at 8. Jobs use
  sync fs calls, so each one is a single message instead of many async hops.

## What we kept

Each benefit was measured right after the change landed, on the platform shown, one or a few samples.
Mac rows are at 15 ms unless noted. Linux is the 4-core box above.

### Metadata

| Change | Benefit |
|---|---|
| Fetch packuments gzipped. A worker unzips, parses and trims each one, and keeps fyn's trimmed copy with its etag | Linux clean 14.3s → 11.6s, resolve 7.4s → 4.3s |
| The worker returns trimmed packuments as JSON text, cheaper than an object graph | Linux resolve 4.3s → 4.1s |
| Fetch npm's abbreviated packuments, about a third the size. Full ones only for lock time or install scripts | Linux clean 8.8s → 7.9s, resolve 4.1s → 3.1s |
| Keep a trimmed copy of each packument for warm installs: 27 MB against 179 MB of full JSON | Mac copy cache row 5.20s → 4.46s, peak memory 1,006 MB → 645 MB |
| Parse each version once when sorting, and only scan the majors a range allows | Resolving the fixture's ranges 44 ms → 19 ms |
| Default registry sockets 15 → 32, see [pnpm-benchmark-replication.md](pnpm-benchmark-replication.md) | Mac 50 ms copy clean 13.0s → 8.46s, no cost at 15 ms |

### Tarballs and the central store

| Change | Benefit |
|---|---|
| Untar and place store files in fs workers, with a faster in-memory untar | Linux clean 21.4s → 14.3s, lockfile 13.9s → 7.3s |
| Store tarballs download as bytes and skip cacache. A worker checks integrity and untars from memory | Linux clean 11.6s → 9.3s, lockfile 7.3s → 5.7s |
| Store and package dir setup in the workers. Missing entries aren't stat'd again | Linux clean 9.0s → 8.8s |
| The untar worker hashes the tree, writes tree.json and renames the entry into place | Linux lockfile 5.5s → 5.0s |
| The whole store protocol runs in the worker. The place job returns package.json | Linux clean and lockfile about 0.45s faster |
| Validate cache hits with a sync scan in the worker, not about 43k async stats on the main thread | Linux cache 3.1s → 2.47s |
| Skip the cacache check for store packages, cache auth per host, make each store dir once | Linux clean 7.5s → 7.4s, cache 3.18s → 3.1s |
| One `cloneDir` per package on macOS, a single `clonefile(2)` per dir | Mac clone clean 14.70s → 10.00s. Replicating the fixture 0.61s against 3.18s per-file |
| Store writes happen in the extractor, not the download slot | Mac 50 ms clone clean 2.3s faster |
| Store hash from the tar headers untar already read | Mac clone clean 9.63s → 9.35s at 15 ms |
| Clone mode is the default on macOS when `@fynjs/reflink` can clone dirs | Mac warm-cache installs 2.5x faster than copy |

On the Mac, the worker and fetch changes together cut the default clean install by 2.0-2.2s and
lockfile by 1.8-1.9s. The default stopped paying the store's 2s cost on installs that download.
Abbreviated packuments and the changes after them cut another 0.7-1.0s off clean.

### Main thread and startup

| Change | Benefit |
|---|---|
| Set `agent.protocol` in `getAgent`, so requests don't work it out from a stack trace | About 230 ms main thread, Linux clean 7.9s → 7.6s |
| Send worker job data as a transferred copy of just its bytes, not the whole backing ArrayBuffer | 75 MB → 11 MB copied for packuments, 130 MB → 64 MB for tarballs. Linux about 0.05s |
| `module.enableCompileCache()`, lazy-load pacote, cacache and arborist, require `http` at runtime | Startup 131 ms → 95 ms |
| Skip fyn's own cache and store dirs in the no-change mtime scan | Mac repeat install 0.35s → 0.15s |

## What we dropped

| Tried | Result | Why |
|---|---|---|
| `--always-fetch-dist` | Mac copy clean 7.74s → 14.0s | Resolve waits for each extraction |
| Start downloads into cacache as versions resolve | Mac copy clean 7.74s → 9.59s | 1,300 downloads queued ahead of the ones extraction needed |
| Fill the store while resolve runs, queue of 4 to 16 | Mac clean flat or 0.5s slower. Linux at most 0.16s, resolve 0.35s slower | Tarball HTTP competes with packuments for the main thread and sockets |
| Packument fetches in the workers | Mac clean 6.54s → 6.73s. Linux 0.3s slower | Each worker carries its own HTTP stack and connections, so total CPU goes up |
| Tarball downloads in the workers | Linux clean and lockfile 0.7s slower | Same as above |
| Native Rust untar | 3.35s on 4 threads against 3.32s for node-tar | Extraction is bound by the filesystem creating files |
| `UV_THREADPOOL_SIZE=16` | Mac about 0.2s slower | Not the bottleneck |
| More extract concurrency, fewer workers, lower worker priority | No change | Not the bottleneck |
| `--max-semi-space-size=64` | 0.08s | GC is not the lever |
| Deferring clones, or cloning from `node_modules` into the store | No change | Same disk work in another order |
| Queueing 2-3 jobs per worker to avoid wakeups | No change in send time | Wakeups cost a few µs |
| Removing both `ensureProperPkgDir` checks | Under 0.1s | They aren't duplicates, so they stay |
| Async `mkdirp` for package dirs | No gain | Moved mkdir work into the thread pool, where it competes with clones |
| Code splitting the bundle | Not shipped | Breaks the `__filename` banner. The compile cache covers most of the parse cost |
| V8 startup snapshot | 125 ms → 90 ms, only with `--snapshot-blob` | Parked, see [fyn-v8-startup-snapshot.md](fyn-v8-startup-snapshot.md) |

## Still open

- **Extraction drains after the last tarball arrives.** Each extract job still makes a few
  main-thread hops, so jobs wait while workers idle. Recent main-thread cuts shrank this. It
  hasn't been measured again.
- **Trimmed packuments are parsed twice.** A worker parses and trims each one, then the main thread
  parses the trimmed JSON.
- **Messaging.** What's left is serialization on a busy main thread. The place job sends file
  lists, and the store job returns trees. A worker could read `tree.json` itself.
- **Memory.** Downloaded bytes wait in memory until their store job runs. Max RSS stays under 1 GB
  on the benchmark. A cap on bytes waiting to be stored would bound it for very large installs.
- **Downloads during resolve, later.** Filling the store while resolve runs gave no gain, because
  tarball HTTP competes with packuments for the main thread and the sockets. It is worth another
  try once each tarball costs the main thread much less.
