# pnpm 12 on macOS: why its installs are slow (2026-10-04)

In pnpm's own benchmark harness on an M4 Pro Mac, pnpm 12.9.1 takes 15-20s for a cold install of
`alotta-files`. pnpm 11 takes about 9s on the same rig, and fyn about 6s. On a 4-core Linux box
pnpm 12 takes 4.5s. So we checked our rig first, then profiled pnpm 12 itself.

**Short version.**
- **It isn't our rig.** pnpm 12 is just as slow against registry.npmjs.org with no latency proxy
  and no pnpr.
- **The cause is too many threads creating files at once.** pnpm 12 builds `node_modules/.pnpm`
  one file at a time from a rayon pool with one thread per core, 14 on this Mac. APFS file
  creation and `clonefileat` slow down when that many threads hit them together.
- **Four threads fix most of it.** `RAYON_NUM_THREADS=4` cuts the harness clean install from
  18.0s to 10.6s at 15 ms. Warm-cache installs get about 1.1s faster too.
- **The rest is the design.** pnpm 12 still writes every file twice: into its content-addressed
  store, then into the virtual store. fyn writes each file once and clones a whole package dir.

## Setup

- Mac: Apple M4 Pro, 14 cores, 24 GB, APFS. pnpm 12.9.1 (`@pnpm/exe.darwin-arm64`), installed
  with `pnpm self-update next-12` like the harness does.
- Fixture: `alotta-files`, 1,345 packages and about 42k files.
- Harness: pnpm's benchmark at `b3f578f` with our patch, see
  [pnpm-benchmark-replication.md](pnpm-benchmark-replication.md). pnpm 12 gets its own
  `PNPM_HOME` and cache dir inside the fixture, and `trustLockfile: true`.

## Step 1: rule out the rig

The harness puts every manager behind a latency proxy, and pnpm 12 also resolves through a local
pnpr server. Either could be hurting pnpm 12 alone. So we ran the same fixture with no proxy and
no pnpr, straight from registry.npmjs.org, two rounds interleaved. "lockfile" deletes
`node_modules` and every cache but keeps the lockfile. Seconds:

| Manager | clean | lockfile |
|---|---|---|
| pnpm 12, default (clone) | 18.1-19.1 | 16.2 |
| pnpm 12, `packageImportMethod: copy` | 10.5-10.7 | 10.7-11.8 |
| fyn default | 6.2-6.5 | 4.9-5.1 |
| fyn copy | 6.4-6.6 | 5.2-5.3 |

The numbers match the harness. The rig isn't the problem. The import method is.

## Step 2: where the time goes

**Downloads are held up by imports.** pnpm 12's ndjson log for one lockfile install:
- It picks `clone` as the import method.
- It keeps 60-112 downloads in flight the whole time, yet download starts are spread from 0.2s to
  10.2s. The last fetch finishes at 14.2s.
- Each package's import ends right after its fetch. The pipeline moves at the pace of storing
  and importing, not the network.

**A 5s `sample` of the engine mid-install** shows 80 threads. Thread-seconds spent in each
syscall, per pool:

| Pool | Threads | clone mode | copy mode |
|---|---|---|---|
| unnamed, mostly rayon | 17 | `clonefileat` 15.6, `mkdir` 8.4, `open` 5.6 | `open` 14.4, `clonefileat` 3.9, `mkdir` 2.9 |
| `cas-write-*` | 14 | `open` 12.8, `write` 3.5 | `open` 13.9, `write` 2.3 |
| `tokio-rt-worker` | 46 | mostly idle, `open` 6.9 | mostly idle, `open` 3.5 |

- **The rayon pool builds the virtual store.** In clone mode it spends about 24 thread-seconds per
  5s in `clonefileat` and `mkdir`. That's about 5 threads stuck in the kernel at all times.
- **The `cas-write` pool writes the store.** It spends more time in `open` than in `write`.
  Creating a file costs more than writing its bytes.
- **Copy mode still clones.** Rust's `fs::copy` on macOS tries `fclonefileat` before copying.

## Step 3: cap the threads

Lockfile installs from registry.npmjs.org, seconds:

| Setting | run 1 | run 2 |
|---|---|---|
| default | 16.31 | 16.74 |
| `RAYON_NUM_THREADS=8` | 12.16 | - |
| `RAYON_NUM_THREADS=4` | 10.51 | 10.13 |
| `RAYON_NUM_THREADS=2` | 10.71 | - |
| `networkConcurrency: 16` | 16.10 | 15.37 |
| `RAYON_NUM_THREADS=4` + copy | 9.34 | 9.16 |

- **Fewer rayon threads are faster, down to 4.** 14 threads cost about 6s over 4.
- **Fewer downloads in flight do nothing.** So neither the network nor the CAS writes set the
  pace.

Then the full harness, pnpm 12 only, seconds:

| Scenario | 15 ms: default | `RAYON_NUM_THREADS=4` | 50 ms: default | `RAYON_NUM_THREADS=4` |
|---|---|---|---|---|
| clean | 18.01 | **10.59** | 19.73 | **10.36** |
| lockfile | 15.43 | **10.51** | 16.70 | **10.51** |
| cache | 2.98 | **1.88** | 3.31 | **1.94** |
| cache + lockfile | 2.87 | **1.71** | 2.76 | **1.76** |
| repeat | 0.04 | 0.04 | 0.04 | 0.04 |
| update | 2.82 | **1.61** | 3.20 | **1.70** |

With 4 threads, pnpm 12 lands near pnpm 11 on cold installs (9.0-9.9s) and close to fyn's
default on warm ones (1.6-1.7s). fyn's default clean install is still about 5s faster.

## Why Linux doesn't show it

On the 4-core Linux box pnpm 12 does a clean install in 4.5s, see
[fyn-install-perf.md](fyn-install-perf.md). It hardlinks there instead of cloning, and its pool
is only 4 threads, the size that works best on the Mac. We didn't profile it on Linux, so we
can't say whether ext4 would also slow down with 14 threads.

## What pnpm could change

- **Cap the import pool on macOS,** to about 4 threads. That's most of the gain for no code.
- **Use dir clones on cold installs too.** pnpm 12 already clones a whole package dir with one
  `clonefile(2)` call when it has a cached copy (`dir_clone_cache.rs`). A cold install still
  imports file by file.
- **Users can set `RAYON_NUM_THREADS=4` today.**

## Not checked

- **pnpm's Rust code wasn't traced.** The binary has no symbols. We call the unnamed pool rayon
  because `RAYON_NUM_THREADS` changes its effect.
- **The `cas-write` pool wasn't capped on its own.** We found no setting for it.
- **One Mac only.** A Mac with fewer cores gets a smaller pool, and may suffer less.
- **macOS file scanning** (Spotlight, XProtect) wasn't ruled in or out.

## Reproducing

Scripts and logs are in `.temp/pnpm-bench/pnpm12-mac/`:
- `probe.mjs` runs the no-proxy cold installs, with its output in `probe.log`.
- `prof.mjs <tag> [extra yaml]` runs one lockfile install with `--reporter=ndjson`, and samples
  the engine with `sample` when `SAMPLE_AT` is set. Thread caps come from the environment.
- `leaf.mjs <sample.txt>` adds up syscall time per thread pool.
- `caps.log` has the thread-cap timings. The `.sample.txt.gz` files are the raw samples.

Harness results with the cap: `.temp/pnpm-bench/local-results-{15,50}ms-v15r4-683296f4.json`.
